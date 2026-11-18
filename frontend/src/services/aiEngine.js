/* —————————————————————————————————————
 * AI Engine (Client-side ML-like Predictions)
 * Statistical models and trend analysis on transaction data to
 * surface spending forecasts, anomalies, goal timelines, budget
 * alerts, and personalized insights.
 *
 * Exports:
 *   - predictNextMonthSpending : Weighted average + linear trend forecast.
 *   - detectAnomalies          : Per-category sigma-based outlier detection.
 *   - predictTimeToGoal        : Months/weeks needed based on avg savings.
 *   - generateAlerts           : Prioritized alert list for the dashboard.
 *   - getSpendingInsights      : Human-readable insights for the user.
 * ————————————————————————————————————— */

// ── Safe YYYY-MM extraction using local calendar components ──
function safeYearMonth(dateVal) {
  if (!dateVal) return '';
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}/.test(dateVal)) {
    return dateVal.substring(0, 7);
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* —————————————————————————————————————
 * Spending Prediction
 * Forecasts next month's total spending using a weighted average
 * (recent months weigh more) plus a linear trend slope.
 * Returns null when there is not enough data.
 * ————————————————————————————————————— */
export function predictNextMonthSpending(transactions) {
  if (!Array.isArray(transactions) || transactions.length < 2) return null;

  // ── Aggregate monthly expenses ──
  const monthlyExpenses = {};
  transactions.filter(t => t && t.type === 'expense' && t.is_deleted !== true).forEach(t => {
    const key = safeYearMonth(t.date); // YYYY-MM
    if (!key) return;
    const amount = Number(t.amount);
    if (Number.isFinite(amount)) {
      monthlyExpenses[key] = (monthlyExpenses[key] || 0) + amount;
    }
  });

  const values = Object.values(monthlyExpenses);
  if (values.length < 1) return null;

  // Weighted average (recent months weigh more)
  const weights = values.map((_, i) => i + 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weightedAvg = values.reduce((sum, v, i) => sum + v * weights[i], 0) / totalWeight;

  // ── Linear trend computation ──
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  const slope = n > 1
    ? values.reduce((sum, y, x) => sum + (x - xMean) * (y - yMean), 0) /
    values.reduce((sum, _, x) => sum + Math.pow(x - xMean, 2), 0)
    : 0;

  // ── Combine trend + average, clamp to non-negative ──
  const predicted = weightedAvg + slope;
  return Math.max(0, parseFloat(predicted.toFixed(2)));
}

/* —————————————————————————————————————
 * Category Spending Anomaly Detection
 * Flags categories whose latest transaction is more than 1.5σ above
 * the category's historical mean.
 * ————————————————————————————————————— */
export function detectAnomalies(transactions) {
  if (!Array.isArray(transactions) || transactions.length < 5) return [];

  // ── Group expense amounts per category ──
  const catStats = {};
  transactions.filter(t => t && t.type === 'expense' && t.is_deleted !== true).forEach(t => {
    const cat = t.category;
    if (!catStats[cat]) catStats[cat] = [];
    catStats[cat].push(Number(t.amount));
  });

  const anomalies = [];
  Object.entries(catStats).forEach(([cat, amounts]) => {
    if (amounts.length < 2) return;
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const stdDev = Math.sqrt(amounts.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) / amounts.length);
    const latest = amounts[amounts.length - 1];
    if (stdDev > 0 && latest > mean + 1.5 * stdDev) {
      anomalies.push({
        category: cat,
        amount: latest,
        average: parseFloat(mean.toFixed(2)),
        excess: parseFloat((latest - mean).toFixed(2)),
      });
    }
  });

  // ── Return the top three anomalies by excess amount ──
  return anomalies.sort((a, b) => b.excess - a.excess).slice(0, 3);
}

/* —————————————————————————————————————
 * Goal Time Prediction
 * Estimates the number of months and weeks needed to reach a goal,
 * based on the user's average monthly savings.
 * ————————————————————————————————————— */
export function predictTimeToGoal(goal, transactions) {
  const { target, saved } = goal;
  const remaining = target - saved;
  if (remaining <= 0) return { months: 0, weeks: 0, achieved: true };

  if (!transactions || transactions.length === 0) return { months: null, weeks: null, achieved: false };

  // ── Aggregate monthly income and expense ──
  const monthlyIncome = {};
  const monthlyExpense = {};
  transactions.forEach(t => {
    const key = safeYearMonth(t.date);
    if (!key) return;
    const amt = Number(t.amount);
    if (!Number.isFinite(amt)) return;
    if (t.type === 'income') monthlyIncome[key] = (monthlyIncome[key] || 0) + amt;
    else monthlyExpense[key] = (monthlyExpense[key] || 0) + amt;
  });

  const months = [...new Set([...Object.keys(monthlyIncome), ...Object.keys(monthlyExpense)])];
  if (months.length === 0) return { months: null, weeks: null, achieved: false };

  // ── Average monthly savings across observed months ──
  const avgMonthlySavings = months.reduce((sum, m) => {
    return sum + ((monthlyIncome[m] || 0) - (monthlyExpense[m] || 0));
  }, 0) / months.length;

  if (avgMonthlySavings <= 0) return { months: null, weeks: null, achieved: false };

  // ── Convert remaining balance into months / weeks ──
  const monthsNeeded = Math.ceil(remaining / avgMonthlySavings);
  const weeksNeeded = Math.ceil(monthsNeeded * 4.33);

  return { months: monthsNeeded, weeks: weeksNeeded, achieved: false, savingsPerMonth: parseFloat(avgMonthlySavings.toFixed(2)) };
}

/* —————————————————————————————————————
 * Budget Alert Generation
 * Produces a prioritized list of alerts for the dashboard based on
 * this month's activity, goals, anomalies, user notification preferences, and daily tips.
 * ————————————————————————————————————— */
export function generateAlerts(transactions, user, goals = []) {
  const safeTxs = Array.isArray(transactions) ? transactions : [];
  const safeGoals = Array.isArray(goals) ? goals : [];
  const alerts = [];
  const monthlyGoal = Number(user?.monthly_goal || 0);
  const now = new Date();
  const thisMonth = safeYearMonth(now);
  const prefs = user?.notification_prefs || {};

  // ── Filter current-month transactions ──
  const thisMonthExpenses = safeTxs.filter(t => {
    if (!t || t.is_deleted === true) return false;
    const m = safeYearMonth(t.date);
    const type = String(t.type || '').trim().toLowerCase();
    return type === 'expense' && m === thisMonth;
  });
  const thisMonthIncome = safeTxs.filter(t => {
    if (!t || t.is_deleted === true) return false;
    const m = safeYearMonth(t.date);
    const type = String(t.type || '').trim().toLowerCase();
    return type === 'income' && m === thisMonth;
  });

  const totalExpense = thisMonthExpenses.reduce((a, c) => {
    const val = Number(c.amount);
    return a + (Number.isFinite(val) ? val : 0);
  }, 0);
  const totalIncome = thisMonthIncome.reduce((a, c) => {
    const val = Number(c.amount);
    return a + (Number.isFinite(val) ? val : 0);
  }, 0);
  const currentSavings = totalIncome - totalExpense;

  const budgetEnabled = prefs.budgetAlerts !== false;
  const unusualSpendingEnabled = prefs.unusualSpending !== false;
  const goalsEnabled = prefs.goalMilestones !== false;

  // 1. Prompt to set a monthly goal if none is set
  if (monthlyGoal === 0) {
    alerts.push({
      id: `alert-set-goal-${thisMonth}`,
      type: 'info',
      category: 'goal',
      icon: '🎯',
      title: 'Set a Monthly Savings Goal',
      message: 'Head to Settings to set a monthly savings goal — it unlocks smart budget alerts and progress tracking.',
      priority: 4,
      timestamp: new Date().toISOString(),
      actionLabel: 'Set Goal',
      actionRoute: '/settings',
      details: 'A defined savings target helps calculate pacing and detect overspending early.',
    });
  }

  // 2. Budget limit warning (pacing alert)
  if (budgetEnabled && monthlyGoal > 0 && currentSavings < monthlyGoal * 0.2 && currentSavings >= 0) {
    const pct = ((currentSavings / monthlyGoal) * 100).toFixed(0);
    alerts.push({
      id: `alert-budget-pacing-${thisMonth}`,
      type: 'warning',
      category: 'budget',
      icon: '⚠️',
      title: 'Budget Alert',
      message: `You're only ${pct}% toward your monthly goal. Try to cut some expenses!`,
      priority: 2,
      timestamp: new Date().toISOString(),
      actionLabel: 'Review Budgets',
      actionRoute: '/budgets',
      details: `Saved so far: ${currentSavings.toFixed(2)} out of goal ${monthlyGoal.toFixed(2)}. ${pct}% accomplished with ${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()} days remaining in the month.`,
    });
  }

  // 3. Negative savings (Overspending deficit)
  if (budgetEnabled && currentSavings < 0) {
    const deficit = Math.abs(currentSavings).toFixed(2);
    alerts.push({
      id: `alert-overspending-${thisMonth}`,
      type: 'danger',
      category: 'budget',
      icon: '🚨',
      title: 'Overspending Alert',
      message: `You've spent more than you earned this month. Current deficit: ${deficit}`,
      priority: 1,
      timestamp: new Date().toISOString(),
      actionLabel: 'View Outflow',
      actionRoute: '/transactions',
      details: `Total monthly income: ${totalIncome.toFixed(2)} vs expenses: ${totalExpense.toFixed(2)}. Net cashflow deficit of ${deficit}.`,
    });
  }

  // 4. Top category this month
  const catMap = {};
  thisMonthExpenses.forEach(t => {
    const cat = t.category || 'Other';
    catMap[cat] = (catMap[cat] || 0) + Number(t.amount || 0);
  });
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
  if (topCat && totalExpense > 0 && topCat[1] > totalExpense * 0.4) {
    const catPct = ((topCat[1] / totalExpense) * 100).toFixed(0);
    alerts.push({
      id: `alert-topcat-${encodeURIComponent(topCat[0])}-${thisMonth}`,
      type: 'info',
      category: 'spending',
      icon: '🔍',
      title: 'Top Expense Category',
      message: `"${topCat[0]}" accounts for ${catPct}% of your spending this month.`,
      priority: 3,
      timestamp: new Date().toISOString(),
      actionLabel: 'Analyze Spending',
      actionRoute: '/analytics',
      details: `Total spent in ${topCat[0]}: ${topCat[1].toFixed(2)} out of total monthly expenditure ${totalExpense.toFixed(2)}.`,
    });
  }

  // 5. Anomalies
  if (unusualSpendingEnabled) {
    const anomalies = detectAnomalies(safeTxs);
    if (anomalies.length > 0) {
      const topAnomaly = anomalies[0];
      alerts.push({
        id: `alert-anomaly-${encodeURIComponent(topAnomaly.category || 'other')}-${thisMonth}`,
        type: 'warning',
        category: 'spending',
        icon: '📊',
        title: 'Unusual Spending Detected',
        message: `Your "${topAnomaly.category}" spending (${topAnomaly.amount.toFixed(2)}) is unusually high vs avg of ${topAnomaly.average.toFixed(2)}.`,
        priority: 2,
        timestamp: new Date().toISOString(),
        actionLabel: 'Inspect Transactions',
        actionRoute: '/transactions',
        details: 'Identified as a spending spike that significantly exceeds your 90-day baseline average.',
      });
    }
  }

  // 6. Goals checks (Milestones reached & Stuck goals)
  if (goalsEnabled && safeGoals.length > 0) {
    // 6a. Milestone achieved
    const achievedGoal = safeGoals.find(g => {
      const tgt = Number(g?.target || 0);
      const svd = Number(g?.saved || 0);
      return tgt > 0 && svd >= tgt;
    });
    if (achievedGoal) {
      alerts.push({
        id: `alert-goal-achieved-${achievedGoal.id || achievedGoal._id || achievedGoal.name}`,
        type: 'success',
        category: 'goal',
        icon: '🎉',
        title: 'Goal Achieved!',
        message: `Congratulations! You funded 100% of "${achievedGoal.name}".`,
        priority: 2,
        timestamp: achievedGoal.updated_at || new Date().toISOString(),
        actionLabel: 'View Goals',
        actionRoute: '/goals',
        details: `Saved ${Number(achievedGoal.saved).toFixed(2)} of target ${Number(achievedGoal.target).toFixed(2)}. Ready for your next milestone!`,
      });
    }

    // 6b. Stuck goal nudge
    const stuckGoals = safeGoals.filter(g => {
      const pct = g.target > 0 ? (Number(g.saved) / Number(g.target)) * 100 : 0;
      const ageInDays = g.created_at ? (now - new Date(g.created_at)) / (1000 * 60 * 60 * 24) : 0;
      return pct < 15 && ageInDays > 14 && pct < 100;
    });
    if (stuckGoals.length > 0) {
      const g = stuckGoals[0];
      const pct = g.target > 0 ? ((Number(g.saved) / Number(g.target)) * 100).toFixed(0) : 0;
      alerts.push({
        id: `alert-goal-stuck-${g.id || g._id || g.name}`,
        type: 'warning',
        category: 'goal',
        icon: '🐌',
        title: 'Goal Behind Schedule',
        message: `"${g.name}" is only ${pct}% funded after 2+ weeks. Consider adding a small contribution to keep momentum!`,
        priority: 3,
        timestamp: new Date().toISOString(),
        actionLabel: 'Contribute Now',
        actionRoute: '/goals',
        details: `Target: ${Number(g.target).toFixed(2)}, currently saved: ${Number(g.saved).toFixed(2)}. Even modest recurring deposits keep momentum high.`,
      });
    }
  }

  // 7. Daily tip (refreshed daily)
  const tips = [
    "💡 Try the 50/30/20 rule: 50% needs, 30% wants, 20% savings.",
    "💡 Tracking every expense can save up to 20% more each month!",
    "💡 Set up auto-savings to hit your goal without thinking.",
    "💡 Cancel unused subscriptions - small amounts add up fast!",
    "💡 Compare prices before buying – apps like Honey can help.",
    "💡 Cook at home twice more per week to save significantly on food.",
  ];
  alerts.push({
    id: `alert-tip-${thisMonth}-${now.getDate()}`,
    type: 'tip',
    category: 'insights',
    icon: '💡',
    title: 'Daily Finance Tip',
    message: tips[now.getDate() % tips.length],
    priority: 5,
    timestamp: new Date().toISOString(),
    actionLabel: 'Read Insights',
    actionRoute: '/analytics',
    details: 'Daily micro-insights powered by MyCoinwise behavioral finance engine.',
  });

  // ── Deduplicate by ID and sort by priority (lowest number = highest priority) ──
  const seenIds = new Set();
  const deduped = [];
  for (const a of alerts) {
    if (!seenIds.has(a.id)) {
      seenIds.add(a.id);
      deduped.push(a);
    }
  }

  return deduped.sort((a, b) => a.priority - b.priority);
}

/* —————————————————————————————————————
 * Spending Insights
 * Builds a small set of human-readable insights about savings rate,
 * forecasted spending, top category, and category diversity.
 * ————————————————————————————————————— */
export function getSpendingInsights(transactions, fmt) {
  if (!Array.isArray(transactions) || transactions.length === 0) return [];

  // ── Aggregate totals ──
  const safeTxs = transactions.filter(t => t && t.is_deleted !== true);
  const income = safeTxs.filter(t => t.type === 'income').reduce((a, c) => a + Number(c.amount), 0);
  const expense = safeTxs.filter(t => t.type === 'expense').reduce((a, c) => a + Number(c.amount), 0);
  const savingsRate = income > 0 ? ((income - expense) / income * 100) : 0;

  // Find top spending category
  const catMap = {};
  safeTxs.filter(t => t.type === 'expense').forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount);
  });
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
  const topCatName = topCat ? topCat[0] : null;
  const topCatAmount = topCat ? topCat[1] : 0;
  const topCatPct = expense > 0 ? ((topCatAmount / expense) * 100).toFixed(0) : 0;

  const insights = [];

  // ── Savings rate insight — actionable ──
  if (savingsRate >= 30) {
    insights.push({ icon: '🏆', color: '#10b981', text: `Great discipline! You're saving ${savingsRate.toFixed(0)}% of your income. Consider allocating savings toward your goal.` });
  } else if (savingsRate >= 20) {
    insights.push({ icon: '✅', color: '#10b981', text: `Solid ${savingsRate.toFixed(0)}% savings rate. Push to 30%+ by cutting back on ${topCatName || 'non-essentials'}.` });
  } else if (savingsRate > 0) {
    insights.push({ icon: '📈', color: '#f59e0b', text: `${savingsRate.toFixed(0)}% savings rate. ${topCatName ? `Your top category is ${topCatName} (${topCatPct}% of spending). Try reducing it by 20%.` : 'Aim for at least 20%.'}` });
  } else {
    insights.push({ icon: '⚠️', color: '#ef4444', text: `Spending exceeds income! ${topCatName ? `"${topCatName}" is ${topCatPct}% of expenses (${fmt ? fmt(topCatAmount) : topCatAmount.toFixed(2)}). Consider cutting back here first.` : 'Review your expenses immediately.'}` });
  }

  // ── Predicted next month — with context ──
  const predicted = predictNextMonthSpending(transactions);
  if (predicted !== null) {
    const pctOfIncome = income > 0 ? ((predicted / income) * 100).toFixed(0) : null;
    const pctContext = pctOfIncome ? ` That's ~${pctOfIncome}% of your average income.` : '';
    insights.push({
      icon: '🔮',
      color: '#059669',
      text: `Based on your spending trend, next month may cost ~${fmt ? fmt(predicted) : predicted.toFixed(2)}.${pctContext}`,
    });
  }

  // ── Category diversity ──
  const cats = [...new Set(transactions.filter(t => t.type === 'expense').map(t => t.category))];
  if (cats.length >= 5) {
    insights.push({ icon: '📊', color: '#06b6d4', text: `Spending across ${cats.length} categories — diversified habits help you spot outliers faster.` });
  }

  return insights;
}