/* —————————————————————————————————————
 * Cashflow AI Insights Route
 * Generates a short AI-written cashflow analysis from the user's
 * aggregated metrics (income, spend, subscriptions, danger day).
 *
 * Endpoint:
 *   POST /ai-insights   Returns { insight } or a graceful fallback
 *
 * Key behaviors:
 *   - Gemini API key is sent via the x-goog-api-key header, never
 *     in the URL query string (see bug note below).
 *   - Request timeout is 15 seconds.
 *   - On provider failure, a locally-composed fallback insight is
 *     returned with HTTP 200 so the client renders it instead of
 *     throwing on a 500.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const auth = require('../middleware/auth');
const axios = require('axios');
const { logger } = require('../utils/logger');

/* —————————————————————————————————————
 * Helpers
 * ————————————————————————————————————— */

// ── Call Gemini and return the trimmed text of the first candidate ──
const fetchGemini = async (prompt) => {
  // ── Require the API key ──
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY environment variable.');

  // ── Resolve the model name ──
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  // ── Endpoint (key is passed via header, not query string) ──
  // Note: an earlier version appended ?key=... to the URL, which
  // leaked the key into server access logs, proxies, and error
  // messages. The header approach below avoids that.
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`;

  // ── Request payload ──
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 300,
      temperature: 0.75,
    },
  };

  // ── Send the request ──
  const response = await axios.post(url, payload, {
    timeout: 15000, // 15 seconds
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
  });

  // ── Validate provider response ──
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

/* —————————————————————————————————————
 * POST /ai-insights
 * Build a prompt from the request metrics, call Gemini, and
 * return { insight }. On failure, return a fallback insight.
 * ————————————————————————————————————— */
router.post(
  '/ai-insights',
  auth,
  [
    // ── Validate numeric inputs ──
    body('averageDailyIncome').isFloat({ min: 0 }).toFloat(),
    body('medianDailyExpense').isFloat({ min: 0 }).toFloat(),
    body('subscriptionsCount').isInt({ min: 0 }).toInt(),
    body('subscriptionsCost').isFloat({ min: 0 }).toFloat(),
    body('whatIfAmount').optional({ nullable: true }).isFloat().toFloat(),
    body('dangerDay').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
  ],
  async (req, res) => {
    // ── Reject validation errors ──
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // ── Read validated metrics ──
    const {
      averageDailyIncome,
      medianDailyExpense,
      subscriptionsCount,
      subscriptionsCost,
      whatIfAmount,
      dangerDay,
    } = req.body;

    // ── Format optional values for the prompt ──
    const whatIfDisplay = whatIfAmount !== undefined && whatIfAmount !== null
      ? (whatIfAmount === 0 ? '0 (no impact)' : (whatIfAmount > 0 ? `+${whatIfAmount}` : `${whatIfAmount}`))
      : 'None';
    const dangerDisplay = dangerDay ? `Day ${dangerDay}` : 'No danger projected in next 90 days';

    // ── Compose the system prompt ──
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
      // ── Call Gemini and return the insight ──
      const insight = await fetchGemini(prompt);
      res.json({ insight });
    } catch (error) {
      logger.error('[Cashflow AI Insight] Error', {
        error: error.message,
        stack: error.stack,
      });

      // ── Compose a local fallback insight ──
      const fallback = dangerDay
        ? `Your cashflow may hit a low point on day ${dangerDay}. Consider reducing variable expenses or adjusting subscriptions.`
        : 'Your cashflow remains stable. Keep monitoring your daily burn rate.';

      // Return HTTP 200 with the fallback so the client renders it.
      // Note: an earlier version returned HTTP 500, which caused Axios
      // on the client to throw and discard the fallback message.
      res.status(200).json({
        insight: fallback,
        fallback: true,
      });
    }
  }
);

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Export router ──
module.exports = router;