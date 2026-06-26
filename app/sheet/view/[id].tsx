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

import { usePaperScreenClass } from "@/components/app-fond-background";
import { BookCover } from "@/components/book-cover";
import { ReportMenuButton } from "@/components/report/report-menu-button";
import { SheetSectionEditor } from "@/components/sheet/sheet-section-editor";
import { SheetPinchZoom } from "@/components/sheet/sheet-pinch-zoom";
import { SkiaSheetFondLayer } from "@/components/sheet/skia-sheet-fond-layer";
import { SkiaStaticStickerLayer } from "@/components/sheet/skia-static-sticker-layer";
import { SheetSurface } from "@/components/sheet-surface";
import { PERSO_BORDER_ID } from "@/lib/borders/catalog";
import { UserCard } from "@/components/user-card";
import { useAuth } from "@/hooks/use-auth";
import { newId } from "@/lib/id";
import {
  ficheTextStyle,
  hexWithAlpha,
  resolvePublicAppearance,
  SHEET_TEXT_SHADOW,
} from "@/lib/sheet-appearance";
import { supabase } from "@/lib/supabase";
import { getFont } from "@/lib/theme/fonts";
import { usePreferences } from "@/store/preferences";
import { useViewedSheets, type PublicSheetBundle } from "@/store/viewed-sheets";
import type { SheetAppearance } from "@/types/book";
import { MaterialIcons } from "@expo/vector-icons";
import { Reactions } from "@grimolia/social";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

// Aligné sur le minHeight du TextInput body de l'éditeur (cf. SectionEditor
// dans app/sheet/[isbn].tsx). Garantit que les fiches éditées avec une
// section au body vide ne sautent pas de hauteur en read-only.
const SECTION_BODY_MIN_HEIGHT = 96;
const SECTION_BODY_LINE_HEIGHT = 22;

// Espace réservé en bas de la ScrollView pour que la pill sticky ne couvre
// pas le bas de la fiche. ≈ pill (44 bouton + 10*2 padding) + margin bas 12.
const PILL_BOTTOM_CLEARANCE = 88;

const SHEET_MAX_WIDTH = 380;

async function fetchPublicSheet(
  sheetId: string,
): Promise<PublicSheetBundle | null> {
  const { data, error } = await supabase.rpc("get_public_sheet", {
    p_sheet_id: sheetId,
  });
  if (error) throw error;
  const row = (data ?? [])[0] as PublicSheetBundle | undefined;
  return row ?? null;
}

export default function PublicSheetScreen() {
  const paperScreen = usePaperScreenClass();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themePaper = usePreferences((s) => s.colorBg);
  const themeFontId = usePreferences((s) => s.fontId);
  // Lus ici (avant les early returns sur loading/error) pour respecter
  // les rules-of-hooks — sinon l'ordre des hooks change selon le state
  // de la query et React throw "Rendered more hooks than previous render".
  const themeFondIdReactive = usePreferences((s) => s.fondId);
  const themeFondOpacityReactive = usePreferences((s) => s.fondOpacity);
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;

  const queryClient = useQueryClient();
  const sheetQuery = useQuery({
    queryKey: ["public-sheet", id],
    queryFn: () => fetchPublicSheet(id!),
    enabled: Boolean(id),
    staleTime: 1000 * 60,
  });

  // Invalide au focus pour récupérer les modifs après un Editer→Sauver→Retour.
  // En native stack le screen reste monté, donc refetchOnMount ne suffit pas.
  useFocusEffect(
    useCallback(() => {
      if (id) {
        void queryClient.invalidateQueries({ queryKey: ["public-sheet", id] });
      }
    }, [queryClient, id]),
  );

  // Cache offline-first (SWR) : on lit le dernier bundle connu et on l'écrase
  // à chaque fetch réussi. Hors ligne / avant le fetch, on rend le local au
  // lieu d'afficher « Fiche introuvable ». Le backend reste le SSOT.
  const cachedBundle = useViewedSheets((s) => (id ? s.byId[id] : undefined));
  useEffect(() => {
    if (sheetQuery.data) useViewedSheets.getState().save(sheetQuery.data);
  }, [sheetQuery.data]);

  const bundle: PublicSheetBundle | undefined = sheetQuery.data ?? cachedBundle;

  // Spinner seulement si on n'a RIEN à afficher (ni fetch ni cache).
  if (sheetQuery.isLoading && !bundle) {
    return (
      <SafeAreaView className={`flex-1 items-center justify-center ${paperScreen}`}>
        <ActivityIndicator color={themeInk} />
      </SafeAreaView>
    );
  }

  // « Introuvable » seulement si vraiment aucune donnée (jamais mise en cache
  // et fetch impossible/refusé) — pas sur une simple erreur réseau hors ligne.
  if (!bundle) {
    return (
      <SafeAreaView
        className={`flex-1 items-center justify-center ${paperScreen} px-8`}
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

  const isOwner = currentUserId !== null && bundle.owner_id === currentUserId;

  // Apparence : snapshot de l'auteur, fond figé via resolvePublicAppearance
  // (sinon SheetSurface retomberait sur les prefs du visiteur pour fond.fondId
  // et fond.opacity quand l'auteur ne les a pas explicitement set).
  const appearance: SheetAppearance = resolvePublicAppearance(
    bundle.content?.appearance,
  );
  // Police effective des catégories : on privilégie celle snapshotée par
  // l'auteur (appearance.fontId), sinon on retombe sur la police du thème
  // courant du lecteur — pas sur le hardcoded DEFAULT_APPEARANCE.fontId.
  const sheetFontId = bundle.content?.appearance?.fontId;
  const fontFamily = getFont((sheetFontId ?? themeFontId) as never).variants
    .display;
  const sections = bundle.content?.sections ?? [];
  const stickers = bundle.content?.stickers ?? [];

  // Skia fond seulement en mode perso (catalog garde le rendu JSX interne
  // à CardFrame — porter le suppress là-bas est un chantier séparé). Cf.
  // commentaire sur disableFond dans sheet-surface.tsx.
  const isPersoFrame =
    !appearance.frame.borderId ||
    appearance.frame.borderId === PERSO_BORDER_ID;
  const explicitFondId = appearance.fond?.fondId;
  const effectiveFondId = explicitFondId ?? themeFondIdReactive;
  const isThemeFondActive =
    !explicitFondId || explicitFondId === themeFondIdReactive;
  const effectiveFondOpacity =
    appearance.fond?.opacity ?? (isThemeFondActive ? themeFondOpacityReactive : 1);
  const useSkiaFond = isPersoFrame;

  return (
    <SafeAreaView className={`flex-1 ${paperScreen}`} edges={["top", "bottom"]}>
      <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
        >
          <MaterialIcons name="arrow-back" size={22} color={themeInk} />
        </Pressable>
        <View className="flex-row items-center gap-1">
          <MaterialIcons
            name={bundle.is_public ? "public" : "lock-outline"}
            size={14}
            color={themeInk}
          />
          <Text className="font-sans-med text-xs text-ink">
            {bundle.is_public ? "Fiche publique" : "Fiche privée"}
          </Text>
        </View>
        {isOwner ? (
          <Pressable
            onPress={() => router.push(`/sheet/${bundle.book_isbn}`)}
            hitSlop={8}
            accessibilityLabel="Éditer la fiche"
            className="h-10 flex-row items-center gap-1 rounded-full px-3 active:opacity-60"
            style={{ borderWidth: 1, borderColor: themeInk }}
          >
            <MaterialIcons name="edit" size={14} color={themeInk} />
            <Text className="font-sans-med text-xs text-ink">Éditer</Text>
          </Pressable>
        ) : (
          // Spacer pour préserver le justify-between du header. Le report
          // est désormais dans la pill sticky en bas, à droite du love.
          <View className="h-10 w-10" />
        )}
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            // Réserve la place de la pill sticky pour qu'elle ne masque pas
            // le bas de la fiche au scroll.
            paddingBottom: bundle.is_public ? PILL_BOTTOM_CLEARANCE : 24,
          }}
        >
          {isOwner ? null : (
            <View className="mb-4">
              <Text className="mb-2 font-sans-med text-sm text-ink-soft">
                Publiée par :
              </Text>
              <UserCard userId={bundle.owner_id} variant="rich" />
            </View>
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              minWidth: "100%",
              justifyContent: "center",
            }}
          >
            {/* Pinch-zoom mobile. availableWidth = windowWidth - 32
                (paddingHorizontal: 16 du ScrollView parent).
                - skiaUnderlay : fond image (mode perso seulement) rendu
                  AVANT l'inner JSX → crisp à toute échelle.
                - skiaOverlay : stickers rendus APRES → crisp aussi.
                En mode catalog, le fond reste rendu en JSX par CardFrame
                (et pixelize au zoom — limitation v1 documentée). */}
            <SheetPinchZoom
              naturalWidth={SHEET_MAX_WIDTH}
              availableWidth={windowWidth - 32}
              outerStyle={{
                // Cf. app/sheet/[isbn].tsx : pour un cadre catalog, le backing
                // de l'outer = la page (transparent → `bg-paper`), pas
                // `appearance.bgColor`, sinon liseré sous-pixel en bas au scale.
                backgroundColor: isPersoFrame ? appearance.bgColor : "transparent",
                borderRadius: appearance.frame.radius,
              }}
              skiaUnderlay={
                useSkiaFond
                  ? ({
                      scale,
                      translateX,
                      translateY,
                      fitScale,
                      naturalWidth,
                      naturalHeight,
                    }) => (
                      <SkiaSheetFondLayer
                        bgColor={appearance.bgColor}
                        fondId={effectiveFondId}
                        colorOverrides={appearance.fond?.colorOverrides}
                        opacity={effectiveFondOpacity}
                        outerWidth={naturalWidth * fitScale}
                        outerHeight={naturalHeight * fitScale}
                        naturalWidth={naturalWidth}
                        naturalHeight={naturalHeight}
                        scale={scale}
                        translateX={translateX}
                        translateY={translateY}
                        fitScale={fitScale}
                        borderRadius={appearance.frame.radius}
                      />
                    )
                  : undefined
              }
              skiaOverlay={({
                scale,
                translateX,
                translateY,
                fitScale,
                naturalWidth,
                naturalHeight,
              }) => (
                <SkiaStaticStickerLayer
                  stickers={stickers}
                  outerWidth={naturalWidth * fitScale}
                  outerHeight={naturalHeight * fitScale}
                  naturalWidth={naturalWidth}
                  naturalHeight={naturalHeight}
                  scale={scale}
                  translateX={translateX}
                  translateY={translateY}
                  fitScale={fitScale}
                />
              )}
            >
              <Animated.View
                entering={FadeInDown.duration(400)}
                style={{
                  width: SHEET_MAX_WIDTH,
                  position: "relative",
                }}
              >
                <SheetSurface
                appearance={appearance}
                disableFond={useSkiaFond}
              >
                <View className="flex-row items-start gap-3">
                  <BookCover
                    isbn={bundle.book_isbn}
                    coverUrl={bundle.book_cover_url ?? undefined}
                    style={{ width: 48, height: 72, borderRadius: 6 }}
                  />
                  <View className="justify-center flex-auto">
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
                          {
                            color: appearance.mutedColor,
                            ...ficheTextStyle(11),
                          },
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
                          borderTopColor: hexWithAlpha(
                            appearance.mutedColor,
                            0.22,
                          ),
                        }}
                      >
                        <SheetSectionEditor
                          section={section}
                          appearance={appearance}
                          fontFamily={fontFamily}
                          bodyEditable={false}
                          ratingInteractive={false}
                        />
                      </Animated.View>
                    ))}
                  </View>
                )}
              </SheetSurface>
                {/* Stickers déplacés dans la couche Skia (skiaOverlay
                ci-dessus) — pas de StaticStickerLayer JSX ici sinon
                double rendu. */}
              </Animated.View>
            </SheetPinchZoom>
          </ScrollView>
        </ScrollView>

        {/* Pill sticky : ancrée en bas de la viewport, flotte au-dessus du
            scroll. Cachée si fiche privée (aucune audience pouvant réagir). */}
        {bundle.is_public ? (
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              bottom: 12,
              left: 0,
              right: 0,
              alignItems: "center",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 999,
                backgroundColor: themePaper,
                borderWidth: 1,
                borderColor: hexWithAlpha(themeInk, 0.12),
                shadowColor: "#000",
                shadowOpacity: 0.12,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 4,
              }}
            >
              <Reactions.ReactionBar
                target={{ kind: "sheet", id: bundle.sheet_id }}
                currentUserId={currentUserId}
              />
              {/* Menu Signaler : visible uniquement sur une fiche qui n'est
                  pas la nôtre (ReportMenuButton avec hidden=isOwner — masque
                  totalement, on ne signale pas sa propre fiche). Séparateur
                  vertical pour démarquer l'action engagement (love) de
                  l'action modération (...). */}
              {!isOwner ? (
                <>
                  <View
                    style={{
                      width: 1,
                      height: 22,
                      backgroundColor: hexWithAlpha(themeInk, 0.18),
                    }}
                  />
                  <ReportMenuButton
                    target={{ kind: "sheet", id: bundle.sheet_id }}
                    size={20}
                    color={themeInk}
                  />
                </>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

