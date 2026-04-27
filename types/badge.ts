// Badge identifié par sa clé (ex: 'first_sheet', 'sheets_count:5').
// Le catalog complet (titre, desc, visuel, règle) vit côté serveur dans
// public.badge_catalog et est récupéré via le store badge-catalog.
export type BadgeKey = string;

export type GraphicKind = 'svg' | 'lottie';

export type BadgeCatalogEntry = {
  badgeKey: BadgeKey;
  title: string;
  description: string;
  graphicKind: GraphicKind;
  graphicPayload: string;
  // Pour SVG : `{{name}}` placeholders → valeur (text replace).
  // Pour Lottie : `"layer_name": "#hex"` mapping → colorFilters au render.
  graphicTokens: Record<string, string>;
  retiredAt: string | null;
};

export type EarnedBadge = {
  key: BadgeKey;
  earnedAt: string;
};
