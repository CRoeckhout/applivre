// Couche d'isolation : tous les SELECT admin user-scoped passent par ici.
// La migration 0062 a introduit des RPC SECURITY DEFINER gate is_caller_admin
// pour fermer le trou où l'app mobile d'un admin agrégait les données de tous
// les users (les policies *_admin_select de 0059 autorisaient le RLS à laisser
// passer n'importe quel SELECT venant d'un admin authentifié).
//
// Si on bascule un jour sur une auth backend dédiée (service_role + check
// d'admin côté serveur Node), seul ce fichier est à réécrire : les panels
// consomment cette API stable, pas Supabase directement.

import { supabase } from "./supabase";
import type {
  BingoCompletionRow,
  BingoRow,
  BookLoanRow,
  ReadingChallengeRow,
  ReadingSessionRow,
  ReadingSheetRow,
  ReadingStatus,
  ReadingStreakDayRow,
  SocialFeedEntryRow,
  UserBadgeRow,
  UserBookRow,
} from "./types";

// ═══════════════ Types enrichis (jointures résolues par les RPC) ═══════════════

export type UserBookWithBook = UserBookRow & {
  book: {
    isbn: string;
    title: string;
    authors: string[];
    cover_url: string | null;
  } | null;
};

export type LoanWithBook = BookLoanRow & {
  user_book: {
    book_isbn: string;
    book: { isbn: string; title: string } | null;
  };
};

export type SessionWithBook = ReadingSessionRow & {
  user_book: {
    book_isbn: string;
    book: { isbn: string; title: string } | null;
  };
};

export type SheetWithBook = ReadingSheetRow & {
  user_book: {
    id: string;
    book_isbn: string;
    book: { isbn: string; title: string; cover_url: string | null } | null;
  };
};

// Overview : raccourci typé pour les `added_books` côté RPC.
export type OverviewAddedBook = {
  id: string;
  book_isbn: string;
  status: ReadingStatus;
  created_at: string;
  book: { isbn: string; title: string } | null;
};

export type OverviewComment = {
  id: string;
  target_kind: string;
  target_id: string;
  parent_id: string | null;
  body: string;
  deleted_at: string | null;
  created_at: string;
};

// Map "kind:id" -> infos pré-résolues côté serveur. Le panel TS construit
// directement sa Map<string, {label, author}> à partir de ça, sans plus
// faire de SELECT cross-user.
export type OverviewTargetInfo = Record<
  string,
  {
    label: string;
    author_user_id: string | null;
    author_label: string | null;
  }
>;

export type AdminUserOverview = {
  feed: SocialFeedEntryRow[];
  added_books: OverviewAddedBook[];
  comments: OverviewComment[];
  target_info: OverviewTargetInfo;
};

export type AdminUserChallenges = {
  bingos: BingoRow[];
  completions: BingoCompletionRow[];
  streak_days: ReadingStreakDayRow[];
  annual_challenges: ReadingChallengeRow[];
  read_by_year: Record<string, number>;
};

// ═══════════════ Helpers ═══════════════

async function callRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as T;
}

// ═══════════════ Panel queries ═══════════════

export function getAdminUserBadges(userId: string): Promise<UserBadgeRow[]> {
  return callRpc<UserBadgeRow[]>("admin_user_badges", { p_user_id: userId });
}

export function getAdminUserBooks(userId: string): Promise<UserBookWithBook[]> {
  return callRpc<UserBookWithBook[]>("admin_user_books", {
    p_user_id: userId,
  });
}

export function getAdminUserLoans(userId: string): Promise<LoanWithBook[]> {
  return callRpc<LoanWithBook[]>("admin_user_loans", { p_user_id: userId });
}

export function getAdminUserSessions(
  userId: string,
): Promise<SessionWithBook[]> {
  return callRpc<SessionWithBook[]>("admin_user_sessions", {
    p_user_id: userId,
  });
}

export function getAdminUserSheets(userId: string): Promise<SheetWithBook[]> {
  return callRpc<SheetWithBook[]>("admin_user_sheets", { p_user_id: userId });
}

export function getAdminUserOverview(
  userId: string,
): Promise<AdminUserOverview> {
  return callRpc<AdminUserOverview>("admin_user_overview", {
    p_user_id: userId,
  });
}

export function getAdminUserChallenges(
  userId: string,
): Promise<AdminUserChallenges> {
  return callRpc<AdminUserChallenges>("admin_user_challenges", {
    p_user_id: userId,
  });
}
