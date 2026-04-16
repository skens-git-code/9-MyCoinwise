// =============================================
// Zenith Spend – AI Engine (Client-side ML-like predictions)
// Uses statistical models + trend analysis on transaction data
// =============================================

// ── Spending Prediction ──────────────────────────────────────────────────────
export function predictNextMonthSpending(transactions) {
  if (!transactions || transactions.length < 2) return null;

  const monthlyExpenses = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    const key = new Date(t.date).toISOString().substring(0, 7); // YYYY-MM
    monthlyExpenses[key] = (monthlyExpenses[key] || 0) + Number(t.amount);
  });

  const values = Object.values(monthlyExpenses);
  if (values.length < 1) return null;

  // Weighted average (recent months weigh more)
  const weights = values.map((_, i) => i + 1);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weightedAvg = values.reduce((sum, v, i) => sum + v * weights[i], 0) / totalWeight;

  // Linear trend
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  const slope = n > 1
    ? values.reduce((sum, y, x) => sum + (x - xMean) * (y - yMean), 0) /
    values.reduce((sum, _, x) => sum + Math.pow(x - xMean, 2), 0)
    : 0;

  const predicted = weightedAvg + slope;
  return Math.max(0, parseFloat(predicted.toFixed(2)));
}

// ── Category Spending Anomaly Detection ─────────────────────────────────────
export function detectAnomalies(transactions) {
  if (!transactions || transactions.length < 5) return [];

  const catStats = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
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

  return anomalies.sort((a, b) => b.excess - a.excess).slice(0, 3);
}

// ── Goal Time Prediction ─────────────────────────────────────────────────────
export function predictTimeToGoal(goal, transactions) {
  const { target, saved } = goal;
  const remaining = target - saved;
  if (remaining <= 0) return { months: 0, weeks: 0, achieved: true };

  if (!transactions || transactions.length === 0) return { months: null, weeks: null, achieved: false };

  // Estimate avg monthly savings
  const monthlyIncome = {};
  const monthlyExpense = {};
  transactions.forEach(t => {
    const key = new Date(t.date).toISOString().substring(0, 7);
    if (t.type === 'income') monthlyIncome[key] = (monthlyIncome[key] || 0) + Number(t.amount);
    else monthlyExpense[key] = (monthlyExpense[key] || 0) + Number(t.amount);
  });

  const months = [...new Set([...Object.keys(monthlyIncome), ...Object.keys(monthlyExpense)])];
  if (months.length === 0) return { months: null, weeks: null, achieved: false };

  const avgMonthlySavings = months.reduce((sum, m) => {
    return sum + ((monthlyIncome[m] || 0) - (monthlyExpense[m] || 0));
  }, 0) / months.length;

  if (avgMonthlySavings <= 0) return { months: null, weeks: null, achieved: false };

  const monthsNeeded = Math.ceil(remaining / avgMonthlySavings);
  const weeksNeeded = Math.ceil(monthsNeeded * 4.33);

  return { months: monthsNeeded, weeks: weeksNeeded, achieved: false, savingsPerMonth: parseFloat(avgMonthlySavings.toFixed(2)) };
}

// ── Budget Alert Generation ───────────────────────────────────────────────────
export function generateAlerts(transactions, user) {
  const alerts = [];
  const monthlyGoal = Number(user?.monthly_goal || 0);
  const now = new Date();
  const thisMonth = now.toISOString().substring(0, 7);

  const thisMonthExpenses = transactions.filter(t => {
    const m = new Date(t.date).toISOString().substring(0, 7);
    return t.type === 'expense' && m === thisMonth;
  });
  const thisMonthIncome = transactions.filter(t => {
    const m = new Date(t.date).toISOString().substring(0, 7);
    return t.type === 'income' && m === thisMonth;
  });

  const totalExpense = thisMonthExpenses.reduce((a, c) => a + Number(c.amount), 0);
  const totalIncome = thisMonthIncome.reduce((a, c) => a + Number(c.amount), 0);
  const currentSavings = totalIncome - totalExpense;

  // 1. Budget limit warning
  if (monthlyGoal > 0 && currentSavings < monthlyGoal * 0.2 && currentSavings >= 0) {
    alerts.push({
      type: 'warning',
      icon: '⚠️',
      title: 'Budget Alert',
      message: `You're only ${((currentSavings / monthlyGoal) * 100).toFixed(0)}% toward your monthly goal. Try to cut some expenses!`,
      priority: 2,
    });
  }

  // 2. Negative savings
  if (currentSavings < 0) {
    alerts.push({
      type: 'danger',
      icon: '🚨',
      title: 'Overspending Alert',
      message: `You've spent more than you earned this month. Current deficit: ${Math.abs(currentSavings).toFixed(2)}`,
      priority: 1,
    });
  }

  // 3. Top category this month
  const catMap = {};
  thisMonthExpenses.forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount);
  });
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
  if (topCat && topCat[1] > totalExpense * 0.4) {
    alerts.push({
      type: 'info',
      icon: '🔍',
      title: 'Top Expense Category',
      message: `"${topCat[0]}" accounts for ${((topCat[1] / totalExpense) * 100).toFixed(0)}% of your spending this month.`,
      priority: 3,
    });
  }

  // 4. Anomalies
  const anomalies = detectAnomalies(transactions);
  if (anomalies.length > 0) {
    alerts.push({
      type: 'info',
      icon: '📊',
      title: 'Unusual Spending Detected',
      message: `Your "${anomalies[0].category}" spending (${anomalies[0].amount.toFixed(2)}) is unusually high vs avg of ${anomalies[0].average.toFixed(2)}.`,
      priority: 3,
    });
  }

  // 5. Daily tip
  const tips = [
    "💡 Try the 50/30/20 rule: 50% needs, 30% wants, 20% savings.",
    "💡 Tracking every expense can save up to 20% more each month!",
    "💡 Set up auto-savings to hit your goal without thinking.",
    "💡 Cancel unused subscriptions - small amounts add up fast!",
    "💡 Compare prices before buying – apps like Honey can help.",
    "💡 Cook at home twice more per week to save significantly on food.",
  ];
  alerts.push({
    type: 'tip',
    icon: '💡',
    title: 'Daily Finance Tip',
    message: tips[new Date().getDate() % tips.length],
    priority: 5,
  });

  return alerts.sort((a, b) => a.priority - b.priority);
}

// ── Spending Insights ─────────────────────────────────────────────────────────
export function getSpendingInsights(transactions, fmt) {
  if (!transactions || transactions.length === 0) return [];

  const income = transactions.filter(t => t.type === 'income').reduce((a, c) => a + Number(c.amount), 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((a, c) => a + Number(c.amount), 0);
  const savingsRate = income > 0 ? ((income - expense) / income * 100) : 0;

  // Find top spending category
  const catMap = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    catMap[t.category] = (catMap[t.category] || 0) + Number(t.amount);
  });
  const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
  const topCatName = topCat ? topCat[0] : null;
  const topCatAmount = topCat ? topCat[1] : 0;
  const topCatPct = expense > 0 ? ((topCatAmount / expense) * 100).toFixed(0) : 0;

  const insights = [];

  // Savings rate insight — actionable
  if (savingsRate >= 30) {
    insights.push({ icon: '🏆', color: '#10b981', text: `Great discipline! You're saving ${savingsRate.toFixed(0)}% of your income. Consider allocating savings toward your goal.` });
  } else if (savingsRate >= 20) {
    insights.push({ icon: '✅', color: '#10b981', text: `Solid ${savingsRate.toFixed(0)}% savings rate. Push to 30%+ by cutting back on ${topCatName || 'non-essentials'}.` });
  } else if (savingsRate > 0) {
    insights.push({ icon: '📈', color: '#f59e0b', text: `${savingsRate.toFixed(0)}% savings rate. ${topCatName ? `Your top category is ${topCatName} (${topCatPct}% of spending). Try reducing it by 20%.` : 'Aim for at least 20%.'}` });
  } else {
    insights.push({ icon: '⚠️', color: '#ef4444', text: `Spending exceeds income! ${topCatName ? `"${topCatName}" is ${topCatPct}% of expenses (${fmt ? fmt(topCatAmount) : topCatAmount.toFixed(2)}). Consider cutting back here first.` : 'Review your expenses immediately.'}` });
  }

  // Predicted next month — with context
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

  // Category diversity
  const cats = [...new Set(transactions.filter(t => t.type === 'expense').map(t => t.category))];
  if (cats.length >= 5) {
    insights.push({ icon: '📊', color: '#06b6d4', text: `Spending across ${cats.length} categories — diversified habits help you spot outliers faster.` });
  }

  return insights;
}

