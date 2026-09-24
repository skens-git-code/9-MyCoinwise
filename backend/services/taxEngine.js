/* —————————————————————————————————————
 * Tax Engine
 * Pure tax calculations. This module deliberately has no database or
 * HTTP dependencies so every number can be tested independently of
 * Express.
 *
 * Exports:
 *   calculateIncomeTax       – Progressive bracket tax with deductions,
 *                              credits, rebate, surcharge, and cess.
 *   calculateCapitalGains    – Short/long-term capital gains tax.
 *   calculateSalesTaxSummary – Sales tax totals grouped by category.
 *   calculateDeductions      – Sums tagged + profile deductions.
 *   calculateCredits         – Summarizes profile tax credits.
 *   estimateAnnualTax        – Top-level orchestrator combining all
 *                              of the above into a single estimate.
 *   roundMoney               – Two-decimal rounding helper.
 * ————————————————————————————————————— */

/* —————————————————————————————————————
 * Numeric Helpers
 * ————————————————————————————————————— */

// ── Coerce a value to a finite number, falling back when invalid ──
const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

// ── Round a money value to two decimals ──
const roundMoney = (value) => Number(finite(value).toFixed(2));

// ── Sum a list of line items, applying a frequency multiplier ──
// Annual (default) × 1, quarterly × 4, monthly × 12. Negative amounts
// are clamped to zero.
const lineTotal = (lines = []) => (Array.isArray(lines) ? lines : []).reduce((sum, line) => {
  const amount = finite(line?.amount);
  const frequency = line?.frequency || 'annual';
  const multiplier = frequency === 'monthly' ? 12 : frequency === 'quarterly' ? 4 : 1;
  return sum + Math.max(0, amount) * multiplier;
}, 0);

/* —————————————————————————————————————
 * Input Validation
 * Ensures the rule set and profile agree on jurisdiction and fiscal
 * year, and that gross income is a non-negative finite number.
 * Returns the parsed gross, or null when validation fails.
 * ————————————————————————————————————— */
const validateInputs = ({ grossIncome, ruleSet, profile }) => {
  const gross = Number(grossIncome);
  if (!Number.isFinite(gross) || gross < 0) return null;
  if (!ruleSet || !profile) return null;
  if (String(ruleSet.jurisdiction) !== String(profile.jurisdiction)) return null;
  if (Number(ruleSet.fiscal_year) !== Number(profile.fiscal_year)) return null;
  return gross;
};

/* —————————————————————————————————————
 * Income Tax
 * Applies progressive brackets, then credits, rebate, surcharge, and
 * cess. Returns a detailed breakdown or null on invalid inputs.
 * ————————————————————————————————————— */
const calculateIncomeTax = ({ grossIncome, ruleSet, profile }) => {
  // ── Validate inputs ──
  const gross = validateInputs({ grossIncome, ruleSet, profile });
  if (gross === null) return null;

  // ── Compute deductions and taxable income ──
  const preTax = lineTotal(profile.pre_tax_contributions);
  const standardDeduction = Math.max(0, finite(ruleSet.standard_deduction));
  const itemized = lineTotal(profile.itemized_deductions);
  const taxableIncome = Math.max(0, gross - preTax - standardDeduction - itemized);

  // ── Sort brackets from lowest to highest `min` ──
  const brackets = (Array.isArray(ruleSet.brackets) ? ruleSet.brackets : [])
    .slice()
    .sort((a, b) => finite(a.min) - finite(b.min));

  // ── Walk the brackets and accumulate tax ──
  let subtotal = 0;
  const bracketBreakdown = brackets.map((bracket) => {
    const min = Math.max(0, finite(bracket.min));
    const max = bracket.max == null ? Infinity : Math.max(min, finite(bracket.max));
    const taxableAtBracket = Math.max(0, Math.min(taxableIncome, max) - min);
    const tax = taxableAtBracket * Math.max(0, finite(bracket.rate));
    subtotal += tax;
    return {
      min,
      max: Number.isFinite(max) ? max : null,
      rate: finite(bracket.rate),
      taxable: roundMoney(taxableAtBracket),
      tax: roundMoney(tax),
      type: bracket.type || 'ordinary',
    };
  }).filter((bracket) => bracket.taxable > 0 || bracket.min === 0);

  // ── Apply credits and rebate ──
  const userCredits = lineTotal(profile.tax_credits);
  const rebate = ruleSet.rebate && taxableIncome <= finite(ruleSet.rebate.maxTaxableIncome, -1)
    ? Math.min(subtotal, Math.max(0, finite(ruleSet.rebate.maxCredit)))
    : 0;
  const creditsApplied = Math.min(subtotal, userCredits + rebate);
  const taxAfterCredits = Math.max(0, subtotal - creditsApplied);

  // ── Apply surcharge from the highest matching threshold ──
  const thresholds = Array.isArray(ruleSet.surcharge_thresholds) ? ruleSet.surcharge_thresholds : [];
  const threshold = thresholds
    .filter((item) => taxableIncome >= finite(item.min))
    .sort((a, b) => finite(b.min) - finite(a.min))[0];
  const surcharge = taxAfterCredits * (threshold ? Math.max(0, finite(threshold.rate)) : 0);

  // ── Apply cess on tax + surcharge ──
  const cess = (taxAfterCredits + surcharge) * Math.max(0, finite(ruleSet.cess_rate));
  const total = taxAfterCredits + surcharge + cess;

  // ── Identify the marginal bracket ──
  const marginalBracket = bracketBreakdown.slice().reverse().find((bracket) => taxableIncome > bracket.min) || bracketBreakdown[0];

  // ── Return the detailed breakdown ──
  return {
    grossIncome: roundMoney(gross),
    preTaxContributions: roundMoney(preTax),
    standardDeductionApplied: roundMoney(Math.min(standardDeduction, gross)),
    itemizedDeductionsApplied: roundMoney(Math.min(itemized, Math.max(0, gross - preTax - standardDeduction))),
    taxableIncome: roundMoney(taxableIncome),
    brackets: bracketBreakdown,
    subtotal: roundMoney(subtotal),
    taxBeforeCredits: roundMoney(subtotal),
    creditsApplied: roundMoney(creditsApplied),
    rebateApplied: roundMoney(rebate),
    taxAfterCredits: roundMoney(taxAfterCredits),
    surcharge: roundMoney(surcharge),
    cess: roundMoney(cess),
    total: roundMoney(total),
    effectiveRate: gross > 0 ? roundMoney((total / gross) * 100) : 0,
    marginalRate: marginalBracket ? roundMoney(marginalBracket.rate * 100) : 0,
  };
};

/* —————————————————————————————————————
 * Capital Gains
 * Classifies each sold holding as short- or long-term based on the
 * rule set's holding period, then computes tax at the applicable
 * rate. Only positive gains are taxed (losses do not reduce the
 * total in this simplified model).
 * ————————————————————————————————————— */
const calculateCapitalGains = ({ holdings, ruleSet }) => {
  // ── Validate inputs ──
  if (!ruleSet || !Array.isArray(holdings)) return null;

  // ── Read rates and holding period from the rule set ──
  const holdingPeriod = Math.max(0, finite(ruleSet.capital_gains?.holding_period_days, 365));
  const shortRate = Math.max(0, finite(ruleSet.capital_gains?.short_term_rate));
  const longRate = Math.max(0, finite(ruleSet.capital_gains?.long_term_rate));

  let shortTermGain = 0;
  let longTermGain = 0;

  // ── Normalize each holding ──
  const normalized = holdings.map((holding) => {
    const costBasis = Math.max(0, finite(holding.base_value));
    const salePrice = Math.max(0, finite(holding.sale_price));
    const fees = Math.max(0, finite(holding.sale_fees));
    const acquisition = new Date(holding.acquisition_date || holding.created_at);
    const soldAt = new Date(holding.sold_at);
    const holdingDays = Number.isNaN(acquisition.getTime()) || Number.isNaN(soldAt.getTime())
      ? 0
      : Math.max(0, Math.floor((soldAt - acquisition) / 86400000));
    const gain = salePrice - fees - costBasis;
    const classification = holdingDays >= holdingPeriod ? 'long_term' : 'short_term';
    const taxRate = classification === 'long_term' ? longRate : shortRate;

    // ── Accumulate into the correct bucket ──
    if (classification === 'long_term') longTermGain += gain;
    else shortTermGain += gain;

    return {
      id: String(holding._id || holding.id || ''),
      name: holding.name || 'Asset',
      costBasis: roundMoney(costBasis),
      salePrice: roundMoney(salePrice),
      saleFees: roundMoney(fees),
      gain: roundMoney(gain),
      tax: roundMoney(Math.max(0, gain) * taxRate),
      holdingDays,
      classification,
    };
  });

  // ── Tax only positive gains in each bucket ──
  const shortTermTax = Math.max(0, shortTermGain) * shortRate;
  const longTermTax = Math.max(0, longTermGain) * longRate;

  return {
    shortTermGain: roundMoney(shortTermGain),
    longTermGain: roundMoney(longTermGain),
    shortTermTax: roundMoney(shortTermTax),
    longTermTax: roundMoney(longTermTax),
    total: roundMoney(shortTermTax + longTermTax),
    totalCapitalGainsTax: roundMoney(shortTermTax + longTermTax),
    holdings: normalized,
  };
};

/* —————————————————————————————————————
 * Sales Tax Summary
 * Computes sales tax per category: uses explicit tax when the
 * transaction provides `tax_amount` / `sales_tax`, otherwise applies
 * the rule set's default rate to the transaction amount.
 * ————————————————————————————————————— */
const calculateSalesTaxSummary = ({ transactions, defaultRate = 0 }) => {
  const byCategory = new Map();
  let totalTaxPaid = 0;

  for (const transaction of Array.isArray(transactions) ? transactions : []) {
    const amount = Math.max(0, finite(transaction?.amount));
    const explicitTax = transaction?.tax_amount ?? transaction?.sales_tax;
    const tax = explicitTax == null
      ? amount * Math.max(0, finite(defaultRate))
      : Math.max(0, finite(explicitTax));
    const category = transaction?.category || 'Other';
    const current = byCategory.get(category) || 0;
    byCategory.set(category, current + tax);
    totalTaxPaid += tax;
  }

  return {
    totalTaxPaid: roundMoney(totalTaxPaid),
    byCategory: Array.from(byCategory, ([category, tax]) => ({ category, tax: roundMoney(tax) })),
  };
};

/* —————————————————————————————————————
 * Deductions
 * Sums tax-tagged deductions (respecting the per-tag portion) and
 * combines them with the profile's own itemized deductions.
 * ————————————————————————————————————— */
const calculateDeductions = ({ taggedTransactions, profile }) => {
  // ── Only treatments in this set count as deductible ──
  const allowed = new Set(['deductible', 'business_expense', 'medical', 'charity', 'retirement', 'education']);

  const byCategory = new Map();
  const items = [];

  for (const item of Array.isArray(taggedTransactions) ? taggedTransactions : []) {
    if (!allowed.has(item?.tag?.treatment)) continue;

    const amount = Math.max(0, finite(item.transaction?.amount));
    const portion = Math.min(100, Math.max(0, finite(item.tag?.portion, 100))) / 100;
    const deductible = amount * portion;
    const category = item.tag.treatment;

    byCategory.set(category, (byCategory.get(category) || 0) + deductible);
    items.push({
      transactionId: String(item.transaction?._id || item.transaction?.id || ''),
      category,
      amount: roundMoney(deductible),
    });
  }

  // ── Include profile-level itemized deductions ──
  const profileDeductions = lineTotal(profile?.itemized_deductions);

  return {
    total: roundMoney(Array.from(byCategory.values()).reduce((a, b) => a + b, 0) + profileDeductions),
    byCategory: Array.from(byCategory, ([category, amount]) => ({ category, amount: roundMoney(amount) })),
    items,
  };
};

/* —————————————————————————————————————
 * Credits
 * Summarizes the profile's tax credits. `unapplied` is currently
 * always empty — the actual capping of credits happens inside
 * calculateIncomeTax.
 * ————————————————————————————————————— */
const calculateCredits = ({ profile, grossIncome, ruleSet }) => {
  if (!profile || !ruleSet || !Number.isFinite(Number(grossIncome))) return null;
  const credits = Array.isArray(profile.tax_credits)
    ? profile.tax_credits.map((credit) => ({
        label: credit.label,
        amount: Math.max(0, finite(credit.amount)),
      }))
    : [];

  return {
    total: roundMoney(credits.reduce((sum, credit) => sum + credit.amount, 0)),
    applied: credits,
    unapplied: [],
  };
};

/* —————————————————————————————————————
 * Annual Tax Estimate (Orchestrator)
 * Combines income tax, capital gains, deductions, and payments into
 * a single estimate with balance due / refund.
 * ————————————————————————————————————— */
const estimateAnnualTax = ({ profile, ruleSet, transactions, payments = [], taggedTransactions = [], holdings = [] }) => {
  if (!profile || !ruleSet) return null;

  // ── Sum income transactions ──
  const income = (Array.isArray(transactions) ? transactions : [])
    .filter((transaction) => String(transaction?.type).toLowerCase() === 'income')
    .reduce((sum, transaction) => sum + Math.max(0, finite(transaction.amount)), 0);

  // ── Compute tagged deductions and fold them into the profile ──
  const deductions = calculateDeductions({ taggedTransactions, profile });
  const taggedDeductionTotal = deductions.items.reduce((sum, item) => sum + finite(item.amount), 0);
  const profileForCalculation = {
    ...profile,
    itemized_deductions: [
      ...(Array.isArray(profile.itemized_deductions) ? profile.itemized_deductions : []),
      { label: 'Tagged tax deductions', amount: taggedDeductionTotal, frequency: 'annual' },
    ],
  };

  // ── Income tax via the enriched profile ──
  const incomeTax = calculateIncomeTax({ grossIncome: income, ruleSet, profile: profileForCalculation });
  if (!incomeTax) return null;

  // ── Capital gains (falls back to zero when not applicable) ──
  const capitalGains = calculateCapitalGains({ holdings, ruleSet }) || { total: 0, holdings: [] };

  // ── Payments already made ──
  const paid = (Array.isArray(payments) ? payments : [])
    .reduce((sum, payment) => sum + Math.max(0, finite(payment.amount)), 0);

  // ── Final liability and settlement ──
  const totalLiability = incomeTax.total + capitalGains.total;

  return {
    ...incomeTax,
    capitalGains,
    deductions,
    paymentsMade: roundMoney(paid),
    totalLiability: roundMoney(totalLiability),
    balanceDue: roundMoney(Math.max(0, totalLiability - paid)),
    refundExpected: roundMoney(Math.max(0, paid - totalLiability)),
    hasTaxableActivity: income > 0 || capitalGains.holdings.length > 0,
  };
};

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */
module.exports = {
  calculateIncomeTax,
  calculateCapitalGains,
  calculateSalesTaxSummary,
  calculateDeductions,
  calculateCredits,
  estimateAnnualTax,
  roundMoney,
};