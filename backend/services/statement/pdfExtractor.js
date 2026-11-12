/* —————————————————————————————————————
 * PDF Extraction Engine
 * Multi-strategy PDF bank statement & table extraction:
 *   1. Vector grid table extraction (`pdf-parse` PDFParse.getTable)
 *   2. Coordinate-based stream table reconstruction (`pdfjs-dist` X/Y clustering)
 *   3. App-specific (PhonePe, Paytm, GPay, BharatPe) & multi-line text parser
 *   4. OCR fallback via Tesseract.js for scanned / image-only PDFs
 * ————————————————————————————————————— */

const { pathToFileURL } = require('url');
const {
  MAX_AMOUNT,
  cleanText,
  toIsoDay,
  parseStatementAmount,
  isBalanceOrSummary,
} = require('./helpers');
const { detectBankName, extractTransactionId } = require('./classifiers');
const { detectTableHeader, normalizeTabularRows, headerKey, normalizeExplicitCategory } = require('./tabularNormalizer');
const { extractTextFromScannedPdf } = require('./ocrService');
const { saveReceiptImageBuffer, MAX_SAVED_IMAGES_PER_STATEMENT } = require('./receiptStorage');
const { logger } = require('../../utils/logger');

let pdfModule = null;
try {
  pdfModule = require('pdf-parse');
} catch {
  // Graceful fallback if pdf-parse is missing
}

let pdfjsPromise = null;
const loadPdfJs = async () => {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      try {
        const resolved = require.resolve('pdfjs-dist/legacy/build/pdf.mjs');
        const mod = await import(pathToFileURL(resolved).href);
        if (mod?.GlobalWorkerOptions && !mod.GlobalWorkerOptions.workerSrc) {
          try {
            const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
            mod.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
          } catch {
            // Worker optional in environments with bundled workers
          }
        }
        return mod;
      } catch {
        return await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => null);
      }
    })();
  }
  return pdfjsPromise;
};

const toPdfUint8Array = (buffer) =>
  Buffer.isBuffer(buffer)
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : buffer instanceof Uint8Array
      ? buffer
      : new Uint8Array(buffer);

const PAGE_CONCURRENCY = 4;

/**
 * Checks whether a password-related error was thrown by pdf-parse or pdfjs-dist.
 */
const isPasswordError = (err) =>
  err?.name === 'PasswordException' ||
  /password|encrypted/i.test(String(err?.message || ''));

const createPasswordRequiredError = (password) => {
  const passErr = new Error(
    password
      ? 'Incorrect password for this protected PDF statement.'
      : 'This PDF is password-protected. Please provide the statement password to unlock.'
  );
  passErr.code = 'PDF_PASSWORD_REQUIRED';
  return passErr;
};

/**
 * Normalizes a 2D table array from PDFParse.getTable() and merges compatible
 * multi-page tables that continue the same transaction ledger.
 */
const collectCandidateTables = (tableResult) => {
  const candidates = [];
  if (!tableResult) return candidates;

  if (Array.isArray(tableResult.mergedTables)) {
    for (const tbl of tableResult.mergedTables) {
      if (Array.isArray(tbl) && tbl.length >= 2) {
        candidates.push(tbl);
      }
    }
  }

  const pageTables = [];
  for (const page of tableResult.pages || []) {
    for (const tbl of page?.tables || []) {
      if (Array.isArray(tbl) && tbl.length >= 2) {
        pageTables.push(tbl);
      }
    }
  }

  // Merge consecutive page tables sharing header signature or column count
  if (pageTables.length > 0) {
    let activeTable = pageTables[0].map((r) => r.map((c) => cleanText(c)));
    let activeHeader = detectTableHeader(activeTable);

    for (let i = 1; i < pageTables.length; i += 1) {
      const next = pageTables[i].map((r) => r.map((c) => cleanText(c)));
      const nextHeader = detectTableHeader(next);
      const sameColCount =
        activeTable[0] && next[0] && activeTable[0].length === next[0].length;

      if (activeHeader && sameColCount) {
        if (nextHeader) {
          // Skip repeated header on continuation page
          activeTable.push(...next.slice(nextHeader.headerIndex + 1));
        } else {
          activeTable.push(...next);
        }
      } else {
        candidates.push(activeTable);
        activeTable = next;
        activeHeader = nextHeader;
      }
    }
    candidates.push(activeTable);
  }

  return candidates;
};

/**
 * Clusters pdfjs text items on a single page into visual rows and cell tokens
 * using Y-baseline proximity and X-gap thresholds.
 *
 * @param {Array<{ str: string, transform: number[], width: number }>} items
 * @param {{ yTolerance?: number, cellGap?: number }} [options]
 * @returns {Array<Array<{ text: string, x: number, endX: number, centerX: number }>>}
 */
const clusterPageItemsToRows = (items, { yTolerance = 3.5, cellGap = 8 } = {}) => {
  const tokens = [];
  for (const item of items || []) {
    const str = String(item?.str || '').replace(/\s+/g, ' ').trim();
    if (!str) continue;
    const x = Number(item.transform?.[4] ?? 0);
    const y = Number(item.transform?.[5] ?? 0);
    const width = Math.max(0, Number(item.width ?? str.length * 4));
    tokens.push({ text: str, x, y, endX: x + width });
  }

  if (tokens.length === 0) return [];

  // Sort top-to-bottom (higher y first in PDF coordinates), then left-to-right
  tokens.sort((a, b) => {
    if (Math.abs(b.y - a.y) > yTolerance) return b.y - a.y;
    return a.x - b.x;
  });

  // Group into baseline rows
  const rowGroups = [];
  let currentGroup = [tokens[0]];
  let currentY = tokens[0].y;

  for (let i = 1; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (Math.abs(tok.y - currentY) <= yTolerance) {
      currentGroup.push(tok);
    } else {
      rowGroups.push(currentGroup);
      currentGroup = [tok];
      currentY = tok.y;
    }
  }
  rowGroups.push(currentGroup);

  // Merge adjacent tokens on the same line within cellGap into single cells
  return rowGroups.map((group) => {
    group.sort((a, b) => a.x - b.x);
    const cells = [];
    let active = {
      text: group[0].text,
      x: group[0].x,
      endX: group[0].endX,
    };

    for (let i = 1; i < group.length; i += 1) {
      const next = group[i];
      const gap = next.x - active.endX;
      if (gap < cellGap) {
        active.text = `${active.text} ${next.text}`.replace(/\s+/g, ' ').trim();
        active.endX = Math.max(active.endX, next.endX);
      } else {
        cells.push({
          ...active,
          centerX: (active.x + active.endX) / 2,
        });
        active = {
          text: next.text,
          x: next.x,
          endX: next.endX,
        };
      }
    }
    cells.push({
      ...active,
      centerX: (active.x + active.endX) / 2,
    });

    return cells;
  });
};

/**
 * Reconstructs a 2D table from borderless coordinate-positioned PDF pages.
 * Equivalent to stream-mode table extraction in Camelot / pdfplumber.
 *
 * @param {Buffer} buffer
 * @param {{ password?: string|null, preferredFormat?: string }} [options]
 * @returns {Promise<{ rows: string[][], pageCount: number, headerText: string } | null>}
 */
const reconstructCoordinateTable = async (buffer, { password = null, preferredFormat = 'DMY' } = {}) => {
  const pdfjs = await loadPdfJs();
  if (!pdfjs?.getDocument) return null;

  let doc = null;
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(toPdfUint8Array(buffer)),
      password: password || undefined,
      verbosity: 0,
    });
    doc = await loadingTask.promise;
    const pageCount = doc.numPages || 0;
    if (pageCount === 0) return null;

    // Process pages in bounded parallel batches
    const pageRowClusters = new Array(pageCount);
    for (let start = 1; start <= pageCount; start += PAGE_CONCURRENCY) {
      const batchNums = [];
      for (let p = start; p < start + PAGE_CONCURRENCY && p <= pageCount; p += 1) {
        batchNums.push(p);
      }
      await Promise.all(
        batchNums.map(async (pageNum) => {
          const page = await doc.getPage(pageNum);
          const content = await page.getTextContent();
          pageRowClusters[pageNum - 1] = clusterPageItemsToRows(content?.items || []);
        })
      );
    }

    const allVisualRows = pageRowClusters.flat();
    if (allVisualRows.length < 2) return null;

    const headerText = allVisualRows
      .slice(0, 15)
      .map((r) => r.map((c) => c.text).join(' '))
      .join('\n')
      .slice(0, 600);

    // Find the coordinate header row (must have >= 3 distinct X-separated cell tokens)
    let headerIdx = -1;
    let colSpecs = null;

    for (let r = 0; r < Math.min(40, allVisualRows.length); r += 1) {
      const visualRow = allVisualRows[r];
      if (visualRow.length < 3) continue;

      const textCells = visualRow.map((c) => c.text);
      const detected = detectTableHeader([textCells]);
      if (detected) {
        headerIdx = r;
        const { columns } = detected;
        const numericIndices = new Set(
          [columns.debit, columns.credit, columns.amount, columns.balance].filter((idx) => idx >= 0)
        );
        colSpecs = visualRow.map((cell, idx) => ({
          index: idx,
          key: headerKey(cell.text),
          x: cell.x,
          endX: cell.endX,
          centerX: cell.centerX,
          isNumeric: numericIndices.has(idx),
        }));
        break;
      }
    }

    if (headerIdx < 0 || !colSpecs || colSpecs.length < 3) {
      return null;
    }

    // Compute midpoint boundaries between adjacent columns
    for (let i = 0; i < colSpecs.length; i += 1) {
      colSpecs[i].leftBound =
        i === 0 ? -Infinity : (colSpecs[i - 1].centerX + colSpecs[i].centerX) / 2;
      colSpecs[i].rightBound =
        i === colSpecs.length - 1 ? Infinity : (colSpecs[i].centerX + colSpecs[i + 1].centerX) / 2;
    }

    const headerDetected = detectTableHeader([allVisualRows[headerIdx].map((c) => c.text)]);
    const dateColIdx = headerDetected.columns.date;
    const descColIdx = headerDetected.columns.description;
    const amtIndices = [
      headerDetected.columns.debit,
      headerDetected.columns.credit,
      headerDetected.columns.amount,
    ].filter((idx) => idx >= 0);

    const assignColumn = (cell) => {
      const looksNumeric = /^[+-]?(?:₹|rs\.?|inr|\$|€|£)?\s*\(?\s*\d[\d,.]*\s*\)?(?:\s*(?:dr|cr))?$/i.test(cell.text);
      if (looksNumeric) {
        const numericCols = colSpecs.filter((c) => c.isNumeric);
        if (numericCols.length > 0) {
          let bestCol = null;
          let bestDist = Infinity;
          for (const col of numericCols) {
            // Distance considering both right-alignment (endX) and left-alignment (x)
            const dist = Math.min(
              Math.abs(cell.endX - col.endX),
              Math.abs(cell.x - col.x),
              Math.abs(cell.centerX - col.centerX)
            );
            if (dist < bestDist) {
              bestDist = dist;
              bestCol = col;
            }
          }
          if (bestCol && bestDist <= 55) {
            return bestCol.index;
          }
        }
      }

      // Text / date columns: match by left edge or center against column bounds
      for (const col of colSpecs) {
        if (cell.x >= col.leftBound && cell.x < col.rightBound) {
          return col.index;
        }
      }
      let nearest = 0;
      let minDist = Infinity;
      for (const col of colSpecs) {
        const d = Math.abs(cell.x - col.x);
        if (d < minDist) {
          minDist = d;
          nearest = col.index;
        }
      }
      return nearest;
    };

    const matrix = [allVisualRows[headerIdx].map((c) => c.text)];
    let lastTxRow = null;

    for (let r = headerIdx + 1; r < allVisualRows.length; r += 1) {
      const visualRow = allVisualRows[r];
      const rowText = visualRow.map((c) => c.text).join(' ');
      if (isBalanceOrSummary(rowText)) continue;

      // Skip repeated page headers
      if (visualRow.length >= 3 && detectTableHeader([visualRow.map((c) => c.text)])) {
        continue;
      }

      const cells = new Array(colSpecs.length).fill('');
      for (const token of visualRow) {
        const colIdx = assignColumn(token);
        cells[colIdx] = cells[colIdx]
          ? `${cells[colIdx]} ${token.text}`.trim()
          : token.text;
      }

      const hasDate = Boolean(toIsoDay(cells[dateColIdx], preferredFormat));
      const hasAmount = amtIndices.some((idx) => parseStatementAmount(cells[idx]) !== null);

      if (hasDate || hasAmount) {
        matrix.push(cells);
        lastTxRow = cells;
      } else if (lastTxRow && descColIdx >= 0 && cells[descColIdx]) {
        // Merge wrapped multi-line narration into previous transaction row
        lastTxRow[descColIdx] = `${lastTxRow[descColIdx]} ${cells[descColIdx]}`.trim();
      }
    }

    if (matrix.length < 2) return null;
    return { rows: matrix, pageCount, headerText };
  } catch (err) {
    if (isPasswordError(err)) {
      throw createPasswordRequiredError(password);
    }
    return null;
  } finally {
    if (doc && typeof doc.destroy === 'function') {
      await doc.destroy().catch(() => {});
    }
  }
};

const extractRawTextWithPdfJs = async (buffer, password = null) => {
  const pdfjs = await loadPdfJs();
  if (!pdfjs?.getDocument) return null;

  let doc = null;
  try {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(toPdfUint8Array(buffer)),
      password: password || undefined,
      verbosity: 0,
    });
    doc = await loadingTask.promise;
    const pageCount = doc.numPages || 0;
    const pageTexts = new Array(pageCount);

    for (let start = 1; start <= pageCount; start += PAGE_CONCURRENCY) {
      const batchNums = [];
      for (let p = start; p < start + PAGE_CONCURRENCY && p <= pageCount; p += 1) {
        batchNums.push(p);
      }
      await Promise.all(
        batchNums.map(async (pageNum) => {
          const page = await doc.getPage(pageNum);
          const content = await page.getTextContent();
          const clustered = clusterPageItemsToRows(content?.items || [], { yTolerance: 3.5, cellGap: 14 });
          pageTexts[pageNum - 1] = clustered.map((row) => row.map((c) => c.text).join(' ')).join('\n');
        })
      );
    }

    return {
      text: pageTexts.filter(Boolean).join('\n'),
      pageCount,
    };
  } catch (err) {
    if (isPasswordError(err)) {
      throw createPasswordRequiredError(password);
    }
    return null;
  } finally {
    if (doc && typeof doc.destroy === 'function') {
      await doc.destroy().catch(() => {});
    }
  }
};

const extractAndSaveImages = async (parser) => {
  const extractedImages = [];
  if (!parser || typeof parser.getImage !== 'function') return extractedImages;
  try {
    const imgResult = await parser.getImage({
      first: 5,
      imageBuffer: true,
      imageDataUrl: false,
      imageThreshold: 80,
    });
    for (const page of imgResult?.pages || []) {
      for (const img of page?.images || []) {
        if (extractedImages.length >= MAX_SAVED_IMAGES_PER_STATEMENT) return extractedImages;
        if (img?.data && img.data.length > 0) {
          const url = await saveReceiptImageBuffer(img.data, {
            width: img.width,
            height: img.height,
            kind: img.kind,
          });
          if (url) extractedImages.push(url);
        }
      }
    }
  } catch (err) {
    logger.warn('Failed to extract embedded images from PDF', { err: err.message });
  }
  return extractedImages;
};

/**
 * Extracts raw text (and optionally tables/images) from a PDF buffer using pdf-parse v2.4.5,
 * with a direct pdfjs-dist text-stream fallback when pdf-parse crashes on malformed annotations (`anchors`).
 */
const extractPdfArtifacts = async (
  buffer,
  { password = null, ocrRunner = null, saveReceipts = true } = {}
) => {
  if (!pdfModule) {
    throw new Error('PDF parsing library is not available.');
  }

  const pdfLib = pdfModule?.default || pdfModule;
  let text = '';
  let pageCount = 0;
  let tableCandidates = [];
  let ocrUsed = false;
  let extractedImages = [];
  const warnings = [];

  try {
    if (typeof pdfLib === 'function') {
      try {
        const options = password ? { password } : {};
        const data = await pdfLib(buffer, options);
        text = data?.text || '';
        pageCount = data?.numpages || 1;
      } catch (legacyErr) {
        if (isPasswordError(legacyErr)) throw legacyErr;
        logger.warn('pdf-parse threw error, falling back to pdfjs-dist text extraction', { err: legacyErr.message });
        const fallback = await extractRawTextWithPdfJs(buffer, password);
        if (!fallback) throw legacyErr;
        text = fallback.text;
        pageCount = fallback.pageCount;
      }
    } else if (pdfLib.PDFParse) {
      const parser = new pdfLib.PDFParse({
        data: buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer),
        password: password || undefined,
        verbosity: 0,
      });

      try {
        // Run getText then getTable sequentially on the same PDFParse instance
        // because pdfjs-dist worker transport rejects concurrent load/transfer calls.
        let textRes = null;
        try {
          textRes = await parser.getText({
            cellSeparator: '\t',
            cellThreshold: 7,
            lineEnforce: true,
            lineThreshold: 4.6,
            pageJoiner: '',
          });
        } catch (textErr) {
          if (isPasswordError(textErr)) throw textErr;
          logger.warn('pdf-parse getText failed, falling back to pdfjs-dist raw text extraction', { err: textErr.message });
          const fallback = await extractRawTextWithPdfJs(buffer, password);
          if (!fallback) throw textErr;
          text = fallback.text;
          pageCount = fallback.pageCount;
        }

        if (textRes) {
          const tableRes =
            typeof parser.getTable === 'function'
              ? await parser.getTable().catch((tblErr) => {
                  logger.warn('PDF vector table extraction warning', { err: tblErr.message });
                  return null;
                })
              : null;

          text = textRes?.text || '';
          pageCount = textRes?.total || tableRes?.total || 0;
          tableCandidates = collectCandidateTables(tableRes);
        }

        // OCR Fallback when PDF has no selectable text
        if (!text || !text.trim()) {
          const ocrResult = await extractTextFromScannedPdf(parser, { ocrRunner });
          if (ocrResult.warning) warnings.push(ocrResult.warning);
          if (ocrResult.ocrUsed && ocrResult.text.trim()) {
            text = ocrResult.text;
            ocrUsed = true;
          }
        }

        if (saveReceipts) {
          extractedImages = await extractAndSaveImages(parser);
        }
      } finally {
        if (typeof parser.destroy === 'function') {
          await parser.destroy();
        }
      }
    } else {
      throw new Error('Unsupported pdf-parse module structure.');
    }
  } catch (err) {
    if (isPasswordError(err)) {
      throw createPasswordRequiredError(password);
    }
    throw new Error(`Failed to parse PDF: ${err.message}`);
  }

  if (!text || !text.trim()) {
    const ocrErr = new Error(
      'Could not extract text from this PDF. The document may be scanned or image-only (OCR required).'
    );
    ocrErr.code = 'PDF_OCR_REQUIRED';
    ocrErr.ocr_required = true;
    throw ocrErr;
  }

  return {
    text,
    pageCount,
    tableCandidates,
    ocrUsed,
    warnings,
    extractedImages,
  };
};

/**
 * App-specific and general multi-line PDF text parsers (PhonePe, Paytm, GPay, BharatPe, Banks).
 */
const parsePdfTextTransactions = (text, filename = '', { preferredFormat = 'DMY' } = {}) => {
  const headerSlice = text.slice(0, 600).toLowerCase();
  const filenameLower = filename.toLowerCase();

  let defaultBank = null;
  let statementSource = 'bank_pdf';

  if (filenameLower.includes('phonepe') || /phonepe statement|transaction statement.*phonepe/i.test(headerSlice)) {
    defaultBank = 'PhonePe';
    statementSource = 'phonepe_pdf';
  } else if (filenameLower.includes('paytm') || /paytm payments bank|paytm wallet|paytm statement|passbook.*paytm|passbook payments history/i.test(headerSlice)) {
    defaultBank = 'Paytm Payments Bank';
    statementSource = 'paytm_pdf';
  } else if (filenameLower.includes('google_pay') || filenameLower.includes('gpay') || /google pay|gpay.*statement/i.test(headerSlice)) {
    defaultBank = 'Google Pay';
    statementSource = 'gpay_pdf';
  } else if (filenameLower.includes('bharatpe') || /bharatpe|qr settlement/i.test(headerSlice)) {
    defaultBank = 'BharatPe';
    statementSource = 'bharatpe_pdf';
  } else {
    defaultBank = detectBankName(filename, null) || detectBankName(headerSlice, 'Bank Statement');
  }

  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const transactions = [];

  // 1. PhonePe Statement Parser
  if (statementSource === 'phonepe_pdf' || /transaction id\s*:\s*T\d+/i.test(text)) {
    let currentBlock = null;
    let lastSeenDate = null;

    for (let i = 0; i < rawLines.length; i += 1) {
      const line = rawLines[i];
      if (isBalanceOrSummary(line)) continue;

      const parsedDate = toIsoDay(line, preferredFormat);
      if (parsedDate) lastSeenDate = parsedDate;

      const isStart = /^(paid to|received from|payment to|payment from|money received|money sent|cashback)\b/i.test(line);
      if (isStart) {
        if (currentBlock && currentBlock.amount && currentBlock.date) {
          transactions.push(currentBlock);
        }
        currentBlock = {
          raw: [line],
          date: lastSeenDate || null,
          type: /received|cashback|credited/i.test(line) ? 'income' : 'expense',
          desc: line,
        };
        continue;
      }

      if (currentBlock) {
        currentBlock.raw.push(line);
        currentBlock.desc += ` ${line}`;
        if (!currentBlock.date && parsedDate) currentBlock.date = parsedDate;

        const isTxnLine = /transaction\s*id|txn\s*id|utr|order\s*id|account|a\/c/i.test(line);
        if (!isTxnLine && !currentBlock.amount) {
          const amtMatch =
            line.match(/(?:amount|rs\.?|₹|inr)\s*[:\-]?\s*(?:[+-]\s*)?(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
            line.match(/(?:[+-]\s*)?(?:₹|rs\.?|inr)\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
            line.match(/\b([0-9]{1,3}(?:,[0-9]{2,3})*\.[0-9]{2})\b/);
          if (amtMatch) {
            const parsedAmt = parseStatementAmount(amtMatch[1]);
            if (parsedAmt && parsedAmt > 0 && parsedAmt <= MAX_AMOUNT) {
              currentBlock.amount = parsedAmt;
            }
          }
        }

        if (/credit|received|cashback/i.test(line)) currentBlock.type = 'income';
        else if (/debit|paid to/i.test(line)) currentBlock.type = 'expense';

        const txnMatch = extractTransactionId(line);
        if (txnMatch && !currentBlock.txnId) currentBlock.txnId = txnMatch;
      }
    }
    if (currentBlock && currentBlock.amount && currentBlock.date) {
      transactions.push(currentBlock);
    }
  }

  // 2. Paytm Passbook / UPI Statement Parser (supports both multi-line UPI statement cards and single-line passbook)
  if (transactions.length === 0 && (statementSource === 'paytm_pdf' || /paytm/i.test(headerSlice))) {
    // Infer statement year (e.g. "1 NOV'26 - 9 NOV'26" -> 2026) for yearless "09 Nov" row dates
    const periodYearMatch =
      headerSlice.match(/\b\d{1,2}\s+[a-z]{3,9}\s*['’](\d{2})\b/i) ||
      headerSlice.match(/\b(20\d{2})\b/);
    const fallbackYear = periodYearMatch
      ? (periodYearMatch[1].length === 2 ? 2000 + Number(periodYearMatch[1]) : Number(periodYearMatch[1]))
      : new Date().getUTCFullYear();

    // Strategy 2A: Multi-line Paytm UPI Statement cards ("Passbook Payments History")
    const dayMonRegex = /^(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\s*['’]?(\d{2,4}))?\b/i;
    const paytmCardStart = /^(?:paid to|money sent to|received from|recharge of|payment to|payment from)\b/i;
    const isPaytmNoiseLine = (l) =>
      /^(?:page \d+ of \d+|powered by|for any queries|contact us|all payments done|passbook payments history|date\s*&\s*time|transaction details|notes\s*&\s*tags|your account|amount|note:|accounts\b|total money|payment made|payment received|self transfer|payments that you)/i.test(l) ||
      /^\d{1,2}:\d{2}\s*(?:am|pm)$/i.test(l);

    const historyIdx = rawLines.findIndex((l) => /passbook payments history/i.test(l));
    const cardLines = historyIdx >= 0 ? rawLines.slice(historyIdx + 1) : rawLines;
    let activeCard = null;
    let pendingDate = null;

    const finalizePaytmCard = (card) => {
      if (!card || !card.date || !card.lines.length) return;
      const fullText = card.lines.join(' ');
      const amtMatches = [...fullText.matchAll(/([+-]\s*)?(?:₹|rs\.?|inr)\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi)];
      if (amtMatches.length === 0) return;

      const lastAmt = amtMatches[amtMatches.length - 1];
      const amount = parseStatementAmount(lastAmt[2]);
      if (!amount || amount <= 0 || amount > MAX_AMOUNT) return;

      const signStr = String(lastAmt[1] || '').replace(/\s+/g, '');
      const isCredit =
        signStr === '+' ||
        (/\b(?:received from|money received|refund|cashback|credited)\b/i.test(fullText) && signStr !== '-');

      const tagMatch = fullText.match(/tag\s*:\s*#?\s*([a-z][a-z\s/&]{1,35}?)(?=\s+(?:union bank|hdfc|icici|sbi|axis|kotak|idfc|federal|canara|pnb|bob|yes bank|bank|rs\.|₹|[+-]\s*rs\.|$))/i) ||
        fullText.match(/#\s*([a-z][a-z\s/&]{1,35}?)(?=\s+(?:union bank|hdfc|icici|sbi|axis|kotak|idfc|federal|canara|pnb|bob|yes bank|bank|rs\.|₹|[+-]\s*rs\.|$))/i);
      const explicitTag = tagMatch ? normalizeExplicitCategory(tagMatch[1].replace(/\uFE0F/g, '').trim()) : null;
      const bankMatch = detectBankName(fullText, null);

      const titleLines = [];
      for (const l of card.lines) {
        if (/^(?:upi\s*id|upi\s*ref|order\s*id|note|tag)\s*:|^[+-]?\s*(?:₹|rs\.?|inr)\s*\d/i.test(l)) break;
        if (detectBankName(l, null) && /-\s*\d{2,4}$/.test(l)) break;
        titleLines.push(l);
      }
      const cleanHeadline = titleLines.join(' ').trim();
      const descForEntities = cleanHeadline
        ? `${cleanHeadline} | ${card.lines.slice(titleLines.length).join(' ')}`
        : card.lines.join(' | ');

      transactions.push({
        date: card.date,
        type: isCredit ? 'income' : 'expense',
        amount,
        desc: descForEntities,
        raw: card.lines,
        txnId: extractTransactionId(fullText),
        category: explicitTag,
        bank_name: bankMatch,
      });
    };

    for (let i = 0; i < cardLines.length; i += 1) {
      const line = cardLines[i];
      if (isPaytmNoiseLine(line) || isBalanceOrSummary(line)) continue;

      const dm = line.match(dayMonRegex);
      if (dm) {
        const yearToken = dm[3] ? (dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : String(fallbackYear);
        const resolvedDate = toIsoDay(`${dm[1]} ${dm[2]} ${yearToken}`, preferredFormat);
        if (resolvedDate) {
          if (activeCard) {
            finalizePaytmCard(activeCard);
            activeCard = null;
          }
          pendingDate = resolvedDate;
          const rest = line.slice(dm[0].length).replace(/^\s*\d{1,2}:\d{2}\s*(?:am|pm)?\s*/i, '').trim();
          if (paytmCardStart.test(rest)) {
            activeCard = { date: resolvedDate, lines: [rest] };
          }
          continue;
        }
      }

      if (paytmCardStart.test(line) && (pendingDate || activeCard?.date)) {
        if (activeCard) finalizePaytmCard(activeCard);
        activeCard = { date: pendingDate || activeCard?.date, lines: [line] };
        continue;
      }

      if (activeCard) {
        activeCard.lines.push(line);
      }
    }
    if (activeCard) finalizePaytmCard(activeCard);

    // Strategy 2B: Single-line Paytm passbook fallback
    if (transactions.length === 0) {
      for (let i = 0; i < rawLines.length; i += 1) {
        const line = rawLines[i];
        if (isBalanceOrSummary(line)) continue;

        const dateMatch = line.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[-\s.]?[A-Za-z]{3,9}[-\s.]?\d{2,4}|[A-Za-z]{3,9}[-\s.]?\d{1,2}[-\s.,]*\d{2,4}|\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2})\b/);
        const rawDateStr = dateMatch ? dateMatch[0] : null;
        const date = toIsoDay(rawDateStr || line, preferredFormat);
        if (!date) continue;

        const lineWithoutDate = (rawDateStr ? line.replace(rawDateStr, ' ') : line)
          .replace(/\b\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}\b|\b\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}\b/, ' ');
        const amtMatch =
          lineWithoutDate.match(/(?:[+-]\s*)?(?:₹|rs\.?|inr)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i) ||
          lineWithoutDate.match(/(?:[+-]\s*)?([0-9,]+\.[0-9]{2})/i);

        if (amtMatch) {
          const isCredit = line.includes('+') || /received|cashback|refund|credit/i.test(line);
          const amount = parseStatementAmount(amtMatch[1]);
          if (amount && amount > 0) {
            transactions.push({
              date,
              type: isCredit ? 'income' : 'expense',
              amount,
              desc: line,
              raw: [line],
              txnId: extractTransactionId(line),
            });
          }
        }
      }
    }
  }

  // 3. Google Pay PDF Parser
  if (transactions.length === 0 && (statementSource === 'gpay_pdf' || /google pay|gpay/i.test(headerSlice))) {
    let currentBlock = null;
    let lastSeenDate = null;

    for (let i = 0; i < rawLines.length; i += 1) {
      const line = rawLines[i];
      if (isBalanceOrSummary(line)) continue;

      const parsedDate = toIsoDay(line, preferredFormat);
      if (parsedDate) lastSeenDate = parsedDate;

      const isStart = /^(paid\b|payment\b|received\b)/i.test(line);
      if (isStart) {
        if (currentBlock && currentBlock.amount && currentBlock.date) {
          transactions.push(currentBlock);
        }
        currentBlock = {
          raw: [line],
          date: lastSeenDate || null,
          type: /received|from\b/i.test(line) ? 'income' : 'expense',
          desc: line,
        };
        const startAmt =
          line.match(/(?:amount|rs\.?|₹|inr)\s*[:\-]?\s*(?:[+-]\s*)?(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
          line.match(/(?:[+-]\s*)?(?:₹|rs\.?|inr)\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
          (!/id|utr|order/i.test(line) && line.match(/\b([0-9]{1,3}(?:,[0-9]{2,3})*\.[0-9]{2})\b/));
        if (startAmt) {
          const parsedAmt = parseStatementAmount(startAmt[1]);
          if (parsedAmt && parsedAmt > 0 && parsedAmt <= MAX_AMOUNT) {
            currentBlock.amount = parsedAmt;
          }
        }
        continue;
      }

      if (currentBlock) {
        currentBlock.raw.push(line);
        currentBlock.desc += ` ${line}`;
        if (!currentBlock.date && parsedDate) currentBlock.date = parsedDate;

        const isTxnLine = /transaction\s*id|txn\s*id|utr|google\s*transaction/i.test(line);
        if (!isTxnLine && !currentBlock.amount) {
          const amtMatch =
            line.match(/(?:amount|rs\.?|₹|inr)\s*[:\-]?\s*(?:[+-]\s*)?(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
            line.match(/(?:[+-]\s*)?(?:₹|rs\.?|inr)\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
            line.match(/\b([0-9]{1,3}(?:,[0-9]{2,3})*\.[0-9]{2})\b/);
          if (amtMatch) {
            const parsedAmt = parseStatementAmount(amtMatch[1]);
            if (parsedAmt && parsedAmt > 0 && parsedAmt <= MAX_AMOUNT) {
              currentBlock.amount = parsedAmt;
            }
          }
        }

        const txnMatch = extractTransactionId(line);
        if (txnMatch && !currentBlock.txnId) currentBlock.txnId = txnMatch;
      }
    }
    if (currentBlock && currentBlock.amount && currentBlock.date) {
      transactions.push(currentBlock);
    }
  }

  // 4. BharatPe PDF Parser
  if (transactions.length === 0 && (statementSource === 'bharatpe_pdf' || /bharatpe/i.test(headerSlice))) {
    let lastSeenDate = null;
    let currentTxnId = null;
    let currentDesc = '';

    for (let i = 0; i < rawLines.length; i += 1) {
      const line = rawLines[i];
      if (isBalanceOrSummary(line)) continue;

      const date = toIsoDay(line, preferredFormat);
      if (date && date !== lastSeenDate) {
        currentDesc = '';
        currentTxnId = null;
      }
      if (date) lastSeenDate = date;

      const txnIdMatch = extractTransactionId(line);
      if (txnIdMatch) currentTxnId = txnIdMatch;

      currentDesc += ` ${line}`;

      const amtMatch =
        line.match(/(?:amount|rs\.?|₹|inr)\s*[:\-]?\s*(?:[+-]\s*)?(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
        (!/transaction\s*id|txn\s*id|utr|order\s*id/i.test(line) && line.match(/\b([0-9]{1,3}(?:,[0-9]{2,3})*\.[0-9]{2})\b/));

      if (amtMatch && (date || lastSeenDate)) {
        const amount = parseStatementAmount(amtMatch[1]);
        if (amount && amount > 0 && amount <= MAX_AMOUNT) {
          transactions.push({
            date: date || lastSeenDate,
            type: /payout|debit|charge/i.test(currentDesc) ? 'expense' : 'income',
            amount,
            desc: currentDesc.trim(),
            raw: [currentDesc.trim()],
            txnId: currentTxnId,
          });
          currentTxnId = null;
          currentDesc = '';
        }
      }
    }
  }

  // 5. General Bank Statement PDF Multi-Line & Tabular Text Parser
  if (transactions.length === 0) {
    const DATE_REGEX = /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[-\s.]?[A-Za-z]{3,9}[-\s.]?\d{2,4}|[A-Za-z]{3,9}[-\s.]?\d{1,2}[-\s.,]*\d{2,4}|\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2})\b/;
    const blocks = [];
    let currentBlock = null;

    for (let i = 0; i < rawLines.length; i += 1) {
      const line = rawLines[i];
      if (isBalanceOrSummary(line)) continue;

      const dateMatch = line.match(DATE_REGEX);
      const isHeader =
        /\b(date|particulars|narration|chq|cheque|withdrawal|deposit|balance|debit|credit|dr|cr)\b/i.test(line) &&
        !line.match(/\d{4}/);

      if (dateMatch && !isHeader) {
        if (currentBlock) blocks.push(currentBlock);
        currentBlock = {
          dateStr: dateMatch[1],
          lines: [line],
        };
      } else if (currentBlock) {
        currentBlock.lines.push(line);
      }
    }
    if (currentBlock) blocks.push(currentBlock);

    for (const block of blocks) {
      const date = toIsoDay(block.dateStr, preferredFormat);
      if (!date) continue;

      const blockText = block.lines.join(' ');
      const textWithoutDate = blockText.replace(block.dateStr, ' ');
      const txnId = extractTransactionId(blockText);
      const textForAmounts = textWithoutDate
        .replace(txnId || '', ' ')
        .replace(/\b\d{10,}\b/g, ' ');

      const checkBalanceContext = (index, matchStr) => {
        const textBefore = textForAmounts.slice(Math.max(0, index - 25), index);
        const isPrecededByBalance = /\b(bal|balance|closing|opening|avail|available|ledger)\b\s*[:=\-]?\s*(?:(?:₹|rs\.?|inr|\$|€|£)\s*)?$/i.test(textBefore);
        const textAfter = textForAmounts.slice(index + matchStr.length, Math.min(textForAmounts.length, index + matchStr.length + 20));
        const isFollowedByBalance = /^\s*(?:\([^\)]*\)\s*)?\b(bal|balance|closing|opening|avail|available|ledger)\b/i.test(textAfter);
        return isPrecededByBalance || isFollowedByBalance;
      };

      const seenIndices = new Set();
      const candidateAmounts = [];

      const currencyMatches = textForAmounts.matchAll(/(?:₹|rs\.?|inr|\$|€|£)\s*([0-9,]+(?:\.[0-9]{2})?)/gi);
      for (const m of currencyMatches) {
        const amt = parseStatementAmount(m[1]);
        if (amt && amt > 0 && amt <= MAX_AMOUNT) {
          seenIndices.add(m.index);
          candidateAmounts.push({ amount: amt, isBalance: checkBalanceContext(m.index, m[0]) });
        }
      }

      const decimalMatches = textForAmounts.matchAll(/\b([0-9]{1,3}(?:,[0-9]{2,3})*|\d+)\.(\d{2})\b/g);
      for (const m of decimalMatches) {
        const isDuplicate = Array.from(seenIndices).some((idx) => Math.abs(idx - m.index) < 10);
        if (!isDuplicate) {
          const amt = parseStatementAmount(m[0]);
          if (amt && amt > 0 && amt <= MAX_AMOUNT) {
            seenIndices.add(m.index);
            candidateAmounts.push({ amount: amt, isBalance: checkBalanceContext(m.index, m[0]) });
          }
        }
      }

      if (candidateAmounts.length === 0) {
        const intMatches = textForAmounts.matchAll(/\b([0-9]{1,3}(?:,[0-9]{2,3})+|\d{2,8})\b/g);
        for (const m of intMatches) {
          const amt = parseStatementAmount(m[0]);
          if (amt && amt > 0 && amt <= MAX_AMOUNT) {
            candidateAmounts.push({ amount: amt, isBalance: checkBalanceContext(m.index, m[0]) });
          }
        }
      }

      if (candidateAmounts.length === 0) continue;

      const nonBalance = candidateAmounts.filter((c) => !c.isBalance);
      let txnAmount = (nonBalance.length > 0 ? nonBalance[0] : candidateAmounts[0]).amount;

      if (candidateAmounts.length >= 2 && /\b(usd|eur|gbp|aed)\b/i.test(blockText)) {
        const inrMatch = blockText.match(/(?:inr|rs\.?|₹)\s*([0-9,]+(?:\.[0-9]{2})?)/i);
        if (inrMatch) {
          const parsedInr = parseStatementAmount(inrMatch[1]);
          if (parsedInr) txnAmount = parsedInr;
        }
      }

      const isCredit = /\b(cr|credit|deposit|by transfer|received|refund|cashback|interest)\b/i.test(blockText);
      const isDebit = /\b(dr|debit|withdrawal|to transfer|paid|charge|fee)\b/i.test(blockText);
      let type = 'expense';
      if (isCredit && !isDebit) type = 'income';
      else if (isDebit) type = 'expense';
      else if (blockText.includes('+') && !blockText.includes('-')) type = 'income';

      transactions.push({
        date,
        type,
        amount: txnAmount,
        desc: blockText,
        raw: block.lines,
        txnId,
      });
    }
  }

  // 6. Generic Receipt / Invoice Parser (useful for OCR images and single-receipt PDFs)
  if (transactions.length === 0 && /receipt|invoice|total|amount\s*due|grand\s*total|subtotal/i.test(text)) {
    let lastSeenDate = null;
    let lastSeenMerchant = 'Receipt Upload';
    let lastSeenAmount = null;
    let pickedMerchant = false;

    for (const line of rawLines) {
      if (!lastSeenDate) {
        const inlineDate = line.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[-\s.]?[A-Za-z]{3,9}[-\s.,]*\d{2,4}|[A-Za-z]{3,9}[-\s.]?\d{1,2}[-\s.,]*\d{2,4}|\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2})\b/);
        const parsedDate = toIsoDay(inlineDate ? inlineDate[1] : line, preferredFormat);
        if (parsedDate) lastSeenDate = parsedDate;
      }

      if (
        !pickedMerchant &&
        /^[A-Za-z][A-Za-z0-9\s.&'-]{2,}$/.test(line) &&
        !/receipt|invoice|tax|gst|subtotal|total|amount|date|cash|change|thank you/i.test(line)
      ) {
        lastSeenMerchant = line.trim();
        pickedMerchant = true;
      }

      const amtMatch = line.match(
        /(?:grand\s*total|amount\s*due|net\s*amount|total\s*paid|total)[\s:]*(?:₹|rs\.?|inr|\$|€|£)?\s*([0-9,]+(?:\.[0-9]{1,2})?)/i
      );
      if (amtMatch) {
        const parsedAmt = parseStatementAmount(amtMatch[1]);
        if (parsedAmt && parsedAmt > 0 && parsedAmt <= MAX_AMOUNT) {
          lastSeenAmount = parsedAmt;
        }
      }
    }

    if (lastSeenAmount) {
      transactions.push({
        date: lastSeenDate || new Date().toISOString().slice(0, 10),
        type: 'expense',
        amount: lastSeenAmount,
        desc: `Paid to ${lastSeenMerchant} | Receipt`,
        raw: rawLines,
        txnId: extractTransactionId(text),
      });
    }
  }

  return {
    rawTransactions: transactions,
    bankName: defaultBank,
    statementSource,
  };
};

/**
 * Unified PDF parsing entry point orchestrating vector tables, coordinate tables,
 * app-specific text extraction, and scanned-PDF OCR fallback.
 */
const parsePdfBuffer = async (
  buffer,
  filename = '',
  {
    password = null,
    preferredFormat = 'DMY',
    merchantCategories = new Map(),
    accountId = null,
    ocrRunner = null,
    saveReceipts = true,
  } = {}
) => {
  const { text, pageCount, tableCandidates, ocrUsed, warnings, extractedImages } = await extractPdfArtifacts(buffer, {
    password,
    ocrRunner,
    saveReceipts,
  });

  const headerSlice = text.slice(0, 600);
  const defaultBank = detectBankName(filename, null) || detectBankName(headerSlice, null);

  // Strategy 1: Vector grid tables (pdf-parse getTable)
  let bestVectorResult = null;
  for (const tbl of tableCandidates) {
    if (!detectTableHeader(tbl)) continue;
    try {
      const normalized = normalizeTabularRows({
        rows: tbl,
        defaultBank: defaultBank || 'Bank Statement',
        merchantCategories,
        preferredFormat,
        accountId,
        importSource: 'bank_pdf_table',
      });
      if (
        normalized.transactions.length > 0 &&
        (!bestVectorResult || normalized.transactions.length > bestVectorResult.transactions.length)
      ) {
        bestVectorResult = normalized;
      }
    } catch {
      // Try next candidate table
    }
  }

  if (bestVectorResult) {
    return {
      mode: 'tabular',
      transactions: bestVectorResult.transactions,
      extractedImages,
      diagnostics: {
        ...bestVectorResult.diagnostics,
        strategy: 'pdf_vector_table',
        pageCount,
        tableCount: tableCandidates.length,
        ocrUsed,
        warnings: [...warnings, ...(bestVectorResult.diagnostics.warnings || [])],
      },
      bankName: defaultBank || 'Bank Statement',
      statementSource: 'bank_pdf_table',
    };
  }

  // Strategy 2: Coordinate-based borderless stream table reconstruction (pdfjs-dist)
  const isAppSpecific =
    /phonepe|paytm|google_pay|gpay|bharatpe/i.test(filename) ||
    /phonepe statement|paytm payments bank|paytm wallet|google pay|bharatpe/i.test(headerSlice);

  if (!isAppSpecific && !ocrUsed) {
    const coordTable = await reconstructCoordinateTable(buffer, { password, preferredFormat });
    if (coordTable) {
      try {
        const normalized = normalizeTabularRows({
          rows: coordTable.rows,
          defaultBank: defaultBank || detectBankName(coordTable.headerText, 'Bank Statement'),
          merchantCategories,
          preferredFormat,
          accountId,
          importSource: 'bank_pdf_stream',
        });
        if (normalized.transactions.length > 0) {
          return {
            mode: 'tabular',
            transactions: normalized.transactions,
            extractedImages,
            diagnostics: {
              ...normalized.diagnostics,
              strategy: 'pdf_coordinate_table',
              pageCount: coordTable.pageCount || pageCount,
              tableCount: 1,
              ocrUsed: false,
              warnings: [...warnings, ...(normalized.diagnostics.warnings || [])],
            },
            bankName: defaultBank || detectBankName(coordTable.headerText, 'Bank Statement'),
            statementSource: 'bank_pdf_stream',
          };
        }
      } catch {
        // Fall through to text parser
      }
    }
  }

  // Strategy 3: App-specific & multi-line text parsers (also handles OCR text)
  const textParsed = parsePdfTextTransactions(text, filename, { preferredFormat });

  return {
    mode: 'raw',
    rawTransactions: textParsed.rawTransactions,
    bankName: textParsed.bankName,
    extractedImages,
    statementSource: ocrUsed ? 'pdf_ocr' : textParsed.statementSource,
    diagnostics: {
      strategy: ocrUsed ? 'pdf_ocr' : (textParsed.statementSource === 'bank_pdf' ? 'pdf_text_multiline' : 'pdf_app_parser'),
      pageCount,
      tableCount: tableCandidates.length,
      ocrUsed,
      rowsTotal: textParsed.rawTransactions.length,
      rowsParsed: textParsed.rawTransactions.length,
      rowsSkipped: 0,
      warnings,
    },
  };
};

module.exports = {
  isPasswordError,
  createPasswordRequiredError,
  extractAndSaveImages,
  extractPdfArtifacts,
  collectCandidateTables,
  clusterPageItemsToRows,
  reconstructCoordinateTable,
  parsePdfTextTransactions,
  parsePdfBuffer,
};
