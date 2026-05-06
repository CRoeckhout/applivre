// Dispatch verb → body. Partagé entre la liste de feed (preview) et l'écran
// dédié /feed/[entryId] (full). Quand on ajoute un nouveau verbe (
// finished_reading, won_bingo, posted_review…), il suffit d'ajouter un case.
// Verbe inconnu → rien (forward-compatible : la DB peut introduire un
// nouveau verb avant qu'un client ne soit déployé).

import { PostedReviewBody } from "@/components/feed/posted-review-body";
import { SharedSheetBody } from "@/components/feed/shared-sheet-body";
import { type Feed } from "@grimolia/social";
import type { ReactNode } from "react";

export function renderFeedItemBody(entry: Feed.FeedEntry): ReactNode {
  switch (entry.verb) {
    case "shared_sheet":
      return entry.target_id ? (
        <SharedSheetBody sheetId={entry.target_id} />
      ) : null;
    case "posted_review":
      return entry.target_id ? (
        <PostedReviewBody reviewId={entry.target_id} meta={entry.meta} />
      ) : null;
    default:
      return null;
  }
}
