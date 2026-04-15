/* eslint-disable no-unused-vars */
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(_error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '40px', 
          textAlign: 'center', 
          color: 'var(--text-primary)', 
          minHeight: '100vh', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: 'var(--surface-0)'
        }}>
          <h2 style={{ fontSize: '2.5rem', marginBottom: '16px', fontWeight: 800 }}>Oops, something went wrong.</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '1.2rem' }}>
            We've encountered an unexpected error catching that render.
          </p>
          <button 
            onClick={() => window.location.reload()} 
            style={{ 
              padding: '12px 28px', 
              background: 'var(--brand-primary)', 
              color: 'white', 
              border: 'none', 
              borderRadius: '12px', 
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '1.1rem',
              boxShadow: 'var(--shadow-brand)'
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
