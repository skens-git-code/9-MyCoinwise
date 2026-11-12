/* —————————————————————————————————————
 * Statement Parser Service (Unified Document Processing Pipeline)
 * Multi-format bank statement ingestion engine supporting:
 *   - CSV & Delimited text files (streaming fast-csv + quote-aware delimiter detection)
 *   - Excel (.xlsx) via ExcelJS (multi-worksheet header fallback)
 *   - PDF statements:
 *       1) Vector grid table extraction (PDFParse.getTable)
 *       2) Coordinate-based stream table reconstruction (pdfjs-dist)
 *       3) App-specific (PhonePe, Paytm, GPay, BharatPe) & multi-line text parsers
 *       4) OCR fallback (Tesseract.js) for scanned / image-only PDFs
 *
 * Includes:
 *   - Running-balance reconciliation & signed-column convention detection
 *   - Schema validation & row-level skip diagnostics
 *   - SHA-256 LRU caching of expensive document parsing
 *   - Structured performance & extraction telemetry logging
 * ————————————————————————————————————— */

const crypto = require('crypto');
const { LRUCache } = require('lru-cache');
const { logger } = require('../utils/logger');

const {
  IMPORT_LIMIT,
  MAX_AMOUNT,
  cleanText,
  normalizeForMatch,
  toIsoDay,
  parseStatementAmount,
  parseSignedAmount,
  isBalanceOrSummary,
} = require('./statement/helpers');
const {
  PAYMENT_RULES,
  CATEGORY_RULES,
  INCOME_CATEGORY_RULES,
  detectBankName,
  extractTransactionId,
  extractCounterpartyDetails,
  parseNarrationEntities,
} = require('./statement/classifiers');
const {
  detectCsvDelimiter,
  parseCsvString,
  parseCsvAsync,
} = require('./statement/csvParser');
const {
  normalizeTabularRows,
  normalizeExplicitCategory,
} = require('./statement/tabularNormalizer');
const {
  parseExcelBuffer: parseExcelWorkbook,
} = require('./statement/excelParser');
const {
  parsePdfBuffer,
  parsePdfTextTransactions,
  reconstructCoordinateTable,
  collectCandidateTables,
  clusterPageItemsToRows,
} = require('./statement/pdfExtractor');
const {
  recognizeImagesWithTesseract,
} = require('./statement/ocrService');
const {
  saveReceiptImageBuffer,
} = require('./statement/receiptStorage');

const ISO_DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Cache parsed document structures (before per-user duplicate checks) for 10 minutes
const parseCache = new LRUCache({
  max: 100,
  ttl: 10 * 60 * 1000,
});

const clearParserCache = () => {
  parseCache.clear();
};

const getParserCacheStats = () => ({
  size: parseCache.size,
  max: parseCache.max,
});

const parseExcelBuffer = async (buffer, filename = '') => {
  const { rows } = await parseExcelWorkbook(buffer, filename);
  return rows;
};

/* —————————————————————————————————————
 * Validation & Enrichers
 * ————————————————————————————————————— */

const isValidNormalizedTransaction = (tx) =>
  Boolean(
    tx &&
      typeof tx.date === 'string' &&
      ISO_DAY_REGEX.test(tx.date) &&
      (tx.type === 'income' || tx.type === 'expense') &&
      typeof tx.amount === 'number' &&
      Number.isFinite(tx.amount) &&
      tx.amount > 0 &&
      tx.amount <= MAX_AMOUNT &&
      typeof tx.import_fingerprint === 'string' &&
      tx.import_fingerprint.length > 0
  );

/**
 * Enriches raw PDF text-parsed transactions into the unified schema.
 */
const enrichRawPdfTransactions = ({
  rawTransactions,
  defaultBank,
  statementSource,
  merchantCategories,
  accountId,
}) =>
  (rawTransactions || [])
    .filter((tx) => tx && tx.date && typeof tx.amount === 'number' && Number.isFinite(tx.amount) && tx.amount > 0 && tx.amount <= MAX_AMOUNT)
    .map((tx, idx) => {
    const entities = parseNarrationEntities({
      narration: tx.desc,
      isIncome: tx.type === 'income',
      defaultBank,
    });

    const merchant = entities.merchant;
    const normalizedMerchant = normalizeForMatch(merchant);
    const savedCategory = merchantCategories.get(normalizedMerchant);
    const explicitCategory = tx.category ? normalizeExplicitCategory(tx.category) : null;
    const categoryRule = CATEGORY_RULES.find(([, rule]) => rule.test(tx.desc.toLowerCase()));
    const incomeCategoryRule = INCOME_CATEGORY_RULES.find(([, rule]) => rule.test(tx.desc.toLowerCase()));

    const category = savedCategory !== undefined
      ? savedCategory
      : explicitCategory || (tx.type === 'income' ? (incomeCategoryRule?.[0] || 'Other') : (categoryRule?.[0] || 'Other'));

    const txnNumber = tx.txnId || entities.transaction_number;
    const fingerprint = crypto
      .createHash('sha256')
      .update(
        [
          accountId || '',
          tx.date,
          tx.type,
          tx.amount.toFixed(2),
          normalizedMerchant,
          normalizeForMatch(txnNumber || ''),
        ].join('|')
      )
      .digest('hex');

    return {
      id: `pdf-row-${idx + 1}`,
      date: tx.date,
      type: tx.type,
      amount: tx.amount,
      category,
      merchant,
      bank_name: tx.bank_name || entities.bank_name || defaultBank || 'Payment App',
      sender_name: entities.sender,
      receiver_name: entities.receiver,
      transaction_number: txnNumber,
      payment_method: PAYMENT_RULES.find(([, rule]) => rule.test(tx.desc.toLowerCase()))?.[0] || 'upi',
      counterparty_bank: extractCounterpartyDetails(tx.desc),
      external_reference: txnNumber,
      note: tx.desc.slice(0, 500),
      receipt_url: tx.receipt_url || null,
      import_fingerprint: fingerprint,
      import_source: statementSource,
      confidence: (savedCategory || explicitCategory) ? 'high' : (categoryRule || incomeCategoryRule) ? 'medium' : 'low',
    };
  });

/**
 * Applies user merchant-category learning on cached transactions so learned
 * categories stay up to date even when document extraction came from cache.
 */
const applyMerchantCategoryLearning = (transactions, merchantCategories) => {
  if (!merchantCategories || merchantCategories.size === 0) {
    return transactions.map((tx) => ({ ...tx }));
  }
  return transactions.map((tx) => {
    const normalizedMerchant = normalizeForMatch(tx.merchant);
    const savedCategory = merchantCategories.get(normalizedMerchant);
    if (savedCategory !== undefined) {
      return {
        ...tx,
        category: savedCategory,
        confidence: 'high',
      };
    }
    return { ...tx };
  });
};

/* —————————————————————————————————————
 * Main Statement Parsing Entry Point
 * ————————————————————————————————————— */

/**
 * Parses a bank statement (CSV, Excel .xlsx, or PDF), normalizes transactions,
 * caches expensive document extraction, and flags duplicates against user history.
 */
const parseStatement = async ({
  content,
  fileData,
  filename = 'statement.csv',
  userTransactions = [],
  password = null,
  dateFormat = null,
  accountId = null,
  ocrRunner = null,
  bypassCache = false,
  saveReceipts = true,
}) => {
  const startedAt = Date.now();
  let buffer = null;
  const isBase64 = typeof fileData === 'string' && fileData.trim() !== '';

  if (isBase64) {
    const pureBase64 = fileData.replace(/^data:[^;]+;base64,/, '');
    buffer = Buffer.from(pureBase64, 'base64');
  } else if (Buffer.isBuffer(content)) {
    buffer = content;
  } else if (typeof content === 'string') {
    if (content.startsWith('data:') && content.includes(';base64,')) {
      const pureBase64 = content.split(';base64,')[1];
      buffer = Buffer.from(pureBase64, 'base64');
    } else {
      buffer = Buffer.from(content, 'utf8');
    }
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('Please upload a valid statement file (CSV, Excel, or PDF).');
  }

  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error('Statement file must be smaller than 10 MB.');
  }

  // Detect file type via magic bytes or filename extension
  const isPdf = buffer.subarray(0, 5).toString('ascii').startsWith('%PDF') || /\.pdf$/i.test(filename);
  const isZipExcel = buffer.subarray(0, 4).toString('ascii') === 'PK\x03\x04';
  const isOle2Excel = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from('D0CF11E0A1B11AE1', 'hex'));
  const isExcelExt = /\.xls[xm]?$/i.test(filename);
  const isExcel = !isPdf && (isZipExcel || isOle2Excel || isExcelExt);
  const isImage =
    !isPdf &&
    !isExcel &&
    (/\.(jpe?g|png|webp)$/i.test(filename) ||
      buffer.subarray(0, 2).toString('hex') === 'ffd8' ||
      buffer.subarray(0, 4).toString('hex') === '89504e47' ||
      (buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'));

  const isUsBankOrFile = /chase|bofa|bank\s*of\s*america|wells\s*fargo|wells|amex|american\s*express|citi|citibank/i.test(filename);
  const preferredFormat = (dateFormat ? String(dateFormat).toUpperCase() : null) || (isUsBankOrFile ? 'MDY' : 'DMY');

  // Build user history lookups for category learning and deduplication
  const merchantCategories = new Map();
  const existingFingerprints = new Set();
  const existingKeys = new Set();

  for (const tx of userTransactions) {
    const merchant = normalizeForMatch(tx.merchant || tx.receiver_name || tx.note);
    if (merchant && tx.category && !merchantCategories.has(merchant)) {
      merchantCategories.set(merchant, tx.category);
    }
    const matchesAccount = !accountId || !tx.account_id || String(tx.account_id) === String(accountId);
    if (matchesAccount) {
      if (tx.import_fingerprint) existingFingerprints.add(tx.import_fingerprint);
      const day = toIsoDay(tx.date, preferredFormat) || '';
      if (day && tx.amount) {
        existingKeys.add(
          [
            day,
            tx.type,
            Number(tx.amount || 0).toFixed(2),
            merchant,
          ].join('|')
        );
      }
    }
  }

  // Compute cache key from document content + parse options (never cache password plaintext)
  const passwordDigest = password
    ? crypto.createHash('sha256').update(String(password)).digest('hex').slice(0, 16)
    : 'none';
  const docHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const cacheKey = `${docHash}:${preferredFormat}:${accountId || 'none'}:${passwordDigest}`;

  let parsedList = [];
  let defaultBank = detectBankName(filename, null);
  let detectedFormat = 'CSV';
  let diagnostics = {};
  let cacheHit = false;

  const cached = (!bypassCache && !ocrRunner) ? parseCache.get(cacheKey) : null;
  if (cached) {
    cacheHit = true;
    defaultBank = cached.defaultBank;
    detectedFormat = cached.detectedFormat;
    diagnostics = { ...cached.diagnostics };
    parsedList = applyMerchantCategoryLearning(cached.parsedList, merchantCategories);
  } else {
    if (isPdf) {
      detectedFormat = 'PDF';
      const pdfResult = await parsePdfBuffer(buffer, filename, {
        password,
        preferredFormat,
        merchantCategories,
        accountId,
        ocrRunner,
        saveReceipts,
      });
      defaultBank = pdfResult.bankName || defaultBank;
      diagnostics = pdfResult.diagnostics || {};

      if (pdfResult.mode === 'tabular') {
        parsedList = pdfResult.transactions;
      } else {
        parsedList = enrichRawPdfTransactions({
          rawTransactions: pdfResult.rawTransactions,
          defaultBank,
          statementSource: pdfResult.statementSource,
          merchantCategories,
          accountId,
        });
      }

      if (Array.isArray(pdfResult.extractedImages) && pdfResult.extractedImages.length > 0) {
        const primaryReceiptUrl = pdfResult.extractedImages[0];
        parsedList = parsedList.map((tx) => ({
          ...tx,
          receipt_url: tx.receipt_url || primaryReceiptUrl,
        }));
      }
    } else if (isExcel) {
      detectedFormat = 'Excel';
      const { rows, rowNumbers = [], extractedImages = [], engine } = await parseExcelWorkbook(buffer, filename, { saveReceipts });
      const normalized = normalizeTabularRows({
        rows,
        defaultBank,
        merchantCategories,
        preferredFormat,
        accountId,
        importSource: 'excel_statement',
      });
      parsedList = normalized.transactions;
      if (extractedImages.length > 0) {
        parsedList = parsedList.map((tx, idx) => {
          const matrixIdxMatch = String(tx.id || '').match(/^row-(\d+)$/);
          const matrixIdx = matrixIdxMatch ? Number(matrixIdxMatch[1]) : null;
          const actualExcelRow =
            matrixIdx !== null && rowNumbers[matrixIdx]
              ? rowNumbers[matrixIdx]
              : (normalized.diagnostics.headerRowIndex || 0) + 2 + idx;
          const matchedImage = extractedImages.find((img) => img.cell === actualExcelRow);
          return {
            ...tx,
            receipt_url: matchedImage ? matchedImage.url : tx.receipt_url || null,
          };
        });
      }
      diagnostics = {
        ...normalized.diagnostics,
        strategy: engine,
      };
    } else if (isImage) {
      detectedFormat = 'Image (OCR)';
      const ocrExec = ocrRunner || recognizeImagesWithTesseract;
      const ocrResult = await ocrExec([buffer], { lang: 'eng', timeoutMs: 30000 });

      if (!ocrResult || !ocrResult.text || !String(ocrResult.text).trim()) {
        throw new Error(
          'Could not extract text from this image. Please ensure the image is clear, well-lit, and contains readable text.'
        );
      }

      const receiptUrl = saveReceipts
        ? await saveReceiptImageBuffer(buffer, { minBytes: 100 })
        : null;

      const textParsed = parsePdfTextTransactions(String(ocrResult.text), filename, { preferredFormat });
      defaultBank = textParsed.bankName || detectBankName(filename, null) || 'Image Receipt';
      parsedList = enrichRawPdfTransactions({
        rawTransactions: (textParsed.rawTransactions || []).map((tx) => ({
          ...tx,
          receipt_url: receiptUrl || null,
        })),
        defaultBank,
        statementSource: 'image_ocr',
        merchantCategories,
        accountId,
      });

      diagnostics = {
        strategy: 'image_ocr',
        ocrUsed: true,
        rowsTotal: parsedList.length,
        rowsParsed: parsedList.length,
        rowsSkipped: 0,
        warnings: [],
      };

      if (parsedList.length === 0) {
        throw new Error(
          'We read text from this image, but could not find valid transaction details (Date, Amount, Merchant).'
        );
      }
    } else {
      detectedFormat = 'CSV';
      const csvResult = await parseCsvAsync(buffer);
      const normalized = normalizeTabularRows({
        rows: csvResult.rows,
        defaultBank,
        merchantCategories,
        preferredFormat,
        accountId,
        importSource: 'csv_statement',
      });
      parsedList = normalized.transactions;
      diagnostics = {
        ...normalized.diagnostics,
        strategy: `csv_${csvResult.engine}`,
        delimiter: csvResult.delimiter,
        warnings: [...(csvResult.warnings || []), ...(normalized.diagnostics.warnings || [])],
      };
    }

    if (!bypassCache && !ocrRunner) {
      parseCache.set(cacheKey, {
        parsedList: parsedList.map((tx) => ({ ...tx })),
        defaultBank,
        detectedFormat,
        diagnostics: { ...diagnostics },
      });
    }
  }

  // Schema Validation Gate
  const valid = parsedList.filter(isValidNormalizedTransaction);
  const schemaRejectedCount = parsedList.length - valid.length;

  if (valid.length === 0) {
    logger.warn('Statement parser yielded zero valid transactions', {
      format: detectedFormat,
      strategy: diagnostics.strategy,
      cacheHit,
      durationMs: Date.now() - startedAt,
    });
    throw new Error('No valid transactions were found in this statement.');
  }

  const capped = valid.slice(0, IMPORT_LIMIT);

  // Deduplication (strong transaction_number fingerprint vs weak fallback key)
  const strong = (tx) => Boolean(tx.transaction_number && String(tx.transaction_number).trim().length >= 8);
  const seenFingerprints = new Set();
  const seenWeakKeys = new Map();

  const transactions = capped.map((tx) => {
    const isStrong = strong(tx);
    const fallbackKey = [
      tx.date,
      tx.type,
      tx.amount.toFixed(2),
      normalizeForMatch(tx.merchant),
    ].join('|');

    let duplicate = false;
    let confidence = tx.confidence || 'medium';

    if (isStrong) {
      if (seenFingerprints.has(tx.import_fingerprint) || existingFingerprints.has(tx.import_fingerprint)) {
        duplicate = true;
      }
    } else {
      const countInBatch = seenWeakKeys.get(fallbackKey) || 0;
      seenWeakKeys.set(fallbackKey, countInBatch + 1);

      if (existingKeys.has(fallbackKey)) {
        duplicate = true;
      } else if (countInBatch > 0) {
        confidence = 'weak_duplicate';
      }
    }

    seenFingerprints.add(tx.import_fingerprint);
    return { ...tx, duplicate, confidence };
  });

  const durationMs = Date.now() - startedAt;
  const warnings = [
    ...(diagnostics.warnings || []),
    ...(schemaRejectedCount > 0 ? [`Filtered out ${schemaRejectedCount} row(s) failing schema validation.`] : []),
    ...(valid.length > IMPORT_LIMIT ? [`Statement contains ${valid.length} transactions; only the first ${IMPORT_LIMIT} are shown.`] : []),
  ];

  const finalDiagnostics = {
    strategy: diagnostics.strategy || detectedFormat.toLowerCase(),
    durationMs,
    cacheHit,
    pageCount: diagnostics.pageCount || 0,
    tableCount: diagnostics.tableCount || 0,
    ocrUsed: Boolean(diagnostics.ocrUsed),
    rowsTotal: diagnostics.rowsTotal ?? valid.length,
    rowsParsed: valid.length,
    rowsSkipped: (diagnostics.rowsSkipped || 0) + schemaRejectedCount,
    balanceReconciledCount: diagnostics.balanceReconciledCount || 0,
    delimiter: diagnostics.delimiter || null,
  };

  logger.info('Statement analyzed successfully', {
    format: detectedFormat,
    bank: defaultBank || 'Bank Statement',
    ...finalDiagnostics,
  });

  return {
    transactions,
    summary: {
      detected: transactions.length,
      duplicates: transactions.filter((t) => t.duplicate).length,
      weakDuplicates: transactions.filter((t) => t.confidence === 'weak_duplicate').length,
      categorized: transactions.filter((t) => t.category !== 'Other').length,
      credits: transactions.filter((t) => t.type === 'income').length,
      debits: transactions.filter((t) => t.type === 'expense').length,
      totalCreditAmount: Math.round(transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0) * 100) / 100,
      totalDebitAmount: Math.round(transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0) * 100) / 100,
      detectedBank: defaultBank || 'Bank Statement',
      detectedFormat,
      truncated: valid.length > IMPORT_LIMIT,
      droppedCount: Math.max(0, valid.length - IMPORT_LIMIT),
      warnings,
      diagnostics: finalDiagnostics,
    },
  };
};

module.exports = {
  parseStatement,
  extractTransactionId,
  detectBankName,
  parseNarrationEntities,
  parsePdfBuffer,
  parseExcelBuffer,
  parseCsvString,
  parseCsvAsync,
  detectCsvDelimiter,
  normalizeTabularRows,
  reconstructCoordinateTable,
  collectCandidateTables,
  clusterPageItemsToRows,
  clearParserCache,
  getParserCacheStats,
  enrichRawPdfTransactions,
  toIsoDay,
  cleanText,
  parseStatementAmount,
  parseSignedAmount,
  isBalanceOrSummary,
  IMPORT_LIMIT,
};
