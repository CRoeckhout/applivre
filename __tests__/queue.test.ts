import * as internals from '@/lib/sync/internals';
import { executeEntry } from '@/lib/sync/queue';
import type { QueueEntry } from '@/store/sync-queue';

jest.mock('@/lib/sync/internals', () => ({
  internalUpsertBook: jest.fn().mockResolvedValue(undefined),
  internalUpsertUserBook: jest.fn().mockResolvedValue(undefined),
  internalDeleteUserBook: jest.fn().mockResolvedValue(undefined),
  internalInsertSession: jest.fn().mockResolvedValue(undefined),
  internalUpsertLoan: jest.fn().mockResolvedValue(undefined),
  internalDeleteLoan: jest.fn().mockResolvedValue(undefined),
  internalUpsertSheet: jest.fn().mockResolvedValue(undefined),
  internalDeleteSheet: jest.fn().mockResolvedValue(undefined),
  internalUpsertChallenge: jest.fn().mockResolvedValue(undefined),
  internalDeleteChallenge: jest.fn().mockResolvedValue(undefined),
}));

// Aide à créer une QueueEntry minimale
function entry<K extends QueueEntry['kind']>(kind: K, payload: unknown): QueueEntry {
  return {
    id: 'test-id',
    createdAt: Date.now(),
    attempts: 0,
    kind,
    payload,
  } as QueueEntry;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('executeEntry', () => {
  test('route upsertBook vers internalUpsertBook', async () => {
    const book = { isbn: '123', title: 'T', authors: [] };
    await executeEntry(entry('upsertBook', { book }));
    expect(internals.internalUpsertBook).toHaveBeenCalledWith(book);
  });

  test('route upsertUserBook avec userId', async () => {
    const ub = { id: 'ub1', userId: 'u1', book: { isbn: '1', title: 't', authors: [] }, status: 'read', favorite: false };
    await executeEntry(entry('upsertUserBook', { ub, userId: 'u1' }));
    expect(internals.internalUpsertUserBook).toHaveBeenCalledWith(ub, 'u1');
  });

  test('route deleteUserBook avec id', async () => {
    await executeEntry(entry('deleteUserBook', { id: 'ub1' }));
    expect(internals.internalDeleteUserBook).toHaveBeenCalledWith('ub1');
  });

  test('route insertSession', async () => {
    const session = {
      id: 's1',
      userBookId: 'ub1',
      durationSec: 60,
      stoppedAtPage: 10,
      startedAt: '2026-01-01T00:00:00.000Z',
    };
    await executeEntry(entry('insertSession', { session }));
    expect(internals.internalInsertSession).toHaveBeenCalledWith(session);
  });

  test('route upsertLoan', async () => {
    const loan = { id: 'l1', userBookId: 'ub1', contactName: 'A', direction: 'lent', dateOut: '2026-01-01' };
    await executeEntry(entry('upsertLoan', { loan }));
    expect(internals.internalUpsertLoan).toHaveBeenCalledWith(loan);
  });

  test('route deleteLoan', async () => {
    await executeEntry(entry('deleteLoan', { id: 'l1' }));
    expect(internals.internalDeleteLoan).toHaveBeenCalledWith('l1');
  });

  test('route upsertSheet', async () => {
    const sheet = { userBookId: 'ub1', sections: [], updatedAt: '2026-01-01T00:00:00.000Z' };
    await executeEntry(entry('upsertSheet', { sheet }));
    expect(internals.internalUpsertSheet).toHaveBeenCalledWith(sheet);
  });

  test('route deleteSheet', async () => {
    await executeEntry(entry('deleteSheet', { userBookId: 'ub1' }));
    expect(internals.internalDeleteSheet).toHaveBeenCalledWith('ub1');
  });

  test('route upsertChallenge avec userId', async () => {
    const challenge = { year: 2026, target: 25 };
    await executeEntry(entry('upsertChallenge', { challenge, userId: 'u1' }));
    expect(internals.internalUpsertChallenge).toHaveBeenCalledWith(challenge, 'u1');
  });

  test('route deleteChallenge avec year et userId', async () => {
    await executeEntry(entry('deleteChallenge', { year: 2026, userId: 'u1' }));
    expect(internals.internalDeleteChallenge).toHaveBeenCalledWith(2026, 'u1');
  });
});
