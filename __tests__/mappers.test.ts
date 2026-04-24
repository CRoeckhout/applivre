import {
  bookFromDb,
  bookToDb,
  challengeFromDb,
  challengeToDb,
  loanFromDb,
  loanToDb,
  sessionFromDb,
  sessionToDb,
  sheetFromDb,
  sheetToDb,
  userBookFromDb,
  userBookToDb,
} from '@/lib/sync/mappers';
import type { Book, BookLoan, ReadingSession, ReadingSheet, UserBook } from '@/types/book';
import type { Challenge } from '@/store/challenges';

const USER_ID = '11111111-1111-1111-1111-111111111111';

const BOOK: Book = {
  isbn: '9782070368228',
  title: 'Le Petit Prince',
  authors: ['Antoine de Saint-Exupéry'],
  pages: 96,
  publishedAt: '1943',
  coverUrl: 'https://covers.openlibrary.org/b/isbn/9782070368228-L.jpg',
};

describe('Book mapper', () => {
  test('roundtrips full book', () => {
    expect(bookFromDb(bookToDb(BOOK))).toEqual(BOOK);
  });

  test('handles missing optional fields', () => {
    const minimal: Book = { isbn: '123', title: 'T', authors: [] };
    const roundtripped = bookFromDb(bookToDb(minimal));
    expect(roundtripped).toEqual(minimal);
  });
});

describe('UserBook mapper', () => {
  const UB: UserBook = {
    id: '22222222-2222-2222-2222-222222222222',
    userId: USER_ID,
    book: BOOK,
    status: 'reading',
    rating: 4,
    favorite: true,
    startedAt: '2026-04-01T10:00:00.000Z',
    finishedAt: undefined,
  };

  test('roundtrips', () => {
    const dbRow = userBookToDb(UB, USER_ID);
    const back = userBookFromDb(dbRow, BOOK);
    expect(back).toEqual(UB);
  });

  test('missing rating becomes undefined', () => {
    const ub: UserBook = { ...UB, rating: undefined };
    expect(userBookToDb(ub, USER_ID).rating).toBeNull();
    expect(userBookFromDb(userBookToDb(ub, USER_ID), BOOK).rating).toBeUndefined();
  });
});

describe('Session mapper', () => {
  const SESSION: ReadingSession = {
    id: '33333333-3333-3333-3333-333333333333',
    userBookId: '22222222-2222-2222-2222-222222222222',
    cycleId: '44444444-4444-4444-4444-444444444444',
    durationSec: 1800,
    stoppedAtPage: 47,
    startedAt: '2026-04-15T20:30:00.000Z',
  };

  test('roundtrips', () => {
    expect(sessionFromDb(sessionToDb(SESSION))).toEqual(SESSION);
  });

  test('maps stopped_at_page snake_case correctly', () => {
    expect(sessionToDb(SESSION).stopped_at_page).toBe(47);
  });
});

describe('Loan mapper', () => {
  const LOAN: BookLoan = {
    id: '44444444-4444-4444-4444-444444444444',
    userBookId: '22222222-2222-2222-2222-222222222222',
    contactName: 'Alice',
    direction: 'lent',
    dateOut: '2026-03-15',
    dateBack: undefined,
    note: 'à rendre avant juin',
  };

  test('roundtrips active loan', () => {
    expect(loanFromDb(loanToDb(LOAN))).toEqual(LOAN);
  });

  test('roundtrips closed loan', () => {
    const closed: BookLoan = { ...LOAN, dateBack: '2026-04-01' };
    expect(loanFromDb(loanToDb(closed))).toEqual(closed);
  });
});

describe('Sheet mapper', () => {
  const SHEET: ReadingSheet = {
    userBookId: '22222222-2222-2222-2222-222222222222',
    sections: [
      {
        id: '55555555-5555-5555-5555-555555555555',
        title: 'Histoire',
        body: 'Très bon rythme',
        rating: { value: 4, icon: 'star' },
      },
      {
        id: '66666666-6666-6666-6666-666666666666',
        title: 'Romance',
        body: '',
        rating: { value: 5, icon: 'heart' },
      },
    ],
    updatedAt: '2026-04-20T12:00:00.000Z',
  };

  test('stores sections inside content JSONB', () => {
    const row = sheetToDb(SHEET);
    expect(row.content).toEqual({ sections: SHEET.sections });
  });

  test('reads sections back from JSONB', () => {
    const dbRow = {
      id: 'x',
      user_book_id: SHEET.userBookId,
      content: { sections: SHEET.sections },
      is_public: false,
      updated_at: SHEET.updatedAt,
    };
    expect(sheetFromDb(dbRow)).toEqual(SHEET);
  });
});

describe('Challenge mapper', () => {
  const C: Challenge = { year: 2026, target: 25 };

  test('roundtrips', () => {
    const dbRow = {
      id: 'x',
      ...challengeToDb(C, USER_ID),
    };
    expect(challengeFromDb(dbRow)).toEqual(C);
  });

  test('maps target to target_count in DB', () => {
    expect(challengeToDb(C, USER_ID).target_count).toBe(25);
  });
});
