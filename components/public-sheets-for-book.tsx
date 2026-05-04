// Section "Fiches publiques d'autres lecteurs" affichée sur l'écran détail
// d'un livre. Query la fonction `list_public_sheets_for_book` (cf. migration
// 0049) et résout les profils auteurs via le profile lens du package social.
//
// Cache la section si la liste est vide — pas de "0 fiches publiques" affiché,
// trop bruyant. Filtre out la fiche du user courant (qu'il voit déjà via le
// SheetPreview au-dessus).

import { supabase } from "@/lib/supabase";
import { MaterialIcons } from "@expo/vector-icons";
import { useProfiles } from "@grimolia/social";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

type PublicSheetRow = {
  sheet_id: string;
  owner_id: string;
  updated_at: string;
  preview: string | null;
  section_count: number;
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

  // Filtre la fiche du user courant (visible via SheetPreview au-dessus).
  const otherSheets = useMemo(() => {
    return (sheetsQuery.data ?? []).filter(
      (s) => s.owner_id !== currentUserId,
    );
  }, [sheetsQuery.data, currentUserId]);

  const ownerIds = useMemo(
    () => otherSheets.map((s) => s.owner_id),
    [otherSheets],
  );
  const profilesQuery = useProfiles(ownerIds);

  if (sheetsQuery.isLoading || otherSheets.length === 0) return null;

  return (
    <View className="mt-8">
      <Text className="mb-3 font-display text-xl text-ink">
        Fiches d&apos;autres lecteurs
      </Text>
      <View className="gap-3">
        {otherSheets.map((s) => {
          const author = profilesQuery.data?.[s.owner_id];
          const label =
            author?.display_name || author?.username || "Anonyme";
          return (
            <Pressable
              key={s.sheet_id}
              onPress={() => router.push(`/sheet/view/${s.sheet_id}`)}
              className="overflow-hidden rounded-3xl bg-paper-warm p-4 active:opacity-80"
            >
              <View className="flex-row items-center gap-3">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-accent">
                  <MaterialIcons name="person" size={18} color="#fbf8f4" />
                </View>
                <View className="flex-1">
                  <Text className="font-sans-med text-ink">{label}</Text>
                  <Text
                    className="text-xs text-ink-muted"
                    numberOfLines={1}
                  >
                    {s.section_count} section
                    {s.section_count > 1 ? "s" : ""}
                    {s.preview ? ` · ${s.preview}` : ""}
                  </Text>
                </View>
                <Text className="text-2xl text-accent-deep">›</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
