import React, { useState, useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { DollarSign, Percent, Award, ArrowRight } from 'lucide-react';
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

export default function InteractiveSimulator() {
  const prefersReduced = useReducedMotion();
  const [monthlyIncome, setMonthlyIncome] = useState(120000);
  const [savingsRate, setSavingsRate] = useState(30);
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
  
  // Estimated annual tax optimization via MyCoinwise regime comparison & deduction planning (~8% of annual income)
  const estimatedTaxSaved = Math.round(annualIncome * 0.08);

  const applyPreset = (preset) => {
    setMonthlyIncome(preset.income);
    setSavingsRate(preset.rate);
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
            {/* Quick Presets */}
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
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="control-group">
              <div className="control-header">
                <label htmlFor={incomeInputId} className="control-label">
                  <DollarSign aria-hidden="true" size={16} /> Monthly Inflow
                </label>
                <span className="control-value">{formatINR(monthlyIncome)}</span>
              </div>
              <input
                id={incomeInputId}
                type="range"
                min="25000"
                max="1000000"
                step="5000"
                value={monthlyIncome}
                onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                className="simulator-slider"
                aria-valuetext={formatINR(monthlyIncome)}
              />
              <div className="slider-hints">
                <span>₹25,000</span>
                <span>₹5,00,000</span>
                <span>₹10,00,000</span>
              </div>
            </div>

            <div className="control-group">
              <div className="control-header">
                <label htmlFor={savingsInputId} className="control-label">
                  <Percent aria-hidden="true" size={16} /> Target Savings Rate
                </label>
                <span className="control-value">{savingsRate}%</span>
              </div>
              <input
                id={savingsInputId}
                type="range"
                min="5"
                max="75"
                step="1"
                value={savingsRate}
                onChange={(e) => setSavingsRate(Number(e.target.value))}
                className="simulator-slider"
                aria-valuetext={`${savingsRate} percent`}
              />
              <div className="slider-hints">
                <span>5% (Conservative)</span>
                <span>35% (Optimal)</span>
                <span>75% (FIRE)</span>
              </div>
            </div>

            <div className="simulator-tip">
              <Award className="tip-icon" aria-hidden="true" size={18} />
              <p>
                <strong>The Coinwise Edge:</strong> Members who track budgets with our automated rollover save an average of <strong>18% more</strong> every single quarter.
              </p>
            </div>
          </motion.div>

          {/* Results Display */}
          <motion.div 
            className="simulator-results"
            initial={prefersReduced ? false : { opacity: 0, x: 20 }}
            whileInView={prefersReduced ? undefined : { opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.5 }}
          >
            <div className="result-metric primary">
              <span className="metric-label">5-Year Compound Wealth (at 10% CAGR)</span>
              <div className="metric-value">{formatINR(fiveYearCorpus)}</div>
              <span className="metric-sub">
                Investing {formatINR(monthlySavings)} monthly gives you ₹{Math.round(fiveYearCorpus - (monthlySavings * 60)).toLocaleString('en-IN')} in pure compound gains.
              </span>
            </div>

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
              <Link to="/register" className="btn btn-primary btn-block">
                <span>Lock In This Trajectory</span>
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
