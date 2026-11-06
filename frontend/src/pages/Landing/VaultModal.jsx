import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Sparkles, X, ArrowRight, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export default function VaultModal({ isOpen, onClose }) {
  const dialogRef = useRef(null);
  const canvasRef = useRef(null);
  const prefersReduced = useReducedMotion();

  // Accessible focus trap, Escape key dismiss, and scroll management
  useFocusTrap({
    isOpen,
    onClose,
    containerRef: dialogRef,
  });

  // Window-level Escape listener (ensures Escape works even when window has focus or in test runners)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || prefersReduced) return;

    // Confetti burst on canvas
    const canvas = canvasRef.current;
    let ctx = null;
    try {
      ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    } catch {
      ctx = null;
    }
    if (ctx) {
      const width = document.documentElement.clientWidth || window.innerWidth;
      const height = document.documentElement.clientHeight || window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      const colors = ['#10b981', '#38bdf8', '#f59e0b', '#ec4899', '#8b5cf6'];
      const particles = Array.from({ length: 70 }, () => ({
        x: width / 2,
        y: height / 2,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.8) * 14,
        size: Math.random() * 6 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 12
      }));

      let animId;
      const render = () => {
        ctx.clearRect(0, 0, width, height);
        let alive = false;
        particles.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.35; // gravity
          p.alpha -= 0.015;
          p.rotation += p.vr;

          if (p.alpha > 0) {
            alive = true;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
          }
        });

        if (alive) {
          animId = requestAnimationFrame(render);
        }
      };

      animId = requestAnimationFrame(render);
      return () => {
        if (animId) cancelAnimationFrame(animId);
      };
    }
  }, [isOpen, prefersReduced]);

  if (!isOpen) return null;

  return (
    <div className="vault-modal-backdrop" onClick={onClose} role="presentation">
      <canvas ref={canvasRef} className="vault-confetti-canvas" aria-hidden="true" />
      <div
        ref={dialogRef}
        className="vault-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="vault-modal-close"
          onClick={onClose}
          aria-label="Close vault modal"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <div className="vault-badge-pill">
          <Sparkles size={14} className="text-emerald" aria-hidden="true" />
          <span>Secret Vault Unlocked</span>
        </div>

        <h3 id="vault-modal-title" className="vault-title">
          You Found the Founding Member Protocol 🗝️
        </h3>

        <p className="vault-desc">
          You entered the legendary Konami sequence. As an early pioneer exploring under the hood of
          MyCoinwise, you are granted Founding Member status with priority telemetry queues and early-access feature flags.
        </p>

        <div className="vault-perks">
          <div className="perk-item">
            <ShieldCheck size={16} className="text-emerald" aria-hidden="true" />
            <span>Lifetime free core workspace tier</span>
          </div>
          <div className="perk-item">
            <ShieldCheck size={16} className="text-emerald" aria-hidden="true" />
            <span>Early access to AI wealth insights & automations</span>
          </div>
        </div>

        <div className="vault-actions">
          <Link
            to="/register?tier=founder"
            className="btn-landing-primary btn-block"
            onClick={onClose}
          >
            <span>Claim Founding Member Access</span>
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <button type="button" className="btn-landing-glass btn-block" onClick={onClose}>
            <span>Continue Exploring</span>
          </button>
        </div>
      </div>
    </div>
  );
}

VaultModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
