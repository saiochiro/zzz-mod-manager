import { NSFW_MODEL_CLASSES, type NsfwLevel, type NsfwScores, type NsfwSource } from '../shared/nsfw';

/**
 * On-device NSFW image check. Runs the open MobileNetV2 model from NSFWJS with TensorFlow.js
 * right on this PC (GPU when available). No pictures leave the computer and no API key is needed.
 *
 * The backend decides what the scores mean (src/shared/nsfw.ts) and remembers the result.
 */

type TF = typeof import('@tensorflow/tfjs');
type LayersModel = import('@tensorflow/tfjs').LayersModel;

const SIZE = 224;
const MAX_IMAGES = 6;

let modelPromise: Promise<{ tf: TF; model: LayersModel }> | null = null;

const bridge = () => (window as any).fairyBridge as { isElectron?: boolean; invoke: (ch: string, ...a: any[]) => Promise<any> } | undefined;

export function nsfwAiAvailable(): boolean {
  return Boolean(bridge()?.isElectron) && typeof createImageBitmap === 'function';
}

async function loadModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import('@tensorflow/tfjs');
      const { modelJson, weights } = (await bridge()!.invoke('nsfw:model')) as { modelJson: any; weights: Uint8Array };
      const bytes = weights instanceof Uint8Array ? weights : new Uint8Array(weights as ArrayBufferLike);
      const model = await tf.loadLayersModel(
        tf.io.fromMemory({
          modelTopology: modelJson.modelTopology,
          weightSpecs: modelJson.weightsManifest.flatMap((g: any) => g.weights),
          weightData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        })
      );
      // Warm up once so the first real picture isn't slow.
      tf.tidy(() => model.predict(tf.zeros([1, SIZE, SIZE, 3])));
      return { tf, model };
    })();
    modelPromise.catch(() => {
      modelPromise = null;
    });
  }
  return modelPromise;
}

async function imageBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) return (await fetch(url)).blob();
  const bytes = (await bridge()!.invoke('nsfw:image', url)) as Uint8Array;
  return new Blob([bytes as BlobPart]);
}

/** Scores one picture. Throws if it can't be downloaded or decoded. */
export async function classifyImage(url: string): Promise<NsfwScores> {
  const { tf, model } = await loadModel();
  const bitmap = await createImageBitmap(await imageBlob(url), { resizeWidth: SIZE, resizeHeight: SIZE, resizeQuality: 'high' });
  try {
    const out = tf.tidy(() => {
      const x = tf.browser.fromPixels(bitmap).toFloat().div(255).reshape([1, SIZE, SIZE, 3]);
      return model.predict(x) as import('@tensorflow/tfjs').Tensor;
    });
    const probs = await out.data();
    out.dispose();
    const scores = {} as NsfwScores;
    NSFW_MODEL_CLASSES.forEach((c, i) => (scores[c] = probs[i] ?? 0));
    return scores;
  } finally {
    bitmap.close();
  }
}

/* ------------------------------------------------------------------ */
/* Background review queue                                             */
/* ------------------------------------------------------------------ */

export interface NsfwReviewItem {
  key: string;
  gamebananaId?: number | null;
  modUuid?: string;
  title: string;
  description?: string;
  contentRating?: string;
  /** Labeled NSFW before the check. */
  flagged: boolean;
  /** Cover first. */
  images: string[];
}

export interface NsfwReviewOutcome {
  key: string;
  level: NsfwLevel;
  reason: string;
  source: NsfwSource;
}

type Listener = (r: NsfwReviewOutcome) => void;

const queue: NsfwReviewItem[] = [];
const queued = new Set<string>();
const done = new Set<string>();
const listeners = new Set<Listener>();
let running = false;

export function onNsfwReviewed(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Adds mods labeled NSFW to check (every screenshot). Unlabeled mods are skipped. */
export function queueNsfwReview(items: NsfwReviewItem[]): void {
  if (!nsfwAiAvailable()) return;
  for (const it of items) {
    if (!it.flagged) continue;
    if (queued.has(it.key) || done.has(it.key)) continue;
    const images = it.images.filter((u) => u && !u.startsWith('data:image/svg'));
    if (images.length === 0) continue;
    queued.add(it.key);
    // Flagged mods first: those are the ones whose label might be wrong.
    const item = { ...it, images: it.flagged ? images.slice(0, MAX_IMAGES) : images.slice(0, 1) };
    if (it.flagged) queue.unshift(item);
    else queue.push(item);
  }
  void pump();
}

/** Lets a mod be checked again in this session (after a reset). */
export function forgetNsfwReviews(): void {
  done.clear();
}

async function pump() {
  if (running) return;
  running = true;
  try {
    await loadModel();
    while (queue.length) {
      const it = queue.shift()!;
      queued.delete(it.key);
      const scores: NsfwScores[] = [];
      let coverFailed = false;
      for (let i = 0; i < it.images.length; i++) {
        try {
          scores.push(await classifyImage(it.images[i]));
        } catch {
          if (i === 0) coverFailed = true;
        }
        // Stay out of the way of the UI.
        await new Promise((r) => setTimeout(r, 30));
      }
      if (coverFailed || scores.length === 0) {
        done.add(it.key); // try again next session, not over and over now
        continue;
      }
      try {
        const res = (await bridge()!.invoke('nsfw:submit', {
          key: it.key,
          gamebananaId: it.gamebananaId ?? null,
          modUuid: it.modUuid,
          flagged: it.flagged,
          title: it.title,
          description: it.description,
          contentRating: it.contentRating,
          scores,
        })) as NsfwReviewOutcome;
        done.add(it.key);
        listeners.forEach((fn) => fn(res));
      } catch {
        // backend busy or closed; skip
      }
    }
  } catch {
    // Model failed to load (old GPU driver, missing file...). Leave labels as they are.
    queue.length = 0;
    queued.clear();
  } finally {
    running = false;
  }
}

/** Applies a verdict to anything carrying NSFW fields (Browse items, installed mods). */
export function withNsfwOutcome<T extends { is_nsfw?: boolean; nsfw_level?: NsfwLevel; nsfw_reason?: string; nsfw_source?: NsfwSource; nsfw_checked?: boolean }>(
  item: T,
  r: NsfwReviewOutcome
): T {
  return { ...item, nsfw_level: r.level, is_nsfw: r.level !== 'sfw', nsfw_reason: r.reason, nsfw_source: r.source, nsfw_checked: true };
}
