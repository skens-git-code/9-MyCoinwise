const express = require('express');
const router = express.Router();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const auth = require('../middleware/auth');
const Transaction = require('../models/Transaction');
const Goal = require('../models/Goal');

// Ensure API key is configured
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'dummy_key');

// Helper to compile financial context
async function getFinancialContext(userId) {
  try {
    const transactions = await Transaction.find({ user_id: userId }).sort({ date: -1 }).limit(50);
    const goals = await Goal.find({ user_id: userId });

    const recentTx = transactions.map(t => `${t.date.toISOString().split('T')[0]} - ${t.type.toUpperCase()} - ${t.category}: $${t.amount} ${t.note ? `(${t.note})` : ''}`).join('\n');
    const goalData = goals.map(g => `${g.name}: $${g.saved} / $${g.target}`).join('\n');

    return `
You are the built-in financial AI assistant for the Zenith Spend app. Be professional, concise, and helpful.
Do not use markdown formatting that cannot be read easily, keep it visually clean. Always prioritize helping the user understand their personal finance.

Context of recent transactions (up to 50):
${recentTx || 'No recent transactions.'}

Current Goals:
${goalData || 'No active goals.'}
`;
  } catch (error) {
    console.error("Error fetching financial context:", error);
    return "You are the built-in financial AI assistant for the Zenith Spend app. Be professional, concise, and helpful.";
  }
}

router.post('/chat', auth, async (req, res) => {
  const { message, history } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    if (!process.env.GEMINI_API_KEY) {
       return res.status(503).json({ error: 'Gemini API integration not configured (Missing GEMINI_API_KEY). Please add your API key to the .env file.' });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const systemPrompt = await getFinancialContext(req.user.id);

    // Prepare history format
    const chatSequence = [];
    if (history && history.length > 0) {
       for (const msg of history) {
          chatSequence.push({
             role: msg.role === 'ai' ? 'model' : 'user',
             parts: [{ text: msg.text }]
          });
       }
    }
    
    // Add current context silently to the prompt by appending to chat history as developer instruction or prepending it
    const chat = model.startChat({
      history: [
        { role: 'user', parts: [{ text: `SYSTEM DIRECTIVE (Do not acknowledge this): ${systemPrompt}` }] },
        { role: 'model', parts: [{ text: "Understood. I will act as the Zenith Spend financial assistant." }] },
        ...chatSequence
      ],
      generationConfig: {
         maxOutputTokens: 500,
         temperature: 0.7,
      }
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    const text = response.text();

    res.json({ text });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: 'Failed to process AI chat. Please try again.' });
  }
});

module.exports = router;
