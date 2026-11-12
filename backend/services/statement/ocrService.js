/* —————————————————————————————————————
 * OCR Service (Tesseract.js)
 * Extracts text from scanned / image-only PDF documents using embedded
 * page images (or rendered page screenshots) with strict page/time bounds.
 * ————————————————————————————————————— */

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { logger } = require('../../utils/logger');

const TESSERACT_CACHE_DIR = path.join(os.tmpdir(), 'mycoinwise-tesseract-cache');

let tesseractModule = null;
try {
  tesseractModule = require('tesseract.js');
} catch {
  // Optional dependency fallback
}

const DEFAULT_OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES) || 10;
const DEFAULT_OCR_TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS) || 25000;

const isOcrEnabled = () => {
  if (process.env.OCR_ENABLED === 'false') return false;
  if (process.env.NODE_ENV === 'test' && process.env.OCR_ENABLED !== 'true') return false;
  return Boolean(tesseractModule?.createWorker);
};

/**
 * Runs Tesseract OCR on an array of image Buffers using a single reused worker,
 * bounded by an overall timeout to protect API responsiveness.
 *
 * @param {Buffer[]} imageBuffers
 * @param {{ lang?: string, timeoutMs?: number }} [options]
 * @returns {Promise<{ text: string, pagesOcred: number }>}
 */
const recognizeImagesWithTesseract = async (imageBuffers, { lang = 'eng', timeoutMs = DEFAULT_OCR_TIMEOUT_MS } = {}) => {
  if (!tesseractModule?.createWorker || !Array.isArray(imageBuffers) || imageBuffers.length === 0) {
    return { text: '', pagesOcred: 0 };
  }

  let worker = null;
  let timer = null;

  try {
    await fs.mkdir(TESSERACT_CACHE_DIR, { recursive: true }).catch(() => {});
    const workerOptions = {
      cachePath: TESSERACT_CACHE_DIR,
      logger: () => {},
    };
    if (process.env.OCR_LANG_PATH) {
      workerOptions.langPath = process.env.OCR_LANG_PATH;
    }

    const workPromise = (async () => {
      worker = await tesseractModule.createWorker(lang, 1, workerOptions);
      const chunks = [];
      let pagesOcred = 0;

      for (const imgBuf of imageBuffers) {
        if (!imgBuf || imgBuf.length === 0) continue;
        const { data } = await worker.recognize(imgBuf);
        const pageText = String(data?.text || '').trim();
        if (pageText) {
          chunks.push(pageText);
          pagesOcred += 1;
        }
      }

      return {
        text: chunks.join('\n'),
        pagesOcred,
      };
    })();

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`OCR timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    return await Promise.race([workPromise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
    if (worker && typeof worker.terminate === 'function') {
      await worker.terminate().catch(() => {});
    }
  }
};

/**
 * Attempts OCR on a PDFParse instance when selectable text extraction yielded nothing.
 * Uses embedded page images first (fastest for scanned PDFs), falling back to screenshots.
 *
 * @param {any} parser PDFParse instance
 * @param {{ maxPages?: number, timeoutMs?: number, ocrRunner?: Function }} [options]
 * @returns {Promise<{ text: string, ocrUsed: boolean, pagesOcred: number, warning?: string }>}
 */
const extractTextFromScannedPdf = async (
  parser,
  {
    maxPages = DEFAULT_OCR_MAX_PAGES,
    timeoutMs = DEFAULT_OCR_TIMEOUT_MS,
    ocrRunner = null,
  } = {}
) => {
  const runner = ocrRunner || recognizeImagesWithTesseract;
  if (!ocrRunner && !isOcrEnabled()) {
    return { text: '', ocrUsed: false, pagesOcred: 0 };
  }

  const imageBuffers = [];

  try {
    if (typeof parser.getImage === 'function') {
      const imgResult = await parser.getImage({
        first: maxPages,
        imageBuffer: true,
        imageDataUrl: false,
        imageThreshold: 80,
      });
      for (const page of imgResult?.pages || []) {
        for (const img of page?.images || []) {
          if (img?.data && img.data.length > 0) {
            imageBuffers.push(Buffer.from(img.data));
          }
        }
      }
    }

    if (imageBuffers.length === 0 && typeof parser.getScreenshot === 'function') {
      const shotResult = await parser.getScreenshot({
        first: Math.min(maxPages, 5),
        scale: 2,
        imageBuffer: true,
        imageDataUrl: false,
      });
      for (const page of shotResult?.pages || []) {
        if (page?.data && page.data.length > 0) {
          imageBuffers.push(Buffer.from(page.data));
        }
      }
    }
  } catch (err) {
    logger.warn('OCR image extraction from PDF failed', { err: err.message });
    return { text: '', ocrUsed: false, pagesOcred: 0, warning: 'Scanned PDF image extraction failed.' };
  }

  if (imageBuffers.length === 0) {
    return { text: '', ocrUsed: false, pagesOcred: 0 };
  }

  try {
    const result = await runner(imageBuffers, { timeoutMs });
    return {
      text: result?.text || '',
      ocrUsed: Boolean(result?.text && result.text.trim()),
      pagesOcred: result?.pagesOcred || 0,
    };
  } catch (err) {
    logger.warn('Tesseract OCR failed on scanned PDF', { err: err.message });
    return {
      text: '',
      ocrUsed: false,
      pagesOcred: 0,
      warning: `OCR attempt failed: ${err.message}`,
    };
  }
};

module.exports = {
  isOcrEnabled,
  recognizeImagesWithTesseract,
  extractTextFromScannedPdf,
};
