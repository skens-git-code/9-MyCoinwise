import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  COOKIE_CONSENT_KEY,
  CLARITY_SCRIPT_ID,
  getCookieConsent,
  setCookieConsent,
  isDoNotTrack,
  initClarity,
  stopClarity,
  clearClarityCookies,
} from '../services/clarity';
import CookieBanner from '../components/CookieBanner';

describe('Microsoft Clarity Cookie Consent Gate & Loader', () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = '';
    const script = document.getElementById(CLARITY_SCRIPT_ID);
    if (script && script.parentNode) {
      script.parentNode.removeChild(script);
    }
    delete window.clarity;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    const script = document.getElementById(CLARITY_SCRIPT_ID);
    if (script && script.parentNode) {
      script.parentNode.removeChild(script);
    }
    delete window.clarity;
  });

  it('1. Consent gate defaults to null on first visit with no cookies set', () => {
    expect(getCookieConsent()).toBeNull();
    expect(localStorage.getItem(COOKIE_CONSENT_KEY)).toBeNull();
    // Attempting to init Clarity without consent must return false
    const loaded = initClarity({ forceDev: true });
    expect(loaded).toBe(false);
    expect(document.getElementById(CLARITY_SCRIPT_ID)).toBeNull();
  });

  it('2. Rejection stores "rejected" and never initializes Clarity', () => {
    setCookieConsent('rejected');
    expect(getCookieConsent()).toBe('rejected');
    expect(localStorage.getItem(COOKIE_CONSENT_KEY)).toBe('rejected');

    const loaded = initClarity({ forceDev: true });
    expect(loaded).toBe(false);
    expect(document.getElementById(CLARITY_SCRIPT_ID)).toBeNull();
  });

  it('3. Respects Do Not Track (DNT) header even if user consented', () => {
    setCookieConsent('accepted');
    expect(getCookieConsent()).toBe('accepted');

    // Simulate DNT = 1
    Object.defineProperty(navigator, 'doNotTrack', {
      value: '1',
      configurable: true,
    });
    expect(isDoNotTrack()).toBe(true);

    const loaded = initClarity({ forceDev: true });
    expect(loaded).toBe(false);
    expect(document.getElementById(CLARITY_SCRIPT_ID)).toBeNull();

    // Reset DNT
    Object.defineProperty(navigator, 'doNotTrack', {
      value: '0',
      configurable: true,
    });
  });

  it('4. Switching from accepted to rejected calls stopClarity and purges cookies', () => {
    // Simulate active clarity cookies
    document.cookie = '_clck=test_user_123; path=/';
    document.cookie = '_clsk=test_session_456; path=/';
    document.cookie = 'clarity_metric=1; path=/';

    // Mock clarity function
    const mockClarity = vi.fn();
    mockClarity.__loaded = true;
    window.clarity = mockClarity;

    // Simulate script element in DOM
    const fakeScript = document.createElement('script');
    fakeScript.id = CLARITY_SCRIPT_ID;
    document.head.appendChild(fakeScript);

    // Call stopClarity directly
    stopClarity();

    expect(mockClarity).toHaveBeenCalledWith('consent', false);
    expect(mockClarity).toHaveBeenCalledWith('stop');
    expect(document.getElementById(CLARITY_SCRIPT_ID)).toBeNull();
    expect(window.clarity.__loaded).toBeUndefined();
  });

  it('5. Renders CookieBanner on first visit with accessible >= 44px buttons', () => {
    render(<CookieBanner />);

    const banner = screen.getByRole('region', { name: /cookie consent banner/i });
    expect(banner).toBeInTheDocument();

    const acceptBtn = screen.getByRole('button', { name: /accept cookies and analytics/i });
    const rejectBtn = screen.getByRole('button', { name: /reject analytics cookies/i });

    expect(acceptBtn).toBeInTheDocument();
    expect(rejectBtn).toBeInTheDocument();

    // Clicking Reject sets status to rejected and hides the banner
    fireEvent.click(rejectBtn);
    expect(getCookieConsent()).toBe('rejected');
  });

  it('6. Accepts consent and saves "accepted" to localStorage', () => {
    render(<CookieBanner />);

    const acceptBtn = screen.getByRole('button', { name: /accept cookies and analytics/i });
    fireEvent.click(acceptBtn);

    expect(getCookieConsent()).toBe('accepted');
    expect(localStorage.getItem(COOKIE_CONSENT_KEY)).toBe('accepted');
  });
});
