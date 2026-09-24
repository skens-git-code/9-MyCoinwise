/* —————————————————————————————————————
 * ErrorBoundary Component
 * React error boundary that catches render errors in its subtree
 * and shows a fallback UI with retry / reload actions.
 *
 * Props:
 *   - children   : subtree to protect.
 *   - resetKeys  : optional array; when any entry changes, the
 *                  boundary auto-resets.
 *   - onReset    : optional callback fired after reset.
 *   - fullScreen : when not false, the fallback fills the viewport
 *                  and uses the base surface background (default true).
 *
 * Behavior:
 *   - Errors are logged via console.error and stored on state.
 *   - "Try Again" resets internal state and calls onReset.
 *   - "Reload Application" performs a full page reload.
 *   - Reset is auto-triggered when resetKeys change (shallow compare).
 * ————————————————————————————————————— */

import React from 'react';

/* —————————————————————————————————————
 * Error Boundary Class
 * ————————————————————————————————————— */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    // ── Boundary state: hasError flag and captured error info ──
    this.state = { hasError: false, errorInfo: null };
  }

  // ── Flip into the error state when a child throws ──
  static getDerivedStateFromError(_error) {
    return { hasError: true };
  }

  // ── Capture and log error details when a child throws ──
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  // ── Auto-reset when any resetKeys entry changes ──
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

  // ── Clear error state and notify the parent ──
  handleReset = () => {
    this.setState({ hasError: false, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    // ── Fallback UI when an error has been caught ──
    if (this.state.hasError) {
      // fullScreen defaults to true; callers can opt into a 60vh inline
      // fallback by passing fullScreen={false}.
      const isFullScreen = this.props.fullScreen !== false;
      return (
        <div style={{ 
          padding: '40px', 
          textAlign: 'center', 
          color: 'var(--text-primary)', 
          minHeight: isFullScreen ? '100vh' : '60vh', 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: isFullScreen ? 'var(--surface-0)' : 'transparent'
        }}>
          {/* ── Fallback heading ── */}
          <h2 style={{ fontSize: '2rem', marginBottom: '16px', fontWeight: 800 }}>Oops, something went wrong.</h2>

          {/* ── Fallback explanation ── */}
          <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', fontSize: '1.1rem' }}>
            We've encountered an unexpected error catching that render.
          </p>

          {/* ── Recovery actions ── */}
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

    // ── No error: render the protected subtree ──
    return this.props.children;
  }
}

export default ErrorBoundary;