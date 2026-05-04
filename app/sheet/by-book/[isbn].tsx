// Liste des fiches publiques pour un ISBN. Atterrissage depuis le bouton
// "Fiches de lecture" sur /book/[isbn]. Filtre la fiche du user courant
// (déjà accessible via SheetPreview sur la page livre). Le rendu compact
// d'un item (SheetCard + bandeau rattaché en bas) vit dans
// components/public-sheet-list-item, partagé avec /profile/[userId].

import {
  PublicSheetListItem,
  type PublicSheetListItemRow,
} from "@/components/public-sheet-list-item";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

async function fetchPublicSheets(
  isbn: string,
): Promise<PublicSheetListItemRow[]> {
  const { data, error } = await supabase.rpc("list_public_sheets_for_book", {
    p_isbn: isbn,
  });
  if (error) throw error;
  return (data ?? []) as PublicSheetListItemRow[];
}

export default function PublicSheetsByBookScreen() {
  const { isbn } = useLocalSearchParams<{ isbn: string }>();
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;

  const sheetsQuery = useQuery({
    queryKey: ["public-sheets-for-book", isbn],
    queryFn: () => fetchPublicSheets(isbn!),
    enabled: Boolean(isbn),
    staleTime: 1000 * 60,
  });

  const otherSheets = useMemo(() => {
    return (sheetsQuery.data ?? []).filter(
      (s) => s.owner_id !== currentUserId,
    );
  }, [sheetsQuery.data, currentUserId]);

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top", "bottom"]}>
      <View className="flex-row items-center gap-2 px-4 pt-2 pb-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
        >
          <MaterialIcons name="arrow-back" size={22} color={themeInk} />
        </Pressable>
        <Text className="font-display text-xl text-ink">
          Fiches de lecture
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
      >
        {sheetsQuery.isLoading ? (
          <View className="mt-8 items-center">
            <ActivityIndicator color={themeInk} />
          </View>
        ) : otherSheets.length === 0 ? (
          <Text className="mt-8 text-center text-sm text-ink-muted">
            Aucune fiche publique pour ce livre.
          </Text>
        ) : (
          <View className="mt-2 gap-3">
            {otherSheets.map((row) => (
              <PublicSheetListItem key={row.sheet_id} row={row} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
