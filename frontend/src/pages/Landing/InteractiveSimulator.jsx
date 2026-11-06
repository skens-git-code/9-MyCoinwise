import React, { useState, useId, useRef, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { DollarSign, Percent, Award, ArrowRight, TrendingUp, Sparkles, Shield, Compass, Share2, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

const formatINR = (val) => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(val);
};

const PRESETS = [
  { label: 'Starter', income: 50000, rate: 20 },
  { label: 'Balanced', income: 120000, rate: 30 },
  { label: 'Growth', income: 250000, rate: 40 },
  { label: 'FIRE', income: 500000, rate: 55 },
];

const parseUrlPlan = () => {
  if (typeof window === 'undefined' || !window.location.search) return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const planParam = params.get('plan');
    const incomeParam = params.get('income');
    const rateParam = params.get('rate');

    if (planParam && planParam.includes('-')) {
      const [inc, rt] = planParam.split('-');
      const incNum = Number(inc);
      const rtNum = Number(rt);
      return {
        income: !isNaN(incNum) && incNum >= 25000 && incNum <= 1000000 ? incNum : null,
        rate: !isNaN(rtNum) && rtNum >= 5 && rtNum <= 75 ? rtNum : null,
      };
    }
    const incNum = incomeParam ? Number(incomeParam) : null;
    const rtNum = rateParam ? Number(rateParam) : null;
    return {
      income: incNum && !isNaN(incNum) && incNum >= 25000 && incNum <= 1000000 ? incNum : null,
      rate: rtNum && !isNaN(rtNum) && rtNum >= 5 && rtNum <= 75 ? rtNum : null,
    };
  } catch {
    return null;
  }
};

export default function InteractiveSimulator() {
  const prefersReduced = useReducedMotion();
  const [monthlyIncome, setMonthlyIncome] = useState(() => {
    const plan = parseUrlPlan();
    return plan?.income ?? 120000;
  });
  const [savingsRate, setSavingsRate] = useState(() => {
    const plan = parseUrlPlan();
    return plan?.rate ?? 30;
  });
  const [copied, setCopied] = useState(false);
  const incomeInputId = useId();
  const savingsInputId = useId();

  // Derived metrics
  const monthlySavings = (monthlyIncome * savingsRate) / 100;
  const annualSavings = monthlySavings * 12;
  const annualIncome = monthlyIncome * 12;

  // Wealth accumulation assuming 10% annual compound return on invested monthly savings
  // Future value of a monthly annuity: FV = P * [ ((1 + r)^n - 1) / r ]
  const monthlyRate = 0.10 / 12;
  const months = 60;
  const fiveYearCorpus = monthlySavings * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
  const threeYearCorpus = monthlySavings * ((Math.pow(1 + monthlyRate, 36) - 1) / monthlyRate);

  // Pure compound growth gains (excluding principal contributed over 60 months)
  const totalPrincipalInvested = monthlySavings * 60;
  const pureCompoundGrowth = Math.max(0, Math.round(fiveYearCorpus - totalPrincipalInvested));

  // Estimated annual tax optimization via MyCoinwise regime comparison & deduction planning (~8% of annual income)
  const estimatedTaxSaved = Math.round(annualIncome * 0.08);

  // Slider track fill percentages for dynamic gradient styling
  const incomePct = Math.min(100, Math.max(0, ((monthlyIncome - 25000) / (1000000 - 25000)) * 100));
  const savingsPct = Math.min(100, Math.max(0, ((savingsRate - 5) / (75 - 5)) * 100));

  // Dynamic trajectory curve calculations based on savings rate
  const normalizedRate = (savingsRate - 5) / 70; // 0 to 1
  const endY = Math.round(44 - normalizedRate * 36); // 44 down to 8
  const mid1Y = Math.round(52 - normalizedRate * 8); // 52 down to 44
  const mid2Y = Math.round(48 - normalizedRate * 22); // 48 down to 26
  const trajectoryPath = `M 0,55 Q 100,${mid1Y} 180,${mid2Y} T 300,${endY}`;
  const trajectoryArea = `${trajectoryPath} L 300,60 L 0,60 Z`;

  const applyPreset = (preset) => {
    setMonthlyIncome(preset.income);
    setSavingsRate(preset.rate);
  };

  const copyTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleSharePlan = async () => {
    try {
      const url = `${window.location.origin}${window.location.pathname}?plan=${monthlyIncome}-${savingsRate}#simulator`;
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', url);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      }
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2400);
    }
  };

  return (
    <section id="simulator" className="landing-simulator">
      <div className="landing-container">
        <div className="section-header">
          <span className="section-pill">Interactive Wealth Engine</span>
          <h2>See Your Future Wealth Unfold</h2>
          <p>
            Adjust your monthly income and targeted savings rate to instantly preview the compounding trajectory enabled by MyCoinwise.
          </p>
        </div>

        <div className="simulator-grid">
          {/* Controls Column */}
          <motion.div
            className="simulator-controls"
            initial={prefersReduced ? false : { opacity: 0, x: -20 }}
            whileInView={prefersReduced ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.5 }}
          >
            {/* Quick Presets Bar */}
            <div className="simulator-presets-bar">
              <span className="presets-label">Quick Scenarios:</span>
              <div className="presets-chips">
                {PRESETS.map((preset) => {
                  const isActive = monthlyIncome === preset.income && savingsRate === preset.rate;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      className={`preset-chip ${isActive ? 'active' : ''}`}
                      onClick={() => applyPreset(preset)}
                      aria-pressed={isActive}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Inflow Slider Group */}
            <div className="control-group">
              <div className="control-header">
                <label htmlFor={incomeInputId} className="control-label">
                  <DollarSign aria-hidden="true" size={16} />
                  <span>Monthly Inflow</span>
                </label>
                <span className="control-value">{formatINR(monthlyIncome)}</span>
              </div>
              <div className="slider-track-container">
                <input
                  id={incomeInputId}
                  type="range"
                  min="25000"
                  max="1000000"
                  step="5000"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                  className="simulator-slider"
                  style={{
                    background: `linear-gradient(to right, #10b981 0%, #10b981 ${incomePct}%, rgba(255, 255, 255, 0.12) ${incomePct}%, rgba(255, 255, 255, 0.12) 100%)`
                  }}
                  aria-valuetext={formatINR(monthlyIncome)}
                />
              </div>
              <div className="slider-hints">
                <span>₹25,000</span>
                <span>₹5,00,000</span>
                <span>₹10,00,000</span>
              </div>
            </div>

            {/* Savings Rate Slider Group */}
            <div className="control-group">
              <div className="control-header">
                <label htmlFor={savingsInputId} className="control-label">
                  <Percent aria-hidden="true" size={16} />
                  <span>Target Savings Rate</span>
                </label>
                <span className="control-value">{savingsRate}%</span>
              </div>
              <div className="slider-track-container">
                <input
                  id={savingsInputId}
                  type="range"
                  min="5"
                  max="75"
                  step="1"
                  value={savingsRate}
                  onChange={(e) => setSavingsRate(Number(e.target.value))}
                  className="simulator-slider"
                  style={{
                    background: `linear-gradient(to right, #10b981 0%, #10b981 ${savingsPct}%, rgba(255, 255, 255, 0.12) ${savingsPct}%, rgba(255, 255, 255, 0.12) 100%)`
                  }}
                  aria-valuetext={`${savingsRate} percent`}
                />
              </div>
              <div className="slider-hints">
                <span>5% (Conservative)</span>
                <span>35% (Optimal)</span>
                <span>75% (FIRE)</span>
              </div>
            </div>

            {/* Dynamic Monthly Allocation Breakdown */}
            <div className="simulator-monthly-breakdown">
              <div className="allocation-pill">
                <span className="pill-dot emerald" />
                <span>Monthly Invested: <strong>{formatINR(monthlySavings)}</strong></span>
              </div>
              <div className="allocation-pill">
                <span className="pill-dot slate" />
                <span>Discretionary & Living: <strong>{formatINR(monthlyIncome - monthlySavings)}</strong></span>
              </div>
            </div>

            {/* The Coinwise Edge Tip */}
            <div className="simulator-tip">
              <Award className="tip-icon" aria-hidden="true" size={20} />
              <p>
                <strong>The Coinwise Edge:</strong> Members who track budgets with our automated rollover save an average of <strong>18% more</strong> every single quarter.
              </p>
            </div>
          </motion.div>

          {/* Results Display Column */}
          <motion.div
            className="simulator-results"
            initial={prefersReduced ? false : { opacity: 0, x: 20 }}
            whileInView={prefersReduced ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.5 }}
          >
            {/* Primary 5-Year Compound Metric */}
            <div className="result-metric primary">
              <div className="metric-header-row">
                <span className="metric-label">5-Year Compound Wealth (at 10% CAGR)</span>
                <span className="metric-badge-chip">Compounding</span>
              </div>
              <div className="metric-value">{formatINR(fiveYearCorpus)}</div>
              <span className="metric-sub">
                Investing {formatINR(monthlySavings)} monthly gives you ₹{pureCompoundGrowth.toLocaleString('en-IN')} in pure compound gains.
              </span>
            </div>

            {/* Dynamic Curve Mini-Visualizer */}
            <div className="simulator-trajectory-chart" aria-hidden="true">
              <svg viewBox="0 0 300 60" preserveAspectRatio="none" className="trajectory-svg">
                <defs>
                  <linearGradient id="simGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                <path
                  d={trajectoryArea}
                  fill="url(#simGrad)"
                />
                <path
                  d={trajectoryPath}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle cx="0" cy="55" r="3.5" fill="#10b981" />
                <circle cx="100" cy={mid1Y} r="3.5" fill="#10b981" />
                <circle cx="180" cy={mid2Y} r="4" fill="#38bdf8" />
                <circle cx="300" cy={endY} r="5" fill="#10b981" />
              </svg>
            </div>

            {/* Direct Savings & Tax Savings Subgrid */}
            <div className="results-subgrid">
              <div className="result-metric">
                <span className="metric-label">1-Year Direct Savings</span>
                <div className="metric-value small">{formatINR(annualSavings)}</div>
                <span className="metric-sub">Accumulated in cash/liquid reserves</span>
              </div>

              <div className="result-metric">
                <span className="metric-label">Est. Annual Tax Optimization</span>
                <div className="metric-value small accent">{formatINR(estimatedTaxSaved)}</div>
                <span className="metric-sub">Via optimal regime & 80C/80D planning</span>
              </div>
            </div>

            {/* Visual Milestones Trajectory */}
            <div className="simulator-milestones">
              <div className="milestone-item">
                <span className="milestone-time">Year 1</span>
                <strong className="milestone-val">{formatINR(annualSavings)}</strong>
                <span className="milestone-desc">Emergency Fund</span>
              </div>
              <div className="milestone-item">
                <span className="milestone-time">Year 3</span>
                <strong className="milestone-val">{formatINR(threeYearCorpus)}</strong>
                <span className="milestone-desc">Growth Phase</span>
              </div>
              <div className="milestone-item highlight">
                <span className="milestone-time">Year 5</span>
                <strong className="milestone-val">{formatINR(fiveYearCorpus)}</strong>
                <span className="milestone-desc">Wealth Acceleration</span>
              </div>
            </div>

            <div className="simulator-cta">
              <Link
                to={`/register?income=${monthlyIncome}&rate=${savingsRate}`}
                className="btn-landing-primary btn-block btn-lg"
              >
                <span>Lock In This Trajectory</span>
                <ArrowRight aria-hidden="true" size={17} />
              </Link>
              <button
                type="button"
                onClick={handleSharePlan}
                className="btn-landing-glass btn-block btn-share-plan"
                aria-label="Share or copy this custom wealth plan link"
              >
                {copied ? <Check size={16} className="text-emerald" aria-hidden="true" /> : <Share2 size={16} aria-hidden="true" />}
                <span>{copied ? 'Plan Link Copied to Clipboard!' : 'Share / Save This Plan'}</span>
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
