import { describe, it, expect } from 'vitest';

const filterGoals = (goals, query) => {
  if (!query || !query.trim()) return goals;
  const q = query.toLowerCase().trim();
  return goals.filter((g) => {
    const nameMatch = String(g.name || '').toLowerCase().includes(q);
    const notesMatch = String(g.notes || '').toLowerCase().includes(q);
    const catMatch = String(g.category || '').toLowerCase().includes(q);
    return nameMatch || notesMatch || catMatch;
  });
};

describe('Goals Search & Filter', () => {
  const sampleGoals = [
    { id: '1', name: 'Tokyo Trip', category: 'vacation', notes: 'Spring 2027 cherry blossoms' },
    { id: '2', name: 'MacBook Pro M4', category: 'gadget', notes: 'Work machine upgrade' },
    { id: '3', name: 'Rainy Day Fund', category: 'emergency_fund', notes: '6 months expenses' },
  ];

  it('returns all goals when search query is empty', () => {
    expect(filterGoals(sampleGoals, '')).toHaveLength(3);
    expect(filterGoals(sampleGoals, '   ')).toHaveLength(3);
  });

  it('filters goals by name case-insensitively', () => {
    const res = filterGoals(sampleGoals, 'tokyo');
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Tokyo Trip');
  });

  it('filters goals by notes', () => {
    const res = filterGoals(sampleGoals, 'cherry');
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Tokyo Trip');
  });

  it('filters goals by category', () => {
    const res = filterGoals(sampleGoals, 'emergency');
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe('Rainy Day Fund');
  });

  it('returns empty array when query does not match anything', () => {
    const res = filterGoals(sampleGoals, 'nonexistent');
    expect(res).toHaveLength(0);
  });
});
