const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Account = require('../models/Account');
const checkOwnership = require('../middleware/ownership');

const router = express.Router();

const TRANSACTION_TYPES = new Set(['income', 'expense']);
const IMPORT_LIMIT = 1000;

const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeForMatch = (value) => cleanText(value).toLowerCase().replace(/[^a-z0-9@]/g, '');
const parseStatementAmount = (value) => {
  const raw = cleanText(value).replace(/[₹$€£,\s]/g, '');
  if (!raw || raw === '-' || raw.toLowerCase() === 'null') return null;
  const normalized = raw.replace(/^\((.*)\)$/, '-$1');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount !== 0 ? Math.abs(amount) : null;
};

const parseCsv = (content) => {
  const rows = [];
  let row = [], field = '', quoted = false;
  const text = String(content || '').replace(/^\uFEFF/, '');
  const delimiter = (text.split(/\r?\n/, 1)[0].match(/;/g) || []).length > (text.split(/\r?\n/, 1)[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(field.trim()); field = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; field = '';
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
};

const headerKey = (value) => cleanText(value).toLowerCase().replace(/[^a-z0-9]/g, '');
const findColumn = (headers, names) => headers.findIndex(header => names.includes(header));
const toIsoDay = (value) => {
  const source = cleanText(value);
  if (!source) return null;
  const match = source.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!match) {
    const direct = new Date(source);
    return Number.isNaN(direct.getTime()) ? null : direct.toISOString().slice(0, 10);
  }
  const [, first, second, yearRaw] = match;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
  // Indian bank exports are generally DD/MM/YYYY. Use month-first only when
  // the first number cannot be a day.
  const day = Number(first) > 12 ? first : second;
  const month = Number(first) > 12 ? second : first;
  const parsed = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const PAYMENT_RULES = [
  ['upi', /\bupi\b|@\w+|gpay|google pay|phonepe|phone pe|bhim/],
  ['card', /\b(pos|card|visa|mastercard|rupay|amex)\b/],
  ['bank_transfer', /\b(neft|imps|rtgs|ach|ecs|bank transfer)\b/],
  ['wallet', /paytm|mobikwik|freecharge|amazon pay/],
];
const CATEGORY_RULES = [
  ['Groceries', /grocery|supermarket|mart|bigbasket|blinkit|zepto|dmart/],
  ['Food', /restaurant|cafe|coffee|swiggy|zomato|food|dining/],
  ['Transport', /uber|ola|metro|fuel|petrol|diesel|parking|rapido/],
  ['Shopping', /amazon|flipkart|myntra|meesho|store/],
  ['Bills', /electricity|water bill|gas bill|broadband|mobile recharge|jio|airtel|vi /],
  ['Subscriptions', /netflix|spotify|youtube|prime|hotstar|subscription/],
  ['Health', /hospital|clinic|pharmacy|medical|apollo/],
  ['Rent', /\brent\b/],
  ['Travel', /airline|hotel|irctc|makemytrip|booking\.com/],
  ['Education', /school|college|course|udemy|coursera/],
  ['Investment', /mutual fund|zerodha|groww|sip|investment/],
];

const extractBankDetails = (description) => {
  const upiHandle = description.match(/@([a-z0-9._-]+)/i)?.[1];
  const ifsc = description.match(/\b[A-Z]{4}0[A-Z0-9]{6}\b/i)?.[0];
  const account = description.match(/(?:a\/c|account)\s*(?:no\.?|#)?\s*(\*{2,}\d{3,6}|\d{4,})/i)?.[1];
  return cleanText([upiHandle && `UPI: @${upiHandle}`, ifsc && `IFSC: ${ifsc}`, account && `A/C: ${account}`].filter(Boolean).join(' · ')) || null;
};

const extractMerchant = (description) => {
  let value = cleanText(description)
    .replace(/\b(upi|imps|neft|rtgs|pos|dr|cr|debit|credit|transfer|payment|txn|transaction)\b/gi, ' ')
    .replace(/\b\d{8,}\b/g, ' ');
  const parts = value.split(/[\/:|,-]+/).map(cleanText).filter(part => part && !/^\d+$/.test(part));
  const candidate = parts.find(part => part.length > 2 && !/^(to|from|ref|by|at|via)$/i.test(part)) || value;
  return cleanText(candidate).slice(0, 150) || 'Bank transaction';
};

const classifyStatementRow = (row, columns, merchantCategories) => {
  const description = cleanText(row[columns.description] || row[columns.narration] || row[columns.particulars] || '');
  const debit = parseStatementAmount(row[columns.debit]);
  const credit = parseStatementAmount(row[columns.credit]);
  const genericAmount = parseStatementAmount(row[columns.amount]);
  const typeHint = cleanText(row[columns.type]).toLowerCase();
  const isIncome = credit !== null || (!debit && /credit|\bcr\b|deposit|received/.test(typeHint + description.toLowerCase()));
  const amount = debit ?? credit ?? genericAmount;
  if (!description || !amount || amount <= 0) return null;
  const merchant = extractMerchant(description);
  const normalizedMerchant = normalizeForMatch(merchant);
  const savedCategory = merchantCategories.get(normalizedMerchant);
  const categoryRule = CATEGORY_RULES.find(([, rule]) => rule.test(description.toLowerCase()));
  const category = isIncome ? (/(salary|payroll)/i.test(description) ? 'Salary' : 'Other') : (savedCategory || categoryRule?.[0] || 'Other');
  const paymentMethod = PAYMENT_RULES.find(([, rule]) => rule.test(description.toLowerCase()))?.[0] || 'bank_transfer';
  const date = toIsoDay(row[columns.date] || row[columns.valueDate]);
  if (!date) return null;
  const reference = cleanText(row[columns.reference] || row[columns.ref] || '');
  const fingerprint = crypto.createHash('sha256').update([date, isIncome ? 'income' : 'expense', amount.toFixed(2), normalizedMerchant, normalizeForMatch(reference)].join('|')).digest('hex');
  return {
    date, type: isIncome ? 'income' : 'expense', amount, category, merchant,
    payment_method: paymentMethod, counterparty_bank: extractBankDetails(description),
    external_reference: reference || null, note: description.slice(0, 500),
    import_fingerprint: fingerprint,
    confidence: savedCategory ? 'high' : categoryRule ? 'medium' : 'low',
  };
};

const parseTransactionAmount = (value) => {
  const amount = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999.99) return null;
  if (Math.round(amount * 100) !== amount * 100) return null;
  return amount;
};

const parseTransactionDate = (value) => {
  if (value === undefined || value === null || value === '') return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const validateTransactionPayload = (payload) => {
  const { type, category, amount, date, note, merchant, tags, payment_method, account_id, is_recurring, recurrence_interval, recurrence_ends_at, is_split, split_details } = payload;
  const numericAmount = parseTransactionAmount(amount);
  if (!TRANSACTION_TYPES.has(type)) return { error: 'Type must be income or expense.' };
  if (typeof category !== 'string' || !category.trim() || category.trim().length > 80) {
    return { error: 'A valid category is required.' };
  }
  if (numericAmount === null) return { error: 'Amount must be a positive number with at most 2 decimals.' };
  const parsedDate = parseTransactionDate(date);
  if (!parsedDate) return { error: 'Date must be valid.' };
  if (note !== undefined && note !== null && String(note).length > 500) {
    return { error: 'Note must be 500 characters or fewer.' };
  }
  if (account_id !== undefined && account_id !== null && account_id !== '' && !mongoose.isValidObjectId(account_id)) {
    return { error: 'Account ID is invalid.' };
  }
  
  const parsedPayload = { numericAmount, parsedDate };
  if (merchant !== undefined) parsedPayload.merchant = merchant ? String(merchant).trim() : null;
  if (tags !== undefined) parsedPayload.tags = Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [];
  if (payment_method !== undefined) parsedPayload.payment_method = payment_method;
  if (account_id !== undefined) parsedPayload.account_id = account_id || null;
  
  if (is_recurring !== undefined) parsedPayload.is_recurring = Boolean(is_recurring);
  if (recurrence_interval !== undefined) parsedPayload.recurrence_interval = recurrence_interval;
  if (recurrence_ends_at !== undefined) parsedPayload.recurrence_ends_at = recurrence_ends_at ? new Date(recurrence_ends_at) : null;
  
  if (is_split !== undefined) parsedPayload.is_split = Boolean(is_split);
  if (split_details !== undefined && Array.isArray(split_details)) {
    parsedPayload.split_details = split_details.map(s => ({
      person: String(s.person).trim(),
      amount: parseTransactionAmount(s.amount) || 0,
      paid: Boolean(s.paid)
    }));
  }

  return parsedPayload;
};

const getTransactionBalance = async (userId) => {
  const [result] = await Transaction.aggregate([
    { $match: { user_id: new mongoose.Types.ObjectId(userId), is_deleted: { $ne: true } } },
    {
      $group: {
        _id: null,
        income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } },
        expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } }
      }
    }
  ]);
  return Number(((result?.income || 0) - (result?.expense || 0)).toFixed(2));
};

const syncUserBalance = async (userId) => {
  const balance = await getTransactionBalance(userId);
  await User.findByIdAndUpdate(userId, { $set: { balance } });
  return balance;
};

const syncAccountBalances = async (accountIds = []) => {
  const uniqueIds = [...new Set(accountIds.filter(Boolean).map(String))];
  await Promise.all(uniqueIds.map(async (accountId) => {
    const account = await Account.findById(accountId).select('initial_balance');
    if (!account) return;
    const [result] = await Transaction.aggregate([
      { $match: { account_id: new mongoose.Types.ObjectId(accountId), is_deleted: { $ne: true } } },
      { $group: { _id: '$account_id', income: { $sum: { $cond: [{ $eq: ['$type', 'income'] }, '$amount', 0] } }, expense: { $sum: { $cond: [{ $eq: ['$type', 'expense'] }, '$amount', 0] } } } },
    ]);
    const balance = Number((Number(account.initial_balance || 0) + (result?.income || 0) - (result?.expense || 0)).toFixed(2));
    await Account.findByIdAndUpdate(accountId, { $set: { current_balance: balance } });
  }));
};

const nextOccurrence = (date, interval) => {
  const next = new Date(date);
  if (interval === 'daily') next.setDate(next.getDate() + 1);
  else if (interval === 'weekly') next.setDate(next.getDate() + 7);
  else if (interval === 'monthly') next.setMonth(next.getMonth() + 1);
  else if (interval === 'yearly') next.setFullYear(next.getFullYear() + 1);
  else return null;
  return next;
};

const processRecurringForUser = async (userId) => {
  const now = new Date();
  const templates = await Transaction.find({
    user_id: userId,
    is_recurring: true,
    is_deleted: { $ne: true },
    recurrence_interval: { $ne: null }
  }).select('+recurrence_instance_key');

  let created = 0;
  const affectedAccountIds = new Set();
  for (const template of templates) {
    if (template.account_id) affectedAccountIds.add(String(template.account_id));
    let occurrence = nextOccurrence(template.date, template.recurrence_interval);
    let safety = 0;
    while (occurrence && occurrence <= now && safety < 240) {
      if (template.recurrence_ends_at && occurrence > template.recurrence_ends_at) break;
      const instanceKey = `${template._id.toString()}:${occurrence.toISOString().slice(0, 10)}`;
      const exists = await Transaction.exists({ user_id: userId, recurrence_instance_key: instanceKey });
      if (!exists) {
        await Transaction.create({
          user_id: userId,
          type: template.type,
          category: template.category,
          amount: template.amount,
          date: occurrence,
          note: template.note,
          currency: template.currency,
          payment_method: template.payment_method,
          location: template.location,
          tags: template.tags,
          merchant: template.merchant,
          account_id: template.account_id,
          receipt_url: template.receipt_url,
          is_one_time: true,
          parent_transaction_id: template._id,
          recurrence_instance_key: instanceKey,
          audit_logs: [{ action: 'Generated recurring transaction', timestamp: new Date() }]
        });
        created += 1;
      }
      occurrence = nextOccurrence(occurrence, template.recurrence_interval);
      safety += 1;
    }
  }
  if (created > 0) {
    await syncUserBalance(userId);
    await syncAccountBalances([...affectedAccountIds]);
  }
  return created;
};

// The preview endpoint deliberately receives parsed file text rather than
// persisting a bank statement. Only normalized transaction data is returned.
router.post('/statement/preview', async (req, res) => {
  try {
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    if (!content || Buffer.byteLength(content, 'utf8') > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Upload a CSV statement smaller than 5 MB.' });
    }

    const csvRows = parseCsv(content);
    if (csvRows.length < 2 || csvRows.length > IMPORT_LIMIT + 1) {
      return res.status(400).json({ error: `Statement must contain between 1 and ${IMPORT_LIMIT} transactions.` });
    }
    const headers = csvRows[0].map(headerKey);
    const columns = {
      date: findColumn(headers, ['date', 'transactiondate', 'txndate']),
      valueDate: findColumn(headers, ['valuedate', 'valuedt']),
      description: findColumn(headers, ['description', 'transactiondetails', 'details']),
      narration: findColumn(headers, ['narration']),
      particulars: findColumn(headers, ['particulars']),
      debit: findColumn(headers, ['debit', 'debitamount', 'withdrawal', 'withdrawalamt']),
      credit: findColumn(headers, ['credit', 'creditamount', 'deposit', 'depositamt']),
      amount: findColumn(headers, ['amount', 'transactionamount']),
      type: findColumn(headers, ['type', 'transactiontype', 'drcr']),
      reference: findColumn(headers, ['referenceno', 'reference', 'transactionid', 'utr', 'chqrefno']),
      ref: findColumn(headers, ['refno', 'ref']),
    };
    if ((columns.date < 0 && columns.valueDate < 0) || (columns.description < 0 && columns.narration < 0 && columns.particulars < 0)) {
      return res.status(400).json({ error: 'Could not find date and description columns. Export the statement as CSV from your bank.' });
    }

    const historical = await Transaction.find({ user_id: req.user.id, is_deleted: { $ne: true } })
      .select('merchant category note date type amount import_fingerprint')
      .sort({ date: -1 })
      .limit(5000)
      .lean();
    const merchantCategories = new Map();
    const existingFingerprints = new Set();
    const existingKeys = new Set();
    historical.forEach((transaction) => {
      const merchant = normalizeForMatch(transaction.merchant || transaction.note);
      if (merchant && transaction.category && transaction.category !== 'Other' && !merchantCategories.has(merchant)) {
        merchantCategories.set(merchant, transaction.category);
      }
      if (transaction.import_fingerprint) existingFingerprints.add(transaction.import_fingerprint);
      const day = new Date(transaction.date).toISOString().slice(0, 10);
      existingKeys.add([day, transaction.type, Number(transaction.amount).toFixed(2), merchant].join('|'));
    });

    const seen = new Set();
    const transactions = csvRows.slice(1).map((row, index) => {
      const transaction = classifyStatementRow(row, columns, merchantCategories);
      if (!transaction) return null;
      const fallbackKey = [transaction.date, transaction.type, transaction.amount.toFixed(2), normalizeForMatch(transaction.merchant)].join('|');
      const duplicate = seen.has(transaction.import_fingerprint) || existingFingerprints.has(transaction.import_fingerprint) || existingKeys.has(fallbackKey);
      seen.add(transaction.import_fingerprint);
      return { id: `row-${index + 1}`, ...transaction, duplicate };
    }).filter(Boolean);

    if (!transactions.length) return res.status(400).json({ error: 'No valid transactions were found in this statement.' });
    res.json({
      transactions,
      summary: {
        detected: transactions.length,
        duplicates: transactions.filter(transaction => transaction.duplicate).length,
        categorized: transactions.filter(transaction => transaction.category !== 'Other').length,
      }
    });
  } catch (error) {
    console.error('Statement preview failed:', error);
    res.status(500).json({ error: 'Could not analyze this statement.' });
  }
});

router.post('/statement/import', async (req, res) => {
  try {
    const requested = Array.isArray(req.body?.transactions) ? req.body.transactions : [];
    if (!requested.length || requested.length > IMPORT_LIMIT) {
      return res.status(400).json({ error: `Select between 1 and ${IMPORT_LIMIT} transactions to add.` });
    }

    const fingerprints = requested.map(item => String(item.import_fingerprint || '')).filter(Boolean);
    const existing = new Set((await Transaction.find({ user_id: req.user.id, import_fingerprint: { $in: fingerprints } })
      .select('import_fingerprint').lean()).map(transaction => transaction.import_fingerprint));
    const batchKeys = new Set();
    const accepted = [];
    let skipped = 0;

    for (const item of requested) {
      const validation = validateTransactionPayload(item);
      const merchant = cleanText(item.merchant).slice(0, 150) || null;
      const fingerprint = String(item.import_fingerprint || '').slice(0, 64);
      const key = [validation.parsedDate?.toISOString().slice(0, 10), item.type, validation.numericAmount?.toFixed(2), normalizeForMatch(merchant || item.note)].join('|');
      if (validation.error || !fingerprint || existing.has(fingerprint) || batchKeys.has(key)) { skipped += 1; continue; }
      batchKeys.add(key);
      accepted.push({
        user_id: req.user.id,
        type: item.type,
        category: cleanText(item.category).slice(0, 80),
        amount: validation.numericAmount,
        date: validation.parsedDate,
        note: cleanText(item.note).slice(0, 500) || null,
        merchant,
        payment_method: ['cash', 'card', 'upi', 'bank_transfer', 'wallet', 'cheque', 'other'].includes(item.payment_method) ? item.payment_method : 'bank_transfer',
        counterparty_bank: cleanText(item.counterparty_bank).slice(0, 200) || null,
        external_reference: cleanText(item.external_reference).slice(0, 150) || null,
        import_fingerprint: fingerprint,
        import_source: 'bank_statement',
        audit_logs: [{ action: 'Imported from bank statement', timestamp: new Date() }],
      });
    }
    if (!accepted.length) return res.json({ created: 0, skipped, message: 'All selected transactions were already imported or invalid.' });

    // Fingerprints catch re-imports exactly. This second check catches a
    // matching manual entry made before statement import, without a query per
    // transaction.
    const dates = accepted.map(transaction => transaction.date.getTime());
    const existingTransactions = await Transaction.find({
      user_id: req.user.id,
      is_deleted: { $ne: true },
      date: { $gte: new Date(Math.min(...dates) - 24 * 60 * 60 * 1000), $lte: new Date(Math.max(...dates) + 24 * 60 * 60 * 1000) }
    }).select('date type amount merchant note').lean();
    const existingKeys = new Set(existingTransactions.map(transaction => [
      new Date(transaction.date).toISOString().slice(0, 10), transaction.type,
      Number(transaction.amount).toFixed(2), normalizeForMatch(transaction.merchant || transaction.note)
    ].join('|')));
    const newTransactions = accepted.filter(transaction => {
      const key = [transaction.date.toISOString().slice(0, 10), transaction.type, transaction.amount.toFixed(2), normalizeForMatch(transaction.merchant || transaction.note)].join('|');
      if (existingKeys.has(key)) { skipped += 1; return false; }
      return true;
    });
    if (!newTransactions.length) return res.json({ created: 0, skipped, message: 'All selected transactions were already in your wallet.' });
    const created = await Transaction.insertMany(newTransactions, { ordered: false });
    const balance = await syncUserBalance(req.user.id);
    res.status(201).json({ created: created.length, skipped, balance, message: `${created.length} transaction(s) added to wallet.` });
  } catch (error) {
    console.error('Statement import failed:', error);
    res.status(500).json({ error: 'Could not import the selected transactions.' });
  }
});

router.get('/:userId', checkOwnership('userId'), async (req, res) => {
  try {
    await processRecurringForUser(req.params.userId);
    const limit = Math.min(2000, Math.max(1, Number.parseInt(req.query.limit, 10) || 2000));
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const skip = (page - 1) * limit;

    const transactions = await Transaction.find({ user_id: req.params.userId, is_deleted: { $ne: true } })
      .sort({ date: -1, _id: -1 })
      .skip(skip)
      .limit(limit);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/process-recurring', async (req, res) => {
  try {
    const created = await processRecurringForUser(req.user.id);
    res.json({ created, message: created ? `Generated ${created} recurring transaction(s).` : 'Recurring transactions are up to date.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process recurring transactions.' });
  }
});

router.post('/', async (req, res) => {
  const user_id = req.user.id;
  try {
    const validation = validateTransactionPayload(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    if (validation.account_id) {
      const account = await Account.exists({ _id: validation.account_id, user_id });
      if (!account) return res.status(400).json({ error: 'Selected account was not found.' });
    }
    
    const txData = {
      user_id, 
      type: req.body.type, 
      category: req.body.category.trim(), 
      amount: validation.numericAmount,
      date: validation.parsedDate, 
      note: req.body.note ? String(req.body.note).trim() : null,
      merchant: validation.merchant,
      tags: validation.tags,
      payment_method: validation.payment_method,
      account_id: validation.account_id || null,
      is_recurring: validation.is_recurring,
      recurrence_interval: validation.recurrence_interval,
      recurrence_ends_at: validation.recurrence_ends_at,
      is_split: validation.is_split,
      split_details: validation.split_details,
      audit_logs: [{ action: 'Created', timestamp: new Date() }]
    };

    const transaction = await Transaction.create(txData);
    const balance = await syncUserBalance(user_id);
    await syncAccountBalances([transaction.account_id]);
    res.status(201).json({ transaction, balance, message: 'Transaction added' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.put('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid transaction ID' });
  }
  try {
    const t = await Transaction.findOne({ _id: req.params.id, is_deleted: { $ne: true } });
    if (!t) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (t.user_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const next = { ...req.body };
    if (next.type === undefined) next.type = t.type;
    if (next.category === undefined) next.category = t.category;
    if (next.amount === undefined) next.amount = t.amount;
    if (next.date === undefined) next.date = t.date;
    if (next.account_id === undefined) next.account_id = t.account_id;

    const validation = validateTransactionPayload(next);
    if (validation.error) return res.status(400).json({ error: validation.error });
    if (validation.account_id) {
      const account = await Account.exists({ _id: validation.account_id, user_id: req.user.id });
      if (!account) return res.status(400).json({ error: 'Selected account was not found.' });
    }

    const previousAccountId = t.account_id;

    t.type = next.type;
    t.amount = validation.numericAmount;
    t.category = next.category.trim();
    t.note = next.note !== undefined ? (next.note ? String(next.note).trim() : null) : t.note;
    t.date = validation.parsedDate;
    t.account_id = validation.account_id || null;
    
    if (validation.merchant !== undefined) t.merchant = validation.merchant;
    if (validation.tags !== undefined) t.tags = validation.tags;
    if (validation.payment_method !== undefined) t.payment_method = validation.payment_method;
    if (validation.is_recurring !== undefined) t.is_recurring = validation.is_recurring;
    if (validation.recurrence_interval !== undefined) t.recurrence_interval = validation.recurrence_interval;
    if (validation.recurrence_ends_at !== undefined) t.recurrence_ends_at = validation.recurrence_ends_at;
    if (validation.is_split !== undefined) t.is_split = validation.is_split;
    if (validation.split_details !== undefined) t.split_details = validation.split_details;
    
    t.audit_logs.push({ action: 'Updated', timestamp: new Date() });
    await t.save();

    const balance = await syncUserBalance(t.user_id);
    await syncAccountBalances([previousAccountId, t.account_id]);
    res.json({ transaction: t, balance, message: 'Transaction updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid transaction ID' });
  }
  try {
    const t = await Transaction.findById(req.params.id);
    if (!t) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    if (t.user_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    t.is_deleted = true;
    await t.save();
    const balance = await syncUserBalance(t.user_id);
    await syncAccountBalances([t.account_id]);

    res.json({ balance, message: 'Transaction deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.post('/bulk-delete', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Array of transaction IDs is required' });
  }

  try {
    const validIds = ids.filter(id => mongoose.isValidObjectId(id));
    if (validIds.length === 0) {
      return res.status(400).json({ error: 'No valid transaction IDs provided' });
    }

    const affectedAccountIds = await Transaction.find({
      _id: { $in: validIds },
      user_id: req.user.id,
      is_deleted: { $ne: true },
    }).distinct('account_id');

    const result = await Transaction.updateMany(
      { _id: { $in: validIds }, user_id: req.user.id },
      { $set: { is_deleted: true } }
    );

    const balance = await syncUserBalance(req.user.id);
    await syncAccountBalances(affectedAccountIds);
    res.json({ balance, deletedCount: result.modifiedCount, message: `${result.modifiedCount} transactions deleted` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
