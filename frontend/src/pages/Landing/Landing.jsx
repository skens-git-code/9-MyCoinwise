import React, { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Shield, TrendingUp } from 'lucide-react';

import LandingNavbar from './LandingNavbar';
import HeroSection from './HeroSection';
import FeaturesBento from './FeaturesBento';
import InteractiveSimulator from './InteractiveSimulator';
import ComparisonSection from './ComparisonSection';
import FaqSection from './FaqSection';
import LandingFooter from './LandingFooter';
import './landing.scss';

export default function Landing() {
  const prefersReduced = useReducedMotion();

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

      {/* Dynamic Ambient Mesh Background */}
      <div className="ambient-background" aria-hidden="true">
        <div className="glow-sphere sphere-1" />
        <div className="glow-sphere sphere-2" />
        <div className="glow-sphere sphere-3" />
        <div className="mesh-grid" />
      </div>

      {/* Navigation */}
      <LandingNavbar />

      <main id="main-content">
        {/* Hero Section */}
        <HeroSection />

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
              <div className="cta-content">
                <span className="section-pill">Start In 60 Seconds</span>
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
                  <Link to="/register" className="btn btn-primary btn-lg">
                    <span>Create Your Free Account</span>
                    <ArrowRight aria-hidden="true" size={18} />
                  </Link>
                  <Link to="/login" className="btn btn-outline btn-lg">
                    <span>Existing Member Sign In</span>
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <LandingFooter />
    </div>
  );
}
