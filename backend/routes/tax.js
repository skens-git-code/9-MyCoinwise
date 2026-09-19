const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const TaxProfile = require('../models/TaxProfile');
const TaxRuleSet = require('../models/TaxRuleSet');
const TaxTag = require('../models/TaxTag');
const TaxPayment = require('../models/TaxPayment');
const TaxDocument = require('../models/TaxDocument');
const Transaction = require('../models/Transaction');
const WealthItem = require('../models/WealthItem');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { logger, auditLogger } = require('../utils/logger');
const {
  estimateAnnualTax,
  calculateCapitalGains,
  calculateSalesTaxSummary,
} = require('../services/taxEngine');

const router = express.Router();
const supportedJurisdictions = new Set(['IN', 'US']);
const deductibleTreatments = new Set(['deductible', 'business_expense', 'medical', 'charity', 'retirement', 'education']);

const userIdOf = (req) => String(req.user?.id || '');
const isEnabled = () => String(process.env.FEATURE_TAX_MODULE || '').toLowerCase() === 'true'
  || (process.env.FEATURE_TAX_MODULE == null && process.env.NODE_ENV !== 'production');

const userLimiter = (max, windowMs, message) => rateLimit({
  windowMs,
  max,
  keyGenerator: (req) => userIdOf(req) || 'anonymous',
  validate: { keyGeneratorIpFallback: false },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: message },
});

const estimateLimiter = userLimiter(60, 60 * 60 * 1000, 'Estimate rate limit reached. Please try again later.');
const gainsLimiter = userLimiter(30, 60 * 60 * 1000, 'Capital-gains estimate rate limit reached. Please try again later.');
const tagLimiter = userLimiter(200, 60 * 60 * 1000, 'Tax-tag rate limit reached. Please try again later.');
const reportLimiter = userLimiter(10, 60 * 60 * 1000, 'Tax report rate limit reached. Please try again later.');
const generalLimiter = userLimiter(120, 15 * 60 * 1000, 'Too many tax requests. Please try again later.');

const resultOrBadRequest = (req, res) => {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    res.status(400).json({ error: result.array()[0].msg, code: 'TAX_VALIDATION_ERROR', errors: result.array() });
    return false;
  }
  return true;
};

const idParam = param('id').isMongoId().withMessage('Invalid tax resource ID.');
const profileIdBody = body('profile_id').isMongoId().withMessage('A valid tax profile is required.');
const parseMoney = (value, { required = false, positive = false } = {}) => {
  if (value === undefined || value === null || value === '') return required ? null : undefined;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < (positive ? Number.EPSILON : 0)) return null;
  return Number(amount.toFixed(2));
};

const formatDateKey = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

const fiscalBounds = (profile) => {
  const year = Number(profile.fiscal_year);
  if (profile.jurisdiction === 'IN') {
    return { start: new Date(`${year}-04-01T00:00:00.000Z`), end: new Date(`${year + 1}-04-01T00:00:00.000Z`) };
  }
  return { start: new Date(`${year}-01-01T00:00:00.000Z`), end: new Date(`${year + 1}-01-01T00:00:00.000Z`) };
};

const audit = (req, action, profileId = null, extra = {}) => {
  auditLogger.info('Tax data access', {
    userId: userIdOf(req),
    profileId: profileId ? String(profileId) : null,
    action,
    ip: req.ip,
    timestamp: new Date().toISOString(),
    ...extra,
  });
};

const findOwnedProfile = async (req, id) => TaxProfile.findOne({ _id: id, user_id: userIdOf(req) });

const getRuleSet = async (profile) => TaxRuleSet.findOne({
  jurisdiction: profile.jurisdiction,
  fiscal_year: profile.fiscal_year,
  regime: profile.tax_regime,
}).lean();

const missingRules = (res, profile) => res.status(400).json({
  error: `Tax rules for ${profile.jurisdiction} ${profile.fiscal_year} are not yet available.`,
  code: 'TAX_RULES_MISSING',
});

const getFiscalTransactions = async (req, profile) => {
  const { start, end } = fiscalBounds(profile);
  return Transaction.find({
    user_id: userIdOf(req),
    is_deleted: { $ne: true },
    date: { $gte: start, $lt: end },
  }).sort({ date: 1 }).lean();
};

const getTaggedTransactions = async (req, profileId, start, end) => {
  const tagQuery = { user_id: userIdOf(req) };
  if (profileId) tagQuery.tax_profile_id = profileId;
  const tags = await TaxTag.find(tagQuery).lean();
  if (!tags.length) return [];
  const ids = tags.map((tag) => tag.transaction_id);
  const transactionQuery = { _id: { $in: ids }, user_id: userIdOf(req), is_deleted: { $ne: true } };
  if (start || end) transactionQuery.date = { ...(start ? { $gte: new Date(start) } : {}), ...(end ? { $lt: new Date(end) } : {}) };
  const transactions = await Transaction.find(transactionQuery).lean();
  const byId = new Map(transactions.map((tx) => [String(tx._id), tx]));
  return tags.map((tag) => ({ tag, transaction: byId.get(String(tag.transaction_id)) })).filter((item) => item.transaction);
};

const getCryptoKey = () => {
  const raw = String(process.env.TAX_FIELD_ENCRYPTION_KEY || '').trim();
  if (!raw) throw Object.assign(new Error('Tax document encryption is not configured.'), { status: 503, code: 'TAX_ENCRYPTION_NOT_CONFIGURED' });
  return crypto.createHash('sha256').update(raw).digest();
};

const encrypt = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getCryptoKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
};

const decrypt = (value) => {
  const [ivPart, tagPart, encryptedPart] = String(value || '').split('.');
  if (!ivPart || !tagPart || !encryptedPart) return '';
  const decipher = crypto.createDecipheriv('aes-256-gcm', getCryptoKey(), Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, 'base64url')), decipher.final()]).toString('utf8');
};

const serializeDocument = (doc) => {
  const plain = { ...doc };
  try { plain.file_url = decrypt(doc.file_url); } catch { plain.file_url = null; }
  return plain;
};

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  if (!isEnabled() && !req.path.startsWith('/admin/')) return res.status(404).json({ error: 'Tax module is not enabled.' });
  return next();
});
router.use(auth);
router.use(generalLimiter);

router.get('/profiles', async (req, res) => {
  // Ignore legacy/incomplete records so the UI never renders a profile with
  // undefined jurisdiction or fiscal year. They remain untouched for audit.
  const profiles = await TaxProfile.find({
    user_id: userIdOf(req),
    name: { $type: 'string', $ne: '' },
    jurisdiction: { $in: Array.from(supportedJurisdictions) },
    fiscal_year: { $gte: 2000 },
  }).sort({ fiscal_year: -1, created_at: -1 }).lean();
  audit(req, 'view');
  return res.json({ profiles });
});

router.post('/profiles', [
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('jurisdiction').isIn(Array.from(supportedJurisdictions)),
  body('fiscal_year').isInt({ min: 2000, max: 2100 }),
  body('filing_status').optional().isIn(['single', 'married_joint', 'married_separate', 'head_of_household']),
  body('tax_regime').optional().isIn(['new', 'old', 'federal']),
  body('currency').isLength({ min: 3, max: 3 }).isAlphanumeric(),
  body('tax_id_last4').optional({ checkFalsy: true, nullable: true }).matches(/^[A-Za-z0-9]{4}$/).withMessage('Only the last four tax-ID characters may be stored.'),
], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const duplicate = await TaxProfile.exists({ user_id: userIdOf(req), fiscal_year: Number(req.body.fiscal_year) });
  const profile = await TaxProfile.create({
    ...req.body,
    user_id: userIdOf(req),
    household_id: req.user.household_id || null,
    currency: String(req.body.currency).toUpperCase(),
    tax_id_last4: req.body.tax_id_last4 ? String(req.body.tax_id_last4).toUpperCase() : null,
    tax_regime: req.body.tax_regime || (req.body.jurisdiction === 'US' ? 'federal' : 'new'),
  });
  audit(req, 'create', profile._id);
  return res.status(201).json({ profile, warning: duplicate ? 'Another profile already exists for this fiscal year.' : null, message: 'Tax profile created.' });
});

router.get('/profiles/:id', [idParam], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const profile = await findOwnedProfile(req, req.params.id);
  if (!profile) return res.status(404).json({ error: 'Tax profile not found. Create one first.', code: 'TAX_PROFILE_NOT_FOUND' });
  audit(req, 'view', profile._id);
  return res.json({ profile });
});

router.put('/profiles/:id', [idParam], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const allowed = ['name', 'jurisdiction', 'fiscal_year', 'filing_status', 'tax_regime', 'dependents', 'residency_status', 'currency', 'pre_tax_contributions', 'itemized_deductions', 'tax_credits', 'capital_loss_carryforward', 'shared_with_household', 'tax_id_last4', 'notes', 'is_active'];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  if (updates.tax_id_last4 === '') updates.tax_id_last4 = null;
  if (updates.jurisdiction && !supportedJurisdictions.has(String(updates.jurisdiction))) return res.status(400).json({ error: 'Unsupported tax jurisdiction.' });
  if (updates.tax_id_last4 && !/^[A-Za-z0-9]{4}$/.test(String(updates.tax_id_last4))) return res.status(400).json({ error: 'Only the last four tax-ID characters may be stored.' });
  const profile = await TaxProfile.findOneAndUpdate(
    { _id: req.params.id, user_id: userIdOf(req), ...(req.body._version !== undefined ? { _version: Number(req.body._version) } : {}) },
    { $set: { ...updates, ...(updates.currency ? { currency: String(updates.currency).toUpperCase() } : {}) }, $inc: { _version: 1 } },
    { new: true, runValidators: true },
  );
  if (!profile) return res.status(409).json({ error: 'Profile changed in another tab. Refresh and try again.', code: 'TAX_PROFILE_CONFLICT' });
  audit(req, 'update', profile._id);
  return res.json({ profile, message: 'Tax profile updated.' });
});

router.delete('/profiles/:id', [idParam], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const profile = await findOwnedProfile(req, req.params.id);
  if (!profile) return res.status(404).json({ error: 'Tax profile not found. Create one first.', code: 'TAX_PROFILE_NOT_FOUND' });
  await Promise.all([
    TaxTag.deleteMany({ user_id: userIdOf(req), tax_profile_id: profile._id }),
    TaxPayment.deleteMany({ user_id: userIdOf(req), tax_profile_id: profile._id }),
    TaxDocument.deleteMany({ user_id: userIdOf(req), tax_profile_id: profile._id }),
    TaxProfile.deleteOne({ _id: profile._id }),
  ]);
  audit(req, 'delete', profile._id);
  return res.json({ message: 'Tax profile and associated tax records deleted.' });
});

const estimate = async (req, res) => {
  const profile = await findOwnedProfile(req, req.body.profile_id);
  if (!profile) return res.status(404).json({ error: 'Tax profile not found. Create one first.', code: 'TAX_PROFILE_NOT_FOUND' });
  const ruleSet = await getRuleSet(profile);
  if (!ruleSet) return missingRules(res, profile);
  const transactions = await getFiscalTransactions(req, profile);
  let incomeOverride;
  if (req.body.income_override !== undefined) {
    incomeOverride = parseMoney(req.body.income_override);
    if (incomeOverride === null) return res.status(400).json({ error: 'Income cannot be negative or malformed.', code: 'TAX_NEGATIVE_INCOME' });
  }
  const incomeTransactions = incomeOverride == null ? transactions : [{ type: 'income', amount: incomeOverride }];
  const tagged = await getTaggedTransactions(req, profile._id, fiscalBounds(profile).start, fiscalBounds(profile).end);
  const payments = await TaxPayment.find({ user_id: userIdOf(req), tax_profile_id: profile._id }).lean();
  const holdings = await WealthItem.find({ user_id: userIdOf(req), sold_at: { $ne: null } }).lean();
  const result = estimateAnnualTax({ profile: profile.toObject(), ruleSet, transactions: incomeTransactions, taggedTransactions: tagged, payments, holdings });
  if (!result) return res.status(400).json({ error: 'Tax data is incomplete. Verify the profile and rule set.' });
  audit(req, 'estimate', profile._id);
  return res.json({ estimate: result, profile, ruleSet: { jurisdiction: ruleSet.jurisdiction, fiscal_year: ruleSet.fiscal_year, regime: ruleSet.regime, currency: ruleSet.currency, brackets: ruleSet.brackets, standard_deduction: ruleSet.standard_deduction, advance_tax_dates: ruleSet.advance_tax_dates, advance_tax_schedule: ruleSet.advance_tax_schedule, metadata: ruleSet.metadata } });
};

router.post('/estimate', estimateLimiter, [profileIdBody], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  try { return await estimate(req, res); } catch (error) { logger.error('Tax estimate failed', error); return res.status(error.status || 500).json({ error: error.message || 'Tax estimate failed.' }); }
});

router.post('/estimate/compare', estimateLimiter, [profileIdBody], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const profile = await findOwnedProfile(req, req.body.profile_id);
  if (!profile) return res.status(404).json({ error: 'Tax profile not found. Create one first.', code: 'TAX_PROFILE_NOT_FOUND' });
  if (profile.jurisdiction !== 'IN') return res.status(400).json({ error: 'Regime comparison is currently available for India profiles only.' });
  const transactions = await getFiscalTransactions(req, profile);
  const tagged = await getTaggedTransactions(req, profile._id, fiscalBounds(profile).start, fiscalBounds(profile).end);
  const payments = await TaxPayment.find({ user_id: userIdOf(req), tax_profile_id: profile._id }).lean();
  const holdings = await WealthItem.find({ user_id: userIdOf(req), sold_at: { $ne: null } }).lean();
  const comparison = {};
  for (const regime of ['new', 'old']) {
    const ruleSet = await TaxRuleSet.findOne({ jurisdiction: 'IN', fiscal_year: profile.fiscal_year, regime }).lean();
    if (!ruleSet) return missingRules(res, { ...profile.toObject(), jurisdiction: 'IN' });
    comparison[regime] = estimateAnnualTax({ profile: { ...profile.toObject(), tax_regime: regime }, ruleSet, transactions, taggedTransactions: tagged, payments, holdings });
  }
  audit(req, 'regime_compare', profile._id);
  return res.json({ comparison });
});

router.post('/estimate/capital-gains', gainsLimiter, [profileIdBody], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const profile = await findOwnedProfile(req, req.body.profile_id);
  if (!profile) return res.status(404).json({ error: 'Tax profile not found. Create one first.', code: 'TAX_PROFILE_NOT_FOUND' });
  const ruleSet = await getRuleSet(profile);
  if (!ruleSet) return missingRules(res, profile);
  const holdings = await WealthItem.find({ user_id: userIdOf(req), sold_at: { $ne: null } }).lean();
  const result = calculateCapitalGains({ holdings, ruleSet });
  audit(req, 'capital_gains_estimate', profile._id);
  return res.json({ capital_gains: result });
});

router.post('/tag', tagLimiter, [
  body('transaction_id').isMongoId(),
  profileIdBody,
  body('treatment').isIn(['deductible', 'non_deductible', 'capital_gain', 'capital_loss', 'exempt', 'business_expense', 'medical', 'charity', 'retirement', 'education']),
  body('portion').optional().isFloat({ min: 0, max: 100 }),
], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const transaction = await Transaction.findOne({ _id: req.body.transaction_id, user_id: userIdOf(req), is_deleted: { $ne: true } }).lean();
  if (!transaction) return res.status(403).json({ error: 'You can only tag your own transactions.' });
  const profile = await findOwnedProfile(req, req.body.profile_id);
  if (!profile) return res.status(404).json({ error: 'Tax profile not found. Create one first.', code: 'TAX_PROFILE_NOT_FOUND' });
  const existing = await TaxTag.findOne({ transaction_id: transaction._id }).lean();
  if (existing && existing.treatment !== req.body.treatment && (deductibleTreatments.has(existing.treatment) || deductibleTreatments.has(req.body.treatment))) {
    return res.status(409).json({ error: `This transaction is already claimed under ${existing.treatment}. Remove the other tag first.`, code: 'TAX_DUPLICATE_DEDUCTION' });
  }
  const tag = await TaxTag.findOneAndUpdate(
    { transaction_id: transaction._id },
    { $set: { user_id: userIdOf(req), tax_profile_id: profile._id, treatment: req.body.treatment, portion: req.body.portion ?? 100, note: String(req.body.note || '').slice(0, 500) } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );
  audit(req, 'tag_create', profile._id, { transactionId: String(transaction._id) });
  return res.json({ tag, message: 'Transaction tagged for tax.' });
});

router.delete('/tag/:transaction_id', [param('transaction_id').isMongoId()], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  await TaxTag.deleteOne({ transaction_id: req.params.transaction_id, user_id: userIdOf(req) });
  audit(req, 'tag_delete');
  return res.json({ message: 'Tax tag removed.' });
});

router.get('/tagged-transactions', [query('profile_id').optional().isMongoId()], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const rows = await getTaggedTransactions(req, req.query.profile_id, req.query.start, req.query.end);
  const treatment = req.query.treatment ? String(req.query.treatment) : null;
  const filtered = treatment ? rows.filter((row) => row.tag.treatment === treatment) : rows;
  return res.json({ transactions: filtered, total: filtered.length });
});

router.get('/payments', [query('profile_id').optional().isMongoId()], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const filter = { user_id: userIdOf(req) };
  if (req.query.profile_id) filter.tax_profile_id = req.query.profile_id;
  const payments = await TaxPayment.find(filter).sort({ payment_date: -1 }).lean();
  return res.json({ payments });
});

router.post('/payments', [
  profileIdBody,
  body('amount').isFloat({ gt: 0 }),
  body('currency').isLength({ min: 3, max: 3 }).isAlphanumeric(),
  body('payment_date').isISO8601(),
  body('payment_type').isIn(['advance_tax', 'tds', 'quarterly', 'self_assessment', 'other']),
], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const profile = await findOwnedProfile(req, req.body.profile_id);
  if (!profile) return res.status(404).json({ error: 'Tax profile not found. Create one first.', code: 'TAX_PROFILE_NOT_FOUND' });
  const payment = await TaxPayment.create({ ...req.body, user_id: userIdOf(req), currency: String(req.body.currency).toUpperCase(), amount: Number(req.body.amount) });
  audit(req, 'payment_create', profile._id);
  return res.status(201).json({ payment, message: 'Tax payment recorded.' });
});

router.delete('/payments/:id', [idParam], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const deleted = await TaxPayment.findOneAndDelete({ _id: req.params.id, user_id: userIdOf(req) });
  if (!deleted) return res.status(404).json({ error: 'Tax payment not found.' });
  audit(req, 'payment_delete', deleted.tax_profile_id);
  return res.json({ message: 'Tax payment removed.' });
});

router.get('/documents', [query('profile_id').optional().isMongoId()], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const filter = { user_id: userIdOf(req) };
  if (req.query.profile_id) filter.tax_profile_id = req.query.profile_id;
  const documents = await TaxDocument.find(filter).sort({ issue_date: -1, created_at: -1 }).lean();
  audit(req, 'document_view');
  return res.json({ documents: documents.map(serializeDocument) });
});

router.post('/documents', [
  profileIdBody,
  body('document_type').isIn(['w2', '1099', 'form16', 't4', 't5', 'receipt', 'invoice', 'other']),
  body('label').trim().isLength({ min: 1, max: 200 }),
  body('file_url').isURL({ require_protocol: true }).isLength({ max: 4096 }),
  body('file_size').isInt({ min: 0, max: 10 * 1024 * 1024 }),
  body('mime_type').trim().isLength({ min: 1, max: 120 }),
], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const profile = await findOwnedProfile(req, req.body.profile_id);
  if (!profile) return res.status(404).json({ error: 'Tax profile not found. Create one first.', code: 'TAX_PROFILE_NOT_FOUND' });
  const document = await TaxDocument.create({ ...req.body, user_id: userIdOf(req), file_url: encrypt(req.body.file_url) });
  audit(req, 'document_create', profile._id);
  return res.status(201).json({ document: serializeDocument(document.toObject()), message: 'Tax document indexed.' });
});

router.delete('/documents/:id', [idParam], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const deleted = await TaxDocument.findOneAndDelete({ _id: req.params.id, user_id: userIdOf(req) });
  if (!deleted) return res.status(404).json({ error: 'Tax document not found.' });
  audit(req, 'document_delete', deleted.tax_profile_id);
  return res.json({ message: 'Tax document removed.' });
});

router.get('/report/:profile_id', reportLimiter, [param('profile_id').isMongoId(), query('format').optional().isIn(['json', 'csv', 'pdf'])], async (req, res) => {
  if (!resultOrBadRequest(req, res)) return;
  const profile = await findOwnedProfile(req, req.params.profile_id);
  if (!profile) return res.status(404).json({ error: 'Tax profile not found. Create one first.', code: 'TAX_PROFILE_NOT_FOUND' });
  const ruleSet = await getRuleSet(profile);
  if (!ruleSet) return missingRules(res, profile);
  const transactions = await getFiscalTransactions(req, profile);
  const tagged = await getTaggedTransactions(req, profile._id, fiscalBounds(profile).start, fiscalBounds(profile).end);
  const payments = await TaxPayment.find({ user_id: userIdOf(req), tax_profile_id: profile._id }).lean();
  const holdings = await WealthItem.find({ user_id: userIdOf(req), sold_at: { $ne: null } }).lean();
  const estimateResult = estimateAnnualTax({ profile: profile.toObject(), ruleSet, transactions, taggedTransactions: tagged, payments, holdings });
  const salesTax = calculateSalesTaxSummary({ transactions, defaultRate: ruleSet.sales_tax_default });
  const report = { generated_at: new Date().toISOString(), disclaimer: 'Estimate only; not tax advice.', profile, estimate: estimateResult, sales_tax: salesTax, transactions_count: transactions.length };
  const format = req.query.format || 'json';
  audit(req, 'export', profile._id, { format });
  if (format === 'pdf') return res.status(501).json({ error: 'PDF export is available through the browser print-to-PDF view.', code: 'TAX_PDF_CLIENT_EXPORT' });
  if (format === 'csv') {
    const escape = (value) => {
      const raw = String(value ?? '');
      const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = [
      ['Metric', 'Value'],
      ['Gross income', estimateResult?.grossIncome ?? ''],
      ['Taxable income', estimateResult?.taxableIncome ?? ''],
      ['Tax before credits', estimateResult?.taxBeforeCredits ?? ''],
      ['Credits applied', estimateResult?.creditsApplied ?? ''],
      ['Capital gains tax', estimateResult?.capitalGains?.total ?? ''],
      ['Total liability', estimateResult?.totalLiability ?? ''],
      ['Payments made', estimateResult?.paymentsMade ?? ''],
      ['Balance due', estimateResult?.balanceDue ?? ''],
      ['Refund expected', estimateResult?.refundExpected ?? ''],
      ['Disclaimer', report.disclaimer],
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mycoinwise-tax-${profile.fiscal_year}.csv"`);
    return res.send(`\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\n')}`);
  }
  return res.json({ report });
});

router.post('/admin/seed-rules', admin, async (req, res) => {
  const indiaRules = require('../services/taxRules/india-2024');
  const usRules = require('../services/taxRules/us-federal-2024');
  const rules = [...indiaRules, ...usRules];
  for (const rule of rules) await TaxRuleSet.updateOne({ rule_key: rule.rule_key }, { $set: rule }, { upsert: true, runValidators: true });
  audit(req, 'admin_seed');
  return res.json({ seeded: rules.length, message: 'Tax rules seeded idempotently.' });
});

module.exports = router;
