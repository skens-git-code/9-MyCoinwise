import React, { useState, useEffect, useContext } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Rocket, Shield, Zap, Globe, Github, Twitter, Instagram, Facebook, Mail,
  Heart, Code, Sparkles, BrainCircuit, Users, Award, Clock
} from 'lucide-react';
import { AppContext } from '../contexts/AppContext';

// ==================== STATIC DATA ====================
const DEFAULT_STATS = {
  users: '10k+',
  managed: '$2B+',
  uptime: '99.9%',
};

const TEAM_MEMBERS = [
  { name: 'Alex Rivera', role: 'Founder & CEO', initials: 'AR', bio: 'Ex‑FinTech engineer with a passion for AI.' },
  { name: 'Jamie Chen', role: 'Head of Product', initials: 'JC', bio: 'Design‑led product strategist.' },
  { name: 'Taylor Singh', role: 'Lead Engineer', initials: 'TS', bio: 'Full‑stack architect and performance guru.' },
];

// ==================== MAIN COMPONENT ====================
export default function About({ stats = DEFAULT_STATS }) {
  const { t } = useContext(AppContext);
  // Detect reduced motion preference
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Animation variants – disabled when reduced motion is preferred
  const containerVariants = prefersReducedMotion
    ? { visible: { transition: { staggerChildren: 0 } } }
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.1, delayChildren: 0.1 },
        },
      };

  const itemVariants = prefersReducedMotion
    ? { visible: { y: 0, opacity: 1 } }
    : {
        hidden: { y: 20, opacity: 0 },
        visible: {
          y: 0,
          opacity: 1,
          transition: { type: 'spring', stiffness: 300, damping: 24 },
        },
      };

  const handleCalculatorClick = () => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'click', { event_category: 'engagement', event_label: 'calculator_cta' });
    }
  };

  return (
    <div className="island-page">
      <motion.div
        className="island-header glass-sm"
        initial={prefersReducedMotion ? { opacity: 1 } : { y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="ih-left">
          <div className="ih-titles">
            <h1>{t?.('about') || 'About Us'}</h1>
            <p>{t?.('about_hero_tag') || 'Meet the vision behind MyCoinwise'}</p>
          </div>
        </div>
      </motion.div>

      <div
        className="island-content-wrapper scroll-hide"
        style={{ padding: 'clamp(14px, 4vw, 24px)' }}
      >
        <motion.div
          className="about-container"
          style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Hero Section */}
          <motion.div
            variants={itemVariants}
            className="bento-tile-base glass"
            style={{
              padding: '48px 32px',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `radial-gradient(circle at 50% -20%, rgba(var(--brand-primary-rgb, 16, 185, 129), 0.15) 0%, transparent 60%)`,
              }}
              aria-hidden="true"
            />
            <motion.div
              animate={
                prefersReducedMotion
                  ? {}
                  : { rotate: [0, 5, -5, 0] }
              }
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                width: 80,
                height: 80,
                margin: '0 auto 24px',
                background: 'var(--brand-gradient)',
                borderRadius: 24,
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                boxShadow: '0 12px 32px var(--brand-glow)',
              }}
            >
              <Sparkles size={36} strokeWidth={2.5} />
            </motion.div>
            <h2
              style={{
                fontSize: 'clamp(2rem, 5vw, 3rem)',
                fontFamily: 'var(--font-head)',
                fontWeight: 800,
                letterSpacing: '-0.03em',
                marginBottom: 16,
              }}
            >
              {t?.('about_hero_title') || 'Empowering Next-Gen Financial Freedom'}
            </h2>
            <p
              style={{
                fontSize: '1.1rem',
                color: 'var(--text-secondary)',
                maxWidth: 600,
                margin: '0 auto',
                lineHeight: 1.6,
              }}
            >
              {t?.('about_hero_desc') || 'MyCoinwise delivers intelligent budgeting, wealth forecasting, and instant multi-currency analytics designed to keep your finances clear, secure, and thriving.'}
            </p>
          </motion.div>

          {/* Core Values Grid */}
          <motion.div
            variants={itemVariants}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {[
              {
                icon: BrainCircuit,
                title: 'AI‑Powered Insights',
                desc: 'Predictive forecasting and intelligent categorisation driven by advanced machine learning.',
              },
              {
                icon: Shield,
                title: 'Bank‑Grade Security',
                desc: 'Your data is encrypted, anonymized, and never sold to third parties.',
              },
              {
                icon: Zap,
                title: 'Lightning Fast',
                desc: 'Built for speed with real‑time syncing and an optimized architecture.',
              },
              {
                icon: Globe,
                title: 'Global Ready',
                desc: 'Multi‑currency support and real‑time exchange rates out of the box.',
              },
            ].map((value, i) => (
              <motion.div
                key={i}
                className="bento-tile-base glass-sm"
                whileHover={prefersReducedMotion ? {} : { y: -4 }}
                transition={{ duration: 0.2 }}
                style={{ padding: 24 }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: `rgba(var(--brand-primary-rgb, 16, 185, 129), 0.1)`,
                    color: 'var(--brand-primary)',
                    display: 'grid',
                    placeItems: 'center',
                    marginBottom: 16,
                  }}
                >
                  <value.icon size={22} strokeWidth={2.5} />
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>
                  {value.title}
                </h3>
                <p
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.95rem',
                    lineHeight: 1.5,
                  }}
                >
                  {value.desc}
                </p>
              </motion.div>
            ))}
          </motion.div>

          {/* Team Section (NEW) */}
          <motion.div variants={itemVariants}>
            <h3
              style={{
                fontSize: '1.4rem',
                fontWeight: 700,
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <Users size={24} className="text-primary" /> Meet the Team
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 16,
              }}
            >
              {TEAM_MEMBERS.map((member) => (
                <div
                  key={member.name}
                  className="bento-tile-base glass-sm"
                  style={{ padding: 24, textAlign: 'center' }}
                >
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, var(--brand-primary), var(--brand-secondary))`,
                      display: 'grid',
                      placeItems: 'center',
                      margin: '0 auto 12px',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '1.4rem',
                    }}
                  >
                    {member.initials}
                  </div>
                  <h4 style={{ fontWeight: 600, marginBottom: 4 }}>{member.name}</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {member.role}
                  </p>
                  <p
                    style={{
                      fontSize: '0.85rem',
                      color: 'var(--text-secondary)',
                      marginTop: 8,
                    }}
                  >
                    {member.bio}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Developer / Mission Section */}
          <motion.div
            variants={itemVariants}
            style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}
          >
            <div
              className="bento-tile-base glass-sm"
              style={{
                padding: '32px',
                display: 'flex',
                gap: 24,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <div style={{ flex: 1, minWidth: 280 }}>
                <h3
                  style={{
                    fontSize: '1.4rem',
                    fontFamily: 'var(--font-head)',
                    fontWeight: 700,
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Code size={24} className="text-primary" /> Crafted with
                  Precision
                </h3>
                <p
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: '1rem',
                    lineHeight: 1.6,
                    marginBottom: 20,
                  }}
                >
                  We believe financial tools shouldn't look like boring
                  spreadsheets. We built MyCoinwise to bring the fluid, premium
                  experience of modern mobile apps to the world of personal
                  wealth tracking on all your devices.
                </p>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <a
                    href="https://github.com/your-repo" // Replace with actual URL
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                    style={{
                      padding: '10px 16px',
                      display: 'inline-flex',
                      gap: 8,
                      alignItems: 'center',
                      borderRadius: 12,
                      textDecoration: 'none',
                    }}
                  >
                    <Github size={18} /> Source Code
                  </a>
                  <a
                    href="https://twitter.com/your-handle" // Replace with actual URL
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary"
                    style={{
                      padding: '10px 16px',
                      display: 'inline-flex',
                      gap: 8,
                      alignItems: 'center',
                      borderRadius: 12,
                      textDecoration: 'none',
                    }}
                  >
                    <Twitter size={18} /> Follow Us
                  </a>
                </div>
                <div
                  className="about-social-links"
                  style={{ marginTop: 16, display: 'flex', gap: 12 }}
                  aria-label="Social media links"
                >
                  <a
                    href="https://instagram.com/your-handle" // Replace with actual URL
                    target="_blank"
                    rel="noopener noreferrer"
                    className="about-social-link instagram"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', textDecoration: 'none' }}
                    aria-label="Instagram (coming soon)"
                  >
                    <Instagram size={18} /> Instagram <span style={{ fontSize: '0.7rem', background: 'var(--glass-2)', padding: '2px 8px', borderRadius: 12 }}>Coming soon</span>
                  </a>
                  <a
                    href="https://facebook.com/your-handle" // Replace with actual URL
                    target="_blank"
                    rel="noopener noreferrer"
                    className="about-social-link facebook"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', textDecoration: 'none' }}
                    aria-label="Facebook (coming soon)"
                  >
                    <Facebook size={18} /> Facebook <span style={{ fontSize: '0.7rem', background: 'var(--glass-2)', padding: '2px 8px', borderRadius: 12 }}>Coming soon</span>
                  </a>
                </div>
              </div>
              <div
                style={{
                  width: 140,
                  height: 140,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, rgba(var(--brand-primary-rgb, 16, 185, 129), 0.2), rgba(139,92,246,0.2))`,
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto',
                }}
              >
                <Heart
                  size={48}
                  color="var(--brand-primary)"
                  fill={`rgba(var(--brand-primary-rgb, 16, 185, 129), 0.2)`}
                />
              </div>
            </div>
          </motion.div>

          {/* Calculator CTA */}
          <motion.div
            variants={itemVariants}
            className="about-calculator-cta glass-sm"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px 24px',
              borderRadius: '16px',
              border: '1px solid var(--glass-border)',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div
              className="about-calculator-cta-icon"
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: `rgba(var(--brand-primary-rgb, 16, 185, 129), 0.15)`,
                display: 'grid',
                placeItems: 'center',
                color: 'var(--brand-primary)',
              }}
            >
              <Sparkles size={22} />
            </div>
            <div style={{ flex: 1 }}>
              <span
                className="calculator-eyebrow"
                style={{
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: 'var(--text-muted)',
                }}
              >
                New in MyCoinwise
              </span>
              <h3 style={{ margin: '4px 0', fontSize: '1.1rem' }}>
                Make every number useful.
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                Explore the new scientific calculator with trigonometry, powers,
                memory, history, and keyboard support.
              </p>
            </div>
            <Link
              to="/calculator"
              className="btn-primary about-calculator-link"
              onClick={handleCalculatorClick}
              style={{
                padding: '10px 20px',
                borderRadius: 12,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              Open Calculator
            </Link>
          </motion.div>

          {/* Stats Footer */}
          <motion.div
            variants={itemVariants}
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 24,
              padding: '24px 0',
              borderTop: '1px solid var(--glass-border)',
              flexWrap: 'wrap',
            }}
          >
            {[
              { label: 'Users', value: stats.users },
              { label: 'Managed', value: stats.managed },
              { label: 'Uptime', value: stats.uptime },
            ].map((stat) => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 800,
                    color: 'var(--text-primary)',
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
