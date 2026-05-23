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
  AdminUserProfile,
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
    book: { isbn: string; title: string; cover_url: string | null } | null;
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

export function getAdminUserProfile(
  userId: string,
): Promise<AdminUserProfile | null> {
  return callRpc<AdminUserProfile | null>("admin_user_profile", {
    p_user_id: userId,
  });
}

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

// ═══════════════ Modération ═══════════════

export type ModerationQueueRow = {
  owner_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_banned: boolean;
  pending_count: number;
  total_count: number;
  last_reported_at: string;
};

export type ReportTargetKind = "feed_entry" | "comment" | "sheet" | "bingo" | "user";

export type ModerationReport = {
  id: string;
  target_kind: ReportTargetKind;
  target_id: string;
  reason: string;
  details: string | null;
  status: "pending" | "reviewed" | "dismissed" | "actioned";
  created_at: string;
  reporter_id: string;
  reporter_username: string | null;
  reporter_display_name: string | null;
  reporter_avatar_url: string | null;
  // jsonb preview du contenu signalé (forme variable selon target_kind).
  preview: Record<string, unknown> | null;
  owner_id: string;
};

export type ModerateAction = "delete" | "delete_and_ban" | "ignore";

export type ModerateRecipient = {
  user_id: string;
  role: "author" | "reporter";
  kind: ReportTargetKind;
  target_id: string;
};

export type ModerationQueueFilter = "pending" | "all" | "closed";

export function getModerationQueue(
  filter: ModerationQueueFilter = "pending",
): Promise<ModerationQueueRow[]> {
  return callRpc<ModerationQueueRow[]>("admin_moderation_queue", {
    p_status_filter: filter,
  });
}

// ═══════════════ Enquête : stats + activité + contexte ═══════════════

export type UserModerationStats = {
  total: number;
  pending: number;
  reviewed: number;
  actioned: number;
  dismissed: number;
  distinct_reporters: number;
  first_reported_at: string | null;
  last_reported_at: string | null;
  banned_at: string | null;
  banned_reason: string | null;
  banned_by: string | null;
  removed_content_count: number;
};

export type RecentContentItem = {
  kind: "feed_entry" | "comment" | "sheet";
  target_id: string;
  created_at: string;
  removed_at: string | null;
  preview: Record<string, unknown>;
};

export type ReporterStat = {
  total: number;
  pending: number;
  reviewed: number;
  actioned: number;
  dismissed: number;
};

export type ContentContext = {
  // feed_entry shape
  entry?: {
    id: string;
    actor_id: string;
    verb: string;
    meta: Record<string, unknown>;
    visibility: string;
    created_at: string;
    removed_at: string | null;
    target_kind: string | null;
    target_id: string | null;
  };
  actor?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  comments?: Array<{
    id: string;
    user_id: string;
    username: string | null;
    body: string;
    created_at: string;
    deleted_at: string | null;
    removed_at: string | null;
    parent_id: string | null;
  }>;
  target_content?: {
    kind: "sheet" | "bingo" | "feed_entry";
    id: string;
    [k: string]: unknown;
  } | null;

  // comment shape
  comment?: {
    id: string;
    user_id: string;
    username: string | null;
    body: string;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
    removed_at: string | null;
    target_kind: string;
    target_id: string;
    parent_id: string | null;
  };
  parent?: Record<string, unknown> | null;
  siblings?: Array<{
    id: string;
    user_id: string;
    username: string | null;
    body: string;
    created_at: string;
    parent_id: string | null;
    deleted_at: string | null;
    removed_at: string | null;
    is_signaled: boolean;
  }>;

  // sheet shape
  sheet?: Record<string, unknown>;
  book?: { isbn: string; title: string; authors: string[]; cover_url: string | null };

  // bingo shape
  bingo?: Record<string, unknown>;

  // user shape
  profile?: Record<string, unknown>;
};

export function getUserModerationStats(
  userId: string,
): Promise<UserModerationStats> {
  return callRpc<UserModerationStats>("admin_user_moderation_stats", {
    p_user_id: userId,
  });
}

export function getUserRecentContent(
  userId: string,
  limit = 20,
): Promise<RecentContentItem[]> {
  return callRpc<RecentContentItem[]>("admin_user_recent_content", {
    p_user_id: userId,
    p_limit: limit,
  });
}

export function getReporterStats(
  reporterIds: string[],
): Promise<Record<string, ReporterStat>> {
  if (reporterIds.length === 0) return Promise.resolve({});
  return callRpc<Record<string, ReporterStat>>("admin_reporter_stats", {
    p_reporter_ids: reporterIds,
  });
}

export function getContentContext(
  kind: ReportTargetKind,
  targetId: string,
): Promise<ContentContext> {
  return callRpc<ContentContext>("admin_content_context", {
    p_kind: kind,
    p_target_id: targetId,
  });
}

export function getModerationUserReports(
  userId: string,
): Promise<ModerationReport[]> {
  return callRpc<ModerationReport[]>("admin_moderation_user_reports", {
    p_user_id: userId,
  });
}

export async function moderate(
  reportIds: string[],
  action: ModerateAction,
  reason: string | null,
): Promise<{ recipients: ModerateRecipient[] }> {
  return callRpc<{ recipients: ModerateRecipient[] }>("admin_moderate", {
    p_report_ids: reportIds,
    p_action: action,
    p_reason: reason,
  });
}

export function banUser(userId: string, reason: string | null): Promise<void> {
  return callRpc<void>("admin_ban_user", {
    p_user_id: userId,
    p_reason: reason,
  });
}

export function unbanUser(userId: string): Promise<void> {
  return callRpc<void>("admin_unban_user", { p_user_id: userId });
}

export function getUnreadReportsCount(): Promise<number> {
  return callRpc<number>("admin_unread_reports_count", {});
}

export function sendModerationMessage(
  toUserId: string,
  body: string,
): Promise<string> {
  return callRpc<string>("admin_send_moderation_message", {
    p_to_user_id: toUserId,
    p_body: body,
  });
}
