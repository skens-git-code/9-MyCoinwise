/* —————————————————————————————————————
 * About Page — Editorial Storytelling & Engineering Showcase
 *
 * Sections:
 *   1. Editorial Split Hero (identity, mission lead, CTAs, interactive portrait)
 *   2. Impact & Credibility Metrics Strip
 *   3. Story, Mission & Core Engineering Pillars Bento
 *   4. Interactive Technology & AI Ecosystem Filter
 *   5. Featured Flagship Project (MyCoinwise) & Ventures
 *   6. Shipped Micro-Tools Showcase
 *   7. Interactive Journey Timeline & Horizon Roadmap
 *   8. Closing Collaboration CTA
 * ————————————————————————————————————— */

import React, { useState, useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Rocket, Shield, Zap, Github, Twitter, Instagram, Mail,
  Heart, Code, Sparkles, BrainCircuit, Clock, MapPin,
  GraduationCap, Briefcase, Terminal, Database, Cloud, Cpu,
  CheckCircle2, ArrowRight, Linkedin, Calculator,
  Layers, Target, ExternalLink, RefreshCw
} from 'lucide-react';
import { useAppActions } from '../contexts/AppContext';

/* ============================================================
   Static Data — Approved skens.space Content & Assets
   ============================================================ */

const DEFAULT_STATS = {
  projects: '20+',
  contributions: '1,000+',
  tools: '4',
  ventures: '2',
};

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
    'Architecting scalable full-stack systems, crafting deep learning pipelines, and designing precision-built interactive interfaces — engineered for low latency, clarity, and production-grade reliability.',
  bio: [
    "Hi! I'm Sarthak Sidalingayya Mathapati, a 3rd-year B.Tech student in Computer Science & Artificial Intelligence at Newton School of Technology (in collaboration with Rishihood University).",
    "Born in Sawantwadi and raised across Kolhapur to Delhi, experiencing diverse cultures has profoundly shaped how I think, collaborate, and engineer solutions. I'm driven by the goal of crafting human-centered tech products with clean architectures and memorable experiences.",
    'From distributed full-stack platforms to Deep Learning & ASI research, every system is built around ruthless efficiency, measurable impact, and thoughtful human ergonomics.',
  ],
};

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
};

const SOCIALS = [
  { label: 'GitHub', href: 'https://github.com/skens-git-code', icon: Github },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/sarthak-mathapati-b2b04430a/', icon: Linkedin },
  { label: 'X / Twitter', href: 'https://x.com/mathapatism8', icon: Twitter },
  { label: 'Instagram', href: 'https://www.instagram.com/lethal_sinister.bleed/', icon: Instagram },
];

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

const TECH_GROUPS = [
  {
    id: 'ai',
    label: 'AI / ASI Ecosystem',
    icon: Cpu,
    items: ['Claude', 'OpenAI', 'DeepSeek', 'Gemini 2.0', 'Antigravity', 'PyTorch', 'TensorFlow', 'LangChain'],
  },
  {
    id: 'frontend',
    label: 'Frontend',
    icon: Layers,
    items: ['React.js', 'Next.js', 'TypeScript', 'Tailwind CSS', 'Three.js', 'HTML5/CSS3'],
  },
  {
    id: 'backend',
    label: 'Backend',
    icon: Terminal,
    items: ['Node.js', 'Python', 'Express.js', 'FastAPI', 'REST APIs', 'WebSockets'],
  },
  {
    id: 'data',
    label: 'Data & Storage',
    icon: Database,
    items: ['MongoDB', 'PostgreSQL', 'Redis', 'MySQL', 'Prisma', 'Firestore'],
  },
  {
    id: 'cloud',
    label: 'Cloud & DevOps',
    icon: Cloud,
    items: ['AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Edge CDN', 'Linux OS'],
  },
];

const TOOLS = [
  {
    name: 'Mathens.io',
    icon: Calculator,
    href: 'https://skens-git-code.github.io/2-Calculator/',
    desc: 'Powerful personal calculator — fast, intelligent, and precise math companion for everyone.',
    image: IMAGES.tools.mathens,
    tags: ['React', 'Math', 'Utility'],
  },
  {
    name: 'CryptEns.io',
    icon: Shield,
    href: 'https://skens-git-code.github.io/3-PW-Generator/',
    desc: 'Secure password generator — create robust, uncrackable keys to protect your digital identity.',
    image: IMAGES.tools.cryptens,
    tags: ['Security', 'Generator'],
  },
  {
    name: 'Battlens.io',
    icon: Zap,
    href: 'https://skens-git-code.github.io/4-RPS-Game/',
    desc: 'Classic Rock Paper Scissors — test your luck and strategy in an interactive browser battle.',
    image: IMAGES.tools.battlens,
    tags: ['Game', 'Interactive'],
  },
  {
    name: 'Achievens.io',
    icon: CheckCircle2,
    href: 'https://skens-git-code.github.io/5-To-Do-App/',
    desc: 'Minimalist task manager — streamline your daily goals and boost productivity.',
    image: IMAGES.tools.achievens,
    tags: ['Productivity', 'Tasks'],
  },
];

const VENTURES = [
  {
    name: 'Skens.inc',
    role: 'Founder',
    desc: 'A product studio turning ideas into shipped software — full-stack apps, developer tools, and AI-first experiments.',
    image: IMAGES.ventures.skens,
  },
  {
    name: 'Leaflix.inc',
    role: 'Co-Founder',
    desc: 'An education-forward venture exploring how technology can make technical learning more personal and practical.',
    image: IMAGES.ventures.leaflix,
  },
];

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

const PRINCIPLES = [
  'Daily Code Rhythm',
  'Continuous Learning',
  'Health First',
  'Open Source Mindset',
  'System Documentation',
  'Empowering Others',
];

const GOALS = [
  {
    id: 'short',
    horizon: 'Short Term · 2025',
    items: [
      'Launch Skens MVP',
      'Contribute to 5+ open source projects',
      'Master Data Structures & Algorithms',
      'Investigating recursive self-improvement, neural scaling laws, and scalable oversight systems toward ASI.',
    ],
  },
  {
    id: 'medium',
    horizon: 'Medium Term · 2026–27',
    items: [
      'Scale startup to 100K+ users',
      'Speak at international tech conferences',
      'Launch AI-powered SaaS product',
      'Build developer community of 10K+ members',
    ],
  },
  {
    id: 'long',
    horizon: 'Long Term · 2028+',
    items: [
      'Establish tech ventures platform',
      'Invest in early-stage tech startups',
      'Author a treatise framing human lifecycle phases through systems architecture & feedback loops',
      'Create foundation for tech education in rural areas',
    ],
  },
];

/* ============================================================
   Main Component
   ============================================================ */

export default function About({ stats = DEFAULT_STATS }) {
  const appActions = useAppActions();
  const t = appActions?.t;
  const shouldReduceMotion = useReducedMotion();

  const [portraitIndex, setPortraitIndex] = useState(0);
  const [profileImgError, setProfileImgError] = useState(false);
  const [activeTechFilter, setActiveTechFilter] = useState('all');
  const [activeGoalId, setActiveGoalId] = useState('short');

  const portraits = [IMAGES.profile, IMAGES.profileAlt];

  const visibleTechGroups = useMemo(() => {
    if (activeTechFilter === 'all') return TECH_GROUPS;
    return TECH_GROUPS.filter((g) => g.id === activeTechFilter);
  }, [activeTechFilter]);

  const activeGoal = useMemo(
    () => GOALS.find((g) => g.id === activeGoalId) || GOALS[0],
    [activeGoalId]
  );

  const sectionAnim = shouldReduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 14 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.15 },
        transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] },
      };

  const statTiles = [
    { value: stats?.projects || DEFAULT_STATS.projects, label: t?.('projects_completed') || 'Projects Completed' },
    { value: stats?.contributions || DEFAULT_STATS.contributions, label: t?.('code_commits') || 'Code Commits' },
    { value: stats?.tools || DEFAULT_STATS.tools, label: t?.('shipped_tools') || 'Shipped Web Tools' },
    { value: stats?.ventures || DEFAULT_STATS.ventures, label: t?.('ventures_founded') || 'Founded Ventures' },
  ];

  return (
    <div className="about-page" aria-label="About Sarthak Mathapati">
      {/* ==================== 1. Editorial Split Hero ==================== */}
      <motion.section
        className="about-hero"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        aria-labelledby="about-hero-title"
      >
        <div className="about-hero__content">
          <span className="about-hero__eyebrow">
            <span className="about-hero__dot" aria-hidden="true" />
            {PROFILE.tagline}
          </span>

          <h1 id="about-hero-title" className="about-hero__title">
            I&apos;m <span className="about-hero__gradient">{PROFILE.name}</span>
          </h1>

          <p className="about-hero__role">{PROFILE.role}</p>
          <p className="about-hero__lead">{PROFILE.intro}</p>

          <div className="about-hero__actions">
            <a
              href={PROFILE.portfolioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{ padding: '10px 18px', borderRadius: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <span>Visit skens.space</span>
              <ExternalLink size={15} aria-hidden="true" />
            </a>
            <a
              href={`mailto:${PROFILE.email}`}
              className="btn-secondary allow-copy"
              data-allow-copy="true"
              style={{ padding: '10px 18px', borderRadius: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <Mail size={15} aria-hidden="true" />
              <span>{PROFILE.email}</span>
            </a>
          </div>

          <div className="about-hero__socials" aria-label="Social links">
            {SOCIALS.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="about-social-btn"
              >
                <s.icon size={15} aria-hidden="true" />
                <span>{s.label}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="about-portrait-card">
          <div className="about-portrait-frame">
            {profileImgError ? (
              <div className="about-portrait-initials" aria-label={PROFILE.name}>
                {PROFILE.initials}
              </div>
            ) : (
              <img
                src={portraits[portraitIndex]}
                alt="Sarthak Mathapati — ASI Software Engineer"
                width={310}
                height={325}
                decoding="async"
                fetchPriority="high"
                onError={() => setProfileImgError(true)}
              />
            )}
          </div>

          <button
            type="button"
            className="about-portrait-switch"
            onClick={() => {
              setProfileImgError(false);
              setPortraitIndex((i) => (i + 1) % portraits.length);
            }}
            aria-label="Switch portrait photo"
          >
            <RefreshCw size={12} aria-hidden="true" />
            <span>Portrait {portraitIndex + 1} / {portraits.length}</span>
          </button>

          <div className="about-portrait-meta">
            <span className="about-chip">
              <MapPin size={12} aria-hidden="true" />
              Delhi, India
            </span>
            <span className="about-chip">
              <GraduationCap size={12} aria-hidden="true" />
              NST · Rishihood
            </span>
          </div>
        </div>
      </motion.section>

      {/* ==================== 2. Impact Metrics Strip ==================== */}
      <motion.section {...sectionAnim} className="about-stats-grid" aria-label="Key milestones and stats">
        {statTiles.map((tile) => (
          <div key={tile.label} className="about-stat-tile">
            <span className="about-stat-tile__val">{tile.value}</span>
            <span className="about-stat-tile__lbl">{tile.label}</span>
          </div>
        ))}
      </motion.section>

      {/* ==================== 3. Story, Mission & Pillars ==================== */}
      <motion.section {...sectionAnim} className="about-section" aria-labelledby="about-story-title">
        <div className="about-section-head">
          <div>
            <h2 id="about-story-title">
              <span className="about-icon-badge" aria-hidden="true">
                <Sparkles size={18} />
              </span>
              Story, Mission &amp; Craft
            </h2>
            <p>From Sawantwadi and Kolhapur to engineering AI systems in Delhi.</p>
          </div>
        </div>

        <div className="about-story-bento">
          <div className="about-card">
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>My Journey &amp; Philosophy</h3>
            <div className="about-story-paragraphs">
              {PROFILE.bio.map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="about-card about-mission-card">
              <span className="about-hero__eyebrow">
                <Target size={12} aria-hidden="true" />
                My Mission
              </span>
              <blockquote>&ldquo;{PROFILE.mission}&rdquo;</blockquote>
            </div>

            <div className="about-pillars-grid">
              {FOCUS_AREAS.map((area) => (
                <div key={area.title} className="about-pillar-tile">
                  <span className="about-icon-badge" aria-hidden="true" style={{ width: 32, height: 32 }}>
                    <area.icon size={16} />
                  </span>
                  <h3>{area.title}</h3>
                  <p>{area.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* ==================== 4. Interactive Tech Stack ==================== */}
      <motion.section {...sectionAnim} className="about-section" aria-labelledby="about-stack-title">
        <div className="about-section-head">
          <div>
            <h2 id="about-stack-title">
              <span className="about-icon-badge" aria-hidden="true">
                <Cpu size={18} />
              </span>
              Technology &amp; AI Ecosystem
            </h2>
            <p>Frontier LLMs, distributed backends, and high-frame-rate client architecture.</p>
          </div>

          <div className="about-filter-pills" role="tablist" aria-label="Filter technology stack">
            <button
              type="button"
              role="tab"
              aria-selected={activeTechFilter === 'all'}
              className={`about-pill-btn ${activeTechFilter === 'all' ? 'is-active' : ''}`}
              onClick={() => setActiveTechFilter('all')}
            >
              All
            </button>
            {TECH_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={activeTechFilter === g.id}
                className={`about-pill-btn ${activeTechFilter === g.id ? 'is-active' : ''}`}
                onClick={() => setActiveTechFilter(g.id)}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="about-tech-grid">
          {visibleTechGroups.map((group) => (
            <div key={group.id} className="about-tech-card">
              <div className="about-tech-card__head">
                <span className="about-icon-badge" aria-hidden="true" style={{ width: 30, height: 30 }}>
                  <group.icon size={15} />
                </span>
                <span>{group.label}</span>
              </div>
              <div className="about-tech-card__chips">
                {group.items.map((item) => (
                  <span key={item} className="about-chip">{item}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ==================== 5. Flagship Project & Ventures ==================== */}
      <motion.section {...sectionAnim} className="about-section" aria-labelledby="about-work-title">
        <div className="about-section-head">
          <div>
            <h2 id="about-work-title">
              <span className="about-icon-badge" aria-hidden="true">
                <Rocket size={18} />
              </span>
              Featured Architecture &amp; Ventures
            </h2>
            <p>Production software platforms and studio ventures built from zero to one.</p>
          </div>
        </div>

        <div className="about-spotlight">
          <div className="about-spotlight__media">
            <img
              src={IMAGES.projects.mycoinwise}
              alt="MyCoinwise — Advanced Financial Planning & Budgeting Architecture"
              width={800}
              height={475}
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="about-spotlight__body">
            <span className="about-chip" style={{ alignSelf: 'flex-start' }}>Full Stack · Flagship</span>
            <h3>Advanced Financial Planning &amp; Budgeting Architecture</h3>
            <p>
              Master cash flow with a modern financial OS combining smart budgeting, automated PDF/Excel/CSV
              statement ingestion, multi-currency analytics, and bank/card management in one intuitive workspace.
            </p>
            <div className="about-tech-card__chips">
              {['React', 'Node.js', 'MongoDB', 'MySQL', 'AI/OCR'].map((tag) => (
                <span key={tag} className="about-chip">{tag}</span>
              ))}
            </div>
            <div className="about-hero__actions">
              <Link to="/" className="btn-primary" style={{ padding: '9px 16px', borderRadius: 11, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span>Open Workspace</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
              <a
                href="https://github.com/skens-git-code/9-MyCoinwise"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
                style={{ padding: '9px 16px', borderRadius: 11, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Github size={14} aria-hidden="true" />
                <span>Source</span>
              </a>
            </div>
          </div>
        </div>

        <div className="about-roadmap-grid">
          {VENTURES.map((v) => (
            <div key={v.name} className="about-tool-card" style={{ cursor: 'default' }}>
              <div className="about-tool-card__img">
                <img src={v.image} alt={`${v.name} preview`} width={600} height={240} loading="lazy" decoding="async" />
              </div>
              <div className="about-tool-card__body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <h4>{v.name}</h4>
                  <span className="about-chip">{v.role}</span>
                </div>
                <p>{v.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.section>

      {/* ==================== 6. Shipped Micro-Tools ==================== */}
      <motion.section {...sectionAnim} className="about-section" aria-labelledby="about-tools-title">
        <div className="about-section-head">
          <div>
            <h2 id="about-tools-title">
              <span className="about-icon-badge" aria-hidden="true">
                <Briefcase size={18} />
              </span>
              Interactive Tools
            </h2>
            <p>Focused utilities built for speed, security, and everyday clarity.</p>
          </div>
        </div>

        <div className="about-tools-grid">
          {TOOLS.map((tool) => (
            <a
              key={tool.name}
              href={tool.href}
              target="_blank"
              rel="noopener noreferrer"
              className="about-tool-card"
            >
              <div className="about-tool-card__img">
                <img src={tool.image} alt={`${tool.name} preview`} width={400} height={220} loading="lazy" decoding="async" />
              </div>
              <div className="about-tool-card__body">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <tool.icon size={16} style={{ color: 'var(--brand-primary, #10b981)' }} aria-hidden="true" />
                    <h4>{tool.name}</h4>
                  </div>
                  <ArrowRight size={15} style={{ opacity: 0.55 }} aria-hidden="true" />
                </div>
                <p>{tool.desc}</p>
                <div className="about-tech-card__chips" style={{ marginTop: 'auto' }}>
                  {tool.tags.map((tag) => (
                    <span key={tag} className="about-chip">{tag}</span>
                  ))}
                </div>
              </div>
            </a>
          ))}
        </div>
      </motion.section>

      {/* ==================== 7. Journey & Horizon Roadmap ==================== */}
      <motion.section {...sectionAnim} className="about-section" aria-labelledby="about-roadmap-title">
        <div className="about-section-head">
          <div>
            <h2 id="about-roadmap-title">
              <span className="about-icon-badge" aria-hidden="true">
                <Clock size={18} />
              </span>
              Journey &amp; Vision Roadmap
            </h2>
            <p>Milestones achieved and where we are building next.</p>
          </div>
        </div>

        <div className="about-roadmap-grid">
          <div className="about-card">
            <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 700 }}>Experience &amp; Education</h3>
            <div className="about-timeline-list">
              {TIMELINE.map((entry) => (
                <div key={entry.title} className="about-timeline-item">
                  <span className="about-timeline-item__period">{entry.period}</span>
                  <h4>{entry.title}</h4>
                  <p>{entry.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="about-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 18 }}>
            <div>
              <div className="about-filter-pills" role="tablist" aria-label="Vision horizon">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    role="tab"
                    aria-selected={activeGoalId === g.id}
                    className={`about-pill-btn ${activeGoalId === g.id ? 'is-active' : ''}`}
                    onClick={() => setActiveGoalId(g.id)}
                  >
                    {g.horizon}
                  </button>
                ))}
              </div>
              <ul className="about-goal-list">
                {activeGoal.items.map((item) => (
                  <li key={item}>
                    <CheckCircle2 size={16} aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '0.84rem', textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
                Operating Principles
              </h4>
              <div className="about-tech-card__chips">
                {PRINCIPLES.map((p) => (
                  <span key={p} className="about-chip">{p}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* ==================== 8. Closing Collaboration CTA ==================== */}
      <motion.section {...sectionAnim} className="about-cta-banner" aria-labelledby="about-cta-title">
        <div className="about-cta-banner__inner">
          <div
            aria-hidden="true"
            style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: 'var(--brand-gradient)',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
            }}
          >
            <Heart size={24} fill="rgba(255,255,255,0.22)" />
          </div>
          <h2 id="about-cta-title">Let&apos;s build something meaningful</h2>
          <p>
            Freelance engineering, AI systems architecture, technical consulting, or open-source collaboration —
            always open to high-impact ideas.
          </p>
          <div className="about-cta-banner__actions">
            <a
              href={`mailto:${PROFILE.email}`}
              className="btn-primary allow-copy"
              data-allow-copy="true"
              style={{ padding: '11px 22px', borderRadius: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}
            >
              <Mail size={16} aria-hidden="true" />
              <span>{PROFILE.email}</span>
            </a>
            <a
              href={PROFILE.portfolioUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary"
              style={{ padding: '11px 22px', borderRadius: 12, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}
            >
              <span>skens.space</span>
              <ExternalLink size={15} aria-hidden="true" />
            </a>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
            {PROFILE.location} · Available 24 × 7
          </p>
        </div>
      </motion.section>
    </div>
  );
}
