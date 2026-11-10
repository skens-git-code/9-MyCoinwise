/* —————————————————————————————————————
 * Statement Classifiers & Entity Extractors
 * Rule-based bank/app detection, transaction ID extraction, narration parsing,
 * payment method classification, and category inference.
 * ————————————————————————————————————— */

const { cleanText } = require('./helpers');

const PAYMENT_RULES = [
  ['upi', /\bupi\b|@\w+|gpay|google pay|phonepe|phone pe|bhim|paytm/i],
  ['card', /\b(pos|card|visa|mastercard|rupay|amex|debit card|credit card)\b/i],
  ['bank_transfer', /\b(neft|imps|rtgs|ach|ecs|wire|bank transfer)\b/i],
  ['cheque', /\b(chq|cheque)\b/i],
  ['wallet', /paytm wallet|mobikwik|freecharge|amazon pay/i],
];

const CATEGORY_RULES = [
  ['Groceries', /grocery|supermarket|mart|bigbasket|blinkit|zepto|dmart|nature's basket|jiomart|milk|dairy|whole foods|trader joe/i],
  ['Food', /restaurant|cafe|coffee|swiggy|zomato|starbucks|mcdonald|domino|kfc|burger king|haldiram|food|dining|eats|ubereats|doordash/i],
  ['Transport', /uber|ola|metro|fuel|petrol|diesel|parking|rapido|irctc|railway|fastag|toll|hpcl|bpcl|ioc|shell|lyft/i],
  ['Shopping', /amazon|flipkart|myntra|meesho|nykaa|ajio|tata neu|zara|h&m|retail|store|mall|target|walmart/i],
  ['Bills', /electricity|bescom|msedcl|tata power|water bill|gas bill|igl|broadband|wifi|act fibernet|airtel|jio|vi |recharge|bill payment|utility/i],
  ['Subscriptions', /netflix|spotify|youtube|prime|hotstar|disney|sonyliv|apple|chatgpt|openai|subscription/i],
  ['Health', /hospital|clinic|pharmacy|medical|apollo|pharmeasy|1mg|netmeds|medplus|diagnostic|doctor/i],
  ['Rent', /\brent\b|nobroker|magicbricks|house rent|flat rent|landlord/i],
  ['Travel', /airline|hotel|makemytrip|cleartrip|yatra|booking\.com|airbnb|indigo|air india|akasa|vistara|flight/i],
  ['Education', /school|college|course|udemy|coursera|unacademy|byju|tuition|fees/i],
  ['Investment', /mutual fund|zerodha|groww|angel one|upstox|kuvera|indmoney|smallcase|sip|investment|nse|bse|ppf|nps|vanguard|fidelity/i],
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
  { pattern: /state bank of india|\bsbi\b/i, name: 'State Bank of India' },
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
  { pattern: /chase/i, name: 'Chase Bank' },
  { pattern: /bank of america|bofa/i, name: 'Bank of America' },
  { pattern: /wells fargo/i, name: 'Wells Fargo' },
  { pattern: /citibank|\bciti\b/i, name: 'Citibank' },
];

const detectBankName = (text, defaultName = null) => {
  if (!text) return defaultName;
  for (const b of KNOWN_BANKS) {
    if (b.pattern.test(text)) return b.name;
  }
  return defaultName;
};

/**
 * Extracts UTR / UPI / IMPS / NEFT / RTGS / Payment App / Cheque references.
 * Explicitly avoids misclassifying Indian mobile numbers as 12-digit references.
 *
 * @param {string} text
 * @returns {string|null}
 */
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

  // UTR: IMPS (12), NEFT (16 chars), RTGS (22 chars)
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

const extractCounterpartyDetails = (description) => {
  const str = String(description || '');
  const upiHandle = str.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9_-]+)/)?.[1];
  const ifsc = str.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/i)?.[0];
  const account = str.match(/(?:a\/c|account)\s*(?:no\.?|#)?\s*(\*{2,}\d{3,6}|\d{4,})/i)?.[1];
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

const parseNarrationEntities = ({ narration, isIncome, defaultBank = null }) => {
  const desc = cleanText(narration);
  let sender = isIncome ? null : 'You';
  let receiver = isIncome ? 'You' : null;
  let bankName = defaultBank;
  let txnId = extractTransactionId(desc);

  const STOP_BOUNDARY = '(?:upi|transaction|txn|utr|order|note|tag|chq|ref|dated|date|debited|credited|status|using|via|from|to|for|amount|\\||\\b\\d{8,}\\b)';

  const paidToMatch = desc.match(new RegExp(`(?:money sent to|paid to|payment to|paid at|recharge of|to:?)\\s+([A-Za-z0-9\\s&.'-]+?)(?:\\s*${STOP_BOUNDARY}\\b|\\s*\\||$)`, 'i'));
  if (paidToMatch) {
    receiver = cleanText(paidToMatch[1]);
    sender = 'You';
  }

  const receivedFromMatch = desc.match(new RegExp(`(?:received from|payment from|received at|from:?)\\s+([A-Za-z0-9\\s&.'-]+?)(?:\\s*${STOP_BOUNDARY}\\b|\\s*\\||$)`, 'i'));
  if (receivedFromMatch) {
    sender = cleanText(receivedFromMatch[1]);
    receiver = 'You';
  }

  const upiTokens = desc.split(/[\/]/).map(cleanText).filter(Boolean);
  if (upiTokens.length >= 3 && /^upi$/i.test(upiTokens[0])) {
    const candidateRef = upiTokens.find((t) => /^\d{12}$/.test(t));
    if (candidateRef) txnId = candidateRef;

    const nameCandidate = upiTokens.find((t) => t.length > 2 && !/^\d+$/.test(t) && !/^(p2a|p2p|p2m|cr|dr|upi)$/i.test(t));
    if (nameCandidate) {
      if (isIncome) sender = nameCandidate;
      else receiver = nameCandidate;
    }
  }

  const neftMatch = desc.match(/neft\s*(?:cr|dr)?[-/]([A-Za-z0-9]+)[-/]([A-Za-z0-9\s]+)/i);
  if (neftMatch) {
    txnId = txnId || neftMatch[1];
    const entity = cleanText(neftMatch[2]);
    if (isIncome) sender = entity;
    else receiver = entity;
  }

  const bankMatch = desc.match(/\b(?:debited from|credited to|from bank|bank:)\s+([A-Za-z\s]+?)(?:[-•*\d]|\baccount\b|$)/i);
  if (bankMatch) {
    bankName = detectBankName(bankMatch[1], null) || detectBankName(desc, bankName);
  } else {
    bankName = detectBankName(desc, bankName);
  }

  const merchant = isIncome
    ? (sender && sender !== 'You' ? sender : extractMerchantOrName(desc) || 'Deposit')
    : (receiver && receiver !== 'You' ? receiver : extractMerchantOrName(desc));

  return {
    sender: sender ? sender.slice(0, 150) : null,
    receiver: receiver ? receiver.slice(0, 150) : null,
    merchant: (merchant || 'Bank transaction').slice(0, 150),
    bank_name: bankName,
    transaction_number: txnId,
  };
};

module.exports = {
  PAYMENT_RULES,
  CATEGORY_RULES,
  INCOME_CATEGORY_RULES,
  KNOWN_BANKS,
  detectBankName,
  extractTransactionId,
  extractCounterpartyDetails,
  extractMerchantOrName,
  parseNarrationEntities,
};

