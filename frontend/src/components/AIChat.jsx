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
  const [messageId, setMessageId] = useState(1);
  // ── Message list, seeded with the assistant's greeting ──
  const [messages, setMessages] = useState([
    { id: 0, role: 'ai', text: 'Hello! I am your MyCoinwise assistant. How can I help you understand your finances today?' }
  ]);

  // ── Current input value and in-flight loading flag ──
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef(null);
  const listRef = useRef(null);

  // ── Ref to the sentinel element at the end of the message list ──
  const endOfMessagesRef = useRef(null);

  // ── Scroll to the newest message whenever messages change ──
  // Respects reduced-motion and never yanks the user away from history:
  // only auto-scroll when already near the bottom.
  useEffect(() => {
    try {
      const list = listRef.current;
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      if (list) {
        const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 160;
        if (!nearBottom) return;
      }
      endOfMessagesRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
    } catch { /* best effort */ }
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
    const trimmed = input.trim().slice(0, 2000);
    if (!trimmed || isLoading) return;

    const userMessage = { id: messageId, role: 'user', text: trimmed };
    setMessageId((v) => v + 1);

    // Snapshot history before appending the new user message, so the
    // API receives the conversation up to (but not including) this turn.
    const chatHistory = [...messages];

    // ── Optimistically render the user's message and clear the input ──
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // ── Send to the backend and append the reply ──
      const res = await api.chatWithAI(userMessage.text, chatHistory);
      setMessages((prev) => [...prev, { id: messageId + 1, role: 'ai', text: res.text }]);
      setMessageId((v) => v + 1);
    } catch (error) {
      if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError') return;
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
      setMessages((prev) => [...prev, { id: messageId + 1, role: 'ai', text: errMsg, isError: !isRateLimit, isWarning: isRateLimit }]);
      setMessageId((v) => v + 1);
    } finally {
      // ── Always clear the loading state ──
      if (abortRef.current === controller) abortRef.current = null;
      setIsLoading(false);
    }
  }, [input, isLoading, messages, messageId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <div className="ai-chat-container">
      {/* ── Message list ── */}
      <div className="ai-chat-messages" ref={listRef}>
        {messages.map((msg) => (
          <div
            key={msg.id ?? `${msg.role}-${msg.text?.slice(0, 24)}`}
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
        <label htmlFor="ai-chat-input" className="sr-only">Ask a financial question</label>
        <input
          id="ai-chat-input"
          type="text"
          placeholder="Ask a financial question..."
          aria-label="Ask a financial question"
          value={input}
          maxLength={2000}
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