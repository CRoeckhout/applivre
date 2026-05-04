// Vue read-only d'une fiche de lecture publique. Accessible à n'importe quel
// authentifié via la fonction SECURITY DEFINER `get_public_sheet` (cf.
// migration 0049), qui ne renvoie la donnée que si la fiche est is_public.
//
// La fiche est rendue avec l'apparence snapshotée par l'auteur (content.appearance)
// — la fiche partagée est un objet figé visuellement, indépendant des prefs
// du lecteur.
//
// Hauteur des champs body alignée sur l'éditeur (minHeight: 96, lineHeight: 22)
// pour que le rendu read-only n'ait pas de saut de mise en page comparé à
// l'écran d'édition de l'auteur.

import { BookCover } from "@/components/book-cover";
import { SheetSurface } from "@/components/sheet-surface";
import { StaticStickerLayer } from "@/components/static-sticker-layer";
import { newId } from "@/lib/id";
import {
  DEFAULT_APPEARANCE,
  ficheTextStyle,
  hexWithAlpha,
  resolveSectionIcon,
  SHEET_TEXT_SHADOW,
} from "@/lib/sheet-appearance";
import { supabase } from "@/lib/supabase";
import { getFont } from "@/lib/theme/fonts";
import { usePreferences } from "@/store/preferences";
import type {
  PlacedSticker,
  SheetAppearance,
  SheetAppearanceOverride,
  SheetSection,
} from "@/types/book";
import { MaterialIcons } from "@expo/vector-icons";
import { useProfile } from "@grimolia/social";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

type PublicSheetBundle = {
  sheet_id: string;
  user_book_id: string;
  content: {
    sections?: SheetSection[];
    appearance?: SheetAppearanceOverride;
    stickers?: PlacedSticker[];
  } | null;
  updated_at: string;
  owner_id: string;
  book_isbn: string;
  book_title: string;
  book_authors: string[] | null;
  book_cover_url: string | null;
  book_pages: number | null;
};

// Aligné sur le minHeight du TextInput body de l'éditeur (cf. SectionEditor
// dans app/sheet/[isbn].tsx). Garantit que les fiches éditées avec une
// section au body vide ne sautent pas de hauteur en read-only.
const SECTION_BODY_MIN_HEIGHT = 96;
const SECTION_BODY_LINE_HEIGHT = 22;

const SHEET_MAX_WIDTH = 380;

async function fetchPublicSheet(sheetId: string): Promise<PublicSheetBundle | null> {
  const { data, error } = await supabase.rpc("get_public_sheet", {
    p_sheet_id: sheetId,
  });
  if (error) throw error;
  const row = (data ?? [])[0] as PublicSheetBundle | undefined;
  return row ?? null;
}

export default function PublicSheetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themePaper = usePreferences((s) => s.colorBg);
  const insets = useSafeAreaInsets();

  const sheetQuery = useQuery({
    queryKey: ["public-sheet", id],
    queryFn: () => fetchPublicSheet(id!),
    enabled: Boolean(id),
    staleTime: 1000 * 60,
  });

  const bundle = sheetQuery.data;
  const ownerProfile = useProfile(bundle?.owner_id);

  if (sheetQuery.isLoading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator color={themeInk} />
      </SafeAreaView>
    );
  }

  if (sheetQuery.isError || !bundle) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center bg-paper px-8"
        edges={["top", "bottom"]}
      >
        <MaterialIcons name="lock-outline" size={36} color={themeInk} />
        <Text className="mt-3 font-display text-2xl text-ink">
          Fiche introuvable
        </Text>
        <Text className="mt-2 text-center text-ink-muted">
          Cette fiche est privée ou a été retirée par son auteur.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 rounded-full border border-ink px-6 py-2.5 active:opacity-70"
        >
          <Text className="font-sans-med text-ink">Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Apparence : on prend le snapshot du créateur s'il existe, sinon le default
  // de l'app (PAS le template global de l'utilisateur courant — la fiche
  // partagée est figée).
  const appearance: SheetAppearance = {
    ...DEFAULT_APPEARANCE,
    ...(bundle.content?.appearance ?? {}),
  };
  const fontFamily = getFont(appearance.fontId as never).variants.display;
  const sections = bundle.content?.sections ?? [];
  const stickers = bundle.content?.stickers ?? [];

  const ownerLabel =
    ownerProfile.data?.display_name ||
    ownerProfile.data?.username ||
    "Anonyme";

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
        >
          <MaterialIcons name="arrow-back" size={22} color={themeInk} />
        </Pressable>
        <View className="flex-row items-center gap-1">
          <MaterialIcons name="public" size={14} color={themeInk} />
          <Text className="font-sans-med text-xs text-ink">Fiche publique</Text>
        </View>
        <View className="h-10 w-10" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
      >
        <View className="mb-3 flex-row items-center gap-2">
          <View
            className="h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: hexWithAlpha(themeInk, 0.08) }}
          >
            <MaterialIcons name="person" size={18} color={themeInk} />
          </View>
          <View className="flex-1">
            <Text className="text-xs text-ink-muted">Par</Text>
            <Text className="font-sans-med text-ink">{ownerLabel}</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ minWidth: "100%", justifyContent: "center" }}
        >
          <Animated.View
            entering={FadeInDown.duration(400)}
            style={{ width: SHEET_MAX_WIDTH, marginTop: 4, position: "relative" }}
          >
            <SheetSurface
              appearance={appearance}
              style={{
                shadowColor: "#000",
                shadowOpacity: 0.12,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: 6,
              }}
            >
              <View className="flex-row items-start gap-3">
                <BookCover
                  isbn={bundle.book_isbn}
                  coverUrl={bundle.book_cover_url ?? undefined}
                  style={{ width: 48, height: 72, borderRadius: 6 }}
                />
                <View className="flex-1">
                  <Text
                    style={[
                      { color: appearance.mutedColor },
                      SHEET_TEXT_SHADOW,
                    ]}
                    className="text-xs uppercase tracking-wider"
                  >
                    Fiche de lecture
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[
                      { color: appearance.textColor, fontFamily },
                      SHEET_TEXT_SHADOW,
                    ]}
                    className="text-xl"
                  >
                    {bundle.book_title}
                  </Text>
                  {bundle.book_authors && bundle.book_authors.length > 0 ? (
                    <Text
                      style={[
                        { color: appearance.mutedColor, ...ficheTextStyle(11) },
                        SHEET_TEXT_SHADOW,
                      ]}
                    >
                      {bundle.book_authors.join(", ")}
                    </Text>
                  ) : null}
                </View>
              </View>

              {sections.length === 0 ? (
                <Text
                  style={[
                    { color: appearance.mutedColor, marginTop: 24 },
                    SHEET_TEXT_SHADOW,
                  ]}
                  className="text-center"
                >
                  Cette fiche est vide.
                </Text>
              ) : (
                <View className="mt-6">
                  {sections.map((section, i) => (
                    <Animated.View
                      key={section.id ?? `section-${i}-${newId()}`}
                      entering={FadeIn.duration(300).delay(i * 40)}
                      style={{
                        paddingVertical: 14,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: hexWithAlpha(appearance.mutedColor, 0.22),
                      }}
                    >
                      <ReadOnlySection
                        section={section}
                        appearance={appearance}
                        fontFamily={fontFamily}
                      />
                    </Animated.View>
                  ))}
                </View>
              )}
            </SheetSurface>
            {/* Sibling de SheetSurface (cf. l'éditeur) — bornes alignées via
                le wrapper position:relative au-dessus, pour que les positions
                relatives (x/y dans [0,1]) tombent sur les mêmes pixels. */}
            <StaticStickerLayer stickers={stickers} />
          </Animated.View>
        </ScrollView>
      </ScrollView>
    </SafeAreaView>
  );
}

function ReadOnlySection({
  section,
  appearance,
  fontFamily,
}: {
  section: SheetSection;
  appearance: SheetAppearance;
  fontFamily: string;
}) {
  const ratingValue = section.rating?.value ?? 0;
  const resolvedIcon = resolveSectionIcon(section, appearance);
  const hasIcon = !!(resolvedIcon.emoji || resolvedIcon.materialIcon);
  return (
    <View>
      <Text
        style={[
          { color: appearance.textColor, fontFamily, ...ficheTextStyle(18) },
          SHEET_TEXT_SHADOW,
        ]}
      >
        {section.title || "Sans titre"}
      </Text>

      {hasIcon && ratingValue > 0 ? (
        <View className="mt-2 flex-row items-center gap-2">
          {[1, 2, 3, 4, 5].map((i) => {
            const filled = i <= ratingValue;
            return (
              <View key={i} style={{ opacity: filled ? 1 : 0.25 }}>
                {resolvedIcon.emoji ? (
                  <Text style={[ficheTextStyle(22), SHEET_TEXT_SHADOW]}>
                    {resolvedIcon.emoji}
                  </Text>
                ) : (
                  <MaterialIcons
                    name={
                      resolvedIcon.materialIcon as keyof typeof MaterialIcons.glyphMap
                    }
                    size={22}
                    color={
                      resolvedIcon.materialIconColor ?? appearance.textColor
                    }
                  />
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      <Text
        style={[
          {
            color: appearance.textColor,
            minHeight: SECTION_BODY_MIN_HEIGHT,
            lineHeight: SECTION_BODY_LINE_HEIGHT,
          },
          SHEET_TEXT_SHADOW,
        ]}
        className="mt-3 text-base"
      >
        {section.body ?? ""}
      </Text>
    </View>
  );
}
