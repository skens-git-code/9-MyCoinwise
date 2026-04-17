import React, { useState, useRef, useEffect } from 'react';
import { Send, User as UserIcon, Sparkles, Loader } from 'lucide-react';
import { api } from '../services/api';

const AIChat = () => {
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hello! I am your MyCoinwise assistant. How can I help you understand your finances today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const endOfMessagesRef = useRef(null);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = { role: 'user', text: input.trim() };
    const chatHistory = [...messages];
    
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await api.chatWithAI(userMessage.text, chatHistory);
      setMessages((prev) => [...prev, { role: 'ai', text: res.text }]);
    } catch (error) {
      console.error('Chat Error:', error);
      const status = error.response?.status;
      const serverMsg = error.response?.data?.error;

      let errMsg;
      let isRateLimit = false;

      if (status === 429) {
        isRateLimit = true;
        errMsg = '⏳ The AI is a bit busy right now (rate limit reached). Please wait 15-30 seconds and try again.';
      } else if (status === 503) {
        errMsg = serverMsg || '🔧 AI service is not configured yet. Please add your GEMINI_API_KEY to the backend .env file.';
      } else {
        errMsg = serverMsg || 'Sorry, I encountered an issue. Please try again.';
      }

      setMessages((prev) => [...prev, { role: 'ai', text: errMsg, isError: !isRateLimit, isWarning: isRateLimit }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ai-chat-container">
      <div className="ai-chat-messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-bubble ${msg.role === 'user' ? 'user-msg' : 'ai-msg'} ${msg.isError ? 'error-msg' : ''} ${msg.isWarning ? 'warning-msg' : ''}`}>
            <div className="bubble-icon">
              {msg.role === 'user' ? <UserIcon size={16} /> : <Sparkles size={16} />}
            </div>
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
        {isLoading && (
          <div className="chat-bubble ai-msg">
            <div className="bubble-icon"><Sparkles size={16} /></div>
            <div className="bubble-text loading-dots">
              <Loader size={16} className="spinner" /> Thinking...
            </div>
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>

      <form className="ai-chat-input-area" onSubmit={handleSend}>
        <input 
          type="text" 
          placeholder="Ask a financial question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
        />
        <button type="submit" className="send-btn" disabled={!input.trim() || isLoading}>
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};

export default AIChat;
