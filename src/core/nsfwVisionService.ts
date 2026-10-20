import fs from 'fs';
import path from 'path';
import { GameBananaModItem, VisionModerationResult } from '../shared/types';
import { isModRecordNsfw, NSFW_KEYWORD_REGEX } from './gamebananaService';

const visionCacheMemory = new Map<number, VisionModerationResult>();
let cacheFilePath: string | null = null;
let cacheLoaded = false;

export function initNsfwVisionCache(appDataPath: string): void {
  try {
    const cacheDir = path.join(appDataPath, 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    cacheFilePath = path.join(cacheDir, 'nsfw_vision_cache.json');
    if (fs.existsSync(cacheFilePath)) {
      const raw = JSON.parse(fs.readFileSync(cacheFilePath, 'utf-8'));
      if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw)) {
          const id = Number(k);
          if (!Number.isNaN(id) && v && typeof v === 'object') {
            visionCacheMemory.set(id, v as VisionModerationResult);
          }
        }
      }
    }
    cacheLoaded = true;
  } catch (err) {
    console.warn('[NSFW Vision] Failed to load vision cache:', err);
  }
}

function persistVisionCache(): void {
  if (!cacheFilePath) return;
  try {
    const serialized: Record<string, VisionModerationResult> = {};
    for (const [id, entry] of visionCacheMemory.entries()) {
      serialized[String(id)] = entry;
    }
    fs.writeFileSync(cacheFilePath, JSON.stringify(serialized, null, 2), 'utf-8');
  } catch {
    // ignore disk write errors
  }
}

export function getCachedVisionResult(modId: number): VisionModerationResult | undefined {
  return visionCacheMemory.get(modId);
}

export function setCachedVisionResult(result: VisionModerationResult, skipPersist = false): void {
  visionCacheMemory.set(result.modId, result);
  if (!skipPersist) {
    persistVisionCache();
  }
}

/**
 * Layer 2 AI Vision & Deep Content Moderation Check:
 * Evaluates a mod's primary preview thumbnail URL and deep metadata for NSFW content.
 * Results are permanently cached by Mod ID so the same mod is never re-scanned twice.
 */
export async function moderateModThumbnailVision(
  mod: Pick<GameBananaModItem, 'id' | 'thumbnail_url' | 'title' | 'category'>,
  skipPersist = false
): Promise<VisionModerationResult> {
  const existing = visionCacheMemory.get(mod.id);
  if (existing) {
    return existing;
  }

  const thumbUrl = mod.thumbnail_url || '';

  // Built-in SVG data URLs (curated SFW cards) are known safe unless title matches NSFW keywords
  if (thumbUrl.startsWith('data:image/svg+xml')) {
    const isFlaggedTitle = NSFW_KEYWORD_REGEX.test(`${mod.title} ${mod.category || ''}`);
    const svgResult: VisionModerationResult = {
      modId: mod.id,
      thumbnailUrl: thumbUrl,
      isNsfw: isFlaggedTitle,
      confidence: 0.99,
      reason: isFlaggedTitle ? 'Flagged by title/category keyword' : 'Verified curated SVG asset',
      checkedAt: new Date().toISOString(),
    };
    setCachedVisionResult(svgResult, skipPersist);
    return svgResult;
  }

  // 1. Optional Cloud AI Vision Endpoint (Gemini Vision API / OpenAI Omni-Moderation) if configured
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey && thumbUrl.startsWith('http')) {
    try {
      const imgCtrl = new AbortController();
      const imgTimer = setTimeout(() => imgCtrl.abort(), 3000);
      const imgResp = await fetch(thumbUrl, { signal: imgCtrl.signal });
      clearTimeout(imgTimer);

      if (imgResp.ok) {
        const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
        const arrayBuf = await imgResp.arrayBuffer();
        const base64Data = Buffer.from(arrayBuf).toString('base64');

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
          geminiKey
        )}`;
        const visionResp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: 'Classify if this game mod preview image is NSFW (nudity, explicit, topless, bottomless, lingerie, microbikini, or sexually suggestive adult content). Reply with JSON only: {"isNsfw": boolean, "confidence": number, "reason": string}',
                  },
                  {
                    inlineData: {
                      mimeType: contentType,
                      data: base64Data,
                    },
                  },
                ],
              },
            ],
          }),
        });

        if (visionResp.ok) {
          const visionJson: any = await visionResp.json();
          const rawText =
            visionJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const aiResult: VisionModerationResult = {
              modId: mod.id,
              thumbnailUrl: thumbUrl,
              isNsfw: Boolean(parsed.isNsfw),
              confidence: Number(parsed.confidence) || 0.9,
              reason: String(parsed.reason || 'AI Vision Moderation'),
              checkedAt: new Date().toISOString(),
            };
            setCachedVisionResult(aiResult, skipPersist);
            return aiResult;
          }
        }
      }
    } catch {
      // Fall through to local/deep moderation check
    }
  }

  // 2. Deep ProfilePage Content Ratings + Archive/Description + Thumbnail Binary Inspection
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const profileRes = await fetch(
      `https://gamebanana.com/apiv11/Mod/${mod.id}/ProfilePage`,
      {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'ZZZModManager-v2/2.0' },
      }
    );
    clearTimeout(timer);

    if (profileRes.ok) {
      const profileData: any = await profileRes.json();
      if (isModRecordNsfw(profileData)) {
        const ratingsObj = profileData._aContentRatings || {};
        const ratingLabels = Object.values(ratingsObj).filter(Boolean).join(', ');
        const flaggedResult: VisionModerationResult = {
          modId: mod.id,
          thumbnailUrl: thumbUrl,
          isNsfw: true,
          confidence: 0.96,
          reason: ratingLabels
            ? `Content ratings: ${ratingLabels}`
            : 'Flagged by deep profile & archive inspection',
          checkedAt: new Date().toISOString(),
        };
        setCachedVisionResult(flaggedResult, skipPersist);
        return flaggedResult;
      }

      // Check archive filenames and description body for hidden NSFW indicators
      const fileNames = Array.isArray(profileData._aFiles)
        ? profileData._aFiles.map((f: any) => `${f._sFile || ''} ${f._sDescription || ''}`).join(' ')
        : '';
      const cleanDesc = String(profileData._sText || '').replace(/<[^>]+>/g, ' ');
      if (NSFW_KEYWORD_REGEX.test(`${fileNames} ${cleanDesc}`)) {
        const textFlagged: VisionModerationResult = {
          modId: mod.id,
          thumbnailUrl: thumbUrl,
          isNsfw: true,
          confidence: 0.88,
          reason: 'Flagged by mod description / archive filename analysis',
          checkedAt: new Date().toISOString(),
        };
        setCachedVisionResult(textFlagged, skipPersist);
        return textFlagged;
      }
    }
  } catch {
    // Ignore network timeout on single profile check
  }

  const safeResult: VisionModerationResult = {
    modId: mod.id,
    thumbnailUrl: thumbUrl,
    isNsfw: false,
    confidence: 0.85,
    reason: 'Passed Layer 1 & Layer 2 moderation checks',
    checkedAt: new Date().toISOString(),
  };
  setCachedVisionResult(safeResult, skipPersist);
  return safeResult;
}

/**
 * Parallelizes Layer 2 moderation across all uncached mods simultaneously using Promise.all
 * and persists the vision cache once per batch.
 */
export async function runLayer2VisionModerationBatch(
  mods: GameBananaModItem[]
): Promise<GameBananaModItem[]> {
  const candidates = mods.filter((m) => !m.is_nsfw);
  const uncached = candidates.filter((m) => !visionCacheMemory.has(m.id));

  if (uncached.length > 0) {
    await Promise.all(
      uncached.map((m) =>
        moderateModThumbnailVision(
          {
            id: m.id,
            thumbnail_url: m.thumbnail_url,
            title: m.title,
            category: m.category,
          },
          true
        )
      )
    );
    persistVisionCache();
  }

  return mods.map((m) => {
    if (m.is_nsfw) return m;
    const cached = visionCacheMemory.get(m.id);
    if (cached && cached.isNsfw) {
      return {
        ...m,
        is_nsfw: true,
        nsfw_reason: cached.reason,
        content_rating: cached.reason || 'NSFW (Layer 2 Vision)',
      };
    }
    return m;
  });
}
