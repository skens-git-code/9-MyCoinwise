/* —————————————————————————————————————
 * Statement Parser Service
 * Robust multi-format bank statement ingestion engine supporting:
 *   - CSV & Tab-separated files
 *   - Excel (.xlsx) via ExcelJS
 *   - PDF statements from Indian Banks (SBI, HDFC, ICICI, Axis, Kotak, PNB, etc.)
 *   - Payment Apps: Paytm, Google Pay (GPay), PhonePe, and BharatPe
 *
 * Automatically detects:
 *   - Credited & Debited amounts & transaction direction
 *   - Transaction IDs / UTR / Ref numbers (IMPS, NEFT, RTGS, UPI)
 *   - Bank & Payment platform names
 *   - Sender names & Receiver names
 *   - Intelligent merchant & category classification
 *   - Deduplication fingerprints (strong vs weak)
 * ————————————————————————————————————— */

const crypto = require('crypto');
const ExcelJS = require('exceljs');
let pdfModule = null;
try {
  pdfModule = require('pdf-parse');
} catch {
  // Graceful handling if pdf-parse is missing in minimal environments
}
const { logger } = require('../utils/logger');

// ── Maximum transactions allowed per user statement batch ──
const IMPORT_LIMIT = 1000;
const MAX_AMOUNT = 999_999_999.99;

/* —————————————————————————————————————
 * Text / Amount / Date Helpers
 * ————————————————————————————————————— */

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const normalizeForMatch = (value) =>
  cleanText(value).toLowerCase().replace(/[^a-z0-9@]/g, '');

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/**
 * Standardize dates to YYYY-MM-DD.
 * Properly defaults ambiguous dates (e.g. 05/06/2024) to DD/MM/YYYY for Indian statements,
 * or MM/DD/YYYY when preferredFormat is 'MDY' (for US statements like Chase, BoA, Wells Fargo).
 * Validates actual calendar days (rejects non-existent dates like 31/04/2024 instead of rolling over).
 * Uses UTC fields on Date objects to prevent timezone-shift discrepancies.
 */
const toIsoDay = (value, preferredFormat = 'DMY') => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
  }
  const s = cleanText(value).replace(/^date:?\s*/i, '');
  if (!s) return null;

  const ok = (y, m, d) => {
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
      dt.getUTCFullYear() === year &&
      dt.getUTCMonth() === month - 1 &&
      dt.getUTCDate() === day
    ) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return null;
  };

  // 1. YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/\b(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})\b/);
  if (m) return ok(m[1], m[2], m[3]);

  // 2. DD-MM-YYYY or MM-DD-YYYY
  m = s.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})\b/);
  if (m) {
    const [, a, b, y] = m;
    const year = y.length === 2 ? `20${y}` : y;
    let day;
    let month;
    if (Number(a) > 12) {
      day = a;
      month = b;
    } else if (Number(b) > 12) {
      day = b;
      month = a;
    } else {
      // Ambiguous case (both <= 12): use preferred format hint
      if (String(preferredFormat).toUpperCase() === 'MDY') {
        day = b;
        month = a;
      } else {
        // Indian/UK default is DD/MM/YYYY
        day = a;
        month = b;
      }
    }
    return ok(year, month, day);
  }

  // 3. Textual month dates: "01-Apr-2024", "01 Apr 2024", "01Apr2024", "1-Apr-24"
  m = s.match(/\b(\d{1,2})[-\s.]?([A-Za-z]{3,9})[-\s.]?(\d{2,4})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return ok(y, MONTHS[m[2].toLowerCase()], m[1]);
  }

  // 4. "Oct 24, 2024", "October 24 2024", "Oct 24 24"
  m = s.match(/\b([A-Za-z]{3,9})[-\s.]?(\d{1,2})[-\s.,]*(\d{2,4})\b/);
  if (m && MONTHS[m[1].toLowerCase()]) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return ok(y, MONTHS[m[1].toLowerCase()], m[2]);
  }

  return null;
};

/**
 * Parses numeric amount from currency strings.
 * Safely strips INR, Rs, Dr, Cr, Debit, Credit suffixes and currency symbols.
 */
const parseStatementAmount = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value !== 0 ? Math.abs(value) : null;
  }

  let s = cleanText(value).replace(/^\((.*)\)$/, '-$1');

  // Strip "Rs/-" or "500/-" common in Indian statements
  s = s.replace(/\/-(?=\s|$|\b)/g, '');

  // Strip currency prefixes and labels (including Rs. and Rs/-)
  s = s
    .replace(/\b(inr|usd|eur|gbp|aed|sgd|rupees?)\b/gi, ' ')
    .replace(/\brs\.?(?:\s*\/?-?)?/gi, ' ')
    .replace(/\((?:debit|dr|credit|cr)\)/gi, ' ')
    .replace(/\b(dr|cr|debit|credit)\b\.?/gi, ' ')
    .replace(/(?:dr|cr)$/i, '');

  // Detect European format: e.g. 1.234,56 or 1234,56 (dot thousands, comma decimal)
  const europeanCandidate = s.replace(/[^\d.,-]/g, '');
  if (/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(europeanCandidate)) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  }

  s = s.replace(/[₹$€£,\s\/]/g, '');

  if (!s || s === '-' || s.toLowerCase() === 'null') return null;
  const n = Number(s);
  return Number.isFinite(n) && n !== 0 ? Math.abs(n) : null;
};

/**
 * Extracts signed amount when the numeric sign indicates direction.
 */
const parseSignedAmount = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  let s = cleanText(value).replace(/^\((.*)\)$/, '-$1');

  // Strip "Rs/-" or "500/-" common in Indian statements
  s = s.replace(/\/-(?=\s|$|\b)/g, '');

  // Strip currency prefixes and labels (including Rs. and Rs/-)
  s = s
    .replace(/\b(inr|usd|eur|gbp|aed|sgd|rupees?)\b/gi, ' ')
    .replace(/\brs\.?(?:\s*\/?-?)?/gi, ' ')
    .replace(/\((?:debit|dr)\)/gi, '-')
    .replace(/\((?:credit|cr)\)/gi, '+')
    .replace(/\b(debit|dr)\b\.?/gi, '-')
    .replace(/\b(credit|cr)\b\.?/gi, '+')
    .replace(/(?:dr)$/i, '-')
    .replace(/(?:cr)$/i, '+');

  if (s.endsWith('-')) s = `-${s.slice(0, -1)}`;
  if (s.endsWith('+')) s = s.slice(0, -1);

  // Detect European format: e.g. 1.234,56 or 1234,56
  const europeanCandidate = s.replace(/[^\d.,-]/g, '');
  if (/^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}$/.test(europeanCandidate)) {
    s = s.replace(/\./g, '').replace(/,/g, '.');
  }

  s = s.replace(/[₹$€£,\s\/]/g, '');

  if (!s || s === '-' || s === '+' || s.toLowerCase() === 'null') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * Guard to identify non-transaction statement balance / total lines.
 */
const isBalanceOrSummary = (line) =>
  /\b(opening balance|closing balance|available balance|ledger balance|current balance|running balance|previous balance|total balance|net balance|balance b\/?f|balance c\/?f|\bb\/f\b|\bc\/f\b|total (debit|credit|amount|withdrawal|deposit|balance)|(debit|credit|amount|withdrawal|deposit) total|grand total|sub[- ]?total|net (total|amount)|statement summary|account summary|page \d+(?: of \d+)?)\b/i.test(line);

/* —————————————————————————————————————
 * Classification Rules & Dictionaries
 * ————————————————————————————————————— */

const PAYMENT_RULES = [
  ['upi', /\bupi\b|@\w+|gpay|google pay|phonepe|phone pe|bhim|paytm/i],
  ['card', /\b(pos|card|visa|mastercard|rupay|amex)\b/i],
  ['bank_transfer', /\b(neft|imps|rtgs|ach|ecs|bank transfer)\b/i],
  ['wallet', /paytm wallet|mobikwik|freecharge|amazon pay/i],
];

const CATEGORY_RULES = [
  ['Groceries', /grocery|supermarket|mart|bigbasket|blinkit|zepto|dmart|nature's basket|jiomart|milk|dairy/i],
  ['Food', /restaurant|cafe|coffee|swiggy|zomato|starbucks|mcdonald|domino|kfc|burger king|haldiram|food|dining|eats/i],
  ['Transport', /uber|ola|metro|fuel|petrol|diesel|parking|rapido|irctc|railway|fastag|toll|hpcl|bpcl|ioc|shell/i],
  ['Shopping', /amazon|flipkart|myntra|meesho|nykaa|ajio|tata neu|zara|h&m|retail|store|mall/i],
  ['Bills', /electricity|bescom|msedcl|tata power|water bill|gas bill|igl|broadband|wifi|act fibernet|airtel|jio|vi |recharge|bill payment/i],
  ['Subscriptions', /netflix|spotify|youtube|prime|hotstar|disney|sonyliv|apple|chatgpt|openai|subscription/i],
  ['Health', /hospital|clinic|pharmacy|medical|apollo|pharmeasy|1mg|netmeds|medplus|diagnostic|doctor/i],
  ['Rent', /\brent\b|nobroker|magicbricks|house rent|flat rent|landlord/i],
  ['Travel', /airline|hotel|makemytrip|cleartrip|yatra|booking\.com|airbnb|indigo|air india|akasa|vistara|flight/i],
  ['Education', /school|college|course|udemy|coursera|unacademy|byju|tuition|fees/i],
  ['Investment', /mutual fund|zerodha|groww|angel one|upstox|kuvera|indmoney|smallcase|sip|investment|nse|bse|ppf|nps/i],
  ['Salary', /salary|payroll|stipend|wages/i],
  ['Transfer', /self transfer|atm wdl|cash wdl|fund transfer|wallet topup/i],
];

const INCOME_CATEGORY_RULES = [
  ['Salary', /salary|payroll|stipend|wages/i],
  ['Freelance', /freelanc|consultanc|contractor|gig|upwork|fiverr/i],
  ['Investment', /dividend|interest credit|mutual fund|stock sale|capital gain|wealth/i],
  ['Gift', /gift|bonus|reward|cashback|referral/i],
  ['Refund', /refund|reversal|chargeback|dispute/i],
  ['Transfer', /self transfer|account transfer|fund transfer/i],
];

const KNOWN_BANKS = [
  { pattern: /hdfc/i, name: 'HDFC Bank' },
  { pattern: /state bank of india|sbi\b/i, name: 'State Bank of India' },
  { pattern: /icici/i, name: 'ICICI Bank' },
  { pattern: /axis bank/i, name: 'Axis Bank' },
  { pattern: /kotak/i, name: 'Kotak Mahindra Bank' },
  { pattern: /punjab national bank|\bpnb\b/i, name: 'Punjab National Bank' },
  { pattern: /bank of baroda|\bbob\b/i, name: 'Bank of Baroda' },
  { pattern: /canara bank/i, name: 'Canara Bank' },
  { pattern: /union bank/i, name: 'Union Bank of India' },
  { pattern: /idfc/i, name: 'IDFC FIRST Bank' },
  { pattern: /indusind/i, name: 'IndusInd Bank' },
  { pattern: /yes bank/i, name: 'Yes Bank' },
  { pattern: /federal bank/i, name: 'Federal Bank' },
  { pattern: /paytm payments bank|paytm/i, name: 'Paytm Payments Bank' },
  { pattern: /phonepe/i, name: 'PhonePe' },
  { pattern: /google pay|gpay/i, name: 'Google Pay' },
  { pattern: /bharatpe/i, name: 'BharatPe' },
];

const detectBankName = (text, defaultName = null) => {
  if (!text) return defaultName;
  for (const b of KNOWN_BANKS) {
    if (b.pattern.test(text)) return b.name;
  }
  return defaultName;
};

// ── Extract Transaction ID / UTR / Reference ──
const extractTransactionId = (text) => {
  if (!text) return null;
  const str = String(text);

  // PhonePe Txn ID (e.g. T2410241234567890123456)
  const phonePeMatch = str.match(/\b(T[A-Za-z0-9]{16,28})\b/);
  if (phonePeMatch) return phonePeMatch[1];

  // Google Pay Txn ID (e.g. CICAg...)
  const gpayMatch = str.match(/\b(CICAg[A-Za-z0-9_-]+)\b/);
  if (gpayMatch) return gpayMatch[1];

  // BharatPe Txn ID (e.g. BP12345678901)
  const bharatPeMatch = str.match(/\b(BP\d{10,20})\b/i);
  if (bharatPeMatch) return bharatPeMatch[1];

  // Paytm Order / Txn ID
  const paytmMatch = str.match(/(?:order\s*id|wallet\s*txn\s*id|txn\s*id)[:\s]*([A-Za-z0-9_]{10,30})/i);
  if (paytmMatch) return paytmMatch[1];

  // UTR: IMPS (12), NEFT (16 chars, e.g. SBIN123456789012), RTGS (22 chars, e.g. HDFCR52024021000123456)
  const utrMatch = str.match(/(?:upi|utr|ref|neft|rtgs|imps)[^\dA-Z]{0,4}([A-Z]{4}[A-Za-z0-9]{12,18}|\d{12,22})\b/i);
  if (utrMatch) return utrMatch[1];

  // Cheque number (6 to 9 digits)
  const chqMatch = str.match(/\b(?:chq|cheque)\s*(?:no\.?|#)?\s*(\d{6,9})\b/i);
  if (chqMatch) return `CHQ-${chqMatch[1]}`;

  // Generic 12-digit reference (Reject Indian mobile numbers: optional 91 + 10 digits starting 6-9)
  const generic12 = str.match(/\b(\d{12})\b/);
  if (generic12 && !/^(91)?[6-9]\d{9}$/.test(generic12[1])) {
    return generic12[1];
  }

  return null;
};

// ── Extract Counterparty details (UPI VPA, IFSC, A/C) ──
const extractCounterpartyDetails = (description) => {
  const upiHandle = description.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9_-]+)/)?.[1];
  const ifsc = description.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/i)?.[0];
  const account = description.match(/(?:a\/c|account)\s*(?:no\.?|#)?\s*(\*{2,}\d{3,6}|\d{4,})/i)?.[1];
  return (
    cleanText(
      [
        upiHandle && `UPI: ${upiHandle}`,
        ifsc && `IFSC: ${ifsc}`,
        account && `A/C: ${account}`,
      ]
        .filter(Boolean)
        .join(' · ')
    ) || null
  );
};

// ── Clean & Extract Merchant / Payee / Person name ──
const extractMerchantOrName = (description) => {
  const value = cleanText(description)
    .replace(/\b(upi|imps|neft|rtgs|pos|dr|cr|debit|credit|transfer|payment|txn|transaction|ref|utr|chq|order|p2a|p2p|p2m)\b/gi, ' ')
    .replace(/\b\d{8,}\b/g, ' ')
    .replace(/[a-zA-Z0-9._-]+@[a-zA-Z0-9_-]+/g, ' ')
    .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, ' ');

  const parts = value
    .split(/[\/:|,-]+/)
    .map(cleanText)
    .filter((part) => part && !/^\d+$/.test(part));

  const candidate =
    parts.find((part) => part.length > 2 && !/^(to|from|ref|by|at|via|inb|mob|pay|inr|rs|p2a|p2p|p2m)$/i.test(part)) ||
    value;

  const cleanedCandidate = candidate.replace(/^\s*(?:to|from|at|by|via)\s+/i, '').trim();
  return cleanText(cleanedCandidate || candidate).slice(0, 150) || 'Bank transaction';
};

// ── Parse Narration for Sender, Receiver, and Bank ──
const parseNarrationEntities = ({ narration, isIncome, defaultBank = null }) => {
  const desc = cleanText(narration);
  let sender = isIncome ? null : 'You';
  let receiver = isIncome ? 'You' : null;
  let bankName = defaultBank;
  let txnId = extractTransactionId(desc);

  // Stop-words where entity names end in narration
  const STOP_BOUNDARY = '(?:transaction|txn|utr|order|chq|ref|dated|date|debited|credited|status|using|via|from|to|for|amount|\\b\\d{8,}\\b)';

  // Pattern: "Paid to [Receiver]" or "Payment to [Receiver]"
  const paidToMatch = desc.match(new RegExp(`(?:paid to|payment to|paid at|to:?)\\s+([A-Za-z0-9\\s&.'-]+?)(?:\\s+${STOP_BOUNDARY}\\b|$)`, 'i'));
  if (paidToMatch) {
    receiver = cleanText(paidToMatch[1]);
    sender = 'You';
  }

  // Pattern: "Received from [Sender]" or "Payment from [Sender]"
  const receivedFromMatch = desc.match(new RegExp(`(?:received from|payment from|received at|from:?)\\s+([A-Za-z0-9\\s&.'-]+?)(?:\\s+${STOP_BOUNDARY}\\b|$)`, 'i'));
  if (receivedFromMatch) {
    sender = cleanText(receivedFromMatch[1]);
    receiver = 'You';
  }

  // UPI structured strings: UPI/P2A/<ref>/<payee>/<bank>/<vpa> or UPI/<ref>/<payee>/<vpa>
  const upiTokens = desc.split(/[\/]/).map(cleanText).filter(Boolean);
  if (upiTokens.length >= 3 && /^upi$/i.test(upiTokens[0])) {
    const candidateRef = upiTokens.find((t) => /^\d{12}$/.test(t));
    if (candidateRef) txnId = candidateRef;

    const nameCandidate = upiTokens.find((t) => t.length > 2 && !/^\d+$/.test(t) && !/^(p2a|p2p|p2m|cr|dr|upi)$/i.test(t));
    if (nameCandidate) {
      if (isIncome) {
        sender = nameCandidate;
      } else {
        receiver = nameCandidate;
      }
    }
  }

  // NEFT / IMPS structured narration: NEFT-CR-<ref>-<sender> or IMPS/<ref>/<account>/<name>
  const neftMatch = desc.match(/neft\s*(?:cr|dr)?[-/]([A-Za-z0-9]+)[-/]([A-Za-z0-9\s]+)/i);
  if (neftMatch) {
    txnId = txnId || neftMatch[1];
    const entity = cleanText(neftMatch[2]);
    if (isIncome) sender = entity;
    else receiver = entity;
  }

  // Debited from / Credited to Bank pattern: "Debited from State Bank of India ••••1234"
  const bankMatch = desc.match(/\b(?:debited from|credited to|from bank|bank:)\s+([A-Za-z\s]+?)(?:[-•*\d]|\baccount\b|$)/i);
  if (bankMatch) {
    bankName = detectBankName(bankMatch[1], null) || detectBankName(desc, bankName);
  } else {
    bankName = detectBankName(desc, bankName);
  }

  const merchant = isIncome
    ? (sender && sender !== 'You' ? sender : 'Deposit')
    : (receiver && receiver !== 'You' ? receiver : extractMerchantOrName(desc));

  return {
    sender: sender ? sender.slice(0, 150) : null,
    receiver: receiver ? receiver.slice(0, 150) : null,
    merchant: merchant.slice(0, 150),
    bank_name: bankName,
    transaction_number: txnId,
  };
};

/* —————————————————————————————————————
 * PDF Parsing Engine
 * ————————————————————————————————————— */

/**
 * Robust extraction of text from PDF buffers.
 * Handles both function and class exports of pdf-parse across environments.
 * Catches password-protected and image-only (scanned) PDFs with descriptive errors.
 */
const extractPdfText = async (buffer, { password = null } = {}) => {
  if (!pdfModule) {
    throw new Error('PDF parsing library is not available.');
  }

  const pdfLib = pdfModule?.default || pdfModule;
  let text = '';
  try {
    if (typeof pdfLib === 'function') {
      const options = password ? { password } : {};
      const data = await pdfLib(buffer, options);
      text = data?.text || '';
    } else if (pdfLib.PDFParse) {
      const parser = new pdfLib.PDFParse({
        data: buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer),
        password: password || undefined,
      });
      try {
        const res = await parser.getText();
        text = res?.text || '';
      } finally {
        if (typeof parser.destroy === 'function') {
          await parser.destroy();
        }
      }
    } else {
      throw new Error('Unsupported pdf-parse module structure.');
    }
  } catch (err) {
    if (err?.name === 'PasswordException' || /password|encrypted/i.test(err?.message)) {
      const passErr = new Error(
        password
          ? 'Incorrect password for this protected PDF statement.'
          : 'This PDF is password-protected. Please provide the statement password to unlock.'
      );
      passErr.code = 'PDF_PASSWORD_REQUIRED';
      throw passErr;
    }
    throw new Error(`Failed to parse PDF: ${err.message}`);
  }

  if (!text || !text.trim()) {
    const ocrErr = new Error('Could not extract text from this PDF. The document may be scanned or image-only (OCR required).');
    ocrErr.code = 'PDF_OCR_REQUIRED';
    ocrErr.ocr_required = true;
    throw ocrErr;
  }

  return text;
};

/**
 * Extracts and classifies transactions from PDF statements (Paytm, GPay, PhonePe, BharatPe, Banks).
 */
const parsePdfBuffer = async (buffer, filename = '', { password = null, preferredFormat = 'DMY' } = {}) => {
  const text = await extractPdfText(buffer, { password });

  // Check file header block (first 600 chars) for source determination to prevent body false positives
  const headerSlice = text.slice(0, 600).toLowerCase();
  const filenameLower = filename.toLowerCase();

  let defaultBank = null;
  let statementSource = 'bank_pdf';

  if (filenameLower.includes('phonepe') || /phonepe statement|transaction statement.*phonepe/i.test(headerSlice)) {
    defaultBank = 'PhonePe';
    statementSource = 'phonepe_pdf';
  } else if (filenameLower.includes('paytm') || /paytm payments bank|paytm wallet|passbook.*paytm/i.test(headerSlice)) {
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

  // ──────────────────────────────────────────────
  // App-Specific PDF Parsers
  // ──────────────────────────────────────────────

  // 1. PhonePe Statement Parser
  if (statementSource === 'phonepe_pdf' || /transaction id\s*:\s*T\d+/i.test(text)) {
    let currentBlock = null;
    let lastSeenDate = null;

    for (let i = 0; i < rawLines.length; i += 1) {
      const line = rawLines[i];
      if (isBalanceOrSummary(line)) continue;

      const parsedDate = toIsoDay(line, preferredFormat);
      if (parsedDate) {
        lastSeenDate = parsedDate;
      }

      // Check if line indicates start of new PhonePe txn
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

        if (!currentBlock.date && parsedDate) {
          currentBlock.date = parsedDate;
        }

        const isTxnLine = /transaction\s*id|txn\s*id|utr|order\s*id|account|a\/c/i.test(line);
        if (!isTxnLine && !currentBlock.amount) {
          const amtMatch = line.match(/(?:amount|rs\.?|₹|inr)\s*[:\-]?\s*(?:[+-]\s*)?(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
                           line.match(/(?:[+-]\s*)?(?:₹|rs\.?|inr)\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
                           line.match(/\b([0-9]{1,3}(?:,[0-9]{2,3})*\.[0-9]{2})\b/);
          if (amtMatch) {
            const parsedAmt = parseStatementAmount(amtMatch[1]);
            if (parsedAmt && parsedAmt > 0 && parsedAmt <= MAX_AMOUNT) {
              currentBlock.amount = parsedAmt;
            }
          }
        }

        if (/credit|received|cashback/i.test(line)) {
          currentBlock.type = 'income';
        } else if (/debit|paid to/i.test(line)) {
          currentBlock.type = 'expense';
        }

        const txnMatch = extractTransactionId(line);
        if (txnMatch && !currentBlock.txnId) {
          currentBlock.txnId = txnMatch;
        }
      }
    }
    if (currentBlock && currentBlock.amount && currentBlock.date) {
      transactions.push(currentBlock);
    }
  }

  // 2. Paytm Passbook / Statement Parser
  if (transactions.length === 0 && (statementSource === 'paytm_pdf' || /paytm/i.test(headerSlice))) {
    for (let i = 0; i < rawLines.length; i += 1) {
      const line = rawLines[i];
      if (isBalanceOrSummary(line)) continue;

      const dateMatch = line.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[-\s.]?[A-Za-z]{3,9}[-\s.]?\d{2,4}|[A-Za-z]{3,9}[-\s.]?\d{1,2}[-\s.,]*\d{2,4}|\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2})\b/);
      const rawDateStr = dateMatch ? dateMatch[0] : null;
      const date = toIsoDay(rawDateStr || line, preferredFormat);
      if (!date) continue;

      const lineWithoutDate = (rawDateStr ? line.replace(rawDateStr, ' ') : line)
        .replace(/\b\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}\b|\b\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}\b/, ' ');
      const amtMatch = lineWithoutDate.match(/(?:[+-]\s*)?(?:₹|rs\.?|inr)\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
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
        const startAmt = line.match(/(?:amount|rs\.?|₹|inr)\s*[:\-]?\s*(?:[+-]\s*)?(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
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
          const amtMatch = line.match(/(?:amount|rs\.?|₹|inr)\s*[:\-]?\s*(?:[+-]\s*)?(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
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
        if (txnMatch && !currentBlock.txnId) {
          currentBlock.txnId = txnMatch;
        }
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

      const amtMatch = line.match(/(?:amount|rs\.?|₹|inr)\s*[:\-]?\s*(?:[+-]\s*)?(?:₹|rs\.?|inr)?\s*([0-9,]+(?:\.[0-9]{2})?)/i) ||
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

  // 5. General Bank Statement PDF Multi-Line & Tabular Parser (SBI, HDFC, ICICI, Axis, Kotak, PNB, etc.)
  if (transactions.length === 0) {
    const DATE_REGEX = /\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}[-\s.]?[A-Za-z]{3,9}[-\s.]?\d{2,4}|[A-Za-z]{3,9}[-\s.]?\d{1,2}[-\s.,]*\d{2,4}|\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2})\b/;

    // Accumulate lines into logical transaction blocks starting at each date line
    const blocks = [];
    let currentBlock = null;

    for (let i = 0; i < rawLines.length; i += 1) {
      const line = rawLines[i];
      if (isBalanceOrSummary(line)) continue;

      const dateMatch = line.match(DATE_REGEX);
      const isHeader = /\b(date|particulars|narration|chq|cheque|withdrawal|deposit|balance|debit|credit|dr|cr)\b/i.test(line) &&
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
      let candidateAmounts = [];

      // 1. Currency-preceded amounts
      const currencyMatches = textForAmounts.matchAll(/(?:₹|rs\.?|inr|\$|€|£)\s*([0-9,]+(?:\.[0-9]{2})?)/gi);
      for (const m of currencyMatches) {
        const amt = parseStatementAmount(m[1]);
        if (amt && amt > 0 && amt <= MAX_AMOUNT) {
          seenIndices.add(m.index);
          candidateAmounts.push({ amount: amt, isBalance: checkBalanceContext(m.index, m[0]) });
        }
      }

      // 2. Standard 2-decimal numbers (e.g. 450.00, 1,234.56)
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

      // 3. Formatted thousands or integer amounts (if still no candidates)
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

      // Multi-currency override if explicit foreign currency noted
      if (candidateAmounts.length >= 2 && /\b(usd|eur|gbp|aed)\b/i.test(blockText)) {
        const inrMatch = blockText.match(/(?:inr|rs\.?|₹)\s*([0-9,]+(?:\.[0-9]{2})?)/i);
        if (inrMatch) {
          const parsedInr = parseStatementAmount(inrMatch[1]);
          if (parsedInr) txnAmount = parsedInr;
        }
      }

      // Direction detection
      const isCredit = /\b(cr|credit|deposit|by transfer|received|refund|cashback|interest)\b/i.test(blockText);
      const isDebit = /\b(dr|debit|withdrawal|to transfer|paid|charge|fee)\b/i.test(blockText);
      let type = 'expense';
      if (isCredit && !isDebit) {
        type = 'income';
      } else if (isDebit) {
        type = 'expense';
      } else if (blockText.includes('+') && !blockText.includes('-')) {
        type = 'income';
      } else {
        type = 'expense';
      }

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

  return {
    rawTransactions: transactions,
    bankName: defaultBank,
    statementSource,
  };
};

/* —————————————————————————————————————
 * Excel Parsing Engine (.xlsx)
 * ————————————————————————————————————— */

/**
 * Parses Excel files using ExcelJS into a 2D array of rows.
 */
const parseExcelBuffer = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Excel workbook contains no worksheets.');
  }

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    const formatted = values.map((val) => {
      if (val === null || val === undefined) return '';
      if (val instanceof Date && !Number.isNaN(val.getTime())) {
        return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
      }
      if (typeof val === 'object') {
        if ('text' in val) return String(val.text || '').trim();
        if (val.result !== undefined) return String(val.result ?? '').trim();
      }
      return String(val).trim();
    });
    if (formatted.some(Boolean)) {
      rows.push(formatted);
    }
  });

  return rows;
};

/* —————————————————————————————————————
 * CSV Parsing Engine
 * ————————————————————————————————————— */

/**
 * Robust CSV parser supporting quotes, commas, semicolons, tabs, and pipes.
 * Samples the first 10 lines to reliably detect delimiter even with metadata header rows.
 */
const parseCsvString = (content) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const text = String(content || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) return [];

  // Sample up to first 10 lines to auto-detect delimiter
  const sampleLines = lines.slice(0, 10);
  const delimiters = [',', ';', '\t', '|'];
  let delimiter = ',';
  let maxCount = -1;

  for (const d of delimiters) {
    let totalCount = 0;
    for (const l of sampleLines) {
      totalCount += (l.split(d).length - 1);
    }
    if (totalCount > maxCount) {
      maxCount = totalCount;
      delimiter = d;
    }
  }

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (quoted && nextChar === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && nextChar === '\n') {
        i += 1;
      }
      row.push(field.trim());
      field = '';
      if (row.some(Boolean)) {
        rows.push(row);
      }
      row = [];
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some(Boolean)) {
      rows.push(row);
    }
  }

  return rows;
};

/* —————————————————————————————————————
 * Tabular Row Normalization Engine (CSV & Excel)
 * ————————————————————————————————————— */

const headerKey = (value) =>
  cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const findColumn = (headers, names) => {
  const exact = headers.findIndex((h) => names.some((n) => h === n));
  if (exact >= 0) return exact;
  return headers.findIndex((h) =>
    names.some((n) => (n.length >= 4 ? h.startsWith(n) || h.includes(n) : h.startsWith(n)))
  );
};

/**
 * Normalizes tabular rows (CSV/Excel) into structured transactions.
 */
const processTabularRows = ({
  rows,
  defaultBank = null,
  merchantCategories = new Map(),
  preferredFormat = 'DMY',
  accountId = null,
}) => {
  if (rows.length < 2) {
    throw new Error('Statement must contain a header row and at least one transaction row.');
  }

  // Scan the first 15 rows to find the actual table header
  let headerIndex = -1;
  let columns = null;

  for (let r = 0; r < Math.min(15, rows.length); r += 1) {
    const candidateHeaders = rows[r].map(headerKey);
    const dateCol = findColumn(candidateHeaders, ['date', 'txndate', 'trandate', 'transactiondate', 'valuedate', 'postdate', 'txndatetime', 'bookingdate', 'posted', 'time', 'timestamp', 'dt']);
    let descCol = findColumn(candidateHeaders, [
      'description', 'transactiondetails', 'details', 'narration', 'particulars', 'remarks', 'memo',
      'merchant', 'payee', 'note', 'name', 'title', 'party', 'partyname', 'beneficiary',
      'trans', 'transaction', 'activity', 'reason', 'purpose', 'item', 'comment', 'store'
    ]);
    const debitCol = findColumn(candidateHeaders, ['debit', 'debitamount', 'withdrawal', 'withdrawalamount', 'withdraw', 'dr', 'paidout', 'outflow', 'debitinr', 'debitrs', 'expense', 'spent', 'spend']);
    const creditCol = findColumn(candidateHeaders, ['credit', 'creditamount', 'deposit', 'depositamount', 'cr', 'paidin', 'inflow', 'creditinr', 'creditrs', 'income', 'received']);
    const amtCol = findColumn(candidateHeaders, ['amount', 'txnamount', 'transactionamount', 'netamount', 'total', 'amountinr', 'amountrs', 'value', 'price', 'cost']);

    if (descCol < 0 && dateCol >= 0 && (debitCol >= 0 || creditCol >= 0 || amtCol >= 0)) {
      for (let c = 0; c < candidateHeaders.length; c += 1) {
        if (c !== dateCol && c !== debitCol && c !== creditCol && c !== amtCol) {
          descCol = c;
          break;
        }
      }
    }

    if ((dateCol >= 0) && (descCol >= 0 || candidateHeaders.some((h) => h.includes('desc') || h.includes('detail') || h.includes('narr') || h.includes('merchant'))) &&
        (debitCol >= 0 || creditCol >= 0 || amtCol >= 0)) {
      headerIndex = r;
      columns = {
        date: dateCol,
        valueDate: findColumn(candidateHeaders, ['valuedate', 'valuedt']),
        description: descCol,
        narration: findColumn(candidateHeaders, ['narration']),
        particulars: findColumn(candidateHeaders, ['particulars']),
        debit: debitCol,
        credit: creditCol,
        amount: amtCol,
        type: findColumn(candidateHeaders, ['type', 'transactiontype', 'drcr', 'crdr', 'direction', 'flow']),
        reference: findColumn(candidateHeaders, ['referenceno', 'referencenumber', 'reference', 'chequeno', 'chqno', 'transactionid', 'txnid', 'utr', 'orderid']),
        ref: findColumn(candidateHeaders, ['refno', 'ref']),
        bank: findColumn(candidateHeaders, ['bank', 'bankname']),
        sender: findColumn(candidateHeaders, ['sender', 'sendername', 'payer', 'from']),
        receiver: findColumn(candidateHeaders, ['receiver', 'receivername', 'payee', 'to', 'beneficiary']),
      };
      break;
    }
  }

  if (headerIndex < 0 || !columns) {
    throw new Error('Could not identify date and description columns. Please ensure this is a standard bank statement.');
  }

  // Detect bank name from rows preceding the header
  let detectedBank = defaultBank;
  for (let r = 0; r < headerIndex; r += 1) {
    const rowText = rows[r].join(' ');
    detectedBank = detectBankName(rowText, detectedBank);
  }

  const results = [];
  const dataRows = rows.slice(headerIndex + 1);

  for (let idx = 0; idx < dataRows.length; idx += 1) {
    const row = dataRows[idx];
    const fullRowText = row.join(' ');
    if (isBalanceOrSummary(fullRowText)) continue;

    const dateVal = row[columns.date] || (columns.valueDate >= 0 ? row[columns.valueDate] : null);
    const date = toIsoDay(dateVal, preferredFormat);
    if (!date) continue;

    const desc = cleanText(
      (columns.description >= 0 ? row[columns.description] : '') ||
      (columns.narration >= 0 ? row[columns.narration] : '') ||
      (columns.particulars >= 0 ? row[columns.particulars] : '') ||
      ''
    );

    const debit = columns.debit >= 0 ? parseStatementAmount(row[columns.debit]) : null;
    const credit = columns.credit >= 0 ? parseStatementAmount(row[columns.credit]) : null;
    const genericAmount = columns.amount >= 0 ? parseStatementAmount(row[columns.amount]) : null;
    const signedAmount = columns.amount >= 0 ? parseSignedAmount(row[columns.amount]) : null;
    const typeCell = columns.type >= 0 ? cleanText(row[columns.type]).toLowerCase() : '';

    // Accurate credit / debit direction logic
    let isIncome = false;
    if (credit !== null && credit > 0) {
      isIncome = true;
    } else if (debit !== null && debit > 0) {
      isIncome = false;
    } else if (/(^|\b)(cr|credit)\b|deposit|received/i.test(typeCell)) {
      isIncome = true;
    } else if (/(^|\b)(dr|debit)\b|withdrawal/i.test(typeCell)) {
      isIncome = false;
    } else if (signedAmount !== null && signedAmount < 0) {
      isIncome = false;
    } else if (String(row[columns.amount] || '').includes('+') || /(cr|credit)$/i.test(String(row[columns.amount] || ''))) {
      isIncome = true;
    } else if (/received from|money received/i.test(desc) && !/credit card|reversal/i.test(desc)) {
      isIncome = true;
    } else {
      isIncome = false;
    }

    const amount = debit ?? credit ?? genericAmount;
    if (!amount || amount <= 0 || amount > MAX_AMOUNT) continue;
    const finalDesc = desc || 'Transaction Entry';

    const entities = parseNarrationEntities({
      narration: finalDesc,
      isIncome,
      defaultBank: detectedBank,
    });

    const explicitBank = columns.bank >= 0 ? cleanText(row[columns.bank]).slice(0, 100) : null;
    const explicitSender = columns.sender >= 0 ? cleanText(row[columns.sender]).slice(0, 150) : null;
    const explicitReceiver = columns.receiver >= 0 ? cleanText(row[columns.receiver]).slice(0, 150) : null;
    const explicitRef = (columns.reference >= 0 ? cleanText(row[columns.reference]) : '') ||
                        (columns.ref >= 0 ? cleanText(row[columns.ref]) : '');

    const bankName = explicitBank || entities.bank_name || detectedBank || 'Bank Account';
    const sender = explicitSender || entities.sender;
    const receiver = explicitReceiver || entities.receiver;
    const txnNumber = explicitRef || entities.transaction_number || extractTransactionId(desc);
    const merchant = isIncome
      ? (sender && sender !== 'You' ? sender : (entities.merchant || 'Deposit'))
      : (receiver && receiver !== 'You' ? receiver : (entities.merchant || 'Merchant'));

    const normalizedMerchant = normalizeForMatch(merchant);
    const savedCategory = merchantCategories.get(normalizedMerchant);
    const categoryRule = CATEGORY_RULES.find(([, rule]) => rule.test(desc.toLowerCase()));
    const incomeCategoryRule = INCOME_CATEGORY_RULES.find(([, rule]) => rule.test(desc.toLowerCase()));

    const category = isIncome
      ? (savedCategory !== undefined ? savedCategory : (incomeCategoryRule?.[0] || 'Other'))
      : (savedCategory !== undefined ? savedCategory : (categoryRule?.[0] || 'Other'));

    const fingerprint = crypto
      .createHash('sha256')
      .update(
        [
          accountId || '',
          date,
          isIncome ? 'income' : 'expense',
          amount.toFixed(2),
          normalizedMerchant,
          normalizeForMatch(txnNumber || ''),
        ].join('|')
      )
      .digest('hex');

    results.push({
      id: `row-${headerIndex + 1 + idx}`,
      date,
      type: isIncome ? 'income' : 'expense',
      amount,
      category,
      merchant,
      bank_name: bankName,
      sender_name: sender,
      receiver_name: receiver,
      transaction_number: txnNumber,
      payment_method: PAYMENT_RULES.find(([, rule]) => rule.test(desc.toLowerCase()))?.[0] || 'bank_transfer',
      counterparty_bank: extractCounterpartyDetails(desc),
      external_reference: txnNumber,
      note: desc.slice(0, 500),
      import_fingerprint: fingerprint,
      import_source: 'statement_upload',
      confidence: savedCategory ? 'high' : categoryRule ? 'medium' : 'low',
    });
  }

  return results;
};

/**
 * Main statement parsing entry point.
 * Accepts buffer or string data, detects format (CSV, Excel, PDF),
 * normalizes parameters, and checks against user history for duplicates.
 */
const parseStatement = async ({
  content,
  fileData,
  filename = 'statement.csv',
  userTransactions = [],
  password = null,
  dateFormat = null,
  accountId = null,
}) => {
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
  const isPdf = buffer.slice(0, 5).toString('ascii').startsWith('%PDF') || /\.pdf$/i.test(filename);
  const isZipExcel = buffer.slice(0, 4).toString('ascii') === 'PK\x03\x04' || /\.xlsx$/i.test(filename);
  const isXls = /\.xls$/i.test(filename);

  // Reject legacy OLE2 .xls files with actionable instruction
  if (isXls && !isZipExcel) {
    const err = new Error('Legacy .xls files (Excel 97-2003) are not supported. Please open the file and save/export as .xlsx or .csv.');
    err.code = 'XLS_NOT_SUPPORTED';
    throw err;
  }

  // Detect date format preference: MDY for US banks/statements, default DMY for Indian banks
  const isUsBankOrFile = /chase|bofa|bank\s*of\s*america|wells\s*fargo|wells|amex|american\s*express|citi|citibank/i.test(filename);
  const preferredFormat = (dateFormat ? String(dateFormat).toUpperCase() : null) || (isUsBankOrFile ? 'MDY' : 'DMY');

  // Load user merchant categories & existing fingerprints
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

  let parsedList = [];
  let defaultBank = detectBankName(filename, null);
  let detectedFormat = 'CSV';

  if (isPdf) {
    detectedFormat = 'PDF';
    const { rawTransactions, bankName, statementSource } = await parsePdfBuffer(buffer, filename, { password, preferredFormat });
    defaultBank = bankName || defaultBank;

    parsedList = rawTransactions.map((tx, idx) => {
      const entities = parseNarrationEntities({
        narration: tx.desc,
        isIncome: tx.type === 'income',
        defaultBank,
      });

      const merchant = entities.merchant;
      const normalizedMerchant = normalizeForMatch(merchant);
      const savedCategory = merchantCategories.get(normalizedMerchant);
      const categoryRule = CATEGORY_RULES.find(([, rule]) => rule.test(tx.desc.toLowerCase()));
      const incomeCategoryRule = INCOME_CATEGORY_RULES.find(([, rule]) => rule.test(tx.desc.toLowerCase()));

      const category = tx.type === 'income'
        ? (savedCategory !== undefined ? savedCategory : (incomeCategoryRule?.[0] || 'Other'))
        : (savedCategory !== undefined ? savedCategory : (categoryRule?.[0] || 'Other'));

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
        bank_name: entities.bank_name || defaultBank || 'Payment App',
        sender_name: entities.sender,
        receiver_name: entities.receiver,
        transaction_number: txnNumber,
        payment_method: PAYMENT_RULES.find(([, rule]) => rule.test(tx.desc.toLowerCase()))?.[0] || 'upi',
        counterparty_bank: extractCounterpartyDetails(tx.desc),
        external_reference: txnNumber,
        note: tx.desc.slice(0, 500),
        import_fingerprint: fingerprint,
        import_source: statementSource,
        confidence: savedCategory ? 'high' : categoryRule ? 'medium' : 'low',
      };
    });
  } else if (isZipExcel) {
    detectedFormat = 'Excel';
    const rows = await parseExcelBuffer(buffer);
    parsedList = processTabularRows({
      rows,
      defaultBank,
      merchantCategories,
      preferredFormat,
      accountId,
    });
  } else {
    detectedFormat = 'CSV';
    const contentStr = buffer.toString('utf8');
    const rows = parseCsvString(contentStr);
    parsedList = processTabularRows({
      rows,
      defaultBank,
      merchantCategories,
      preferredFormat,
      accountId,
    });
  }

  // Filter valid transactions
  const valid = parsedList.filter((tx) => tx && tx.date && tx.amount > 0 && tx.amount <= MAX_AMOUNT);

  if (valid.length === 0) {
    throw new Error('No valid transactions were found in this statement.');
  }

  // Cap to IMPORT_LIMIT
  const capped = valid.slice(0, IMPORT_LIMIT);

  // Identify duplicate entries without falsely dropping legitimate same-day repeat purchases
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
        // Flag identical repeat purchase within the same file for user review without auto-dropping
        confidence = 'weak_duplicate';
      }
    }

    seenFingerprints.add(tx.import_fingerprint);
    return { ...tx, duplicate, confidence };
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
      warnings: [
        ...(valid.length > IMPORT_LIMIT ? [`Statement contains ${valid.length} transactions; only the first ${IMPORT_LIMIT} are shown.`] : []),
      ],
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
  toIsoDay,
  cleanText,
  parseStatementAmount,
  parseSignedAmount,
  isBalanceOrSummary,
  IMPORT_LIMIT,
};
