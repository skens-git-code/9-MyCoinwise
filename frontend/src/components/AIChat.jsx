/* —————————————————————————————————————
 * AI Chat Component
 * Chat UI that sends the user's message plus recent history to the
 * backend AI endpoint and renders the reply.
 *
 * Key behaviors:
 *   - Maintains a message list seeded with a greeting.
 *   - Auto-scrolls to the newest message on every update.
 *   - Disables the input and send button while a request is in flight.
 *   - Maps common backend errors to friendly, styled messages:
 *       - 429 → warning bubble (rate limited)
 *       - 503 → error bubble (AI not configured)
 *       - other → error bubble (generic)
 *   - Multiline replies are rendered with <br /> between lines.
 * ————————————————————————————————————— */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, User as UserIcon, Sparkles, Loader } from 'lucide-react';
import { api } from '../services/api';

/* —————————————————————————————————————
 * Component
 * ————————————————————————————————————— */
const AIChat = () => {
  // ── Message list, seeded with the assistant's greeting ──
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hello! I am your MyCoinwise assistant. How can I help you understand your finances today?' }
  ]);

  // ── Current input value and in-flight loading flag ──
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // ── Ref to the sentinel element at the end of the message list ──
  const endOfMessagesRef = useRef(null);

  // ── Scroll to the newest message whenever messages change ──
  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  /* —————————————————————————————————————
   * Send Handler
   * Appends the user's message, calls the API with the current
   * history, and appends the reply. On failure, appends a styled
   * error or warning bubble based on the HTTP status.
   * ————————————————————————————————————— */
  const handleSend = useCallback(async (e) => {
    e?.preventDefault();

    // ── Guard: empty input or a request already in flight ──
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', text: input.trim() };

    // Snapshot history before appending the new user message, so the
    // API receives the conversation up to (but not including) this turn.
    const chatHistory = [...messages];

    // ── Optimistically render the user's message and clear the input ──
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // ── Send to the backend and append the reply ──
      const res = await api.chatWithAI(userMessage.text, chatHistory);
      setMessages((prev) => [...prev, { role: 'ai', text: res.text }]);
    } catch (error) {
      console.error('Chat Error:', error);

      // ── Extract status and server message from the error ──
      const status = error.response?.status;
      const serverMsg = error.response?.data?.error;

      let errMsg;
      let isRateLimit = false;

      // ── Map common status codes to friendly messages ──
      if (status === 429) {
        // Rate limit → warning styling (not an error)
        isRateLimit = true;
        errMsg = '⏳ The AI is a bit busy right now (rate limit reached). Please wait 15-30 seconds and try again.';
      } else if (status === 503) {
        // Service not configured → surface the server's message
        errMsg = serverMsg || '🔧 AI service is not configured yet. Please add your GEMINI_API_KEY to the backend .env file.';
      } else {
        // Generic failure
        errMsg = serverMsg || 'Sorry, I encountered an issue. Please try again.';
      }

      // ── Append the error/warning bubble ──
      setMessages((prev) => [...prev, { role: 'ai', text: errMsg, isError: !isRateLimit, isWarning: isRateLimit }]);
    } finally {
      // ── Always clear the loading state ──
      setIsLoading(false);
    }
  }, [input, isLoading, messages]);

  return (
    <div className="ai-chat-container">
      {/* ── Message list ── */}
      <div className="ai-chat-messages">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`chat-bubble ${msg.role === 'user' ? 'user-msg' : 'ai-msg'} ${msg.isError ? 'error-msg' : ''} ${msg.isWarning ? 'warning-msg' : ''}`}
          >
            {/* ── Bubble icon (user vs. AI) ── */}
            <div className="bubble-icon">
              {msg.role === 'user' ? <UserIcon size={16} /> : <Sparkles size={16} />}
            </div>

            {/* ── Bubble text: split on \n and render with <br /> ── */}
            <div className="bubble-text">
              {msg.text.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ))}
            </div>
          </div>
        ))}

        {/* ── Loading indicator while a request is in flight ── */}
        {isLoading && (
          <div className="chat-bubble ai-msg">
            <div className="bubble-icon"><Sparkles size={16} /></div>
            <div className="bubble-text loading-dots">
              <Loader size={16} className="spinner" /> Thinking...
            </div>
          </div>
        )}

        {/* ── Scroll anchor at the bottom of the list ── */}
        <div ref={endOfMessagesRef} />
      </div>

      {/* ── Input row: text field and send button ── */}
      <form className="ai-chat-input-area" onSubmit={handleSend}>
        <input
          type="text"
          placeholder="Ask a financial question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
        />
        <button
          type="submit"
          className="send-btn"
          disabled={!input.trim() || isLoading}
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

// ── Export ──
export default AIChat;