import { NSFW_MODEL_CLASSES, type NsfwImageScores, type NsfwLevel, type NsfwScores, type NsfwSource } from '../shared/nsfw';

/**
 * On-device NSFW image check. Runs two open NSFWJS models (InceptionV3 and MobileNetV2) with TensorFlow.js
 * right on this PC (GPU when available). No pictures leave the computer and no API key is needed.
 *
 * The backend decides what the scores mean (src/shared/nsfw.ts) and remembers the result.
 */

type TF = typeof import('@tensorflow/tfjs');
type LayersModel = import('@tensorflow/tfjs').LayersModel;

const MOBILE_SIZE = 224;
const INCEPTION_SIZE = 299;
const MAX_IMAGES = 10;


const bridge = () => (window as any).fairyBridge as { isElectron?: boolean; invoke: (ch: string, ...a: any[]) => Promise<any> } | undefined;

export function nsfwAiAvailable(): boolean {
  return Boolean(bridge()?.isElectron) && typeof createImageBitmap === 'function';
}

interface Loaded {
  tf: TF;
  mobile: LayersModel;
  inception: LayersModel;
}

async function loadOne(tf: TF, which: 'mobile' | 'inception', size: number): Promise<LayersModel> {
  const { modelJson, weights } = (await bridge()!.invoke('nsfw:model', which)) as { modelJson: any; weights: Uint8Array };
  const bytes = weights instanceof Uint8Array ? weights : new Uint8Array(weights as ArrayBufferLike);
  const model = await tf.loadLayersModel(
    tf.io.fromMemory({
      modelTopology: modelJson.modelTopology,
      weightSpecs: modelJson.weightsManifest.flatMap((g: any) => g.weights),
      weightData: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    })
  );
  // Warm up once so the first real picture isn't slow.
  tf.tidy(() => model.predict(tf.zeros([1, size, size, 3])));
  return model;
}

let loadedPromise: Promise<Loaded> | null = null;
async function loadModel(): Promise<Loaded> {
  if (!loadedPromise) {
    loadedPromise = (async () => {
      const tf = await import('@tensorflow/tfjs');
      const mobile = await loadOne(tf, 'mobile', MOBILE_SIZE);
      const inception = await loadOne(tf, 'inception', INCEPTION_SIZE);
      return { tf, mobile, inception };
    })();
    loadedPromise.catch(() => {
      loadedPromise = null;
    });
  }
  return loadedPromise;
}

async function imageBlob(url: string): Promise<Blob> {
  if (url.startsWith('data:')) return (await fetch(url)).blob();
  const bytes = (await bridge()!.invoke('nsfw:image', url)) as Uint8Array;
  return new Blob([bytes as BlobPart]);
}

async function run(tf: TF, model: LayersModel, blob: Blob, size: number): Promise<NsfwScores> {
  const bitmap = await createImageBitmap(blob, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high' });
  try {
    const out = tf.tidy(() => {
      const x = tf.browser.fromPixels(bitmap).toFloat().div(255).reshape([1, size, size, 3]);
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

/** Scores one picture with both models. Throws if it can't be downloaded or decoded. */
export async function classifyImage(url: string): Promise<NsfwImageScores> {
  const { tf, mobile, inception } = await loadModel();
  const blob = await imageBlob(url);
  return { inc: await run(tf, inception, blob, INCEPTION_SIZE), mob: await run(tf, mobile, blob, MOBILE_SIZE) };
}

/* ------------------------------------------------------------------ */
/* Background scan queue                                               */
/* ------------------------------------------------------------------ */

export interface NsfwReviewItem {
  key: string;
  gamebananaId?: number | null;
  modUuid?: string;
  title: string;
  description?: string;
  contentRating?: string;
  category?: string;
  /** GameBanana marked it NSFW before the scan. */
  flagged: boolean;
  /** Cover first. */
  images: string[];
}

export interface NsfwReviewOutcome {
  key: string;
  level: NsfwLevel;
  source: NsfwSource;
  cleanImages: string[];
}

type Listener = (r: NsfwReviewOutcome) => void;

const PARALLEL = 3;
const queue: NsfwReviewItem[] = [];
const queued = new Set<string>();
const done = new Set<string>();
const listeners = new Set<Listener>();
const progressListeners = new Set<(pending: number) => void>();
let running = 0;
let modelFailed = false;

export function onNsfwReviewed(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** How many mods are waiting to be scanned (for a "Checking N mods..." note). */
export function onNsfwScanProgress(fn: (pending: number) => void): () => void {
  progressListeners.add(fn);
  fn(modelFailed ? -1 : queued.size);
  return () => progressListeners.delete(fn);
}

/** -1 = the check can't run on this PC (model failed to load). */
const emitProgress = () => progressListeners.forEach((fn) => fn(modelFailed ? -1 : queued.size));

/** Adds mods to scan. Every mod is scanned, labeled or not. */
export function queueNsfwReview(items: NsfwReviewItem[]): void {
  if (!nsfwAiAvailable() || modelFailed) return;
  for (const it of items) {
    if (!it.key || queued.has(it.key) || done.has(it.key)) continue;
    const images = [...new Set(it.images.filter((u) => u && !u.startsWith('data:image/svg')))].slice(0, MAX_IMAGES);
    queued.add(it.key);
    // In display order, so the grid fills from the top.
    queue.push({ ...it, images });
  }
  emitProgress();
  for (let i = running; i < PARALLEL; i++) void worker();
}

async function scanOne(it: NsfwReviewItem) {
  const imageUrls: string[] = [];
  const scores: NsfwImageScores[] = [];
  for (const url of it.images) {
    try {
      scores.push(await classifyImage(url));
      imageUrls.push(url);
    } catch {
      // A picture that can't be checked simply isn't counted as clean.
    }
  }
  // The cover couldn't be checked: leave it unscanned (hidden from SFW views) and try next session.
  if (it.images.length > 0 && imageUrls[0] !== it.images[0]) return;
  const res = (await bridge()!.invoke('nsfw:submit', {
    key: it.key,
    gamebananaId: it.gamebananaId ?? null,
    modUuid: it.modUuid,
    flagged: it.flagged,
    title: it.title,
    description: it.description,
    contentRating: it.contentRating,
    category: it.category,
    imageUrls,
    scores,
  })) as NsfwReviewOutcome;
  listeners.forEach((fn) => fn(res));
}

async function worker() {
  running++;
  try {
    await loadModel();
    while (queue.length) {
      const it = queue.shift()!;
      try {
        await scanOne(it);
      } catch {
        // backend busy or closed; skip this one for now
      }
      done.add(it.key);
      queued.delete(it.key);
      emitProgress();
    }
  } catch {
    // Model failed to load: nothing gets marked safe, SFW views stay empty of unscanned mods.
    modelFailed = true;
    queue.length = 0;
    queued.clear();
    emitProgress();
  } finally {
    running--;
  }
}

/** Applies a verdict to anything carrying NSFW fields (Browse items, installed mods). */
export function withNsfwOutcome<
  T extends { is_nsfw?: boolean; nsfw_level?: NsfwLevel; nsfw_source?: NsfwSource; nsfw_checked?: boolean; nsfw_clean_images?: string[] }
>(item: T, r: NsfwReviewOutcome): T {
  return { ...item, nsfw_level: r.level, is_nsfw: r.level !== 'sfw', nsfw_source: r.source, nsfw_checked: true, nsfw_clean_images: r.cleanImages };
}
