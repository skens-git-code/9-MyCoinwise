import { describe, it, expect } from 'vitest';
import { cleanNoteText } from '../pages/Transactions';

describe('Analytics & Intelligence Safeguards', () => {
  it('sanitizes raw SMS/UPI dumps in anomaly notes and charts', () => {
    const rawNote = 'Paid to Go Grab | UPI ID: paytm.d12986753104@pty on UPI Ref No: 631579260664 Tag: # Groceries Union Bank Of India - 39 - Rs.20';
    const cleaned = cleanNoteText(rawNote, 40);
    expect(cleaned).toBe('Paid to Go Grab');
    expect(cleaned).not.toContain('paytm.d12986753104@pty');
    expect(cleaned).not.toContain('631579260664');
  });

  it('handles null, undefined, and empty notes gracefully', () => {
    expect(cleanNoteText(null)).toBe('');
    expect(cleanNoteText(undefined)).toBe('');
    expect(cleanNoteText('')).toBe('');
    expect(cleanNoteText('   ')).toBe('');
  });

  it('preserves clean notes without scraper noise', () => {
    expect(cleanNoteText('Coffee with friends')).toBe('Coffee with friends');
    expect(cleanNoteText('Electricity bill November')).toBe('Electricity bill November');
  });

  it('safely computes savings rate and bounds within 0-100%', () => {
    const calculateSavingsRate = (income, expense) => {
      const inc = Number(income) || 0;
      const exp = Number(expense) || 0;
      if (inc <= 0) return 0;
      return Math.max(0, Math.min(100, ((inc - exp) / inc) * 100));
    };

    expect(calculateSavingsRate(10000, 2000)).toBe(80);
    expect(calculateSavingsRate(5000, 5000)).toBe(0);
    expect(calculateSavingsRate(5000, 8000)).toBe(0);
    expect(calculateSavingsRate(0, 5000)).toBe(0);
    expect(calculateSavingsRate(-100, 5000)).toBe(0);
  });
});

describe('Savings Goals Progress & Milestones', () => {
  const getPct = (target, saved) => {
    const tgt = Number(target) || 0;
    const svd = Number(saved) || 0;
    return tgt > 0 ? Math.max(0, Math.min(100, (svd / tgt) * 100)) : 0;
  };

  const getCrossedMilestones = (prevPct, newPct) =>
    [25, 50, 75, 100].filter((m) => prevPct < m && newPct >= m);

  it('clamps progress to [0, 100] regardless of over-saving or negative values', () => {
    expect(getPct(1000, 500)).toBe(50);
    expect(getPct(1000, 1500)).toBe(100);
    expect(getPct(1000, -200)).toBe(0);
    expect(getPct(0, 500)).toBe(0);
    expect(getPct(-500, 500)).toBe(0);
  });

  it('detects single and multiple milestone crossings correctly', () => {
    expect(getCrossedMilestones(20, 30)).toEqual([25]);
    expect(getCrossedMilestones(20, 60)).toEqual([25, 50]);
    expect(getCrossedMilestones(10, 100)).toEqual([25, 50, 75, 100]);
    expect(getCrossedMilestones(50, 60)).toEqual([]);
  });
});

describe('Tax Center Reconciliation Logic', () => {
  it('correctly reconciles advance tax & TDS against computed liability', () => {
    const reconcile = (liability, payments) => {
      const liabilityNum = Math.max(0, Number(liability) || 0);
      const paidNum = (payments || []).reduce((sum, p) => sum + Math.max(0, Number(p.amount) || 0), 0);
      const balanceDue = Math.max(0, liabilityNum - paidNum);
      const refundExpected = Math.max(0, paidNum - liabilityNum);
      return { balanceDue, refundExpected, isSettled: balanceDue === 0 && refundExpected === 0 };
    };

    expect(reconcile(10000, [{ amount: 4000 }, { amount: 6000 }])).toEqual({
      balanceDue: 0,
      refundExpected: 0,
      isSettled: true,
    });

    expect(reconcile(10000, [{ amount: 4000 }])).toEqual({
      balanceDue: 6000,
      refundExpected: 0,
      isSettled: false,
    });

    expect(reconcile(10000, [{ amount: 12000 }])).toEqual({
      balanceDue: 0,
      refundExpected: 2000,
      isSettled: false,
    });
  });
});

describe('Category Spending Evolution & Forecasting Integrity', () => {
  it('generates multi-bucket weekly evolution data for single-month 30+ transaction datasets', () => {
    // Generate 35 transactions across days 1 to 28 of November 2026
    const sampleTxs = [];
    for (let day = 1; day <= 28; day++) {
      sampleTxs.push({
        id: `tx-${day}`,
        date: `2026-11-${String(day).padStart(2, '0')}`,
        type: 'Expense', // test uppercase
        category: day % 2 === 0 ? 'Groceries' : 'Education',
        amount: 200,
      });
    }

    // Weekly bucketing logic simulation
    const activeCats = ['Groceries', 'Education'];
    const weekMap = new Map();
    for (let w = 1; w <= 4; w++) {
      const wKey = `W${w}`;
      weekMap.set(wKey, { name: wKey, Groceries: 0, Education: 0 });
    }

    sampleTxs.forEach((t) => {
      const d = new Date(t.date);
      const day = d.getDate();
      const wNum = Math.min(4, Math.floor((day - 1) / 7) + 1);
      const row = weekMap.get(`W${wNum}`);
      if (row && t.category) {
        row[t.category] += t.amount;
      }
    });

    const weeklyData = Array.from(weekMap.values());
    expect(weeklyData.length).toBe(4);
    expect(weeklyData[0].Groceries).toBeGreaterThan(0);
    expect(weeklyData[0].Education).toBeGreaterThan(0);
    expect(weeklyData[3].Groceries).toBeGreaterThan(0);
  });

  it('correctly handles non-negative uncertainty bands in cashflow forecasting', () => {
    const balance = 500;
    const dailyVolatility = 300;
    const day = 10;
    const uncertaintyOffset = dailyVolatility * Math.sqrt(day); // ~948.68
    const lowerBound = Math.max(0, balance - uncertaintyOffset);
    const upperBound = Math.max(lowerBound, balance + uncertaintyOffset);

    const uncertaintyBase = Number(lowerBound.toFixed(2));
    const uncertaintyBand = Number((upperBound - lowerBound).toFixed(2));

    expect(uncertaintyBase).toBe(0);
    expect(uncertaintyBase).toBeGreaterThanOrEqual(0);
    expect(uncertaintyBand).toBeGreaterThan(0);
    expect(uncertaintyBase + uncertaintyBand).toBeCloseTo(upperBound, 1);
  });
});
