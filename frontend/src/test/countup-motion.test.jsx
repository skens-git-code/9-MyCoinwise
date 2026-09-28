import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import AnimatedNumber from '../components/AnimatedNumber';
import { useCountUpMotion } from '../hooks/useCountUp';
import { renderHook } from '@testing-library/react';

describe('Stage 2: useCountUpMotion and AnimatedNumber', () => {
  it('returns a Framer Motion MotionValue without triggering React re-renders', () => {
    const { result } = renderHook(() => useCountUpMotion(100, 500));
    expect(result.current).toBeDefined();
    expect(typeof result.current.get).toBe('function');
    expect(result.current.get()).toBe(100);
  });

  it('renders AnimatedNumber with prefix, formatted value, and suffix', () => {
    const { container } = render(
      <AnimatedNumber
        value={1250}
        duration={0}
        prefix="$"
        suffix=" USD"
        format={(val) => Math.round(val).toLocaleString()}
      />
    );
    expect(container.textContent).toContain('$');
    expect(container.textContent).toContain('1,250');
    expect(container.textContent).toContain('USD');
  });

  it('updates MotionValue target when value prop changes', () => {
    const { result, rerender } = renderHook(
      ({ val }) => useCountUpMotion(val, 0),
      { initialProps: { val: 50 } }
    );
    expect(result.current.get()).toBe(50);
    rerender({ val: 200 });
    expect(result.current.get()).toBe(200);
  });
});
