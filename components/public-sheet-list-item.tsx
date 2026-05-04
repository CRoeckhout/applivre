// Item compact de fiche publique, partagé par /sheet/by-book/[isbn] et
// /profile/[userId]. Compose une SheetCard headerOnly (apparence figée à
// la version publiée par l'auteur) + un bandeau rattaché en bas (avatar +
// username + counts de réactions). Le bandeau passe sous la card via
// marginTop négatif + zIndex pour donner l'effet "tab".

import { SheetCard } from "@/components/sheet-card";
import {
  hexWithAlpha,
  resolvePublicAppearance,
} from "@/lib/sheet-appearance";
import { usePreferences } from "@/store/preferences";
import type {
  ReadingSheet,
  SheetAppearance,
  SheetAppearanceOverride,
  UserBook,
} from "@/types/book";
import { Reactions, useProfile } from "@grimolia/social";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

export type PublicSheetListItemRow = {
  sheet_id: string;
  owner_id: string;
  updated_at: string;
  book_isbn: string;
  book_title: string;
  book_cover_url: string | null;
  book_authors: string[] | null;
  appearance: SheetAppearanceOverride | null;
};

// Combien le bandeau s'enfonce sous la SheetCard. Doit ≥ borderRadius de
// la SheetSurface pour que la portion top flat reste cachée derrière l'arrondi.
const FOOTER_OVERLAP = 16;
const FOOTER_VISIBLE_PADDING = 8;

export function PublicSheetListItem({
  row,
  onPress,
}: {
  row: PublicSheetListItemRow;
  onPress?: () => void;
}) {
  const router = useRouter();
  const handlePress =
    onPress ?? (() => router.push(`/sheet/view/${row.sheet_id}`));
  return (
    <View>
      {/* zIndex 2 : la card peint AU-DESSUS du bandeau (qui slide dessous). */}
      <View style={{ zIndex: 2 }}>
        <SheetCardCompact row={row} onPress={handlePress} />
      </View>
      <FooterBanner sheetId={row.sheet_id} ownerId={row.owner_id} />
    </View>
  );
}

function SheetCardCompact({
  row,
  onPress,
}: {
  row: PublicSheetListItemRow;
  onPress: () => void;
}) {
  // Synthétise les types attendus par SheetCard. En mode `headerOnly`,
  // SheetCard ne lit que userBook.book.{isbn,title,coverUrl,authors} et
  // sheet.{updatedAt,sections}. Cast contrôlé.
  const userBook = useMemo(
    () =>
      ({
        book: {
          isbn: row.book_isbn,
          title: row.book_title,
          coverUrl: row.book_cover_url ?? undefined,
          authors: row.book_authors ?? [],
        },
      }) as unknown as UserBook,
    [row],
  );

  const sheet = useMemo(
    () =>
      ({
        userBookId: "",
        sections: [],
        updatedAt: row.updated_at,
        appearance: row.appearance ?? undefined,
      }) as ReadingSheet,
    [row],
  );

  // Pas d'accès au template global de l'auteur → `isCustom` n'a pas de sens
  // dans ce contexte, on force false. resolvePublicAppearance fige le fond
  // (fondId + opacity) pour que SheetSurface ne retombe pas sur les prefs
  // du visiteur.
  const appearance: SheetAppearance = useMemo(
    () => resolvePublicAppearance(row.appearance),
    [row.appearance],
  );

  return (
    <SheetCard
      userBook={userBook}
      sheet={sheet}
      appearance={appearance}
      isCustom={false}
      headerOnly
      onPress={onPress}
    />
  );
}

function FooterBanner({
  sheetId,
  ownerId,
}: {
  sheetId: string;
  ownerId: string;
}) {
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);

  const profileQuery = useProfile(ownerId);
  // currentUserId=null : on veut juste les counts globaux. Évite un
  // round-trip "ai-je réagi" inutile dans la liste.
  const summary = Reactions.useReactionSummary(
    { kind: "sheet", id: sheetId },
    null,
  );

  const profile = profileQuery.data;
  const username =
    profile?.username || profile?.display_name || "anonyme";
  const counts = summary.data?.counts;

  return (
    <Pressable
      onPress={() => router.push(`/profile/${ownerId}`)}
      accessibilityLabel={`Profil de ${username}`}
      style={{
        marginTop: -FOOTER_OVERLAP,
        paddingTop: FOOTER_OVERLAP + FOOTER_VISIBLE_PADDING,
        paddingHorizontal: 14,
        paddingBottom: FOOTER_VISIBLE_PADDING,
        backgroundColor: hexWithAlpha(themeInk, 0.06),
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
        marginHorizontal: 6,
        zIndex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
      className="active:opacity-80"
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          overflow: "hidden",
          backgroundColor: hexWithAlpha(themeInk, 0.12),
        }}
      >
        {profile?.avatar_url ? (
          <Image
            source={{ uri: profile.avatar_url }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontSize: 12,
          fontWeight: "500",
          color: themeInk,
        }}
      >
        @{username}
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Text
          style={{
            fontSize: 12,
            color: hexWithAlpha(themeInk, 0.7),
            fontVariant: ["tabular-nums"],
          }}
        >
          👍 {counts?.like ?? 0}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: hexWithAlpha(themeInk, 0.7),
            fontVariant: ["tabular-nums"],
          }}
        >
          ❤️ {counts?.love ?? 0}
        </Text>
      </View>
    </Pressable>
  );
}
