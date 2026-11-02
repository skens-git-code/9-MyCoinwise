import React, { useRef, useEffect, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Play, Pause, RefreshCw, Zap, Sparkles, Shield, ArrowRight } from 'lucide-react';
import { onPagePause, onPageResume } from '../../utils/performanceOptimizer';

const STAGES = [
  { id: 'inflow', label: '1. Inflow', sublabel: 'Direct Salary & Inflows', color: '#10b981' },
  { id: 'categorized', label: '2. Categorized', sublabel: 'Budgets & Envelopes', color: '#38bdf8' },
  { id: 'optimized', label: '3. Optimized', sublabel: 'Surplus, Tax & Wealth', color: '#f59e0b' },
];

const SAMPLE_INFLOWS = [
  { label: 'Salary Inflow', amount: 95000, color: '#10b981' },
  { label: 'Consulting', amount: 35000, color: '#10b981' },
  { label: 'Dividends', amount: 12500, color: '#10b981' },
  { label: 'Treasury Yield', amount: 4800, color: '#10b981' },
  { label: 'Bonus Sweep', amount: 28000, color: '#10b981' },
];

const SAMPLE_CATEGORIES = ['Living & Rent', 'Transport', 'Discretionary', 'SIP Wealth', 'Emergency Fund'];
const SAMPLE_OPTIMIZATIONS = ['+18% Surplus', '87A Tax Shield', 'Zero-Ad Swept', 'Rollover Reserve', '+22% Compounding'];

export default function LivingLedger({ prefersReduced = false }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const countRef = useRef(null);
  const timeRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);

  // Physics state refs to avoid React re-renders in 60 FPS animation loop
  const routedCountRef = useRef(138);
  const speedRef = useRef(1.0);
  const targetSpeedRef = useRef(1.0);
  const tokensRef = useRef([]);
  const sparksRef = useRef([]);
  const isPausedRef = useRef(false);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Real-time local clock via direct DOM update to preserve 60fps scrolling
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      if (timeRef.current) {
        timeRef.current.textContent = `· ${formatted}`;
        timeRef.current.setAttribute('aria-label', `Current simulation clock: ${formatted}`);
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Initialize a fresh token
  const createToken = useCallback((canvasWidth, canvasHeight, customX = null, customStage = null) => {
    const sample = SAMPLE_INFLOWS[Math.floor(Math.random() * SAMPLE_INFLOWS.length)];
    const laneY = 35 + Math.random() * (canvasHeight - 70);
    const speed = 1.1 + Math.random() * 0.9;
    const stage = customStage !== null ? customStage : 0;
    const x = customX !== null ? customX : -15;

    return {
      x,
      y: laneY,
      targetY: laneY + (Math.random() * 24 - 12),
      vx: speed,
      radius: 4.5 + Math.random() * 2,
      amount: sample.amount,
      label: sample.label,
      category: SAMPLE_CATEGORIES[Math.floor(Math.random() * SAMPLE_CATEGORIES.length)],
      optimization: SAMPLE_OPTIMIZATIONS[Math.floor(Math.random() * SAMPLE_OPTIMIZATIONS.length)],
      stage,
      sparkleTimer: 0,
      alpha: 1,
      trail: []
    };
  }, []);

  // Main canvas animation and rendering lifecycle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx = null;
    try {
      ctx = canvas.getContext ? canvas.getContext('2d', { alpha: true }) : null;
    } catch {
      ctx = null;
    }
    if (!ctx) return;

    let width = 0;
    let height = 0;

    // Static rendering fallback for reduced motion
    const renderStatic = () => {
      if (width <= 0 || height <= 0) return;
      ctx.clearRect(0, 0, width, height);

      const col1 = width * 0.33;
      const col2 = width * 0.66;

      // Stage dividing columns
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(col1, 0);
      ctx.lineTo(col1, height);
      ctx.moveTo(col2, 0);
      ctx.lineTo(col2, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Static sample tokens across lanes
      const staticTokens = [
        { x: width * 0.14, y: height * 0.35, color: '#10b981', label: 'Salary Inflow', text: '₹95,000' },
        { x: width * 0.22, y: height * 0.65, color: '#10b981', label: 'Consulting', text: '₹35,000' },
        { x: width * 0.46, y: height * 0.32, color: '#38bdf8', label: 'SIP Wealth', text: 'Budgets Split' },
        { x: width * 0.52, y: height * 0.68, color: '#38bdf8', label: 'Living Envelope', text: 'Automated' },
        { x: width * 0.78, y: height * 0.35, color: '#f59e0b', label: '+18% Surplus', text: 'Wealth Swept' },
        { x: width * 0.84, y: height * 0.65, color: '#10b981', label: 'Tax Shield', text: '87A Max' }
      ];

      staticTokens.forEach((t) => {
        // Token glow
        ctx.beginPath();
        ctx.arc(t.x, t.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = t.color + '26';
        ctx.fill();

        // Token core
        ctx.beginPath();
        ctx.arc(t.x, t.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = t.color;
        ctx.fill();

        // Text pill
        ctx.font = '600 11px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(t.label, t.x - 20, t.y - 12);
        ctx.font = '500 10px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(t.text, t.x - 20, t.y + 18);
      });
    };

    const handleResize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.scale(dpr, dpr);

      if (prefersReduced) {
        renderStatic();
        return;
      }

      // Pre-populate tokens if empty
      if (tokensRef.current.length === 0) {
        tokensRef.current = [
          createToken(width, height, width * 0.12, 0),
          createToken(width, height, width * 0.22, 0),
          createToken(width, height, width * 0.42, 1),
          createToken(width, height, width * 0.54, 1),
          createToken(width, height, width * 0.74, 2),
          createToken(width, height, width * 0.88, 2),
        ];
      }
    };

    handleResize();
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(canvas);

    if (prefersReduced) {
      renderStatic();
      return () => resizeObserver.disconnect();
    }

    let lastSpawnTime = performance.now();
    let isTabVisible = true;

    // Freeze animation when tab is inactive to guarantee zero CPU draw
    const unregisterPause = onPagePause(() => {
      isTabVisible = false;
    });
    const unregisterResume = onPageResume(() => {
      isTabVisible = true;
      lastSpawnTime = performance.now();
    });

    const loop = (time) => {
      if (!isTabVisible || isPausedRef.current) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      // Smooth lerp speed multiplier for hover slow-mo
      speedRef.current += (targetSpeedRef.current - speedRef.current) * 0.08;

      ctx.clearRect(0, 0, width, height);

      const col1 = width * 0.33;
      const col2 = width * 0.66;

      // Draw subtle dashed lane boundaries
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(col1, 0);
      ctx.lineTo(col1, height);
      ctx.moveTo(col2, 0);
      ctx.lineTo(col2, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Spawn new tokens from left at ~1.6s intervals
      if (time - lastSpawnTime > 1400 / speedRef.current && tokensRef.current.length < 35) {
        tokensRef.current.push(createToken(width, height));
        lastSpawnTime = time;
      }

      // Update and draw active sparks
      sparksRef.current = sparksRef.current.filter((spark) => {
        spark.x += spark.vx * speedRef.current;
        spark.y += spark.vy * speedRef.current;
        spark.alpha -= 0.03 * speedRef.current;
        if (spark.alpha <= 0) return false;

        ctx.beginPath();
        ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        ctx.fillStyle = `${spark.color}${Math.floor(spark.alpha * 255).toString(16).padStart(2, '0')}`;
        ctx.fill();
        return true;
      });

      // Update and draw tokens
      tokensRef.current = tokensRef.current.filter((token) => {
        token.x += token.vx * speedRef.current;
        token.y += (token.targetY - token.y) * 0.04 * speedRef.current;

        // Stage transitions & stage triggers
        const prevStage = token.stage;
        if (token.x >= col2) {
          token.stage = 2; // Optimized
        } else if (token.x >= col1) {
          token.stage = 1; // Categorized
        } else {
          token.stage = 0; // Inflow
        }

        // Trigger spark burst on stage transition
        if (token.stage !== prevStage) {
          routedCountRef.current += 1;
          if (countRef.current) {
            countRef.current.textContent = String(routedCountRef.current);
          }
          for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = 0.8 + Math.random() * 1.5;
            sparksRef.current.push({
              x: token.x,
              y: token.y,
              vx: Math.cos(angle) * spd,
              vy: Math.sin(angle) * spd,
              size: 1.5 + Math.random() * 1.5,
              alpha: 0.9,
              color: token.stage === 1 ? '#38bdf8' : '#f59e0b'
            });
          }
        }

        // Color based on active processing stage
        let activeColor = '#10b981';
        let glowColor = 'rgba(16, 185, 129, 0.35)';
        if (token.stage === 1) {
          activeColor = '#38bdf8';
          glowColor = 'rgba(56, 189, 248, 0.35)';
        } else if (token.stage === 2) {
          activeColor = '#f59e0b';
          glowColor = 'rgba(245, 158, 11, 0.35)';
        }

        // Save trail for streak effect
        token.trail.push({ x: token.x, y: token.y });
        if (token.trail.length > 8) token.trail.shift();

        // Draw trail stream
        if (token.trail.length > 1) {
          ctx.beginPath();
          ctx.moveTo(token.trail[0].x, token.trail[0].y);
          for (let i = 1; i < token.trail.length; i++) {
            ctx.lineTo(token.trail[i].x, token.trail[i].y);
          }
          ctx.strokeStyle = glowColor;
          ctx.lineWidth = token.radius * 0.75;
          ctx.lineCap = 'round';
          ctx.stroke();
        }

        // Draw glowing outer aura
        ctx.beginPath();
        ctx.arc(token.x, token.y, token.radius * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = glowColor;
        ctx.fill();

        // Draw token core
        ctx.beginPath();
        ctx.arc(token.x, token.y, token.radius, 0, Math.PI * 2);
        ctx.fillStyle = activeColor;
        ctx.fill();

        // Draw badge text based on stage
        ctx.font = '600 10.5px system-ui, -apple-system, sans-serif';
        if (token.stage === 0) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
          ctx.fillText(`₹${(token.amount / 1000).toFixed(0)}k`, token.x - 12, token.y - 10);
        } else if (token.stage === 1) {
          ctx.fillStyle = '#38bdf8';
          ctx.fillText(token.category, token.x - 16, token.y - 10);
        } else if (token.stage === 2) {
          ctx.fillStyle = '#fbbf24';
          ctx.fillText(token.optimization, token.x - 20, token.y - 10);
        }

        // Remove tokens that move off-screen to the right
        return token.x < width + 30;
      });

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      resizeObserver.disconnect();
      unregisterPause();
      unregisterResume();
    };
  }, [createToken, prefersReduced]);

  const handleMouseEnter = () => {
    targetSpeedRef.current = 0.32; // Smooth slow-mo on hover
  };

  const handleMouseLeave = () => {
    targetSpeedRef.current = 1.0;
  };

  const togglePause = () => {
    setIsPaused((prev) => !prev);
  };

  return (
    <div
      className="living-ledger-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 3 Processing Column Headers */}
      <div className="ledger-columns-header" aria-hidden="true">
        {STAGES.map((stg) => (
          <div key={stg.id} className="ledger-col-head">
            <div className="col-indicator" style={{ background: stg.color }} />
            <div className="col-text-wrap">
              <strong style={{ color: stg.color }}>{stg.label}</strong>
              <span>{stg.sublabel}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Physics Canvas Stream */}
      <div className="ledger-canvas-wrap" onClick={togglePause} role="presentation">
        <canvas
          ref={canvasRef}
          className="ledger-canvas"
          aria-hidden="true"
        />

        {/* Hover / Pause Indicator Overlay */}
        <div className="ledger-canvas-overlay" aria-hidden="true">
          <span className="slowmo-tag">
            {isPaused ? '⏸ Paused · Click to Resume' : 'Hover to Slow · Click to Pause'}
          </span>
        </div>
      </div>

      {/* Real-time Telemetry Live Strip */}
      <div className="ledger-telemetry-bar">
        <div className="bar-left">
          <span className="live-pulse-dot" aria-hidden="true" />
          <span className="telemetry-text">
            <strong ref={countRef}>138</strong> transactions intelligently routed
          </span>
          <span ref={timeRef} className="telemetry-clock">
            · Live
          </span>
        </div>

        <div className="bar-right">
          <button
            type="button"
            className="btn-ledger-toggle"
            onClick={togglePause}
            aria-label={isPaused ? 'Resume living ledger stream' : 'Pause living ledger stream'}
            aria-pressed={isPaused}
          >
            {isPaused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

LivingLedger.propTypes = {
  prefersReduced: PropTypes.bool,
};
