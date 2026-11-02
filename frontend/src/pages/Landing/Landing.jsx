import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Shield, TrendingUp, Zap, Lock, Sparkles, Award } from 'lucide-react';

import LandingNavbar from './LandingNavbar';
import HeroSection from './HeroSection';
import FeaturesBento from './FeaturesBento';
import InteractiveSimulator from './InteractiveSimulator';
import ComparisonSection from './ComparisonSection';
import FaqSection from './FaqSection';
import LandingFooter from './LandingFooter';
import AmbientCurrencyParticles from './AmbientCurrencyParticles';
import VaultModal from './VaultModal';
import './landing.scss';

const KONAMI_SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a'
];

export default function Landing() {
  const prefersReduced = useReducedMotion();
  const [vaultOpen, setVaultOpen] = useState(false);

  // Konami Code Easter Egg Listener
  useEffect(() => {
    let keyIndex = 0;

    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const key = e.key.toLowerCase() === 'b' ? 'b' : e.key.toLowerCase() === 'a' ? 'a' : e.key;

      if (key === KONAMI_SEQUENCE[keyIndex]) {
        keyIndex += 1;
        if (keyIndex === KONAMI_SEQUENCE.length) {
          setVaultOpen(true);
          keyIndex = 0;
        }
      } else {
        keyIndex = 0;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Enable seamless window scrolling across mobile and desktop
  useEffect(() => {
    document.documentElement.classList.add('landing-viewport-scrollable');
    document.body.classList.add('landing-viewport-scrollable');
    return () => {
      document.documentElement.classList.remove('landing-viewport-scrollable');
      document.body.classList.remove('landing-viewport-scrollable');
    };
  }, []);

  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'MyCoinwise — Intelligent Personal Finance, Budgeting & Tax Operating System';

    // Update meta description if available
    let metaDesc = document.querySelector('meta[name="description"]');
    const originalDesc = metaDesc ? metaDesc.getAttribute('content') : '';
    if (metaDesc) {
      metaDesc.setAttribute(
        'content',
        'Take executive control of your personal wealth. Automated budget rollover, dual tax regime comparison, smart subscription tracking, and real-time net worth intelligence.'
      );
    }

    return () => {
      document.title = originalTitle;
      if (metaDesc && originalDesc) {
        metaDesc.setAttribute('content', originalDesc);
      }
    };
  }, []);

  return (
    <div className="landing-page" data-testid="landing-page-root">
      {/* Skip Link for Keyboard/Screen-Reader Accessibility (WCAG 2.4.1) */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Dynamic Ambient Mesh Background with Multi-Tier Glows */}
      <div className="ambient-background" aria-hidden="true">
        <div className="glow-sphere sphere-1" />
        <div className="glow-sphere sphere-2" />
        <div className="glow-sphere sphere-3" />
        <div className="mesh-grid" />
        <AmbientCurrencyParticles prefersReduced={prefersReduced} />
        <div className="noise-texture-overlay" />
      </div>

      {/* Modern Sticky Navigation */}
      <LandingNavbar />

      {/* Secret Vault Easter Egg Modal */}
      <VaultModal isOpen={vaultOpen} onClose={() => setVaultOpen(false)} />

      <main id="main-content" role="main">
        {/* Hero Section */}
        <HeroSection />

        {/* Dynamic Telemetry Proof Strip */}
        <section className="landing-proof-ticker" aria-label="Platform Highlights">
          <div className="landing-container">
            <div className="proof-ticker-grid">
              <div className="ticker-card">
                <div className="ticker-icon">
                  <TrendingUp size={18} className="text-emerald" aria-hidden="true" />
                </div>
                <div className="ticker-info">
                  <strong>Dual-Regime</strong>
                  <span>Tax Engine Ready</span>
                </div>
              </div>
              <div className="ticker-card">
                <div className="ticker-icon">
                  <Zap size={18} className="text-cyan" aria-hidden="true" />
                </div>
                <div className="ticker-info">
                  <strong>Sub-100ms</strong>
                  <span>Local Telemetry</span>
                </div>
              </div>
              <div className="ticker-card">
                <div className="ticker-icon">
                  <Lock size={18} className="text-emerald" aria-hidden="true" />
                </div>
                <div className="ticker-info">
                  <strong>100%</strong>
                  <span>Zero Ad Selling</span>
                </div>
              </div>
              <div className="ticker-card">
                <div className="ticker-icon">
                  <Award size={18} className="text-amber" aria-hidden="true" />
                </div>
                <div className="ticker-info">
                  <strong>Automated</strong>
                  <span>Budget Rollovers</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Feature Bento Grid */}
        <FeaturesBento />

        {/* Dynamic Wealth Simulator */}
        <InteractiveSimulator />

        {/* Why MyCoinwise Comparison */}
        <ComparisonSection />

        {/* FAQ Accordion */}
        <FaqSection />

        {/* High-Impact CTA Banner */}
        <section className="landing-cta-banner">
          <div className="landing-container">
            <motion.div
              className="cta-banner-card"
              initial={prefersReduced ? false : { opacity: 0, scale: 0.96 }}
              whileInView={prefersReduced ? undefined : { opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5 }}
            >
              <div className="cta-ambient-glow" aria-hidden="true" />
              <div className="cta-content">
                <span className="section-pill">
                  <Sparkles size={13} aria-hidden="true" />
                  <span>Start In 60 Seconds</span>
                </span>
                <h2>Your Financial Independence Begins with Clarity</h2>
                <p>
                  Join smart professionals and families using MyCoinwise to optimize cashflow, eliminate budget leaks, and build lasting wealth.
                </p>
                <div className="cta-perks">
                  <span><CheckCircle2 aria-hidden="true" size={16} /> Completely Free Core Plan</span>
                  <span><Shield aria-hidden="true" size={16} /> Bank-Grade Encryption</span>
                  <span><TrendingUp aria-hidden="true" size={16} /> Zero Credit Card Required</span>
                </div>
                <div className="cta-actions">
                  <Link to="/register" className="btn-landing-primary btn-lg">
                    <span>Create Your Free Account</span>
                    <ArrowRight aria-hidden="true" size={18} />
                  </Link>
                  <Link to="/login" className="btn-landing-glass btn-lg">
                    <span>Existing Member Sign In</span>
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Modern Footer */}
      <LandingFooter />
    </div>
  );
}
