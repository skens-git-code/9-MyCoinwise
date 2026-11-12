/* —————————————————————————————————————
 * About Page
 * Personal "about" page presenting the creator's identity, mission,
 * focus areas, tech stack, tools, ventures, timeline, principles,
 * goals, and contact info.
 *
 * Props:
 *   - stats : optional override for the four highlight tiles.
 *
 * Key behaviors:
 *   - Respects `prefers-reduced-motion` — all Framer Motion
 *     animations are disabled when the OS setting is on.
 *   - Staggered section reveal via shared `containerVariants` and
 *     per-section `itemVariants`.
 *   - Profile image floats gently when motion is allowed.
 *   - Tool cards and focus cards lift on hover (motion only).
 *   - All static content (profile, tools, ventures, timeline, etc.)
 *     lives in module-level constants so the JSX stays declarative.
 * ————————————————————————————————————— */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Rocket, Shield, Zap, Globe, Github, Twitter, Instagram, Facebook, Mail,
  Heart, Code, Sparkles, BrainCircuit, Users, Award, Clock, MapPin,
  GraduationCap, Briefcase, Terminal, Database, Cloud, Cpu, BookOpen,
  CheckCircle2, ArrowRight, Linkedin, Calculator, Star, Coffee,
  Layers, Wrench, Target, Quote, ExternalLink
} from 'lucide-react';
import { useAppActions } from '../contexts/AppContext';

/* ============================================================
   Static Data — Single Creator Profile
   ============================================================ */

// ── Default highlight tile values (overridable via props) ──
const DEFAULT_STATS = {
  projects: '20+',
  contributions: '1000+',
  tools: '4',
  ventures: '2',
};

// ── Profile: identity, contact, bio, and mission ──
const PROFILE = {
  name: 'Sarthak Mathapati',
  initials: 'SM',
  role: 'ASI Software Engineer & Web Developer',
  tagline: 'Disciplina · Execucao · Foco',
  location: 'Newton School Of Technology, Delhi',
  email: 'sarthak_m@skens.space',
  mantra: '#BuildingWithInnovation',
  portfolioUrl: 'https://www.skens.space/',
  mission:
    "Most developers build clunky garbage and call it 'intuitive.' I design software that actually works under real pressure—tackling the complex engineering challenges you only pretend to understand.",
  intro:
    "I’m Sarthak Mathapati, an ASI Software Engineer. Precision architecture, ruthless efficiency. Building intelligent systems that work flawlessly at scale, translating complex neural architectures into relentless, production-grade reality.",
  bio: [
    "Hi! I'm Sarthak Sidalingayya Mathapati, a 3rd-year B.Tech student in Computer Science & Artificial Intelligence at Newton School of Technology (in collaboration with Rishihood University).",
    "Born in Sawantwadi and raised across Kolhapur to Delhi, experiencing diverse cultures has profoundly shaped how I think, collaborate, and engineer solutions. I'm driven by the goal of crafting human-centered tech products with clean architectures and memorable experiences.",
    "Architecting distributed full-stack systems, exploring Deep Learning & ASI, and shipping low-latency interactive applications — guided by #BuildingWithInnovation.",
  ],
};

/* ============================================================
   Image Assets — Approved Assets from skens.space
   ============================================================ */

const IMAGES = {
  profile: 'https://i.ibb.co/hRXBg5SR/Whats-App-Image-2026-10-24-at-17-11-37.jpg',
  profileAlt: 'https://i.ibb.co/9HzVY6p5/Whats-App-Image-2026-10-22-at-15-54-52.jpg',

  projects: {
    mycoinwise: 'https://i.ibb.co/wFZqTy5m/image.png',
    mycoinwiseShowcase: 'https://i.ibb.co/Z6NGWNmJ/Whats-App-Image-2026-10-23-at-04-50-22.jpg',
  },

  tools: {
    mathens: 'https://images.unsplash.com/photo-1518770660439-4636190af475?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=85',
    cryptens: 'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=85',
    battlens: 'https://i.ibb.co/Z6NGWNmJ/Whats-App-Image-2026-10-23-at-04-50-22.jpg',
    achievens: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=85',
  },

  ventures: {
    skens: 'https://i.ibb.co/wFZqTy5m/image.png',
    leaflix: 'https://images.unsplash.com/photo-1521737711867-e3b97375f902?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=85',
  },

  testimonials: {
    arpita: 'https://4kwallpapers.com/images/walls/thumbs_3t/27474.png',
    rahul: 'https://4kwallpapers.com/images/walls/thumbs_3t/978.png',
    siddhi: 'https://4kwallpapers.com/images/walls/thumbs_3t/973.png',
  },
};

// ── Social links ──
const SOCIALS = [
  { label: 'GitHub', href: 'https://github.com/skens-git-code', icon: Github },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/sarthak-mathapati-b2b04430a/', icon: Linkedin },
  { label: 'X / Twitter', href: 'https://x.com/mathapatism8', icon: Twitter },
  { label: 'Instagram', href: 'https://www.instagram.com/lethal_sinister.bleed/', icon: Instagram },
];

// ── Focus areas shown as hover-lift cards ──
const FOCUS_AREAS = [
  {
    icon: BrainCircuit,
    title: 'AI & ASI Engineering',
    desc: 'Architecting intelligent systems, deep learning pipelines, and autonomous LLM workflows with PyTorch, TensorFlow, and LangChain.',
  },
  {
    icon: Code,
    title: 'Distributed Full-Stack',
    desc: 'End-to-end production systems with React, Next.js, Node.js, FastAPI, MongoDB, and PostgreSQL — engineered for scale.',
  },
  {
    icon: Sparkles,
    title: 'Low-Latency Interfaces',
    desc: 'Motion-rich, responsive, accessible interfaces built for 60fps clarity across desktop, tablet, and mobile.',
  },
  {
    icon: Shield,
    title: 'Secure by Default',
    desc: 'Zero-trust auth flows, strict input validation, and data ownership. Security is built into the architecture.',
  },
];

// ── Tech stack grouped by discipline ──
const TECH_GROUPS = [
  { label: 'Frontend', icon: Layers, items: ['React.js', 'Next.js', 'TypeScript', 'Tailwind CSS', 'Three.js', 'HTML5/CSS3'] },
  { label: 'Backend', icon: Terminal, items: ['Node.js', 'Python', 'Express.js', 'FastAPI', 'REST APIs', 'WebSockets'] },
  { label: 'Data', icon: Database, items: ['MongoDB', 'PostgreSQL', 'Redis', 'MySQL', 'Prisma', 'Firestore'] },
  { label: 'Cloud & DevOps', icon: Cloud, items: ['AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Edge CDN', 'Linux OS'] },
  { label: 'AI / ASI Ecosystem', icon: Cpu, items: ['Claude', 'OpenAI', 'DeepSeek', 'Gemini 2.0', 'Antigravity', 'PyTorch', 'LangChain'] },
];

// ── Shipped tools with preview images and tags ──
const TOOLS = [
  {
    name: 'Mathens.io',
    icon: Calculator,
    href: 'https://skens-git-code.github.io/2-Calculator/',
    desc: 'Powerful personal calculator — fast, intelligent and precise math companion for everyone.',
    image: IMAGES.tools.mathens,
    tags: ['React', 'Math', 'Utility'],
  },
  {
    name: 'CryptEns.io',
    icon: Shield,
    href: 'https://skens-git-code.github.io/3-PW-Generator/',
    desc: 'Secure password generator — create robust, uncrackable keys to protect your digital identity.',
    image: IMAGES.tools.cryptens,
    tags: ['Security', 'Generator', 'Utility'],
  },
  {
    name: 'Battlens.io',
    icon: Zap,
    href: 'https://skens-git-code.github.io/4-RPS-Game/',
    desc: 'Classic Rock Paper Scissors — test your luck and strategy against the computer.',
    image: IMAGES.tools.battlens,
    tags: ['Game', 'Interactive', 'Fun'],
  },
  {
    name: 'Achievens.io',
    icon: CheckCircle2,
    href: 'https://skens-git-code.github.io/5-To-Do-App/',
    desc: 'Minimalist task manager — streamline your goals and boost productivity with an intuitive list.',
    image: IMAGES.tools.achievens,
    tags: ['Productivity', 'Task Management', 'Utility'],
  },
];

// ── Ventures founded/co-founded ──
const VENTURES = [
  {
    name: 'Skens.inc',
    role: 'Founder',
    desc: 'A product studio turning ideas into shipped software — apps, tools and AI-first experiments.',
    image: IMAGES.ventures.skens,
  },
  {
    name: 'Leaflix.inc',
    role: 'Co-Founder',
    desc: 'An education-forward venture exploring how technology can make learning more personal.',
    image: IMAGES.ventures.leaflix,
  },
];

// ── Career timeline entries ──
const TIMELINE = [
  {
    period: '2026 — Present',
    title: 'Newton School of Technology',
    desc: 'B.Tech in Computer Science & Artificial Intelligence (Rishihood University) — practical software engineering, AI, and entrepreneurship.',
  },
  {
    period: '2026 — Present',
    title: 'Founder & Developer · Skens.inc & Leaflix.inc',
    desc: 'Leading product ideation, engineering web platforms, and launching digital ventures.',
  },
  {
    period: '2023 — 2026',
    title: 'Full-Stack Mastery',
    desc: 'Built responsive web applications, mastered React, Node.js, databases, and UI/UX design patterns.',
  },
];

// ── Personal principles / habits ──
const PRINCIPLES = [
  'Daily Code Rhythm',
  'Continuous Learning',
  'Health First',
  'Open Source Mindset',
  'System Documentation',
  'Empowering Others',
];

// ── Goals split by horizon ──
const GOALS = [
  {
    horizon: 'Short Term · 2025',
    items: [
      'Launch Skens MVP',
      'Contribute to 5+ open source projects',
      'Master Data Structures & Algorithms',
      'Investigating recursive self-improvement, neural scaling laws, and scalable oversight systems toward ASI.',
    ],
  },
  {
    horizon: 'Medium Term · 2026–27',
    items: [
      'Scale startup to 100K+ users',
      'Speak at international tech conferences',
      'Launch AI-powered SaaS product',
      'Build developer community of 10K+ members',
    ],
  },
  {
    horizon: 'Long Term · 2028+',
    items: [
      'Establish tech ventures platform',
      'Invest in early-stage tech startups',
      'Author a treatise framing human lifecycle phases through systems architecture & feedback loops',
      'Create foundation for tech education in rural areas',
    ],
  },
];

// ── Client Testimonials (approved assets from skens.space) ──
const TESTIMONIALS = [
  {
    name: 'Arpita Patil',
    role: 'CTO, TechSolutions Inc.',
    avatar: IMAGES.testimonials.arpita,
    quote:
      'Sarthak delivered an exceptional website that exceeded our expectations. His attention to detail and technical expertise made the entire process smooth and efficient.',
  },
  {
    name: 'Rahul Diwedi',
    role: 'Marketing Director, Innovate Co.',
    avatar: IMAGES.testimonials.rahul,
    quote:
      'Working with Sarthak was a game-changer for our business. He transformed our outdated website into a modern, responsive platform that has significantly improved our user engagement.',
  },
  {
    name: 'Siddhi Miglani',
    role: 'Founder, Creative Studio',
    avatar: IMAGES.testimonials.siddhi,
    quote:
      "Sarthak's ability to understand our vision and translate it into a functional, beautiful website was impressive. His communication throughout the project was excellent.",
  },
];

/* ============================================================
   Small Presentational Helpers
   ============================================================ */

// ── Shared card padding/border-radius ──
const glassCard = {
  padding: 24,
  borderRadius: 20,
};

// ── Section header with icon, title, and optional subtitle ──
function SectionTitle({ icon: Icon, children, sub }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h3
        style={{
          fontSize: 'clamp(1.05rem, 2.4vw, 1.3rem)',
          fontWeight: 700,
          fontFamily: 'var(--font-head)',
          letterSpacing: '-0.01em',
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        {/* ── Icon badge ── */}
        <span
          aria-hidden="true"
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(var(--brand-primary-rgb, 16, 185, 129), 0.12)',
            color: 'var(--brand-primary)',
            flexShrink: 0,
          }}
        >
          <Icon size={17} strokeWidth={2.5} />
        </span>
        {children}
      </h3>

      {/* ── Optional subtitle ── */}
      {sub && (
        <p
          style={{
            margin: '8px 0 0 42px',
            color: 'var(--text-secondary)',
            fontSize: '0.92rem',
            lineHeight: 1.55,
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

// ── Small rounded label used for tech and metadata ──
function Chip({ children }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '6px 12px',
        borderRadius: 999,
        fontSize: '0.78rem',
        fontWeight: 600,
        letterSpacing: '0.01em',
        background: 'var(--glass-2, rgba(255,255,255,0.06))',
        border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
        color: 'var(--text-secondary)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/* ============================================================
   Main Component
   ============================================================ */

export default function About({ stats = DEFAULT_STATS }) {
  // ── i18n ──
  const { t } = useAppActions();
  const [portraitIndex, setPortraitIndex] = useState(0);
  const [profileImgError, setProfileImgError] = useState(false);
  const portraits = [IMAGES.profile, IMAGES.profileAlt];

  // ── Respect the OS-level reduced-motion preference ──
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // ── Keep the reduced-motion flag in sync with OS changes ──
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // ── Container variants: stagger children unless reduced motion ──
  const containerVariants = prefersReducedMotion
    ? { visible: { transition: { staggerChildren: 0 } } }
    : {
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.08, delayChildren: 0.05 },
        },
      };

  // ── Item variants: fade/slide in unless reduced motion ──
  const itemVariants = prefersReducedMotion
    ? { visible: { y: 0, opacity: 1 } }
    : {
        hidden: { y: 18, opacity: 0 },
        visible: {
          y: 0,
          opacity: 1,
          transition: { type: 'spring', stiffness: 280, damping: 26 },
        },
      };

  // ── Hover lift for interactive cards (empty when reduced motion) ──
  const hoverLift = prefersReducedMotion ? {} : { y: -4 };

  // ── Highlight tiles derived from stats ──
  const statTiles = [
    { label: 'Projects Shipped', value: stats.projects },
    { label: 'GitHub Contributions', value: stats.contributions },
    { label: 'Live Tools', value: stats.tools },
    { label: 'Ventures Founded', value: stats.ventures },
  ];

  return (
    <div className="about-page" style={{ width: '100%' }}>
      {/* ==================== Header ==================== */}
      <motion.div
        className="island-header glass-sm"
        initial={prefersReducedMotion ? { opacity: 1 } : { y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <div className="ih-left">
          <div className="ih-titles">
            <h1>{t?.('about') || 'About'}</h1>
            <p>{t?.('about_hero_tag') || 'The builder behind the product'}</p>
          </div>
        </div>
      </motion.div>

      <div className="about-content" style={{ width: '100%' }}>
        <motion.div
          className="about-container"
          style={{
            maxWidth: 960,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >

          {/* ==================== Hero / Identity ==================== */}
          <motion.section
            variants={itemVariants}
            className="bento-tile-base glass"
            style={{
              padding: 'clamp(24px, 5vw, 44px)',
              position: 'relative',
              overflow: 'hidden',
            }}
            aria-labelledby="about-hero-title"
          >
            {/* ── Background glow layer ── */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'radial-gradient(circle at 15% -10%, rgba(var(--brand-primary-rgb, 16, 185, 129), 0.18) 0%, transparent 55%), radial-gradient(circle at 95% 110%, rgba(139, 92, 246, 0.14) 0%, transparent 55%)',
                pointerEvents: 'none',
              }}
            />

            <div
              style={{
                position: 'relative',
                display: 'flex',
                gap: 'clamp(20px, 4vw, 36px)',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              {/* ── Profile image (floats gently when motion allowed, click to switch approved portrait) ── */}
              <motion.div
                animate={prefersReducedMotion ? {} : { y: [0, -6, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  width: 120,
                  height: 120,
                  flexShrink: 0,
                  borderRadius: 30,
                  overflow: 'hidden',
                  position: 'relative',
                  background: 'var(--brand-gradient)',
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: '0 16px 40px var(--brand-glow, rgba(16,185,129,0.35))',
                  border: '3px solid rgba(var(--brand-primary-rgb, 16, 185, 129), 0.3)',
                }}
              >
                {profileImgError ? (
                  <span style={{ color: '#fff', fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-head)' }}>
                    {PROFILE.initials}
                  </span>
                ) : (
                  <img
                    src={portraits[portraitIndex]}
                    alt="Sarthak Mathapati — ASI Software Engineer"
                    width={120}
                    height={120}
                    decoding="async"
                    fetchPriority="high"
                    onError={() => setProfileImgError(true)}
                    onClick={() => setPortraitIndex((i) => (i + 1) % portraits.length)}
                    title="Click to switch portrait"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      cursor: 'pointer',
                    }}
                  />
                )}
              </motion.div>

              {/* ── Name, role, tagline, meta, and CTAs ── */}
              <div style={{ flex: 1, minWidth: 240 }}>
                {/* ── Tagline ── */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: '0.7rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    fontWeight: 700,
                    color: 'var(--brand-primary)',
                    marginBottom: 10,
                  }}
                >
                  <Sparkles size={13} aria-hidden="true" />
                  {PROFILE.tagline}
                </span>

                {/* ── Name ── */}
                <h2
                  id="about-hero-title"
                  style={{
                    fontSize: 'clamp(1.75rem, 5vw, 2.6rem)',
                    fontFamily: 'var(--font-head)',
                    fontWeight: 800,
                    letterSpacing: '-0.03em',
                    lineHeight: 1.08,
                    margin: '0 0 8px',
                  }}
                >
                  {PROFILE.name}
                </h2>

                {/* ── Role ── */}
                <p
                  style={{
                    margin: '0 0 14px',
                    fontSize: 'clamp(0.95rem, 2.4vw, 1.08rem)',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {PROFILE.role}
                </p>

                {/* ── Short intro ── */}
                <p
                  style={{
                    margin: '0 0 18px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.95rem',
                    lineHeight: 1.65,
                    maxWidth: 560,
                  }}
                >
                  {PROFILE.intro}
                </p>

                {/* ── Meta badges: location, education, mantra ── */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
                  <Chip>
                    <MapPin size={12} style={{ marginRight: 6 }} aria-hidden="true" />
                    Delhi, India
                  </Chip>
                  <Chip>
                    <GraduationCap size={12} style={{ marginRight: 6 }} aria-hidden="true" />
                    CS &amp; AI, B.Tech
                  </Chip>
                  <Chip>
                    <Target size={12} style={{ marginRight: 6 }} aria-hidden="true" />
                    {PROFILE.mantra}
                  </Chip>
                </div>

                {/* ── Primary actions ── */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a
                    href={PROFILE.portfolioUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary"
                    style={{
                      padding: '10px 18px',
                      borderRadius: 12,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: '0.9rem',
                      fontWeight: 600,
                    }}
                  >
                    <ExternalLink size={16} aria-hidden="true" /> View Full Portfolio
                  </a>
                  <a
                    href={`mailto:${PROFILE.email}`}
                    className="btn-secondary"
                    style={{
                      padding: '10px 18px',
                      borderRadius: 12,
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: '0.9rem',
                      fontWeight: 600,
                    }}
                  >
                    <Mail size={16} aria-hidden="true" /> Work with me
                  </a>
                </div>
              </div>
            </div>

            {/* ── Social links + availability notice ── */}
            <div
              style={{
                position: 'relative',
                marginTop: 26,
                paddingTop: 20,
                borderTop: '1px solid var(--glass-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div
                className="about-social-links"
                style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
                aria-label="Social media links"
              >
                {SOCIALS.map(({ label, href, icon: Icon }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    title={label}
                    className="about-social-link"
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      display: 'grid',
                      placeItems: 'center',
                      background: 'var(--glass-2, rgba(255,255,255,0.06))',
                      border: '1px solid var(--glass-border, rgba(255,255,255,0.1))',
                      color: 'var(--text-secondary)',
                      textDecoration: 'none',
                      transition: 'transform .2s ease, color .2s ease',
                    }}
                  >
                    <Icon size={17} aria-hidden="true" />
                  </a>
                ))}
              </div>

              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.82rem',
                  color: 'var(--text-muted)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--brand-primary)',
                    boxShadow: '0 0 0 4px rgba(var(--brand-primary-rgb, 16, 185, 129), 0.18)',
                  }}
                  aria-hidden="true"
                />
                Open to freelance, consulting &amp; collaboration
              </span>
            </div>
          </motion.section>

          {/* ==================== Stats ==================== */}
          <motion.section
            variants={itemVariants}
            aria-label="Highlights"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
            }}
          >
            {statTiles.map((s) => (
              <div
                key={s.label}
                className="bento-tile-base glass-sm"
                style={{ padding: '20px 18px', textAlign: 'center' }}
              >
                {/* ── Value with gradient text ── */}
                <div
                  style={{
                    fontSize: 'clamp(1.4rem, 3.5vw, 1.75rem)',
                    fontWeight: 800,
                    fontFamily: 'var(--font-head)',
                    letterSpacing: '-0.02em',
                    background: 'var(--brand-gradient)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    lineHeight: 1.1,
                  }}
                >
                  {s.value}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    fontSize: '0.78rem',
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </motion.section>

          {/* ==================== Mission ==================== */}
          <motion.section
            variants={itemVariants}
            className="bento-tile-base glass-sm"
            style={{ ...glassCard, position: 'relative', overflow: 'hidden' }}
            aria-label="Mission statement"
          >
            {/* ── Decorative quote mark ── */}
            <Quote
              size={64}
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 8,
                right: 12,
                opacity: 0.07,
                color: 'var(--brand-primary)',
              }}
            />
            <span
              style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                fontWeight: 700,
                color: 'var(--text-muted)',
              }}
            >
              My Mission
            </span>
            <p
              style={{
                margin: '10px 0 0',
                fontSize: 'clamp(1rem, 2.6vw, 1.18rem)',
                lineHeight: 1.6,
                fontWeight: 500,
                maxWidth: 720,
              }}
            >
              {PROFILE.mission}
            </p>
          </motion.section>

          {/* ==================== Bio / Journey ==================== */}
          <motion.section
            variants={itemVariants}
            className="bento-tile-base glass-sm"
            style={glassCard}
            aria-labelledby="about-journey-title"
          >
            <SectionTitle icon={BookOpen}>
              <span id="about-journey-title">The Journey</span>
            </SectionTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {PROFILE.bio.map((para, i) => (
                <p
                  key={i}
                  style={{
                    margin: 0,
                    color: 'var(--text-secondary)',
                    fontSize: '0.95rem',
                    lineHeight: 1.7,
                  }}
                >
                  {para}
                </p>
              ))}
            </div>
          </motion.section>

          {/* ==================== Focus Areas ==================== */}
          <motion.section variants={itemVariants} aria-labelledby="about-focus-title">
            <SectionTitle
              icon={Wrench}
              sub="Four things I care about in every product I touch."
            >
              <span id="about-focus-title">What I Do</span>
            </SectionTitle>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
              }}
            >
              {FOCUS_AREAS.map(({ icon: Icon, title, desc }) => (
                <motion.div
                  key={title}
                  className="bento-tile-base glass-sm"
                  whileHover={hoverLift}
                  transition={{ duration: 0.2 }}
                  style={{ padding: 22 }}
                >
                  {/* ── Icon badge ── */}
                  <div
                    aria-hidden="true"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 13,
                      background: 'rgba(var(--brand-primary-rgb, 16, 185, 129), 0.1)',
                      color: 'var(--brand-primary)',
                      display: 'grid',
                      placeItems: 'center',
                      marginBottom: 14,
                    }}
                  >
                    <Icon size={21} strokeWidth={2.5} />
                  </div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 650, margin: '0 0 8px' }}>
                    {title}
                  </h4>
                  <p
                    style={{
                      margin: 0,
                      color: 'var(--text-secondary)',
                      fontSize: '0.9rem',
                      lineHeight: 1.55,
                    }}
                  >
                    {desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* ==================== Tech Stack ==================== */}
          <motion.section
            variants={itemVariants}
            className="bento-tile-base glass-sm"
            style={glassCard}
            aria-labelledby="about-stack-title"
          >
            <SectionTitle
              icon={Layers}
              sub="A modern, evolving toolkit for building efficient, scalable and good-looking software."
            >
              <span id="about-stack-title">Tech Stack</span>
            </SectionTitle>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {TECH_GROUPS.map(({ label, icon: Icon, items }) => (
                <div key={label}>
                  {/* ── Group label with icon ── */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 10,
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                    }}
                  >
                    <Icon size={15} aria-hidden="true" style={{ color: 'var(--brand-primary)' }} />
                    {label}
                  </div>

                  {/* ── Tech chips ── */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {items.map((item) => (
                      <Chip key={item}>{item}</Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.section>

          {/* ==================== Tools / Products ==================== */}
          <motion.section variants={itemVariants} aria-labelledby="about-tools-title">
            <SectionTitle
              icon={Rocket}
              sub="Small, focused utilities I designed and shipped — all free to use."
            >
              <span id="about-tools-title">Things I've Built</span>
            </SectionTitle>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              {TOOLS.map(({ name, icon: Icon, href, desc, image, tags }) => (
                <motion.a
                  key={name}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bento-tile-base glass-sm"
                  whileHover={hoverLift}
                  transition={{ duration: 0.2 }}
                  style={{
                    padding: 0,
                    textDecoration: 'none',
                    color: 'inherit',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    borderRadius: 20,
                  }}
                >
                  {/* ── Preview image with gradient overlay ── */}
                  <div
                    style={{
                      height: 160,
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <img
                      src={image}
                      alt={`${name} preview`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transition: 'transform 0.4s ease',
                      }}
                      loading="lazy"
                    />
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 50%)',
                      }}
                      aria-hidden="true"
                    />
                  </div>

                  {/* ── Card body: title, description, tags ── */}
                  <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          aria-hidden="true"
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            display: 'grid',
                            placeItems: 'center',
                            background: 'rgba(var(--brand-primary-rgb, 16, 185, 129), 0.1)',
                            color: 'var(--brand-primary)',
                            flexShrink: 0,
                          }}
                        >
                          <Icon size={17} strokeWidth={2.5} />
                        </span>
                        <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{name}</h4>
                      </div>
                      <ArrowRight size={16} aria-hidden="true" style={{ opacity: 0.5 }} />
                    </div>

                    <p
                      style={{
                        margin: 0,
                        color: 'var(--text-secondary)',
                        fontSize: '0.88rem',
                        lineHeight: 1.55,
                      }}
                    >
                      {desc}
                    </p>

                    {/* ── Tags ── */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            padding: '3px 8px',
                            borderRadius: 6,
                            background: 'var(--glass-2, rgba(255,255,255,0.06))',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.a>
              ))}
            </div>
          </motion.section>

          {/* ==================== Ventures ==================== */}
          <motion.section variants={itemVariants} aria-labelledby="about-ventures-title">
            <SectionTitle
              icon={Briefcase}
              sub="Turning ideas into real products with a small, dedicated team."
            >
              <span id="about-ventures-title">Ventures</span>
            </SectionTitle>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              {VENTURES.map((v) => (
                <div
                  key={v.name}
                  className="bento-tile-base glass-sm"
                  style={{ padding: 0, overflow: 'hidden', borderRadius: 20 }}
                >
                  {/* ── Venture image with overlay ── */}
                  <div
                    style={{
                      height: 120,
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <img
                      src={v.image}
                      alt={`${v.name} preview`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                      loading="lazy"
                    />
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 60%)',
                      }}
                      aria-hidden="true"
                    />
                  </div>

                  {/* ── Venture body: name, role, description ── */}
                  <div style={{ padding: 22 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 10,
                        marginBottom: 8,
                      }}
                    >
                      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                        {v.name}
                      </h4>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          fontWeight: 700,
                          color: 'var(--brand-primary)',
                        }}
                      >
                        {v.role}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: 0,
                        color: 'var(--text-secondary)',
                        fontSize: '0.9rem',
                        lineHeight: 1.55,
                      }}
                    >
                      {v.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>

          {/* ==================== Timeline ==================== */}
          <motion.section
            variants={itemVariants}
            className="bento-tile-base glass-sm"
            style={glassCard}
            aria-labelledby="about-timeline-title"
          >
            <SectionTitle icon={Clock}>
              <span id="about-timeline-title">Timeline</span>
            </SectionTitle>

            <ol
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
              }}
            >
              {TIMELINE.map((item, i) => (
                <li
                  key={item.title}
                  style={{
                    display: 'flex',
                    gap: 16,
                    paddingBottom: i === TIMELINE.length - 1 ? 0 : 20,
                    position: 'relative',
                  }}
                >
                  {/* ── Dot + connecting line ── */}
                  <div
                    aria-hidden="true"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      flexShrink: 0,
                      width: 14,
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: 'var(--brand-gradient)',
                        marginTop: 5,
                        boxShadow: '0 0 0 4px rgba(var(--brand-primary-rgb, 16, 185, 129), 0.14)',
                      }}
                    />
                    {i !== TIMELINE.length - 1 && (
                      <span
                        style={{
                          flex: 1,
                          width: 2,
                          marginTop: 6,
                          background: 'var(--glass-border)',
                          borderRadius: 2,
                        }}
                      />
                    )}
                  </div>

                  {/* ── Entry body: period, title, description ── */}
                  <div style={{ paddingBottom: 2 }}>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: 'var(--brand-primary)',
                        marginBottom: 4,
                      }}
                    >
                      {item.period}
                    </div>
                    <h4 style={{ margin: '0 0 4px', fontSize: '0.98rem', fontWeight: 650 }}>
                      {item.title}
                    </h4>
                    <p
                      style={{
                        margin: 0,
                        color: 'var(--text-secondary)',
                        fontSize: '0.88rem',
                        lineHeight: 1.55,
                      }}
                    >
                      {item.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </motion.section>

          {/* ==================== Principles ==================== */}
          <motion.section
            variants={itemVariants}
            className="bento-tile-base glass-sm"
            style={glassCard}
            aria-labelledby="about-principles-title"
          >
            <SectionTitle
              icon={CheckCircle2}
              sub="The habits that keep me grounded while moving forward."
            >
              <span id="about-principles-title">Principles &amp; Habits</span>
            </SectionTitle>

            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 10,
              }}
            >
              {PRINCIPLES.map((p) => (
                <li
                  key={p}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    fontSize: '0.9rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <CheckCircle2
                    size={16}
                    aria-hidden="true"
                    style={{ color: 'var(--brand-primary)', flexShrink: 0 }}
                  />
                  {p}
                </li>
              ))}
            </ul>
          </motion.section>

          {/* ==================== Goals ==================== */}
          <motion.section variants={itemVariants} aria-labelledby="about-goals-title">
            <SectionTitle icon={Target}>
              <span id="about-goals-title">Where I'm Headed</span>
            </SectionTitle>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
              }}
            >
              {GOALS.map((goal) => (
                <div
                  key={goal.horizon}
                  className="bento-tile-base glass-sm"
                  style={{ padding: 22 }}
                >
                  {/* ── Horizon label ── */}
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--brand-primary)',
                      marginBottom: 12,
                    }}
                  >
                    {goal.horizon}
                  </div>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                    {goal.items.map((item) => (
                      <li
                        key={item}
                        style={{
                          display: 'flex',
                          gap: 9,
                          fontSize: '0.88rem',
                          lineHeight: 1.5,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        <Star
                          size={14}
                          aria-hidden="true"
                          style={{ color: 'var(--brand-primary)', flexShrink: 0, marginTop: 3 }}
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.section>

          {/* ==================== Portfolio Link CTA ==================== */}
          <motion.section
            variants={itemVariants}
            className="bento-tile-base glass"
            style={{
              ...glassCard,
              padding: 'clamp(24px, 5vw, 40px)',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
            aria-labelledby="about-portfolio-title"
          >
            {/* ── Background glow layer ── */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'radial-gradient(circle at 50% 120%, rgba(139, 92, 246, 0.16) 0%, transparent 60%)',
                pointerEvents: 'none',
              }}
            />

            <div style={{ position: 'relative' }}>
              {/* ── Icon badge ── */}
              <div
                aria-hidden="true"
                style={{
                  width: 56,
                  height: 56,
                  margin: '0 auto 16px',
                  borderRadius: 18,
                  background: 'linear-gradient(135deg, var(--brand-primary), #8b5cf6)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  boxShadow: '0 12px 30px rgba(139, 92, 246, 0.3)',
                }}
              >
                <ExternalLink size={26} />
              </div>

              {/* ── Heading ── */}
              <h3
                id="about-portfolio-title"
                style={{
                  fontSize: 'clamp(1.25rem, 3.5vw, 1.7rem)',
                  fontFamily: 'var(--font-head)',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  margin: '0 0 10px',
                }}
              >
                See the full portfolio
              </h3>

              {/* ── Description ── */}
              <p
                style={{
                  margin: '0 auto 22px',
                  maxWidth: 480,
                  color: 'var(--text-secondary)',
                  fontSize: '0.95rem',
                  lineHeight: 1.6,
                }}
              >
                Explore detailed case studies, project demos, and the complete body of work at my
                dedicated portfolio site.
              </p>

              {/* ── External link ── */}
              <a
                href={PROFILE.portfolioUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
                style={{
                  padding: '12px 24px',
                  borderRadius: 12,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.95rem',
                  fontWeight: 600,
                }}
              >
                skens.space <ExternalLink size={15} aria-hidden="true" />
              </a>
            </div>
          </motion.section>

          {/* ==================== Client Testimonials ==================== */}
          <motion.section variants={itemVariants} aria-labelledby="about-testimonials-title">
            <SectionTitle
              icon={Users}
              sub="Feedback from engineering leaders and founders we have built with."
            >
              <span id="about-testimonials-title">Client Testimonials</span>
            </SectionTitle>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: 16,
              }}
            >
              {TESTIMONIALS.map((item) => (
                <article
                  key={item.name}
                  className="bento-tile-base glass-sm"
                  style={{
                    ...glassCard,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      color: 'var(--text-secondary)',
                      fontSize: '0.9rem',
                      lineHeight: 1.65,
                    }}
                  >
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <img
                      src={item.avatar}
                      alt={`${item.name} — ${item.role}`}
                      width={48}
                      height={48}
                      loading="lazy"
                      decoding="async"
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        objectFit: 'cover',
                        flexShrink: 0,
                        border: '2px solid rgba(var(--brand-primary-rgb, 16, 185, 129), 0.3)',
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700 }}>{item.name}</h4>
                      <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {item.role}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </motion.section>

          {/* ==================== Contact / CTA ==================== */}
          <motion.section
            variants={itemVariants}
            className="bento-tile-base glass"
            style={{
              ...glassCard,
              padding: 'clamp(24px, 5vw, 40px)',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
            aria-labelledby="about-cta-title"
          >
            {/* ── Background glow layer ── */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'radial-gradient(circle at 50% 120%, rgba(var(--brand-primary-rgb, 16, 185, 129), 0.16) 0%, transparent 60%)',
                pointerEvents: 'none',
              }}
            />

            <div style={{ position: 'relative' }}>
              {/* ── Heart icon badge ── */}
              <div
                aria-hidden="true"
                style={{
                  width: 56,
                  height: 56,
                  margin: '0 auto 16px',
                  borderRadius: 18,
                  background: 'var(--brand-gradient)',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  boxShadow: '0 12px 30px var(--brand-glow, rgba(16,185,129,0.3))',
                }}
              >
                <Heart size={26} fill="rgba(255,255,255,0.25)" />
              </div>

              {/* ── Heading ── */}
              <h3
                id="about-cta-title"
                style={{
                  fontSize: 'clamp(1.25rem, 3.5vw, 1.7rem)',
                  fontFamily: 'var(--font-head)',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  margin: '0 0 10px',
                }}
              >
                Let's build something meaningful
              </h3>

              {/* ── Description ── */}
              <p
                style={{
                  margin: '0 auto 22px',
                  maxWidth: 480,
                  color: 'var(--text-secondary)',
                  fontSize: '0.95rem',
                  lineHeight: 1.6,
                }}
              >
                Freelance projects, technical consulting, open source collaboration
                or mentorship — my inbox is always open.
              </p>

              {/* ── Contact actions ── */}
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <a
                  href={`mailto:${PROFILE.email}`}
                  className="btn-primary allow-copy"
                  data-allow-copy="true"
                  style={{
                    padding: '11px 20px',
                    borderRadius: 12,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                >
                  <Mail size={16} aria-hidden="true" /> {PROFILE.email}
                </a>
              </div>

              {/* ── Location note ── */}
              <p
                style={{
                  marginTop: 22,
                  marginBottom: 0,
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                }}
              >
                {PROFILE.location} · Available 24 × 7
              </p>
            </div>
          </motion.section>
        </motion.div>
      </div>
    </div>
  );
}