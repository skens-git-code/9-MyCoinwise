import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TransactionForm from '../components/TransactionForm';
import { AppStateContext, AppActionsContext } from '../contexts/AppContext';

describe('TransactionForm Reset on Reopen (Bug #1 Fix)', () => {
  const mockState = {
    accounts: [{ id: 'acc-1', name: 'Checking', currency: 'USD' }],
    currency: 'USD',
    tr: (k, def) => def || k,
  };
  const mockActions = {};

  function HarnessWithKeyRemount() {
    const [isOpen, setIsOpen] = useState(false);
    const [instanceKey, setInstanceKey] = useState(0);

    const handleOpen = () => {
      setInstanceKey(k => k + 1);
      setIsOpen(true);
    };

    const handleClose = () => {
      setIsOpen(false);
    };

    const onSubmit = vi.fn().mockResolvedValue({ success: true });

    return (
      <AppStateContext.Provider value={mockState}>
        <AppActionsContext.Provider value={mockActions}>
          <div>
            <button onClick={handleOpen}>Open Add Form</button>
            <button onClick={handleClose}>Close Form</button>
            {isOpen && (
              <TransactionForm
                key={`add-${instanceKey}`}
                isOpen={isOpen}
                initialData={{ date: '2026-09-29' }}
                onClose={handleClose}
                onSubmit={onSubmit}
              />
            )}
          </div>
        </AppActionsContext.Provider>
      </AppStateContext.Provider>
    );
  }

  it('resets form fields on successful submit and guarantees clean fields on second open', async () => {
    render(<HarnessWithKeyRemount />);

    // 1. Open form
    fireEvent.click(screen.getByText('Open Add Form'));
    const amountInput = screen.getByPlaceholderText(/0\.00/i);
    expect(amountInput.value).toBe('');

    // 2. Fill fields
    fireEvent.change(amountInput, { target: { value: '99.95' } });
    expect(amountInput.value).toBe('99.95');

    const descInput = screen.getByPlaceholderText(/what was this for/i);
    fireEvent.change(descInput, { target: { value: 'Dinner with team' } });
    expect(descInput.value).toBe('Dinner with team');

    // 3. Submit
    const submitBtn = screen.getByRole('button', { name: /add expense/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(amountInput.value).toBe('');
      expect(descInput.value).toBe('');
    });

    // 4. Close form
    fireEvent.click(screen.getByText('Close Form'));

    // 5. Open form second time
    fireEvent.click(screen.getByText('Open Add Form'));
    const secondAmountInput = screen.getByPlaceholderText(/0\.00/i);
    const secondDescInput = screen.getByPlaceholderText(/what was this for/i);

    expect(secondAmountInput.value).toBe('');
    expect(secondDescInput.value).toBe('');
  });

  it('keeps edit transaction data intact when initialData has an id', async () => {
    const onEditSubmit = vi.fn().mockResolvedValue({ success: true });
    const editTx = {
      id: 'tx-100',
      type: 'expense',
      amount: 150.00,
      category: 'Food',
      note: 'Groceries',
      date: '2026-09-25',
    };

    render(
      <AppStateContext.Provider value={mockState}>
        <AppActionsContext.Provider value={mockActions}>
          <TransactionForm
            isOpen={true}
            initialData={editTx}
            onClose={vi.fn()}
            onSubmit={onEditSubmit}
          />
        </AppActionsContext.Provider>
      </AppStateContext.Provider>
    );

    const amountInput = screen.getByPlaceholderText(/0\.00/i);
    expect(amountInput.value).toBe('150');

    const updateBtn = screen.getByRole('button', { name: /save changes/i });
    fireEvent.click(updateBtn);

    await waitFor(() => {
      expect(onEditSubmit).toHaveBeenCalledTimes(1);
    });

    // For edit transactions, fields should not be wiped to empty
    expect(amountInput.value).toBe('150');
  });
});
