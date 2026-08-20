const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const auth = require('../middleware/auth');
const axios = require('axios'); // <-- Install axios if not already

// ---------- Helpers ----------
const fetchGemini = async (prompt) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY environment variable.');

  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash'; // Use 1.5-flash by default
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

  const data = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: parseFloat(process.env.GEMINI_TEMPERATURE) || 0.7,
      maxOutputTokens: parseInt(process.env.GEMINI_MAX_TOKENS, 10) || 250,
    },
  };

  const response = await axios.post(url, data, {
    timeout: 15000, // 15 seconds
    headers: { 'Content-Type': 'application/json' },
  });

  const candidates = response.data?.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('No candidates returned from Gemini.');
  }

  const text = candidates[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Empty response from Gemini.');
  }

  return text.trim();
};

// ---------- Route ----------
router.post(
  '/ai-insights',
  auth,
  [
    body('averageDailyIncome').isFloat({ min: 0 }).toFloat(),
    body('medianDailyExpense').isFloat({ min: 0 }).toFloat(),
    body('subscriptionsCount').isInt({ min: 0 }).toInt(),
    body('subscriptionsCost').isFloat({ min: 0 }).toFloat(),
    body('whatIfAmount').optional({ nullable: true }).isFloat().toFloat(),
    body('dangerDay').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      averageDailyIncome,
      medianDailyExpense,
      subscriptionsCount,
      subscriptionsCost,
      whatIfAmount,
      dangerDay,
    } = req.body;

    // Build the prompt
    const whatIfDisplay = whatIfAmount !== undefined && whatIfAmount !== null
      ? (whatIfAmount === 0 ? '0 (no impact)' : (whatIfAmount > 0 ? `+${whatIfAmount}` : `${whatIfAmount}`))
      : 'None';
    const dangerDisplay = dangerDay ? `Day ${dangerDay}` : 'No danger projected in next 90 days';

    const prompt = `
You are the MyCoinwise Cashflow AI Coach.
Analyze the user's 90-day cashflow trajectory.
Keep the response under 3 sentences. Be punchy, professional, and directly address their cashflow risk. Do NOT use markdown.

Metrics:
- Avg Daily Income: ~${averageDailyIncome.toFixed(2)}/day
- Median Daily Variable Spend: ~${medianDailyExpense.toFixed(2)}/day (Excluding fixed subscriptions & one-off events)
- Active Subscriptions: ${subscriptionsCount} costing ~${subscriptionsCost.toFixed(2)}/month
- Danger Zone Hit: ${dangerDisplay}
- Hypothetical Scenario Tested: ${whatIfDisplay}

Provide an insight comparing their daily burn rate to income, taking subscriptions into account, and give actionable advice.
    `;

    try {
      const insight = await fetchGemini(prompt);
      res.json({ insight });
    } catch (error) {
      console.error('[Cashflow AI Insight] Error:', error.message);
      // Provide a graceful fallback instead of just 500
      const fallback = dangerDay
        ? `Your cashflow may hit a low point on day ${dangerDay}. Consider reducing variable expenses or adjusting subscriptions.`
        : 'Your cashflow remains stable. Keep monitoring your daily burn rate.';
      res.status(500).json({
        error: 'Failed to generate AI insight.',
        fallback,
      });
    }
  }
);

module.exports = router;