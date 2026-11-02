import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

  it('sets document title and restores it on unmount, and enables viewport scrolling', () => {
    const originalTitle = document.title;
    const { unmount } = renderLandingPage();

    expect(document.title).toContain('MyCoinwise — Intelligent Personal Finance');
    expect(document.documentElement.classList.contains('landing-viewport-scrollable')).toBe(true);
    expect(document.body.classList.contains('landing-viewport-scrollable')).toBe(true);

    unmount();
    expect(document.title).toBe(originalTitle);
    expect(document.documentElement.classList.contains('landing-viewport-scrollable')).toBe(false);
    expect(document.body.classList.contains('landing-viewport-scrollable')).toBe(false);
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

  it('renders defensible platform highlights ticker without unsubstantiated claims', () => {
    renderLandingPage();

    const tickerSection = screen.getByLabelText('Platform Highlights');
    expect(tickerSection).toBeInTheDocument();

    // Verify verified architectural claims within ticker
    const utils = within(tickerSection);
    expect(utils.getByText('Dual-Regime')).toBeInTheDocument();
    expect(utils.getByText('Tax Engine Ready')).toBeInTheDocument();
    expect(utils.getByText('Sub-100ms')).toBeInTheDocument();
    expect(utils.getByText('Local Telemetry')).toBeInTheDocument();
    expect(utils.getByText('100%')).toBeInTheDocument();
    expect(utils.getByText('Zero Ad Selling')).toBeInTheDocument();
    expect(utils.getByText('Automated')).toBeInTheDocument();
    expect(utils.getByText('Budget Rollovers')).toBeInTheDocument();

    // Fabricated marketing strings must NOT be present
    expect(screen.queryByText('₹4.8B+')).not.toBeInTheDocument();
    expect(screen.queryByText('99.98%')).not.toBeInTheDocument();
    expect(screen.queryByText('4.9 / 5')).not.toBeInTheDocument();
  });

  it('uses accessible radiogroup patterns for ComparisonSection and FaqSection filters', () => {
    renderLandingPage();

    // Comparison radiogroup
    const compRadioGroup = screen.getByRole('radiogroup', { name: /Filter comparison capabilities/i });
    expect(compRadioGroup).toBeInTheDocument();
    const allCompRadio = screen.getByRole('radio', { name: /All Capabilities/i });
    const autoCompRadio = screen.getByRole('radio', { name: /Core Automation/i });
    const secCompRadio = screen.getByRole('radio', { name: /Security & Privacy/i });

    expect(allCompRadio).toHaveAttribute('aria-checked', 'true');
    expect(autoCompRadio).toHaveAttribute('aria-checked', 'false');
    expect(secCompRadio).toHaveAttribute('aria-checked', 'false');

    // Click filter radio
    fireEvent.click(autoCompRadio);
    expect(allCompRadio).toHaveAttribute('aria-checked', 'false');
    expect(autoCompRadio).toHaveAttribute('aria-checked', 'true');

    // FAQ radiogroup
    const faqRadioGroup = screen.getByRole('radiogroup', { name: /Filter FAQ topics/i });
    expect(faqRadioGroup).toBeInTheDocument();
    const allFaqRadio = screen.getByRole('radio', { name: /^All$/i });
    const secFaqRadio = screen.getByRole('radio', { name: /^Security$/i });

    expect(allFaqRadio).toHaveAttribute('aria-checked', 'true');
    expect(secFaqRadio).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(secFaqRadio);
    expect(allFaqRadio).toHaveAttribute('aria-checked', 'false');
    expect(secFaqRadio).toHaveAttribute('aria-checked', 'true');
  });

  it('provides aria-pressed states on FeaturesBento interactive controls', () => {
    renderLandingPage();

    // Tax regime buttons
    const newRegimeBtn = screen.getByRole('button', { name: /New Regime/i });
    const oldRegimeBtn = screen.getByRole('button', { name: /Old Regime/i });
    expect(newRegimeBtn).toHaveAttribute('aria-pressed', 'true');
    expect(oldRegimeBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(oldRegimeBtn);
    expect(newRegimeBtn).toHaveAttribute('aria-pressed', 'false');
    expect(oldRegimeBtn).toHaveAttribute('aria-pressed', 'true');

    // Asset category selector buttons
    const fundsBtn = screen.getByRole('button', { name: /Mutual Funds/i });
    const goldBtn = screen.getByRole('button', { name: /Gold & Bullion/i });
    const reBtn = screen.getByRole('button', { name: /Real Estate/i });

    expect(fundsBtn).toHaveAttribute('aria-pressed', 'true');
    expect(goldBtn).toHaveAttribute('aria-pressed', 'false');
    expect(reBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(goldBtn);
    expect(fundsBtn).toHaveAttribute('aria-pressed', 'false');
    expect(goldBtn).toHaveAttribute('aria-pressed', 'true');

    // Subscription audit toggle
    const auditBtn = screen.getByRole('button', { name: /Mark Audited/i });
    expect(auditBtn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(auditBtn);
    expect(screen.getByRole('button', { name: /Reset/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders footer with accessible decorative heart icon and natural phrasing', () => {
    renderLandingPage();

    expect(screen.getByText(/Crafted with care/i)).toBeInTheDocument();
    expect(screen.getByText(/for intelligent savers/i)).toBeInTheDocument();
    // Care shouldn't be an aria-label on the icon causing stutter
    expect(screen.queryByLabelText('care')).not.toBeInTheDocument();
  });

  it('renders the Living Ledger in HeroSection with controls and stage headers', () => {
    renderLandingPage();

    // Verify stage column headers
    expect(screen.getByText('1. Inflow')).toBeInTheDocument();
    expect(screen.getByText('2. Categorized')).toBeInTheDocument();
    expect(screen.getByText('3. Optimized')).toBeInTheDocument();

    // Verify live telemetry routing counter and clock
    expect(screen.getByText(/transactions intelligently routed/i)).toBeInTheDocument();

    // Verify pause/resume control
    const pauseToggle = screen.getByRole('button', { name: /pause living ledger stream/i });
    expect(pauseToggle).toBeInTheDocument();
    expect(pauseToggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(pauseToggle);
    expect(screen.getByRole('button', { name: /resume living ledger stream/i })).toBeInTheDocument();
  });

  it('provides a shareable wealth trajectory button on InteractiveSimulator', () => {
    render(
      <MemoryRouter>
        <InteractiveSimulator />
      </MemoryRouter>
    );

    const shareBtn = screen.getByRole('button', { name: /share or copy this custom wealth plan/i });
    expect(shareBtn).toBeInTheDocument();

    fireEvent.click(shareBtn);
    expect(screen.getByText(/Plan Link Copied/i)).toBeInTheDocument();
  });

  it('triggers the secret vault modal when entering the Konami code', () => {
    renderLandingPage();

    expect(screen.queryByRole('dialog', { name: /Secret Vault Unlocked/i })).not.toBeInTheDocument();

    const sequence = [
      'ArrowUp',
      'ArrowUp',
      'ArrowDown',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowLeft',
      'ArrowRight',
      'b',
      'a'
    ];

    sequence.forEach((key) => {
      fireEvent.keyDown(window, { key });
    });

    const vaultDialog = screen.getByRole('dialog', { name: /Founding Member/i });
    expect(vaultDialog).toBeInTheDocument();
    expect(screen.getByText(/You Found the Founding Member Protocol/i)).toBeInTheDocument();

    // Close on escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /Founding Member/i })).not.toBeInTheDocument();
  });

  it('supports interactive tax bracket switching in FeaturesBento', () => {
    renderLandingPage();

    const bracket12L = screen.getByRole('button', { name: '₹12L' });
    const bracket20L = screen.getByRole('button', { name: '₹20L' });

    expect(bracket12L).toBeInTheDocument();
    expect(bracket20L).toBeInTheDocument();

    fireEvent.click(bracket12L);
    expect(bracket12L).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/At ₹12L: New Regime saves ₹45,500/i)).toBeInTheDocument();

    fireEvent.click(bracket20L);
    expect(bracket20L).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/At ₹20L: New Regime saves ₹96,200/i)).toBeInTheDocument();
  });

  it('displays the transparent pricing guarantee in the HeroSection', () => {
    renderLandingPage();

    expect(screen.getByText(/Free core tier forever · No credit card required · Zero hidden charges/i)).toBeInTheDocument();
  });
});
