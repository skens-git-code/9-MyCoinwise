/* —————————————————————————————————————
 * Tabular Row Normalization Engine (CSV, Excel, and Extracted PDF Tables)
 * Handles header discovery, column mapping, signed-amount conventions,
 * running-balance reconciliation, entity extraction, and skip diagnostics.
 * ————————————————————————————————————— */

const crypto = require('crypto');
const {
  MAX_AMOUNT,
  cleanText,
  normalizeForMatch,
  toIsoDay,
  parseStatementAmount,
  parseSignedAmount,
  isBalanceOrSummary,
} = require('./helpers');
const {
  PAYMENT_RULES,
  CATEGORY_RULES,
  INCOME_CATEGORY_RULES,
  detectBankName,
  extractTransactionId,
  extractCounterpartyDetails,
  parseNarrationEntities,
} = require('./classifiers');

const HEADER_SCAN_LIMIT = 500;

const STATEMENT_CATEGORY_MAP = {
  food: 'Food',
  groceries: 'Groceries',
  grocery: 'Groceries',
  transport: 'Transport',
  fuel: 'Transport',
  travel: 'Travel',
  shopping: 'Shopping',
  entertainment: 'Entertainment',
  health: 'Health',
  medical: 'Health',
  education: 'Education',
  bills: 'Bills',
  billpayments: 'Bills',
  billpayment: 'Bills',
  utilities: 'Utilities',
  utility: 'Utilities',
  recharge: 'Bills',
  salary: 'Salary',
  freelance: 'Freelance',
  gift: 'Gift',
  rent: 'Rent',
  fitness: 'Fitness',
  subscriptions: 'Subscriptions',
  subscription: 'Subscriptions',
  insurance: 'Insurance',
  investment: 'Investment',
  refund: 'Refund',
  transfer: 'Transfer',
  moneytransfer: 'Transfer',
  moneyreceived: 'Income',
  miscellaneous: 'Other',
  other: 'Other',
};

const normalizeExplicitCategory = (raw) => {
  const cleaned = cleanText(raw);
  if (!cleaned) return null;
  const key = headerKey(cleaned);
  if (STATEMENT_CATEGORY_MAP[key]) return STATEMENT_CATEGORY_MAP[key];
  return cleaned.slice(0, 80);
};

const isSummarySubtableHeader = (cells) => {
  const cleanedCells = (cells || []).map(cleanText).filter(Boolean);
  if (cleanedCells.length === 0) return false;
  const joined = cleanedCells.join(' ').toLowerCase();
  if (
    /^category[\s,-]*wise\s+spending\b/.test(joined) ||
    /^daily\s+cash\s+flow\b/.test(joined)
  ) {
    return true;
  }
  // Data rows that begin with a valid transaction date are never summary headers.
  if (toIsoDay(cleanedCells[0], 'DMY') || toIsoDay(cleanedCells[0], 'MDY')) {
    return false;
  }
  const keys = cleanedCells.map(headerKey).filter(Boolean);
  const summaryOnlyKeys = [
    'totalspent', 'totalspentinr', 'shareofspending',
    'paymentsmade', 'paymentsmadeinr', 'moneyreceivedinr',
    'netcashflow', 'netcashflowinr', 'paymentcount', 'transactioncount', 'txncount',
    'totalpaid', 'totalreceived',
  ];
  const matchedCount = summaryOnlyKeys.filter((k) => keys.includes(k)).length;
  return (
    matchedCount >= 2 ||
    keys.includes('totalspent') ||
    keys.includes('totalspentinr') ||
    keys.includes('shareofspending') ||
    keys.includes('paymentcount')
  );
};

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
 * Detects header row index and maps column indices in a 2D row matrix.
 *
 * @param {Array<Array<string|number>>} rows
 * @returns {{ headerIndex: number, columns: Record<string, number> } | null}
 */
const detectTableHeader = (rows) => {
  for (let r = 0; r < Math.min(HEADER_SCAN_LIMIT, rows.length); r += 1) {
    const candidateHeaders = (rows[r] || []).map(headerKey);
    if (isSummarySubtableHeader(rows[r])) continue;

    const dateCol = findColumn(candidateHeaders, [
      'date', 'txndate', 'trandate', 'transactiondate', 'valuedate',
      'postdate', 'txndatetime', 'bookingdate', 'posted', 'timestamp', 'dt',
    ]);
    let descCol = findColumn(candidateHeaders, [
      'description', 'transactiondetails', 'details', 'narration', 'particulars', 'remarks', 'memo',
      'counterparty', 'counterpartyname', 'merchant', 'merchantname', 'payee', 'vendor', 'note',
      'name', 'title', 'party', 'partyname', 'beneficiary',
      'trans', 'transaction', 'activity', 'reason', 'purpose', 'item', 'comment', 'store',
    ]);
    const debitCol = findColumn(candidateHeaders, [
      'debit', 'debitamount', 'withdrawal', 'withdrawalamount', 'withdraw',
      'dr', 'paidout', 'outflow', 'debitinr', 'debitrs', 'expense', 'spent', 'spend',
    ]);
    const creditCol = findColumn(candidateHeaders, [
      'credit', 'creditamount', 'deposit', 'depositamount',
      'cr', 'paidin', 'inflow', 'creditinr', 'creditrs', 'income', 'received',
    ]);
    const amtCol = findColumn(candidateHeaders, [
      'amount', 'txnamount', 'transactionamount', 'amountinr', 'amountrs',
      'netamount', 'signedamount', 'signedamountinr', 'total', 'value', 'price', 'cost',
    ]);

    const nonDescCols = new Set(['time', 'type', 'category', 'categorytag', 'status', 'account', 'balance', 'currency', 'sno', 'slno', 'id']);
    if (descCol < 0 && dateCol >= 0 && (debitCol >= 0 || creditCol >= 0 || amtCol >= 0)) {
      for (let c = 0; c < candidateHeaders.length; c += 1) {
        if (
          c !== dateCol &&
          c !== debitCol &&
          c !== creditCol &&
          c !== amtCol &&
          candidateHeaders[c] &&
          !nonDescCols.has(candidateHeaders[c])
        ) {
          descCol = c;
          break;
        }
      }
    }

    const hasDescMatch =
      descCol >= 0 ||
      candidateHeaders.some((h) => h.includes('desc') || h.includes('detail') || h.includes('narr') || h.includes('merchant') || h.includes('counterparty'));

    if (dateCol >= 0 && hasDescMatch && (debitCol >= 0 || creditCol >= 0 || amtCol >= 0)) {
      return {
        headerIndex: r,
        columns: {
          date: dateCol,
          valueDate: findColumn(candidateHeaders, ['valuedate', 'valuedt']),
          description: descCol,
          narration: findColumn(candidateHeaders, ['narration']),
          particulars: findColumn(candidateHeaders, ['particulars']),
          counterparty: findColumn(candidateHeaders, ['counterparty', 'counterpartyname', 'merchant', 'merchantname', 'vendor']),
          note: findColumn(candidateHeaders, ['note', 'remarks', 'memo']),
          category: findColumn(candidateHeaders, ['categorytag', 'category', 'tag']),
          upiId: findColumn(candidateHeaders, ['upiid', 'vpa', 'payervpa', 'payeevpa']),
          account: findColumn(candidateHeaders, ['account', 'accountname', 'bankaccount']),
          debit: debitCol,
          credit: creditCol,
          amount: amtCol,
          signedAmount: findColumn(candidateHeaders, ['signedamountinr', 'signedamount']),
          balance: findColumn(candidateHeaders, ['balance', 'runningbalance', 'closingbalance', 'availablebalance', 'availbal', 'bal']),
          type: findColumn(candidateHeaders, ['type', 'transactiontype', 'drcr', 'crdr', 'direction', 'flow']),
          reference: findColumn(candidateHeaders, ['upireferenceno', 'upiref', 'referenceno', 'referencenumber', 'reference', 'chequeno', 'chqno', 'transactionid', 'txnid', 'utrno', 'utr', 'orderid']),
          ref: findColumn(candidateHeaders, ['refno', 'ref']),
          bank: findColumn(candidateHeaders, ['bank', 'bankname']),
          sender: findColumn(candidateHeaders, ['sender', 'sendername', 'payer', 'from']),
          receiver: findColumn(candidateHeaders, ['receiver', 'receivername', 'payee', 'to', 'beneficiary']),
        },
      };
    }
  }
  return null;
};

/**
 * Normalizes a 2D array of tabular rows (CSV, Excel, or PDF table)
 * into validated coinwise transaction candidates and diagnostics.
 *
 * @param {object} params
 * @returns {{ transactions: object[], diagnostics: object }}
 */
const normalizeTabularRows = ({
  rows,
  defaultBank = null,
  merchantCategories = new Map(),
  preferredFormat = 'DMY',
  accountId = null,
  importSource = 'statement_upload',
}) => {
  if (!Array.isArray(rows) || rows.length < 2) {
    throw new Error('Statement must contain a header row and at least one transaction row.');
  }

  const headerInfo = detectTableHeader(rows);
  if (!headerInfo) {
    throw new Error('Could not identify date and description columns. Please ensure this is a standard bank statement.');
  }

  const { headerIndex, columns } = headerInfo;

  // Detect bank name from metadata rows preceding the table header
  let detectedBank = defaultBank;
  for (let r = 0; r < headerIndex; r += 1) {
    const rowText = (rows[r] || []).join(' ');
    detectedBank = detectBankName(rowText, detectedBank);
  }

  const dataRows = rows.slice(headerIndex + 1);

  // Detect whether a single `amount` column uses signed convention (negatives = expense, positives = income)
  let usesSignedAmountConvention = false;
  if (columns.amount >= 0 && columns.debit < 0 && columns.credit < 0 && columns.type < 0) {
    let hasNegative = false;
    let hasPositive = false;
    for (const row of dataRows) {
      const signed = parseSignedAmount(row?.[columns.amount]);
      if (signed !== null && signed < 0) hasNegative = true;
      else if (signed !== null && signed > 0) hasPositive = true;
      if (hasNegative && hasPositive) {
        usesSignedAmountConvention = true;
        break;
      }
    }
  }

  // Detect chronological order for running-balance reconciliation
  let isDescendingOrder = false;
  if (columns.balance >= 0) {
    const sampleDates = [];
    for (const row of dataRows) {
      const d = toIsoDay(row?.[columns.date] || (columns.valueDate >= 0 ? row?.[columns.valueDate] : null), preferredFormat);
      if (d) {
        if (sampleDates.length === 0 || sampleDates[sampleDates.length - 1] !== d) {
          sampleDates.push(d);
        }
        if (sampleDates.length >= 2) break;
      }
    }
    if (sampleDates.length === 2 && sampleDates[0] > sampleDates[1]) {
      isDescendingOrder = true;
    }
  }

  const results = [];
  const skipReasons = { summary: 0, invalidDate: 0, invalidAmount: 0 };
  let prevBalance = null;
  let balanceReconciledCount = 0;

  for (let idx = 0; idx < dataRows.length; idx += 1) {
    const row = dataRows[idx];
    if (!Array.isArray(row) || !row.some((c) => cleanText(c) !== '')) continue;

    // Stop before trailing dashboard summary tables (e.g. CATEGORY-WISE SPENDING, DAILY CASH FLOW)
    if (results.length > 0 && isSummarySubtableHeader(row)) {
      break;
    }

    const fullRowText = row.join(' ');
    if (isBalanceOrSummary(fullRowText)) {
      skipReasons.summary += 1;
      continue;
    }

    const dateVal = row[columns.date] || (columns.valueDate >= 0 ? row[columns.valueDate] : null);
    const date = toIsoDay(dateVal, preferredFormat);
    if (!date) {
      skipReasons.invalidDate += 1;
      continue;
    }

    const primaryDesc = cleanText(
      (columns.description >= 0 ? row[columns.description] : '') ||
      (columns.narration >= 0 ? row[columns.narration] : '') ||
      (columns.particulars >= 0 ? row[columns.particulars] : '') ||
      ''
    );
    const extraNote = columns.note >= 0 && columns.note !== columns.description
      ? cleanText(row[columns.note])
      : '';
    const explicitUpiId = columns.upiId >= 0 ? cleanText(row[columns.upiId]) : '';
    const desc = [primaryDesc, extraNote, explicitUpiId].filter(Boolean).join(' · ') || '';

    const debit = columns.debit >= 0 ? parseStatementAmount(row[columns.debit]) : null;
    const credit = columns.credit >= 0 ? parseStatementAmount(row[columns.credit]) : null;
    const genericAmount = columns.amount >= 0 ? parseStatementAmount(row[columns.amount]) : null;
    const signedFallbackCol = columns.signedAmount >= 0 && columns.signedAmount !== columns.amount
      ? parseStatementAmount(row[columns.signedAmount])
      : null;
    const signedAmount = columns.amount >= 0
      ? (parseSignedAmount(row[columns.amount]) ?? (columns.signedAmount >= 0 ? parseSignedAmount(row[columns.signedAmount]) : null))
      : null;
    const typeCell = columns.type >= 0 ? cleanText(row[columns.type]).toLowerCase() : '';
    const currBalance = columns.balance >= 0 ? parseSignedAmount(row[columns.balance]) : null;

    const amount = debit ?? credit ?? genericAmount ?? signedFallbackCol;
    if (!amount || amount <= 0 || amount > MAX_AMOUNT) {
      skipReasons.invalidAmount += 1;
      continue;
    }

    // Determine transaction direction (income vs expense)
    let isIncome = false;
    let directionKnown = false;

    if (credit !== null && credit > 0 && (debit === null || debit === 0)) {
      isIncome = true;
      directionKnown = true;
    } else if (debit !== null && debit > 0 && (credit === null || credit === 0)) {
      isIncome = false;
      directionKnown = true;
    } else if (/(^|\b)(cr|credit)\b|deposit|received/i.test(typeCell)) {
      isIncome = true;
      directionKnown = true;
    } else if (/(^|\b)(dr|debit)\b|withdrawal/i.test(typeCell)) {
      isIncome = false;
      directionKnown = true;
    } else if (signedAmount !== null && signedAmount < 0) {
      isIncome = false;
      directionKnown = true;
    } else if (String(row[columns.amount] || '').includes('+') || /(cr|credit)$/i.test(String(row[columns.amount] || ''))) {
      isIncome = true;
      directionKnown = true;
    } else if (usesSignedAmountConvention && signedAmount !== null && signedAmount > 0) {
      isIncome = true;
      directionKnown = true;
    }

    // Running-balance reconciliation when direction is still ambiguous
    if (!directionKnown && currBalance !== null && prevBalance !== null) {
      const tolerance = 0.05;
      if (!isDescendingOrder) {
        if (Math.abs((prevBalance + amount) - currBalance) <= tolerance) {
          isIncome = true;
          directionKnown = true;
          balanceReconciledCount += 1;
        } else if (Math.abs((prevBalance - amount) - currBalance) <= tolerance) {
          isIncome = false;
          directionKnown = true;
          balanceReconciledCount += 1;
        }
      } else {
        // Descending order: prevBalance is AFTER this transaction, currBalance is BEFORE
        if (Math.abs((currBalance + amount) - prevBalance) <= tolerance) {
          isIncome = true;
          directionKnown = true;
          balanceReconciledCount += 1;
        } else if (Math.abs((currBalance - amount) - prevBalance) <= tolerance) {
          isIncome = false;
          directionKnown = true;
          balanceReconciledCount += 1;
        }
      }
    }

    if (!directionKnown) {
      if (/received from|money received/i.test(desc) && !/credit card|reversal/i.test(desc)) {
        isIncome = true;
      } else if (/\b(salary|dividend|interest credit|cashback|refund)\b/i.test(desc) && !/credit card|reversal/i.test(desc)) {
        isIncome = true;
      } else {
        isIncome = false;
      }
    }

    if (currBalance !== null) {
      prevBalance = currBalance;
    }

    const finalDesc = desc || 'Transaction Entry';
    const entities = parseNarrationEntities({
      narration: primaryDesc || finalDesc,
      isIncome,
      defaultBank: detectedBank,
    });

    const explicitAccount = columns.account >= 0 ? cleanText(row[columns.account]) : '';
    const explicitBank = columns.bank >= 0
      ? cleanText(row[columns.bank]).slice(0, 100)
      : (explicitAccount ? detectBankName(explicitAccount, null) : null);
    const explicitCounterparty = columns.counterparty >= 0 ? cleanText(row[columns.counterparty]).slice(0, 150) : '';
    const explicitSender = columns.sender >= 0 ? cleanText(row[columns.sender]).slice(0, 150) : null;
    const explicitReceiver = columns.receiver >= 0 ? cleanText(row[columns.receiver]).slice(0, 150) : null;
    const explicitRef =
      (columns.reference >= 0 ? cleanText(row[columns.reference]) : '') ||
      (columns.ref >= 0 ? cleanText(row[columns.ref]) : '');

    const bankName = explicitBank || entities.bank_name || detectedBank || 'Bank Account';
    const sender = explicitSender || (isIncome && explicitCounterparty ? explicitCounterparty : entities.sender);
    const receiver = explicitReceiver || (!isIncome && explicitCounterparty ? explicitCounterparty : entities.receiver);
    const txnNumber = explicitRef || entities.transaction_number || extractTransactionId(finalDesc);
    const merchant = explicitCounterparty || (isIncome
      ? (sender && sender !== 'You' ? sender : (entities.merchant || 'Deposit'))
      : (receiver && receiver !== 'You' ? receiver : (entities.merchant || 'Merchant')));

    const normalizedMerchant = normalizeForMatch(merchant);
    const savedCategory = merchantCategories.get(normalizedMerchant);
    const explicitCategory = columns.category >= 0 ? normalizeExplicitCategory(row[columns.category]) : null;
    const categoryRule = CATEGORY_RULES.find(([, rule]) => rule.test(finalDesc.toLowerCase()));
    const incomeCategoryRule = INCOME_CATEGORY_RULES.find(([, rule]) => rule.test(finalDesc.toLowerCase()));

    const category = savedCategory !== undefined
      ? savedCategory
      : explicitCategory || (isIncome ? (incomeCategoryRule?.[0] || 'Other') : (categoryRule?.[0] || 'Other'));

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
      import_source: importSource,
      confidence: (savedCategory || explicitCategory) ? 'high' : (categoryRule || incomeCategoryRule) ? 'medium' : 'low',
    });
  }

  const rowsSkipped = skipReasons.summary + skipReasons.invalidDate + skipReasons.invalidAmount;
  const warnings = [];
  if (skipReasons.invalidDate > 0) {
    warnings.push(`Skipped ${skipReasons.invalidDate} row(s) with missing or invalid dates.`);
  }
  if (skipReasons.invalidAmount > 0) {
    warnings.push(`Skipped ${skipReasons.invalidAmount} row(s) with missing or zero amounts.`);
  }

  return {
    transactions: results,
    diagnostics: {
      rowsTotal: dataRows.length,
      rowsParsed: results.length,
      rowsSkipped,
      skipReasons,
      balanceReconciledCount,
      headerRowIndex: headerIndex,
      warnings,
    },
  };
};

module.exports = {
  headerKey,
  findColumn,
  detectTableHeader,
  normalizeTabularRows,
  normalizeExplicitCategory,
};

