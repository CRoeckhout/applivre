// Bouton "Fiches de lecture" sur la page livre. Affiché uniquement s'il y a
// au moins une fiche publique d'un AUTRE user (la fiche perso du user
// courant a son propre composant via SheetPreview). Tap → liste dédiée
// /sheet/by-book/[isbn].
//
// Le query share son cache avec l'écran liste (même queryKey) — pas de
// double round-trip.

import { supabase } from "@/lib/supabase";
import { MaterialIcons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

// Le bouton ne consomme que owner_id (pour filtrer la fiche perso) — les
// autres colonnes du retour RPC (book_*, appearance) sont ignorées ici, mais
// pré-fetchées par React Query, donc l'écran liste les retrouve en cache.
type PublicSheetRow = {
  sheet_id: string;
  owner_id: string;
};

async function fetchPublicSheets(isbn: string): Promise<PublicSheetRow[]> {
  const { data, error } = await supabase.rpc("list_public_sheets_for_book", {
    p_isbn: isbn,
  });
  if (error) throw error;
  return (data ?? []) as PublicSheetRow[];
}

export function PublicSheetsForBook({
  isbn,
  currentUserId,
}: {
  isbn: string;
  currentUserId: string | null | undefined;
}) {
  const router = useRouter();

  const sheetsQuery = useQuery({
    queryKey: ["public-sheets-for-book", isbn],
    queryFn: () => fetchPublicSheets(isbn),
    staleTime: 1000 * 60,
  });

  const otherSheets = useMemo(() => {
    return (sheetsQuery.data ?? []).filter(
      (s) => s.owner_id !== currentUserId,
    );
  }, [sheetsQuery.data, currentUserId]);

  if (sheetsQuery.isLoading || otherSheets.length === 0) return null;

  return (
    <Pressable
      onPress={() => router.push(`/sheet/by-book/${isbn}`)}
      className="mt-8 overflow-hidden rounded-3xl bg-paper-warm p-5 active:opacity-80"
      accessibilityLabel={`Voir ${otherSheets.length} fiche${otherSheets.length > 1 ? "s" : ""} de lecture publique${otherSheets.length > 1 ? "s" : ""}`}
    >
      <View className="flex-row items-center gap-4">
        <View className="h-12 w-12 items-center justify-center rounded-full bg-accent">
          <MaterialIcons name="auto-stories" size={24} color="#fbf8f4" />
        </View>
        <View className="flex-1">
          <Text className="font-display text-lg text-ink">
            Fiches de lecture
          </Text>
          <Text className="mt-0.5 text-sm text-ink-soft">
            {otherSheets.length} fiche{otherSheets.length > 1 ? "s" : ""}{" "}
            partagée{otherSheets.length > 1 ? "s" : ""} par d&apos;autres
            lecteurs
          </Text>
        </View>
        <Text className="text-2xl text-accent-deep">›</Text>
      </View>
    </Pressable>
  );
}
