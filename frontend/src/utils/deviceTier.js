/**
 * Device Tier and Performance Capability Utility
 * Dynamically classifies runtime hardware environment to optimize rendering
 * paths between high-end desktop and constrained mobile/low-memory environments.
 */

export function getDeviceTier() {
  if (typeof window === 'undefined') return 'high';

  const prefersReduced = typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width: 900px)').matches;
  const lowCPU = (navigator.hardwareConcurrency || 8) <= 4;
  const lowMem = (navigator.deviceMemory || 8) <= 4;

  if (prefersReduced) return 'minimal';
  if (isMobile || lowCPU || lowMem) return 'mobile';
  return 'high';
}

export const isMobileTier = () => {
  const t = getDeviceTier();
  return t === 'mobile' || t === 'minimal';
};

export default { getDeviceTier, isMobileTier };
