const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Transaction = require('../models/Transaction');
const Goal = require('../models/Goal');

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
router.post('/chat', async (req, res) => {
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
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-8b' });

    const userId = req.user?.id || req.user?._id;
    const systemPrompt = await getFinancialContext(userId);

    // Sanitise history
    const chatHistory = [];
    if (Array.isArray(history)) {
      for (const msg of history) {
        if (msg?.text && msg?.role) {
          chatHistory.push({
            role: msg.role === 'ai' ? 'model' : 'user',
            parts: [{ text: String(msg.text) }],
          });
        }
      }
    }

    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: `[SYSTEM CONTEXT]\n${systemPrompt}` }] },
        { role: 'model', parts: [{ text: 'Understood. I am the MyCoinwise financial assistant, ready to help.' }] },
        ...chatHistory,
      ],
      generationConfig: { maxOutputTokens: 600, temperature: 0.75 },
    });

    const result = await chat.sendMessage(message.trim());
    const text = result.response.text();

    return res.json({ text });

  } catch (err) {
    console.error('[AI] Gemini API error:', err?.message || err);

    // Friendly rate-limit message
    if (err?.message?.includes('429') || err?.message?.includes('quota') || err?.message?.includes('Too Many Requests')) {
      return res.status(429).json({
        error: 'The AI is receiving too many requests right now. Please wait a moment and try again.',
      });
    }

    return res.status(500).json({
      error: err?.message || 'AI service error. Please try again.',
    });
  }
});

module.exports = router;
