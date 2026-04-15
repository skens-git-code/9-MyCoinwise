const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const https = require('https');

// Helper wrapper for Gemini API
const fetchGemini = async (prompt) => {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return reject(new Error('Missing GEMINI_API_KEY environment variable.'));

    const data = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 250 }
    });

    const parsedUrl = new URL(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`);
    
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`API Error: ${res.statusCode} - ${body}`));
        } else {
          try {
            const parsed = JSON.parse(body);
            if (parsed.candidates && parsed.candidates.length > 0) {
              resolve(parsed.candidates[0].content.parts[0].text.trim());
            } else {
              resolve('AI summary generated but no text was returned.');
            }
          } catch (e) {
            reject(new Error('Failed to parse Gemini response'));
          }
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
};

/**
 * @route  POST /api/cashflow/ai-insights
 * @desc   Generate forecasting insights explicitly for Cashflow data
 */
router.post('/ai-insights', auth, async (req, res) => {
  try {
    const { averageDailyIncome, medianDailyExpense, subscriptionsCount, subscriptionsCost, whatIfAmount, dangerDay } = req.body;

    const basePrompt = `You are the Zenith Spend Cashflow AI Coach.
Analyze the user's 90-day cashflow trajectory. 
Keep the response under 3 sentences. Be punchy, professional, and directly address their cashflow risk. Do NOT use markdown.

Metrics:
- Avg Daily Income: ~${averageDailyIncome}/day
- Median Daily Variable Spend: ~${medianDailyExpense}/day (Excluding fixed subscriptions & one-off events)
- Active Subscriptions: ${subscriptionsCount} costing ~${subscriptionsCost}/month
- Danger Zone Hit: ${dangerDay ? `Day ${dangerDay}` : 'No danger projected in next 90 days'}
- Hypothetical One-Time Spend Tested: ${whatIfAmount > 0 ? parseFloat(whatIfAmount) : 'None'}

Provide an insight comparing their daily burn rate to income, taking subscriptions into account, and give actionable advice.`;

    const insight = await fetchGemini(basePrompt);
    res.json({ insight });
  } catch (error) {
    console.error('Cashflow AI Insight Error:', error.message);
    res.status(500).json({ error: 'Failed to generate cashflow insights.' });
  }
});

module.exports = router;
