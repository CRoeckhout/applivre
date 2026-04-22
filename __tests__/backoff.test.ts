import { nextRetryDelayMs } from '@/lib/sync/backoff';

describe('nextRetryDelayMs', () => {
  test('doublement par tentative', () => {
    expect(nextRetryDelayMs(0)).toBe(2000);
    expect(nextRetryDelayMs(1)).toBe(4000);
    expect(nextRetryDelayMs(2)).toBe(8000);
    expect(nextRetryDelayMs(3)).toBe(16000);
  });

  test('plafonnement à 30s', () => {
    expect(nextRetryDelayMs(4)).toBe(30000);
    expect(nextRetryDelayMs(10)).toBe(30000);
  });

  test('attempts négatif traité comme 0', () => {
    expect(nextRetryDelayMs(-1)).toBe(2000);
    expect(nextRetryDelayMs(-5)).toBe(2000);
  });
});
