import React from 'react';
import { motion } from 'framer-motion';
import { 
  Rocket, Shield, Zap, Globe, Github, Twitter, Mail, 
  Heart, Code, Sparkles, BrainCircuit
} from 'lucide-react';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: { 
    y: 0, opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};

export default function About() {
  return (
    <div className="island-page">
      <motion.div 
        className="island-header glass-sm"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="ih-left">
          <div className="ih-titles">
            <h1>About Us</h1>
            <p>Meet the vision behind MyCoinwise</p>
          </div>
        </div>
      </motion.div>

      <div className="island-content-wrapper scroll-hide" style={{ padding: 'clamp(14px, 4vw, 24px)' }}>
        <motion.div 
          className="about-container" 
          style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          
          {/* Hero Section */}
          <motion.div variants={itemVariants} className="bento-tile-base glass" style={{ padding: '48px 32px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% -20%, rgba(var(--brand-primary-rgb), 0.15) 0%, transparent 60%)' }} aria-hidden="true" />
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: 80, height: 80, margin: '0 auto 24px', background: 'var(--brand-gradient)', borderRadius: 24, display: 'grid', placeItems: 'center', color: '#fff', boxShadow: '0 12px 32px var(--brand-glow)' }}
            >
              <Sparkles size={36} strokeWidth={2.5} />
            </motion.div>
            <h2 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontFamily: 'var(--font-head)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 16 }}>
              Redefining Personal Finance
            </h2>
            <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
              MyCoinwise is a next-generation AI-powered wealth management platform designed to provide beautiful, intuitive, and actionable insights into your financial life.
            </p>
          </motion.div>

          {/* Core Values Grid */}
          <motion.div variants={itemVariants} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {[
              { icon: BrainCircuit, title: 'AI-Powered Insights', desc: 'Predictive forecasting and intelligent categorisation driven by advanced machine learning.' },
              { icon: Shield, title: 'Bank-Grade Security', desc: 'Your data is encrypted, anonymized, and never sold to third parties.' },
              { icon: Zap, title: 'Lightning Fast', desc: 'Built for speed with real-time syncing and an optimized architecture.' },
              { icon: Globe, title: 'Global Ready', desc: 'Multi-currency support and real-time exchange rates out of the box.' }
            ].map((value, i) => (
              <motion.div key={i} className="bento-tile-base glass-sm" whileHover={{ y: -4, transition: { duration: 0.2 } }} style={{ padding: 24 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(var(--brand-primary-rgb), 0.1)', color: 'var(--brand-primary)', display: 'grid', placeItems: 'center', marginBottom: 16 }}>
                  <value.icon size={22} strokeWidth={2.5} />
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 8 }}>{value.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.5 }}>{value.desc}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Developer / Mission Section */}
          <motion.div variants={itemVariants} style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            <div className="bento-tile-base glass-sm" style={{ padding: '32px', display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 280 }}>
                <h3 style={{ fontSize: '1.4rem', fontFamily: 'var(--font-head)', fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Code size={24} className="text-primary" /> Crafted with Precision
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6, marginBottom: 20 }}>
                  We believe financial tools shouldn't look like boring spreadsheets. We built MyCoinwise to bring the fluid, premium experience of modern mobile apps to the world of personal wealth tracking on all your devices.
                </p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <a href="#" className="btn-secondary" style={{ padding: '10px 16px', display: 'inline-flex', gap: 8, alignItems: 'center', borderRadius: 12, textDecoration: 'none' }}>
                    <Github size={18} /> Source Code
                  </a>
                  <a href="#" className="btn-secondary" style={{ padding: '10px 16px', display: 'inline-flex', gap: 8, alignItems: 'center', borderRadius: 12, textDecoration: 'none' }}>
                    <Twitter size={18} /> Follow Us
                  </a>
                </div>
              </div>
              <div style={{ width: 140, height: 140, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(139,92,246,0.2))', border: '1px solid rgba(255,255,255,0.1)', display: 'grid', placeItems: 'center', margin: '0 auto' }}>
                <Heart size={48} color="var(--brand-primary)" fill="rgba(var(--brand-primary-rgb), 0.2)" />
              </div>
            </div>
          </motion.div>

          {/* Footer stats */}
          <motion.div variants={itemVariants} style={{ display: 'flex', justifyContent: 'center', gap: 24, padding: '24px 0', borderTop: '1px solid var(--glass-border)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>10k+</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Users</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>$2B+</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Managed</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>99.9%</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Uptime</div>
            </div>
          </motion.div>

        </motion.div>
      </div>
    </div>
  );
}
