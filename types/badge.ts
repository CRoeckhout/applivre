export type BadgeFamily =
  | 'first_sheet'
  | 'sheets_count'
  | 'books_read'
  | 'first_bingo'
  | 'bingo_completed'
  | 'streak_max';

export type BadgeKey = string;

export type BadgeDef = {
  key: BadgeKey;
  family: BadgeFamily;
  tier?: number;
  primaryColor: string;
  showCount: boolean;
  title: string;
  description: string;
};

export type EarnedBadge = {
  key: BadgeKey;
  earnedAt: string;
};

export type BadgeStats = {
  sheetsCount: number;
  booksRead: number;
  bingoCompletedCount: number;
  streakMax: number;
};
