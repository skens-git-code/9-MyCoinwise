/* —————————————————————————————————————
 * AI Routes
 * Provides a single chat endpoint that forwards user messages
 * to Google Gemini, enriched with a financial context built from
 * the user's recent transactions and active goals.
 *
 * Key behaviors:
 *   - `aiLimiter` throttles each IP to 20 requests per 15 minutes.
 *   - Auth is applied upstream (app.use('/api/ai', auth, aiRoutes)),
 *     so these handlers assume `req.user` is already populated.
 *   - Gemini key is read from GEMINI_API_KEY; missing key → 503.
 *   - History is capped at the last 20 turns and merged when two
 *     consecutive turns share the same role.
 *   - Financial context excludes soft-deleted transactions and
 *     archived goals.
 *   - Request timeout is 20 seconds via AbortSignal.timeout.
 * ————————————————————————————————————— */

// ── Load dependencies ──
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const Transaction = require('../models/Transaction');
const Goal = require('../models/Goal');

/* —————————————————————————————————————
 * Rate Limiting
 * Caps AI requests per IP to prevent abuse and cost spikes.
 * ————————————————————————————————————— */
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                  // limit each IP to 20 requests per windowMs
  message: { error: 'Too many AI requests, please try again later.' }
});

/* —————————————————————————————————————
 * Financial Context Builder
 * Produces the system prompt fed to Gemini, based on the
 * user's recent (non-deleted) transactions and active goals.
 * ————————————————————————————————————— */
async function getFinancialContext(userId) {
  try {
    // ── Load recent non-deleted transactions (up to 50) ──
    // Note: an earlier version did not filter is_deleted, which let
    // soft-deleted transactions leak into the AI context.
    const transactions = await Transaction.find({ user_id: userId, is_deleted: { $ne: true } }).sort({ date: -1 }).limit(50);

    // ── Load active (non-archived) goals ──
    const goals = await Goal.find({ user_id: userId, is_archived: { $ne: true } });

    // ── Format transactions as compact text lines ──
    const recentTx = transactions.map(t =>
      `${t.date?.toISOString().split('T')[0] || 'N/A'} - ${(t.type || '').toUpperCase()} - ${t.category}: $${t.amount}${t.note ? ` (${t.note})` : ''}`
    ).join('\n');

    // ── Format goals as compact text lines ──
    const goalData = goals.map(g =>
      `${g.name}: $${g.saved || 0} saved of $${g.target} target`
    ).join('\n');

    // ── Compose the full system prompt ──
    return `You are the built-in financial AI assistant for the MyCoinwise app. Be professional, concise, and helpful. Do not use heavy markdown — keep responses clean and readable.

User's Recent Transactions (up to 50):
${recentTx || 'No recent transactions found.'}

User's Savings Goals:
${goalData || 'No active goals.'}`;

  } catch (err) {
    // ── Fall back to a generic prompt if context loading fails ──
    console.error('[AI] Error fetching financial context:', err.message);
    return 'You are the built-in financial AI assistant for the MyCoinwise app. Be professional, concise, and helpful.';
  }
}

/* —————————————————————————————————————
 * POST /chat
 * Accepts { message, history } and returns { text } from Gemini.
 * Auth is already applied upstream at app.use('/api/ai', auth, aiRoutes).
 * ————————————————————————————————————— */
router.post('/chat', aiLimiter, async (req, res) => {
  // ── Read request payload ──
  const { message, history } = req.body;

  // ── Validate incoming message ──
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  // ── Ensure Gemini API key is configured ──
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return res.status(503).json({
      error: 'Gemini API key not configured. Please add GEMINI_API_KEY to your backend .env file.',
    });
  }

  try {
    // ── Identify the authenticated user ──
    const userId = req.user?.id || req.user?._id;

    // ── Build the system prompt from the user's data ──
    const systemPrompt = await getFinancialContext(userId);

    // ── Sanitize and cap the client-supplied chat history ──
    const rawHistory = Array.isArray(history)
      ? history.slice(-20).flatMap((msg) => {
        if (!msg?.text || !['user', 'ai', 'model'].includes(msg.role)) return [];
        return [{
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(msg.text).slice(0, 4000) }],
        }];
      })
      : [];

    // ── Ensure the first turn is not from the model ──
    if (rawHistory[0]?.role === 'model') rawHistory.shift();

    // ── Merge consecutive turns with the same role ──
    const chatHistory = rawHistory.reduce((messages, current) => {
      const previous = messages[messages.length - 1];
      if (previous?.role === current.role) {
        previous.parts[0].text += `\n${current.parts[0].text}`;
      } else {
        messages.push(current);
      }
      return messages;
    }, []);

    // ── Call Gemini's REST endpoint ──
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey.trim() },
        body: JSON.stringify({
          contents: [
            { role: 'user', parts: [{ text: `[SYSTEM CONTEXT]\n${systemPrompt}` }] },
            { role: 'model', parts: [{ text: 'Understood. I am the MyCoinwise financial assistant, ready to help.' }] },
            ...chatHistory,
            { role: 'user', parts: [{ text: message.trim().slice(0, 4000) }] },
          ],
          generationConfig: { maxOutputTokens: 600, temperature: 0.75 },
        }),
        signal: AbortSignal.timeout(20000),
      }
    );

    // ── Parse the provider response ──
    const result = await response.json();

    // ── Handle non-OK provider responses ──
    if (!response.ok) {
      const providerError = result?.error?.message || '';
      if (response.status === 429 || /quota|rate limit|too many/i.test(providerError)) {
        return res.status(429).json({ error: 'The AI is busy right now. Please try again shortly.' });
      }
      console.error('[AI] Gemini REST error:', response.status, providerError);
      return res.status(502).json({ error: 'The AI service is temporarily unavailable.' });
    }

    // ── Extract the text from the first candidate ──
    const text = result?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    // ── Reject empty responses from the provider ──
    if (!text) return res.status(502).json({ error: 'The AI returned an empty response.' });

    return res.json({ text });

  } catch (err) {
    console.error('[AI] Gemini API error:', err?.message || err);

    // ── Map provider-side rate limits to HTTP 429 ──
    if (err?.message?.includes('429') || err?.message?.includes('quota') || err?.message?.includes('Too Many Requests')) {
      return res.status(429).json({
        error: 'The AI is receiving too many requests right now. Please wait a moment and try again.',
      });
    }

    // ── Fallback for any other failure ──
    return res.status(500).json({ error: 'AI service error. Please try again.' });
  }
});

/* —————————————————————————————————————
 * Export
 * ————————————————————————————————————— */

// ── Export router ──
module.exports = router;