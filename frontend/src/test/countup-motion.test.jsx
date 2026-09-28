import { describe, it, expect, vi } from 'vitest';
import React, { useEffect } from 'react';
import { render, renderHook, act } from '@testing-library/react';
import AnimatedNumber from '../components/AnimatedNumber';
import { useCountUpMotion, useCountUp } from '../hooks/useCountUp';

describe('Stage 2: useCountUpMotion and AnimatedNumber', () => {
  it('throws a loud descriptive error if the removed legacy useCountUp is called', () => {
    expect(() => useCountUp()).toThrow(/useCountUp has been removed to eliminate per-frame setState/);
  });

  it('does NOT invoke React.useState or setState inside useCountUpMotion during animation', () => {
    const useStateSpy = vi.spyOn(React, 'useState');
    const { result } = renderHook(() => useCountUpMotion(100, 500));

    expect(result.current).toBeDefined();
    expect(typeof result.current.get).toBe('function');
    expect(result.current.get()).toBe(100);

    // Assert that useCountUpMotion does not introduce any internal React useState calls
    expect(useStateSpy).not.toHaveBeenCalled();
    useStateSpy.mockRestore();
  });

  it('guarantees parent component does NOT re-render during counter animation frames', async () => {
    const renderSpy = vi.fn();

    function ParentComponent({ target }) {
      useEffect(() => {
        renderSpy();
      });

      return (
        <div>
          <AnimatedNumber
            value={target}
            duration={50}
            format={(v) => Math.round(v)}
          />
        </div>
      );
    }

    const { container } = render(<ParentComponent target={500} />);
    expect(renderSpy).toHaveBeenCalledTimes(1);

    // Wait for the animation duration (50ms) to elapse
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    // Parent component render count MUST stay strictly at 1 (zero animation frame re-renders)
    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('500');
  });

  it('calls onComplete callback when counter animation finishes', async () => {
    const onCompleteMock = vi.fn();

    render(
      <AnimatedNumber
        value={300}
        duration={40}
        onComplete={onCompleteMock}
      />
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

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
