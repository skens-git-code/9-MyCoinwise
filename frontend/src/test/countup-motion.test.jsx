import { describe, it, expect, vi } from 'vitest';
import React, { useEffect } from 'react';
import { render, renderHook, act } from '@testing-library/react';
import AnimatedNumber from '../components/AnimatedNumber';
import { useCountUpMotion, useCountUp } from '../hooks/useCountUp';

describe('Stage 2: useCountUpMotion and AnimatedNumber', () => {
  it('throws a loud descriptive error if the removed legacy useCountUp is called', () => {
    expect(() => useCountUp()).toThrow(/useCountUp has been removed to eliminate per-frame setState/);
  });

  it('does NOT call setState or re-render the consumer during animation frames', async () => {
    const probeRenderSpy = vi.fn();

    function Probe({ target }) {
      useEffect(() => {
        probeRenderSpy();
      });
      useCountUpMotion(target, 100);
      return null;
    }

    const { rerender } = render(<Probe target={0} />);
    expect(probeRenderSpy).toHaveBeenCalledTimes(1);

    // Trigger value change from 0 to 500
    rerender(<Probe target={500} />);
    expect(probeRenderSpy).toHaveBeenCalledTimes(2); // mount + rerender trigger

    // Wait during active animation window (50ms of 100ms duration)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    // Zero re-renders during animation frames
    expect(probeRenderSpy).toHaveBeenCalledTimes(2);

    // Wait for animation completion
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    // Still exactly 2 (zero setState frame commits)
    expect(probeRenderSpy).toHaveBeenCalledTimes(2);
  });

  it('does not re-render the parent component during a value animation', async () => {
    const parentRenderSpy = vi.fn();

    function Parent({ target }) {
      useEffect(() => {
        parentRenderSpy();
      });
      return (
        <AnimatedNumber
          value={target}
          duration={100}
          format={(v) => Math.round(v)}
        />
      );
    }

    const { container, rerender } = render(<Parent target={0} />);
    expect(parentRenderSpy).toHaveBeenCalledTimes(1);

    // Trigger value change: 0 -> 500
    rerender(<Parent target={500} />);
    expect(parentRenderSpy).toHaveBeenCalledTimes(2);

    // Mid-animation: parent should NOT have re-rendered on animation ticks
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(parentRenderSpy).toHaveBeenCalledTimes(2);

    // Post-animation: parent stays at 2 renders, DOM contains final value
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    expect(parentRenderSpy).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('500');
  });

  it('calls onComplete callback after animation duration when value changes', async () => {
    const onCompleteMock = vi.fn();

    const { rerender } = render(
      <AnimatedNumber
        value={0}
        duration={100}
        onComplete={onCompleteMock}
      />
    );
    // Value is 0 on mount -> snaps immediately, or onCompleteMock called if targetValue === initialValue
    onCompleteMock.mockClear();

    // Trigger value change: 0 -> 300
    rerender(
      <AnimatedNumber
        value={300}
        duration={100}
        onComplete={onCompleteMock}
      />
    );

    // Mid-animation (40ms into 100ms duration) - must NOT have completed yet
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(onCompleteMock).not.toHaveBeenCalled();

    // Post-animation (120ms total) - must have completed exactly once
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 90));
    });
    expect(onCompleteMock).toHaveBeenCalledTimes(1);
  });

  it('immediately snaps to target without animation if duration <= 0', () => {
    const onCompleteMock = vi.fn();
    const { result } = renderHook(() => useCountUpMotion(250, 0, onCompleteMock));

    expect(result.current.get()).toBe(250);
    expect(onCompleteMock).toHaveBeenCalledTimes(1);
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
