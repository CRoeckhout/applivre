// Body du verbe `shared_sheet` : rend la fiche en mode COMPACT (cover +
// titre + apparence snapshot, pas de sections), aligné sur l'item utilisé
// par /sheet/by-book et /profile/[userId]. Le détail complet vit derrière
// le tap → /sheet/view/[id].

import { SheetCard } from "@/components/sheet-card";
import { hexWithAlpha, resolvePublicAppearance } from "@/lib/sheet-appearance";
import { supabase } from "@/lib/supabase";
import { usePreferences } from "@/store/preferences";
import type {
  PlacedSticker,
  ReadingSheet,
  SheetAppearanceOverride,
  SheetSection,
  UserBook,
} from "@/types/book";
import { useProfile } from "@grimolia/social";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, Text, View } from "react-native";

type SheetBundle = {
  sheet_id: string;
  user_book_id: string;
  content: {
    sections?: SheetSection[];
    appearance?: SheetAppearanceOverride;
    stickers?: PlacedSticker[];
  } | null;
  is_public: boolean;
  updated_at: string;
  owner_id: string;
  book_isbn: string;
  book_title: string;
  book_authors: string[] | null;
  book_cover_url: string | null;
};

async function fetchSheetBundle(sheetId: string): Promise<SheetBundle | null> {
  const { data, error } = await supabase.rpc("get_public_sheet", {
    p_sheet_id: sheetId,
  });
  if (error) throw error;
  return ((data ?? [])[0] as SheetBundle | undefined) ?? null;
}

export function SharedSheetBody({ sheetId }: { sheetId: string }) {
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);

  const bundleQuery = useQuery({
    queryKey: ["public-sheet", sheetId],
    queryFn: () => fetchSheetBundle(sheetId),
    enabled: Boolean(sheetId),
    staleTime: 1000 * 60,
  });

  const bundle = bundleQuery.data;

  // Profil de l'auteur. Cache RQ partagée avec le header → instantané dans
  // 99% des cas (l'item de feed a déjà résolu le profil pour l'avatar).
  const ownerProfile = useProfile(bundle?.owner_id);
  const handle = ownerProfile.data?.username
    ? `@${ownerProfile.data.username}`
    : ownerProfile.data?.display_name || "Quelqu'un";

  const userBook = useMemo(() => {
    if (!bundle) return null;
    return {
      book: {
        isbn: bundle.book_isbn,
        title: bundle.book_title,
        coverUrl: bundle.book_cover_url ?? undefined,
        authors: bundle.book_authors ?? [],
      },
    } as unknown as UserBook;
  }, [bundle]);

  const sheet = useMemo(() => {
    if (!bundle) return null;
    return {
      userBookId: bundle.user_book_id,
      sections: bundle.content?.sections ?? [],
      stickers: bundle.content?.stickers ?? [],
      appearance: bundle.content?.appearance ?? undefined,
      updatedAt: bundle.updated_at,
    } as ReadingSheet;
  }, [bundle]);

  const appearance = useMemo(
    () => resolvePublicAppearance(bundle?.content?.appearance ?? null),
    [bundle?.content?.appearance],
  );

  if (bundleQuery.isLoading) {
    return (
      <View style={{ paddingVertical: 24, alignItems: "center" }}>
        <ActivityIndicator color={themeInk} />
      </View>
    );
  }

  if (!bundle || !userBook || !sheet) return null;

  return (
    <View style={{ padding: 12, gap: 8 }}>
      <Text
        style={{
          fontSize: 12,
          color: hexWithAlpha(themeInk, 0.65),
          paddingHorizontal: 2,
        }}
      >
        {handle} a partagé une fiche de lecture
      </Text>
      <SheetCard
        userBook={userBook}
        sheet={sheet}
        appearance={appearance}
        isCustom={false}
        headerOnly
        onPress={() => router.push(`/sheet/view/${bundle.sheet_id}`)}
      />
    </View>
  );
}
