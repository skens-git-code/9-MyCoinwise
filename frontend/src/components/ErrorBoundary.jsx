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

  componentDidUpdate(prevProps) {
    if (this.state.hasError && this.props.resetKeys) {
      const hasChanged = this.props.resetKeys.some(
        (key, idx) => key !== prevProps.resetKeys?.[idx]
      );
      if (hasChanged) {
        this.handleReset();
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

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
          <h2 style={{ fontSize: '2rem', marginBottom: '16px', fontWeight: 800 }}>Oops, something went wrong.</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '1.1rem' }}>
            We've encountered an unexpected error catching that render.
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button 
              type="button"
              onClick={this.handleReset}
              style={{ 
                padding: '12px 24px', 
                background: 'var(--surface-2, rgba(255,255,255,0.08))', 
                color: 'var(--text-primary)', 
                border: '1px solid var(--border-color, rgba(255,255,255,0.15))', 
                borderRadius: '12px', 
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '1rem',
              }}
            >
              Try Again
            </button>
            <button 
              type="button"
              onClick={() => window.location.reload()} 
              style={{ 
                padding: '12px 28px', 
                background: 'var(--brand-primary)', 
                color: 'white', 
                border: 'none', 
                borderRadius: '12px', 
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '1rem',
                boxShadow: 'var(--shadow-brand)'
              }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
