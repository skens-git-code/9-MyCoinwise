/* —————————————————————————————————————
 * Receipt Image Compression & Storage Service
 * Extracts embedded images from PDF/Excel statements and direct image uploads,
 * compresses/resizes them to <= 800px JPEGs using `sharp`, and writes them to
 * `backend/public/uploads/receipts/` so MongoDB stores only a lightweight URL.
 * ————————————————————————————————————— */

const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { logger } = require('../../utils/logger');

const RECEIPTS_PUBLIC_DIR = path.join(__dirname, '../../public/uploads/receipts');
const RECEIPTS_TMP_DIR = path.join(os.tmpdir(), 'mycoinwise-receipts');
const RECEIPTS_URL_PREFIX = '/api/uploads/receipts';
const MIN_RECEIPT_IMAGE_BYTES = 5000;
const MAX_SAVED_IMAGES_PER_STATEMENT = 15;

let resolvedWritableDirPromise = null;

const resolveWritableReceiptsDir = async () => {
  if (!resolvedWritableDirPromise) {
    resolvedWritableDirPromise = (async () => {
      for (const candidate of [RECEIPTS_PUBLIC_DIR, RECEIPTS_TMP_DIR]) {
        try {
          await fs.mkdir(candidate, { recursive: true });
          const probeFile = path.join(candidate, `.probe-${process.pid}`);
          await fs.writeFile(probeFile, '');
          await fs.unlink(probeFile).catch(() => {});
          return candidate;
        } catch (err) {
          logger.warn('Receipt storage directory not writable, trying fallback', {
            dir: candidate,
            err: err.message,
          });
        }
      }
      return null;
    })();
  }
  return resolvedWritableDirPromise;
};

/**
 * Validates that a `receipt_url` points either to our receipt upload directory
 * or an explicit HTTP(S) URL (blocks `javascript:`, `data:text/html`, and path traversal).
 *
 * @param {unknown} value
 * @returns {string|null}
 */
const sanitizeReceiptUrl = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 1024) return null;
  if (trimmed.includes('..') || trimmed.includes('\\')) return null;

  if (/^\/(?:api\/)?uploads\/receipts\/[a-zA-Z0-9._-]+\.(?:jpe?g|png|webp)$/i.test(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Reject non-URL strings
  }
  return null;
};

/**
 * Compresses and saves an image Buffer (or raw PDF pixel buffer) as an optimized JPEG
 * under `backend/public/uploads/receipts/` and returns its API URL path.
 *
 * @param {Buffer|Uint8Array} rawBuffer
 * @param {{ minBytes?: number, width?: number, height?: number, kind?: number }} [options]
 * @returns {Promise<string|null>}
 */
const saveReceiptImageBuffer = async (
  rawBuffer,
  { minBytes = MIN_RECEIPT_IMAGE_BYTES, width, height, kind } = {}
) => {
  if (!rawBuffer) return null;
  const buf = Buffer.isBuffer(rawBuffer) ? rawBuffer : Buffer.from(rawBuffer);
  if (buf.length < minBytes) return null;

  let pipeline;
  try {
    // Attempt encoded image decode first (JPEG / PNG / WEBP / TIFF / GIF)
    const testMeta = await sharp(buf).metadata().catch(() => null);
    if (testMeta && testMeta.width && testMeta.height) {
      pipeline = sharp(buf);
    } else if (width && height) {
      // Fallback for uncompressed raw pixel buffers emitted by pdf-parse getImage()
      const pixelCount = Number(width) * Number(height);
      const inferredChannels =
        kind === 1 || buf.length === pixelCount
          ? 1
          : buf.length === pixelCount * 4
            ? 4
            : 3;
      if (pixelCount > 0 && buf.length >= pixelCount * inferredChannels) {
        pipeline = sharp(buf.subarray(0, pixelCount * inferredChannels), {
          raw: {
            width: Number(width),
            height: Number(height),
            channels: inferredChannels,
          },
        });
      }
    }

    if (!pipeline) return null;

    const targetDir = await resolveWritableReceiptsDir();
    if (!targetDir) return null;
    const filename = `receipt-${crypto.randomUUID()}.jpg`;
    const filepath = path.join(targetDir, filename);

    await pipeline
      .rotate()
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(filepath);

    return `${RECEIPTS_URL_PREFIX}/${filename}`;
  } catch (err) {
    logger.warn('Receipt image processing skipped', { err: err.message });
    return null;
  }
};

module.exports = {
  RECEIPTS_PUBLIC_DIR,
  RECEIPTS_TMP_DIR,
  RECEIPTS_URL_PREFIX,
  MIN_RECEIPT_IMAGE_BYTES,
  MAX_SAVED_IMAGES_PER_STATEMENT,
  sanitizeReceiptUrl,
  saveReceiptImageBuffer,
};

