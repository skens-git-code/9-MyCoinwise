const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const Transaction = require('../models/Transaction');
const Goal = require('../models/Goal');

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs
  message: { error: 'Too many AI requests, please try again later.' }
});

// Helper — builds financial context string for the AI
async function getFinancialContext(userId) {
  try {
    const transactions = await Transaction.find({ user_id: userId }).sort({ date: -1 }).limit(50);
    const goals = await Goal.find({ user_id: userId });

    const recentTx = transactions.map(t =>
      `${t.date?.toISOString().split('T')[0] || 'N/A'} - ${(t.type || '').toUpperCase()} - ${t.category}: $${t.amount}${t.note ? ` (${t.note})` : ''}`
    ).join('\n');

    const goalData = goals.map(g =>
      `${g.name}: $${g.saved || 0} saved of $${g.target} target`
    ).join('\n');

    return `You are the built-in financial AI assistant for the MyCoinwise app. Be professional, concise, and helpful. Do not use heavy markdown — keep responses clean and readable.

User's Recent Transactions (up to 50):
${recentTx || 'No recent transactions found.'}

User's Savings Goals:
${goalData || 'No active goals.'}`;

  } catch (err) {
    console.error('[AI] Error fetching financial context:', err.message);
    return 'You are the built-in financial AI assistant for the MyCoinwise app. Be professional, concise, and helpful.';
  }
}

// POST /api/ai/chat
// Auth is already applied at the app.use('/api/ai', auth, aiRoutes) level in server.js
router.post('/chat', aiLimiter, async (req, res) => {
  const { message, history } = req.body;

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return res.status(503).json({
      error: 'Gemini API key not configured. Please add GEMINI_API_KEY to your backend .env file.',
    });
  }

  try {
    const userId = req.user?.id || req.user?._id;
    const systemPrompt = await getFinancialContext(userId);

    const rawHistory = Array.isArray(history)
      ? history.slice(-20).flatMap((msg) => {
        if (!msg?.text || !['user', 'ai', 'model'].includes(msg.role)) return [];
        return [{
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: String(msg.text).slice(0, 4000) }],
        }];
      })
      : [];
    if (rawHistory[0]?.role === 'model') rawHistory.shift();
    const chatHistory = rawHistory.reduce((messages, current) => {
      const previous = messages[messages.length - 1];
      if (previous?.role === current.role) {
        previous.parts[0].text += `\n${current.parts[0].text}`;
      } else {
        messages.push(current);
      }
      return messages;
    }, []);

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
    const result = await response.json();

    if (!response.ok) {
      const providerError = result?.error?.message || '';
      if (response.status === 429 || /quota|rate limit|too many/i.test(providerError)) {
        return res.status(429).json({ error: 'The AI is busy right now. Please try again shortly.' });
      }
      console.error('[AI] Gemini REST error:', response.status, providerError);
      return res.status(502).json({ error: 'The AI service is temporarily unavailable.' });
    }

    const text = result?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();
    if (!text) return res.status(502).json({ error: 'The AI returned an empty response.' });

    return res.json({ text });

  } catch (err) {
    console.error('[AI] Gemini API error:', err?.message || err);

    // Friendly rate-limit message
    if (err?.message?.includes('429') || err?.message?.includes('quota') || err?.message?.includes('Too Many Requests')) {
      return res.status(429).json({
        error: 'The AI is receiving too many requests right now. Please wait a moment and try again.',
      });
    }

    return res.status(500).json({ error: 'AI service error. Please try again.' });
  }
});

module.exports = router;
