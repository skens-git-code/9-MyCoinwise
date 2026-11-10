import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPost = vi.fn();

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      post: mockPost,
      get: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}));

describe('api.previewBankStatement upload resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends FormData by default and falls back to base64 JSON when server returns 400 Upload a statement file', async () => {
    const { api } = await import('../services/api');
    const file = new File(['Date,Description,Debit\n2026-10-12,Coffee,100'], 'statement.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    mockPost
      .mockRejectedValueOnce({
        response: { status: 400, data: { error: 'Upload a statement file.' } },
      })
      .mockResolvedValueOnce({
        data: { transactions: [{ id: '1', amount: 100 }], summary: { detected: 1 } },
      });

    const result = await api.previewBankStatement({ file, filename: 'statement.xlsx' });

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost.mock.calls[0][1]).toBeInstanceOf(FormData);
    expect(mockPost.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        filename: 'statement.xlsx',
        fileData: expect.any(String),
      })
    );
    expect(mockPost.mock.calls[1][1].fileData.length).toBeGreaterThan(0);
    expect(result.summary.detected).toBe(1);
  });

  it('does not swallow unrelated 400 errors such as PDF_PASSWORD_REQUIRED', async () => {
    const { api } = await import('../services/api');
    const file = new File(['%PDF-1.4'], 'locked.pdf', { type: 'application/pdf' });

    mockPost.mockRejectedValueOnce({
      response: { status: 400, data: { error: 'Password required', code: 'PDF_PASSWORD_REQUIRED' } },
    });

    await expect(api.previewBankStatement({ file, filename: 'locked.pdf' })).rejects.toMatchObject({
      response: { status: 400, data: { code: 'PDF_PASSWORD_REQUIRED' } },
    });
    expect(mockPost).toHaveBeenCalledTimes(1);
  });
});

