import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppContext } from '../contexts/AppContext';
import { ToastProvider } from '../components/ToastProvider';
import Transactions from '../pages/Transactions';

vi.mock('../services/api', () => ({
  api: {
    getTransactions: vi.fn().mockResolvedValue([]),
    deleteTransaction: vi.fn().mockResolvedValue({ success: true }),
  },
  CURRENCIES: {
    INR: { symbol: '₹', name: 'Indian Rupee' },
  },
  getStoredToken: vi.fn(() => 'mock-token'),
}));

describe('Paytm Transaction Ticket Component & Mobile Polish', () => {
  const mockUser = {
    id: 'u1',
    _id: 'u1',
    username: 'Test User',
    currency: 'INR',
  };

  const sampleTx = {
    id: 'tx-766',
    _id: 'tx-766',
    amount: 766,
    type: 'expense',
    category: 'Tech',
    merchant: 'Electronics Store',
    note: 'etg',
    tags: ['gadgets'],
    transaction_number: 'TXN-987654321',
    date: '2026-09-23T12:00:00.000Z',
    is_deleted: false,
  };

  const mockContext = {
    user: mockUser,
    transactions: [sampleTx],
    currency: 'INR',
    currencySymbol: '₹',
    formatCurrency: (val) => `₹${Number(val).toFixed(2)}`,
    fmt: (val) => `₹${Number(val).toFixed(2)}`,
    t: () => null,
    theme: 'light',
  };

  it('renders ticket receipt with notches, breakdown rows, and 2x2 action buttons when transaction is clicked', async () => {
    const { container } = render(
      <MemoryRouter>
        <ToastProvider>
          <AppContext.Provider value={mockContext}>
            <Transactions />
          </AppContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    );

    const txItem = container.querySelector('.il-item');
    fireEvent.click(txItem);

    // Verify ticket card renders
    const ticketCard = container.querySelector('.tx-ticket-card');
    expect(ticketCard).toBeTruthy();
    expect(ticketCard).toBeTruthy();
    expect(ticketCard).toBeTruthy();

    // Verify "PAYMENT RECEIPT" badge
    expect(screen.getByText(/PAYMENT RECEIPT/i)).toBeTruthy();

    // Verify amount and category
    expect(container.querySelector('.tx-ticket-amount').textContent).toBe('-₹766.00');
    expect(screen.getByText(/Paid Successfully/i)).toBeTruthy();

    // Verify semicircular punch notches and perforated line
    const leftNotch = container.querySelector('.tx-ticket-notch.left');
    const rightNotch = container.querySelector('.tx-ticket-notch.right');
    const dashedLine = container.querySelector('.tx-ticket-line');
    expect(leftNotch).toBeTruthy();
    expect(rightNotch).toBeTruthy();
    expect(dashedLine).toBeTruthy();

    // Verify receipt breakdown items
    expect(screen.getAllByText('Electronics Store').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('etg')).toBeTruthy();
    expect(ticketCard.querySelector('.ttr-tag-chip').textContent).toBe('#gadgets');
    expect(screen.getByText('TXN-987654321')).toBeTruthy();

    // Verify all 4 action buttons are present inside .tx-ticket-actions
    const editBtn = container.querySelector('.tx-ticket-btn.edit');
    const duplicateBtn = container.querySelector('.tx-ticket-btn.duplicate');
    const copyBtn = container.querySelector('.tx-ticket-btn.copy');
    const deleteBtn = container.querySelector('.tx-ticket-btn.delete');

    expect(editBtn).toBeTruthy();
    expect(duplicateBtn).toBeTruthy();
    expect(copyBtn).toBeTruthy();
    expect(deleteBtn).toBeTruthy();

    // Verify close (✕) button dismisses the ticket
    const closeBtn = container.querySelector('.tx-ticket-close-btn');
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);

    // Ticket should now be dismissed and empty state shown
    await screen.findByText(/Select a Transaction/i);
    await waitFor(() => {
      expect(container.querySelector('.tx-ticket-card')).toBeNull();
    });
  });
});
