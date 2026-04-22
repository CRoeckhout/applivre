export type ReadingStatus = 'to_read' | 'reading' | 'read' | 'abandoned';

export type BookSource = 'openlibrary' | 'googlebooks' | 'bnf' | 'manual';

export type Book = {
  isbn: string;
  title: string;
  authors: string[];
  pages?: number;
  publishedAt?: string;
  coverUrl?: string;
  source?: BookSource;
};

export type UserBook = {
  id: string;
  userId: string;
  book: Book;
  status: ReadingStatus;
  rating?: number;
  favorite: boolean;
  startedAt?: string;
  finishedAt?: string;
};

export type ReadingSession = {
  id: string;
  userBookId: string;
  durationSec: number;
  stoppedAtPage: number;
  startedAt: string;
};

export type BookLoan = {
  id: string;
  userBookId: string;
  contactName: string;
  direction: 'lent' | 'borrowed';
  dateOut: string;
  dateBack?: string;
  note?: string;
};

export type RatingIconKind = 'star' | 'heart' | 'chili';

export type SectionRating = {
  value: number;
  icon: RatingIconKind;
};

export type SheetSection = {
  id: string;
  title: string;
  body: string;
  rating?: SectionRating;
};

export type ReadingSheet = {
  userBookId: string;
  sections: SheetSection[];
  updatedAt: string;
};
