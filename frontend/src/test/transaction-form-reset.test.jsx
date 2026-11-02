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

    // Verify category has NO forced default ("Food" is removed)
    const catSelect = screen.getByLabelText(/category/i);
    expect(catSelect.value).toBe('');

    // 2. Fill fields
    fireEvent.change(amountInput, { target: { value: '99.95' } });
    expect(amountInput.value).toBe('99.95');

    fireEvent.change(catSelect, { target: { value: 'Groceries' } });
    expect(catSelect.value).toBe('Groceries');

    const descInput = screen.getByPlaceholderText(/what was this for/i);
    fireEvent.change(descInput, { target: { value: 'Dinner with team' } });
    expect(descInput.value).toBe('Dinner with team');

    // 3. Submit
    const submitBtn = screen.getByRole('button', { name: /add expense/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(amountInput.value).toBe('');
      expect(descInput.value).toBe('');
      expect(screen.getByLabelText(/category/i).value).toBe('');
    });

    // 4. Close form
    fireEvent.click(screen.getByText('Close Form'));

    // 5. Open form second time
    fireEvent.click(screen.getByText('Open Add Form'));
    const secondAmountInput = screen.getByPlaceholderText(/0\.00/i);
    const secondDescInput = screen.getByPlaceholderText(/what was this for/i);
    const secondCatSelect = screen.getByLabelText(/category/i);

    expect(secondAmountInput.value).toBe('');
    expect(secondDescInput.value).toBe('');
    expect(secondCatSelect.value).toBe('');
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

  it('normalizes amount input: converts commas to dots, trims extra decimals and leading zeroes', () => {
    render(
      <AppStateContext.Provider value={mockState}>
        <AppActionsContext.Provider value={mockActions}>
          <TransactionForm
            isOpen={true}
            onClose={vi.fn()}
            onSubmit={vi.fn()}
          />
        </AppActionsContext.Provider>
      </AppStateContext.Provider>
    );

    const amountInput = screen.getByPlaceholderText(/0\.00/i);

    // Typing with comma (e.g. 500,50) converts to 500.50
    fireEvent.change(amountInput, { target: { value: '500,50' } });
    expect(amountInput.value).toBe('500.50');

    // Capping at 2 decimals (500.555 -> 500.55)
    fireEvent.change(amountInput, { target: { value: '500.555' } });
    expect(amountInput.value).toBe('500.55');

    // Cleans up multiple leading zeros (0500 -> 500)
    fireEvent.change(amountInput, { target: { value: '0500' } });
    expect(amountInput.value).toBe('500');

    // Preserves zero decimal prefix like 0.5
    fireEvent.change(amountInput, { target: { value: '0.5' } });
    expect(amountInput.value).toBe('0.5');
  });

  it('enforces category selection and does not default to Food', async () => {
    const onSubmit = vi.fn();
    render(
      <AppStateContext.Provider value={mockState}>
        <AppActionsContext.Provider value={mockActions}>
          <TransactionForm
            isOpen={true}
            onClose={vi.fn()}
            onSubmit={onSubmit}
          />
        </AppActionsContext.Provider>
      </AppStateContext.Provider>
    );

    // Initial category should be empty, not "Food"
    const catSelect = screen.getByLabelText(/category/i);
    expect(catSelect.value).toBe('');
    expect(screen.getByText('Choose Category')).toBeInTheDocument();

    // Fill amount but omit category
    const amountInput = screen.getByPlaceholderText(/0\.00/i);
    fireEvent.change(amountInput, { target: { value: '45.00' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /add expense/i });
    fireEvent.click(submitBtn);

    // Validation error should show
    expect(await screen.findByText(/please select a category/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('supports detailed descriptions up to 500 characters and passes description & note to submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });
    render(
      <AppStateContext.Provider value={mockState}>
        <AppActionsContext.Provider value={mockActions}>
          <TransactionForm
            isOpen={true}
            onClose={vi.fn()}
            onSubmit={onSubmit}
          />
        </AppActionsContext.Provider>
      </AppStateContext.Provider>
    );

    const amountInput = screen.getByPlaceholderText(/0\.00/i);
    fireEvent.change(amountInput, { target: { value: '250.75' } });

    const catSelect = screen.getByLabelText(/category/i);
    fireEvent.change(catSelect, { target: { value: 'Transport' } });

    const detailedDescription = 'Weekly commute metro card recharge + taxi fare for client meetings across tech hub.';
    const descInput = screen.getByPlaceholderText(/what was this for/i);
    fireEvent.change(descInput, { target: { value: detailedDescription } });

    expect(screen.getByText(`${detailedDescription.length}/500`)).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /add expense/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.amount).toBe(250.75);
    expect(payload.category).toBe('Transport');
    expect(payload.description).toBe(detailedDescription);
    expect(payload.note).toBe(detailedDescription);
  });

  it('supports flexible custom category entries', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ success: true });
    render(
      <AppStateContext.Provider value={mockState}>
        <AppActionsContext.Provider value={mockActions}>
          <TransactionForm
            isOpen={true}
            onClose={vi.fn()}
            onSubmit={onSubmit}
          />
        </AppActionsContext.Provider>
      </AppStateContext.Provider>
    );

    const amountInput = screen.getByPlaceholderText(/0\.00/i);
    fireEvent.change(amountInput, { target: { value: '120.00' } });

    // Select custom category
    const catSelect = screen.getByLabelText(/category/i);
    fireEvent.change(catSelect, { target: { value: '__custom__' } });

    const customInput = screen.getByPlaceholderText(/enter custom category name/i);
    fireEvent.change(customInput, { target: { value: 'Coffee & Roastery' } });

    const submitBtn = screen.getByRole('button', { name: /add expense/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.category).toBe('Coffee & Roastery');
  });

  it('clears category selection when toggling type between expense and income', () => {
    render(
      <AppStateContext.Provider value={mockState}>
        <AppActionsContext.Provider value={mockActions}>
          <TransactionForm
            isOpen={true}
            onClose={vi.fn()}
            onSubmit={vi.fn()}
          />
        </AppActionsContext.Provider>
      </AppStateContext.Provider>
    );

    const catSelect = screen.getByLabelText(/category/i);
    fireEvent.change(catSelect, { target: { value: 'Bills' } });
    expect(catSelect.value).toBe('Bills');

    // Toggle to income
    const incomeBtn = screen.getByRole('radio', { name: /income/i });
    fireEvent.click(incomeBtn);

    // Category should be reset to empty
    expect(screen.getByLabelText(/category/i).value).toBe('');
    expect(screen.getByText('Choose Category')).toBeInTheDocument();
  });
});
