import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Heart, Lock } from 'lucide-react';
import { CoinwiseMark, CoinwiseBadge } from '../../components/CoinwiseBrand';

export default function LandingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="landing-footer">
      <div className="landing-container">
        <div className="footer-top">
          <div className="footer-brand-col">
            <Link 
              to="/welcome" 
              className="footer-brand"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label="MyCoinwise Home"
            >
              <CoinwiseBadge size={34} radius={10} variant="surface" aria-hidden="true">
                <CoinwiseMark size={18} color="#FC0100" aria-hidden="true" />
              </CoinwiseBadge>
              <span className="brand-text">MyCoinwise</span>
            </Link>
            <p className="footer-tagline">
              The intelligent, telemetry-driven personal finance operating system designed to elevate net worth, optimize tax liabilities, and protect discretionary budgets.
            </p>
            <div className="system-status">
              <span className="status-ping" aria-hidden="true">
                <span className="ping-dot" />
                <span className="ping-glow" />
              </span>
              <span>All Systems Operational (API v2.4)</span>
            </div>
          </div>

          <div className="footer-links-col">
            <h4 className="footer-heading">Product</h4>
            <ul className="footer-links">
              <li><a href="#features">Feature Bento</a></li>
              <li><a href="#simulator">Wealth Simulator</a></li>
              <li><a href="#comparison">Why MyCoinwise</a></li>
              <li><a href="#faq">FAQ</a></li>
              <li><Link to="/login">Account Login</Link></li>
            </ul>
          </div>

          <div className="footer-links-col">
            <h4 className="footer-heading">Features</h4>
            <ul className="footer-links">
              <li><Link to="/register">Budget Rollover Engine</Link></li>
              <li><Link to="/register">Dual Tax Regime Comparator</Link></li>
              <li><Link to="/register">Subscription Watchdog</Link></li>
              <li><Link to="/register">Net Worth Analytics</Link></li>
              <li><Link to="/register">Multi-Category Pipelines</Link></li>
            </ul>
          </div>

          <div className="footer-links-col">
            <h4 className="footer-heading">Trust & Security</h4>
            <div className="trust-card">
              <div className="trust-icon">
                <Shield aria-hidden="true" size={20} />
              </div>
              <div className="trust-details">
                <strong>Zero Ad Telemetry</strong>
                <p>Your financial records are isolated, encrypted, and never sold to third parties.</p>
              </div>
            </div>
            <div className="trust-badge-row">
              <span className="badge"><Lock aria-hidden="true" size={12} /> 256-bit TLS</span>
              <span className="badge"><Shield aria-hidden="true" size={12} /> Bcrypt Salted</span>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <div className="copyright">
            © {currentYear} MyCoinwise Inc. All rights reserved. Built for clarity and financial freedom.
          </div>
          <div className="footer-meta">
            <span>Crafted with <Heart className="heart-icon" aria-label="care" size={14} /> for intelligent savers</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
