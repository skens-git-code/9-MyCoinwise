import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from '../pages/Landing/Landing';
import InteractiveSimulator from '../pages/Landing/InteractiveSimulator';
import FaqSection from '../pages/Landing/FaqSection';
import LandingNavbar from '../pages/Landing/LandingNavbar';

describe('Public Landing Page Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderLandingPage = () =>
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <Landing />
      </MemoryRouter>
    );

  it('renders the complete landing page structure with all key sections', () => {
    renderLandingPage();

    // Verify main root, landmark, and skip link
    expect(screen.getByTestId('landing-page-root')).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    const skipLink = screen.getByRole('link', { name: /Skip to main content/i });
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');

    // Verify Hero Section Elements
    expect(screen.getByText(/The Modern Financial OS for High Achievers/i)).toBeInTheDocument();
    expect(screen.getByText(/Master Your Money/i)).toBeInTheDocument();
    expect(screen.getByText(/Eliminate Financial Chaos/i)).toBeInTheDocument();

    // Verify Bento Features Section
    expect(screen.getByText(/Precision Budgets with Dynamic Rollover/i)).toBeInTheDocument();
    expect(screen.getByText(/Tax Center & Regime Comparator/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Subscription Autopilot/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Wealth & Asset Telemetry/i)).toBeInTheDocument();

    // Verify Simulator Section
    expect(screen.getByText(/See Your Future Wealth Unfold/i)).toBeInTheDocument();

    // Verify Comparison Table
    expect(screen.getByText(/The Modern Standard for Financial Clarity/i)).toBeInTheDocument();

    // Verify FAQ
    expect(screen.getByText(/Frequently Asked Questions/i)).toBeInTheDocument();

    // Verify CTA Banner & Footer
    expect(screen.getByText(/Your Financial Independence Begins with Clarity/i)).toBeInTheDocument();
    expect(screen.getByText(/All Systems Operational/i)).toBeInTheDocument();
  });

  it('sets document title and restores it on unmount', () => {
    const originalTitle = document.title;
    const { unmount } = renderLandingPage();

    expect(document.title).toContain('MyCoinwise — Intelligent Personal Finance');

    unmount();
    expect(document.title).toBe(originalTitle);
  });

  it('allows interacting with the Wealth Simulator sliders and recalculates annualized metrics with a11y valuetext', () => {
    render(
      <MemoryRouter>
        <InteractiveSimulator />
      </MemoryRouter>
    );

    // Initial state check
    expect(screen.getByText(/Monthly Inflow/i)).toBeInTheDocument();
    expect(screen.getByText(/Target Savings Rate/i)).toBeInTheDocument();

    const sliders = screen.getAllByRole('slider');
    expect(sliders.length).toBe(2);

    const [incomeSlider, savingsSlider] = sliders;
    expect(incomeSlider).toHaveAttribute('aria-valuetext', '₹1,20,000');
    expect(savingsSlider).toHaveAttribute('aria-valuetext', '30 percent');

    // Change monthly income to 200,000 (annual = 24,00,000)
    fireEvent.change(incomeSlider, { target: { value: '200000' } });
    expect(screen.getByText('₹2,00,000')).toBeInTheDocument();
    expect(incomeSlider).toHaveAttribute('aria-valuetext', '₹2,00,000');

    // Change savings rate to 50%
    fireEvent.change(savingsSlider, { target: { value: '50' } });
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(savingsSlider).toHaveAttribute('aria-valuetext', '50 percent');

    // 1-Year Direct Savings for 200,000 * 50% = 100,000 * 12 = 12,00,000
    expect(screen.getAllByText('₹12,00,000').length).toBeGreaterThan(0);

    // Annualized tax saved: 200,000 * 12 * 0.08 = 1,92,000
    expect(screen.getByText('₹1,92,000')).toBeInTheDocument();
  });

  it('toggles FAQ questions open and closed when clicked', async () => {
    render(
      <MemoryRouter>
        <FaqSection />
      </MemoryRouter>
    );

    const questionButtons = screen.getAllByRole('button');
    expect(questionButtons.length).toBeGreaterThan(0);

    // First question is open by default
    expect(screen.getByText(/Yes! MyCoinwise offers a comprehensive, zero-cost core tier/i)).toBeInTheDocument();

    // Click on the second question ("How is my financial data protected?")
    const secondQuestionBtn = screen.getByRole('button', { name: /How is my financial data protected\?/i });
    fireEvent.click(secondQuestionBtn);

    await waitFor(() => {
      expect(screen.getByText(/Your passwords and sensitive tokens are encrypted using Bcrypt/i)).toBeInTheDocument();
    });
  });

  it('provides navigation and accessible mobile drawer with modal contract', () => {
    render(
      <MemoryRouter>
        <LandingNavbar />
      </MemoryRouter>
    );

    // Brand Link
    const brandLink = screen.getByText('MyCoinwise').closest('a');
    expect(brandLink).toHaveAttribute('href', '/welcome');

    // Sign In Link
    const signInLinks = screen.getAllByRole('link', { name: /Sign In/i });
    expect(signInLinks[0]).toHaveAttribute('href', '/login');

    // Get Started Link
    const getStartedLinks = screen.getAllByRole('link', { name: /Get Started/i });
    expect(getStartedLinks[0]).toHaveAttribute('href', '/register');

    // Mobile Toggle
    const toggleBtn = screen.getByRole('button', { name: /Open navigation menu/i });
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
    expect(toggleBtn).toHaveAttribute('aria-controls', 'landing-mobile-drawer');

    // Open drawer
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    expect(toggleBtn).toHaveAttribute('aria-label', 'Close navigation menu');

    const drawer = screen.getByRole('dialog', { name: /Navigation menu/i });
    expect(drawer).toBeInTheDocument();
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(drawer).toHaveAttribute('id', 'landing-mobile-drawer');
  });
});
