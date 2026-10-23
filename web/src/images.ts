/*
 * Listing photos are optimised in the browser before anything is uploaded — the web twin of the
 * app's data/images/ImageOptimizer.kt, with the same two outputs per photo and the same budgets:
 *
 *   full       ≤1600px longest edge, ~600 KB, JPEG quality 88 → 58   (listing page / viewer)
 *   thumbnail  ≤300px  longest edge, <50 KB,  JPEG quality 80 → 45   (every grid / list)
 *
 * Quality steps down by 8 until the encode fits the budget; if even the floor overshoots, the
 * dimensions shrink by 15% (at most 3 times), and the smallest attempt wins if nothing fits. Images
 * are never upscaled.
 *
 * Privacy: the photo is DRAWN from decoded pixels onto a canvas and re-encoded, so EXIF, GPS tags and
 * camera maker-notes in the original never leave the device. Orientation is applied while decoding
 * (createImageBitmap's imageOrientation: 'from-image'; <img> decoding does the same), so a portrait
 * phone photo isn't stored sideways — and the output carries no orientation tag to undo it.
 */

export interface ImageSpec {
  maxEdgePx: number;
  targetMaxBytes: number;
  startQuality: number;
  minQuality: number;
}

/** ImageSpecs.LISTING / ImageSpecs.THUMBNAIL. */
export const LISTING_SPEC: ImageSpec = { maxEdgePx: 1600, targetMaxBytes: 600 * 1024, startQuality: 88, minQuality: 58 };
export const THUMBNAIL_SPEC: ImageSpec = { maxEdgePx: 300, targetMaxBytes: 50 * 1024, startQuality: 80, minQuality: 45 };
/** ImageSpecs.PROFILE. */
export const PROFILE_SPEC: ImageSpec = { maxEdgePx: 1024, targetMaxBytes: 500 * 1024, startQuality: 88, minQuality: 60 };

const QUALITY_STEP = 8;
const DIMENSION_SHRINK = 0.85;
const MAX_DIMENSION_SHRINKS = 3;
/** Refuse absurd inputs before decoding them (a phone camera original is ~3–12 MB). */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/** ImageOptimizer.targetDimensions: fit the longest edge, keep the aspect ratio, never upscale. */
export function targetDimensions(width: number, height: number, maxEdgePx: number): [number, number] {
  if (width <= 0 || height <= 0) return [width, height];
  const longest = Math.max(width, height);
  if (longest <= maxEdgePx) return [width, height];
  const scale = maxEdgePx / longest;
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

export interface OptimisedImage {
  blob: Blob;
  width: number;
  height: number;
}

export interface OptimisedPair {
  image: OptimisedImage;
  thumbnail: OptimisedImage;
}

type Source = ImageBitmap | HTMLImageElement;

/** Decodes the picked file the right way up. Throws when the browser can't read it as an image. */
async function decode(file: Blob): Promise<Source> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* older Safari rejects the options bag — fall through to <img>, which also orients */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const sizeOf = (s: Source): [number, number] =>
  s instanceof HTMLImageElement ? [s.naturalWidth, s.naturalHeight] : [s.width, s.height];

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality / 100);
  });
}

/** ImageOptimizer.encode: quality first, then dimensions; the smallest attempt if none fits. */
async function encode(source: Source, spec: ImageSpec): Promise<OptimisedImage> {
  const [sw, sh] = sizeOf(source);
  let [width, height] = targetDimensions(sw, sh, spec.maxEdgePx);
  let best: OptimisedImage | null = null;
  const canvas = document.createElement('canvas');
  for (let shrinks = 0; ; shrinks++) {
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    // JPEG has no alpha: paint white first so a transparent PNG doesn't turn black.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, width, height);
    for (let q = spec.startQuality; q >= spec.minQuality; q -= QUALITY_STEP) {
      const blob = await toJpeg(canvas, q);
      const candidate = { blob, width, height };
      if (!best || blob.size < best.blob.size) best = candidate;
      if (blob.size <= spec.targetMaxBytes) return candidate;
    }
    if (shrinks >= MAX_DIMENSION_SHRINKS) break;
    const nw = Math.max(1, Math.floor(width * DIMENSION_SHRINK));
    const nh = Math.max(1, Math.floor(height * DIMENSION_SHRINK));
    if (nw === width && nh === height) break;
    width = nw;
    height = nh;
  }
  canvas.width = canvas.height = 0; // release the bitmap memory promptly on phones
  return best!;
}

/** ImageOptimizer.optimise: one output (the profile photo). Same checks and messages as below. */
export async function optimise(file: File, spec: ImageSpec): Promise<OptimisedImage> {
  if (!file.type.startsWith('image/') && file.type !== '') throw new Error('That file isn’t a photo.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('That photo is too large to use.');
  let source: Source;
  try {
    source = await decode(file);
  } catch {
    throw new Error('That photo couldn’t be read. Try a JPEG or PNG.');
  }
  try {
    return await encode(source, spec);
  } finally {
    if ('close' in source) source.close();
  }
}

/**
 * ImageOptimizer.optimiseWithThumbnail: one decode, both outputs. Rejects with a message fit to show
 * when the file isn't a readable image.
 */
export async function optimiseWithThumbnail(file: File): Promise<OptimisedPair> {
  if (!file.type.startsWith('image/') && file.type !== '') throw new Error('That file isn’t a photo.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('That photo is too large to use.');
  let source: Source;
  try {
    source = await decode(file);
  } catch {
    throw new Error('That photo couldn’t be read. Try a JPEG or PNG.');
  }
  try {
    const image = await encode(source, LISTING_SPEC);
    const thumbnail = await encode(source, THUMBNAIL_SPEC);
    return { image, thumbnail };
  } finally {
    if ('close' in source) source.close();
  }
}
