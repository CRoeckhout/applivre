import { usePaperScreenClass } from '@/components/app-fond-background';
import { BookPlaceholder } from '@/components/book-placeholder';
import { CategoryDrawer } from '@/components/sheet/category-drawer';
import { SheetActionBar } from '@/components/sheet/sheet-action-bar';
import { SheetSectionEditor } from '@/components/sheet/sheet-section-editor';
import { SheetCustomizer } from '@/components/sheet-customizer';
import { SheetPinchZoom } from '@/components/sheet/sheet-pinch-zoom';
import { SkiaSheetFondLayer } from '@/components/sheet/skia-sheet-fond-layer';
import { SkiaStaticStickerLayer } from '@/components/sheet/skia-static-sticker-layer';
import { PERSO_BORDER_ID } from '@/lib/borders/catalog';
import { SheetSurface } from '@/components/sheet-surface';
import { StickerLayer } from '@/components/sticker-layer';
import { StickerPickerModal } from '@/components/sticker-picker-modal';
import { useAuth } from '@/hooks/use-auth';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  appearancesEqual,
  sectionsEqual,
  stickersEqual,
  useUndoableSheetDraft,
} from '@/hooks/use-undoable-sheet-draft';
import * as Haptics from 'expo-haptics';
import { newId } from '@/lib/id';
import {
  DEFAULT_APPEARANCE,
  hexWithAlpha,
  SHEET_TEXT_SHADOW,
} from '@/lib/sheet-appearance';
import { MAX_STICKERS_PER_SHEET } from '@/lib/stickers/catalog';
import { getFont } from '@/lib/theme/fonts';
import { usePreferences } from '@/store/preferences';
import { useReadingSheetTemplates } from '@/store/reading-sheet-templates';
import { useTemplateDraft } from '@/store/template-draft';
import type {
  PlacedSticker,
  SheetAppearance,
  SheetSection,
} from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

// Éditeur de template, en deux étapes :
//   1. Édition visuelle (preview pleine, stickers manipulables, customizer
//      d'apparence, sections éditables, bouton "Stickers"). C'est l'écran
//      principal — l'user compose son template comme une fiche.
//   2. Drawer de finalisation (nom, genres, partage public) qui s'ouvre au
//      tap sur "Suivant". Le drawer porte le bouton "Créer le template"
//      qui sauve en DB.
//
// Routes :
//   /template/new            = création vide ; consomme `useTemplateDraft`
//                              au mount s'il est posé (typiquement depuis
//                              le "Sauvegarder comme template" d'une fiche).
//   /template/<uuid>         = édition d'un template du user. Sauve via
//                              `updateTemplate` en bypassant le drawer
//                              (l'édition existante n'a pas besoin de
//                              renommer/recroix genre, juste la fiche).

const SHEET_MAX_WIDTH = 380;

export default function TemplateEditorScreen() {
  const paperScreen = usePaperScreenClass();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const { session } = useAuth();
  const userId = session?.user.id;

  const mine = useReadingSheetTemplates((s) => s.mine);
  const genres = useReadingSheetTemplates((s) => s.genres);
  const createTemplate = useReadingSheetTemplates((s) => s.createTemplate);
  const updateTemplate = useReadingSheetTemplates((s) => s.updateTemplate);
  const deleteTemplate = useReadingSheetTemplates((s) => s.deleteTemplate);

  const isNew = id === 'new';
  const existing = useMemo(() => mine.find((t) => t.id === id), [mine, id]);

  // Consomme l'éventuel draft posé par "/sheet/[isbn]?Sauvegarder comme
  // template". `consume` clear le store une fois lu — on stocke le résultat
  // dans une ref pour ne le faire qu'une seule fois, même si React fait un
  // double-mount en Strict Mode (sinon la 2e exécution renverrait null et
  // on perdrait le draft entre les deux).
  const seedRef = useRef<ReturnType<typeof useTemplateDraft.getState>['draft'] | undefined>(undefined);
  if (seedRef.current === undefined) {
    seedRef.current = isNew ? useTemplateDraft.getState().consume() : null;
  }
  const seed = seedRef.current;

  useEffect(() => {
    if (isNew) return;
    if (mine.length === 0) return;
    if (!existing) {
      Alert.alert('Template introuvable', "Ce template n'existe pas ou n'est pas le tien.");
      router.replace('/templates' as never);
    }
  }, [isNew, existing, mine.length, router]);

  // Création (isNew) : pré-rempli "Nouveau template" pour éviter une fiche
  // sans titre et ne pas leak le titre du livre source (cas où l'user vient
  // de "Sauvegarder comme template" depuis une fiche). Édition d'un existing :
  // on reprend son nom.
  const [name, setName] = useState(
    existing?.name ?? (isNew ? 'Nouveau template' : seed?.defaultName ?? ''),
  );
  const [selectedGenres, setSelectedGenres] = useState<string[]>(existing?.genres ?? []);
  const [isPublic, setIsPublic] = useState<boolean>(existing?.isPublic ?? false);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [stickerInteracting, setStickerInteracting] = useState(false);

  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  // Drawer "Publication" pour éditer name/genres/isPublic d'un template
  // existant. Reprend FinalizeDrawer en mode 'edit' (pas de bouton "Créer").
  const [publishDrawerOpen, setPublishDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Draft local + historique undo/redo unifié pour sections + stickers +
  // appearance. Aligné sur l'éditeur de fiche : toute mutation est undoable,
  // rien n'est persisté en DB avant tap sur le bouton Enregistrer.
  // Le name / les genres / isPublic sont VOLONTAIREMENT hors undo : ce sont
  // de la metadata de publication, conceptuellement séparée du design. En
  // édition, ils sont persistés directement au tap "Enregistrer" du drawer
  // Publication (cf. persistMetadata), pas via le save du header.
  // En création, ils sont collectés une fois par FinalizeDrawer au "Valider".
  const {
    draft: sections,
    draftStickers: stickers,
    draftAppearance: appearance,
    setDraft: setSections,
    setDraftStickers: setStickers,
    setDraftAppearance: setAppearance,
    setDraftSilent: setSectionsSilent,
    setDraftStickersSilent: setStickersSilent,
    setDraftAppearanceSilent: setAppearanceSilent,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUndoableSheetDraft(
    existing?.sections ?? seed?.sections ?? defaultSections(),
    existing?.stickers ?? seed?.stickers ?? [],
    existing?.appearance ?? seed?.appearance ?? DEFAULT_APPEARANCE,
  );

  // Couche Skia fond : actif en mode perso uniquement (catalog garde le
  // rendu JSX interne à CardFrame — cf. sheet/view/[id]). Hooks usePreferences
  // placés ici (avant les early returns) pour respecter les rules-of-hooks.
  const themeFondIdReactive = usePreferences((s) => s.fondId);
  const themeFondOpacityReactive = usePreferences((s) => s.fondOpacity);
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

  // Hydrate quand l'existing arrive après le mount (fetchMine en cours).
  // Silent → ces resets ne polluent pas l'historique undo (avant cette
  // arrivée, le draft était sur les defaults, intéressant pour l'user
  // ni à conserver dans l'historique).
  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setAppearanceSilent(existing.appearance);
    setSectionsSilent(existing.sections);
    setStickersSilent(existing.stickers ?? []);
    setSelectedGenres(existing.genres);
    setIsPublic(existing.isPublic);
  }, [existing, setAppearanceSilent, setSectionsSilent, setStickersSilent]);

  const toggleGenre = (slug: string) => {
    setSelectedGenres((prev) =>
      prev.includes(slug) ? prev.filter((g) => g !== slug) : [...prev, slug],
    );
  };

  // ═════════ Sections (titre uniquement, body strippé côté template) ═════════
  // Helper unifié — porte le titre ET l'icône fournis par la CategoryDrawer
  // (suggestion = défaut du template, ou custom via IconPickerModal).
  // Aligne le comportement sur addSectionDraft du fiche editor.
  const addSectionFromCategory = (
    title: string,
    opts?: {
      materialIcon?: string;
      materialIconColor?: string;
      emoji?: string;
    },
  ) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSections((prev) => [
      ...prev,
      {
        id: newId(),
        title: trimmed,
        body: '',
        materialIcon: opts?.materialIcon,
        materialIconColor: opts?.materialIconColor,
        emoji: opts?.emoji,
      },
    ]);
  };
  const removeSectionByTitle = (title: string) => {
    const lower = title.trim().toLocaleLowerCase('fr');
    setSections((prev) =>
      prev.filter((s) => s.title.trim().toLocaleLowerCase('fr') !== lower),
    );
  };
  const updateSectionTitle = (sid: string, title: string) => {
    setSections((prev) => prev.map((s) => (s.id === sid ? { ...s, title } : s)));
  };
  const updateSectionMeta = (
    sid: string,
    meta: {
      title: string;
      materialIcon?: string;
      materialIconColor?: string;
      emoji?: string;
    },
  ) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sid
          ? {
              ...s,
              title: meta.title,
              materialIcon: meta.materialIcon,
              materialIconColor: meta.materialIconColor,
              emoji: meta.emoji,
            }
          : s,
      ),
    );
  };
  const removeSection = (sid: string) => {
    setSections((prev) => prev.filter((s) => s.id !== sid));
  };

  // ═════════ Stickers (drag/move/remove dans l'éditeur de template) ═════════
  const placeSticker = (stickerId: string): string | null => {
    if (stickers.length >= MAX_STICKERS_PER_SHEET) return null;
    const id = newId();
    setStickers((prev) => [
      ...prev,
      // x fraction (centre horizontal). y en dp absolu depuis le top —
      // 280dp tombe ~au milieu d'une fiche standard (header + 1 section).
      { id, stickerId, x: 0.5, y: 280, scale: 1, rotation: 0 },
    ]);
    return id;
  };
  const updateStickerTransform = (
    placementId: string,
    next: { x: number; y: number; scale: number; rotation: number },
  ) => {
    setStickers((prev) =>
      prev.map((s) => (s.id === placementId ? { ...s, ...next } : s)),
    );
  };
  const removeSticker = (placementId: string) => {
    setStickers((prev) => prev.filter((s) => s.id !== placementId));
  };
  const reorderSticker = (placementId: string, direction: 1 | -1) => {
    setStickers((prev) => {
      const idx = prev.findIndex((s) => s.id === placementId);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleNext = () => {
    if (sections.length === 0) {
      Alert.alert('Sections vides', 'Ajoute au moins une section au template.');
      return;
    }
    // Sur une édition existante, on sauve direct sans drawer — l'user a
    // déjà nommé son template à la création. Pour la création, le drawer
    // collecte nom/genres/partage avant de persister.
    if (!isNew) {
      void persistUpdate();
      return;
    }
    setFinalizeOpen(true);
  };

  const persistCreate = async () => {
    if (!userId) {
      Alert.alert('Connecte-toi', 'Tu dois être connecté pour sauvegarder un template.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Nom requis', 'Donne un nom à ton template avant de sauvegarder.');
      return;
    }
    setSaving(true);
    const t = await createTemplate({
      userId,
      name,
      appearance,
      sections: sections.map((s) => ({
        ...s,
        body: '',
        rating: s.rating ? { ...s.rating, value: 0 } : undefined,
      })),
      stickers: stickers.length > 0 ? stickers : undefined,
      genres: selectedGenres,
      isPublic,
    });
    setSaving(false);
    if (!t) {
      Alert.alert('Erreur', 'Impossible de créer le template. Réessaie.');
      return;
    }
    setFinalizeOpen(false);
    router.replace(`/template/${t.id}` as never);
  };

  const persistUpdate = async () => {
    if (!existing) return;
    setSaving(true);
    // Header save = design uniquement. name / genres / isPublic sont
    // gérés séparément par le drawer Publication (cf. persistMetadata).
    const t = await updateTemplate(existing.id, {
      appearance,
      sections,
      stickers,
    });
    setSaving(false);
    if (!t) {
      Alert.alert('Erreur', 'Impossible d’enregistrer les changements.');
      return;
    }
    router.back();
  };

  // Persiste immédiatement les changements de publication (name/genres/
  // isPublic) sans toucher au design. Branché sur le bouton "Enregistrer"
  // du drawer Publication, donc seulement appelé en édition d'un existing.
  const persistMetadata = async () => {
    if (!existing) return;
    setSaving(true);
    const t = await updateTemplate(existing.id, {
      name: name.trim() || existing.name,
      genres: selectedGenres,
      isPublic,
    });
    setSaving(false);
    if (!t) {
      Alert.alert('Erreur', "Impossible d'enregistrer la publication.");
      return;
    }
    setPublishDrawerOpen(false);
  };

  // Revert : si l'user ferme le drawer sans valider, on remet les valeurs
  // persistées pour éviter qu'un toggle non-confirmé ne traîne en state
  // local jusqu'à la prochaine sauvegarde.
  const revertMetadata = () => {
    if (!existing) return;
    setName(existing.name);
    setSelectedGenres(existing.genres);
    setIsPublic(existing.isPublic);
  };

  const handleDelete = () => {
    if (!existing) return;
    Alert.alert(
      'Supprimer ce template ?',
      'Cette action est irréversible. Les fiches déjà créées à partir de ce template ne sont pas affectées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await deleteTemplate(existing.id);
            router.back();
          },
        },
      ],
    );
  };

  if (!isNew && !existing && mine.length === 0) {
    return (
      <SafeAreaView className={`flex-1 items-center justify-center ${paperScreen}`}>
        <ActivityIndicator color="#c27b52" />
      </SafeAreaView>
    );
  }

  const fontDef = getFont(appearance.fontId as any);
  const fontFamily = fontDef.variants.display;

  // Dirty check pour le bouton save du header :
  //   - Existing : compare draft (sections/stickers/appearance) vs persisté.
  //     name / genres / isPublic ne participent PAS — ils sont saved
  //     directement au tap "Enregistrer" du drawer Publication.
  //   - New : on autorise dès qu'il y a au moins une section — `handleNext`
  //     ouvrira le FinalizeDrawer pour collecter nom/genres avant persist.
  const dirty = isNew
    ? sections.length > 0
    : !!existing &&
      (!appearancesEqual(appearance, existing.appearance) ||
        !sectionsEqual(sections, existing.sections) ||
        !stickersEqual(stickers, existing.stickers ?? EMPTY_STICKERS));

  return (
    <SafeAreaView className={`flex-1 ${paperScreen}`} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-60">
            <MaterialIcons name="arrow-back" size={22} color={theme.ink} />
          </Pressable>
          <View className="flex-row items-center gap-1">
            {existing ? (
              <Pressable
                onPress={handleDelete}
                hitSlop={8}
                className="h-10 w-10 items-center justify-center rounded-full active:opacity-60">
                <MaterialIcons name="delete-outline" size={22} color="#c8322a" />
              </Pressable>
            ) : null}
            <Pressable
              onPress={
                canUndo
                  ? () => {
                      Haptics.selectionAsync();
                      undo();
                    }
                  : undefined
              }
              disabled={!canUndo}
              hitSlop={8}
              accessibilityLabel="Annuler"
              accessibilityState={{ disabled: !canUndo }}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
              style={{ opacity: canUndo ? 1 : 0.35 }}>
              <MaterialIcons name="undo" size={22} color={theme.ink} />
            </Pressable>
            <Pressable
              onPress={
                canRedo
                  ? () => {
                      Haptics.selectionAsync();
                      redo();
                    }
                  : undefined
              }
              disabled={!canRedo}
              hitSlop={8}
              accessibilityLabel="Rétablir"
              accessibilityState={{ disabled: !canRedo }}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
              style={{ opacity: canRedo ? 1 : 0.35 }}>
              <MaterialIcons name="redo" size={22} color={theme.ink} />
            </Pressable>
            {isNew ? (
              <Pressable
                onPress={dirty && !saving ? handleNext : undefined}
                disabled={!dirty || saving}
                hitSlop={8}
                accessibilityLabel="Valider"
                accessibilityState={{ disabled: !dirty || saving }}
                className="h-10 items-center justify-center rounded-full bg-accent px-4 active:opacity-80"
                style={{ opacity: dirty && !saving ? 1 : 0.35 }}>
                <Text className="font-sans-med text-paper">Valider</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={dirty && !saving ? handleNext : undefined}
                disabled={!dirty || saving}
                hitSlop={8}
                accessibilityLabel="Enregistrer"
                accessibilityState={{ disabled: !dirty || saving }}
                className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
                style={{ opacity: dirty && !saving ? 1 : 0.35 }}>
                <MaterialIcons name="check" size={24} color={theme.ink} />
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView
          contentContainerClassName="pt-2 pb-32"
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!stickerInteracting}>
          {/* Largeur fixe SHEET_MAX_WIDTH, scroll latéral si écran étroit —
              cf. /sheet/[isbn]. Garantit que les positions des stickers
              rendent identique à la fiche réelle qui utilisera ce template. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!stickerInteracting}
            contentContainerStyle={{ minWidth: '100%', justifyContent: 'center' }}>
            {/* Pinch-zoom mobile. Le ScrollView parent n'a pas de padding
                horizontal → availableWidth = windowWidth.
                Skia underlay (fond perso) + overlay (stickers hybrides,
                cf. sheet/[isbn] pour le pattern). */}
            <SheetPinchZoom
              naturalWidth={SHEET_MAX_WIDTH}
              availableWidth={windowWidth}
              outerStyle={{
                backgroundColor: appearance.bgColor,
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
                  skipIds={selectedStickerId ? [selectedStickerId] : undefined}
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
                style={{ width: SHEET_MAX_WIDTH, position: 'relative' }}>
                <SheetSurface
                appearance={appearance}
                disableFond={useSkiaFond}>
                <View className="flex-row items-start gap-3">
                  <BookPlaceholder style={{ width: 48, height: 72, borderRadius: 6 }} />
                  <View className="flex-1">
                    <Text
                      style={[{ color: appearance.mutedColor }, SHEET_TEXT_SHADOW]}
                      className="text-xs uppercase tracking-wider">
                      Template
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={[
                        { color: appearance.textColor, fontFamily },
                        SHEET_TEXT_SHADOW,
                      ]}
                      className="text-xl">
                      {name.trim() || 'Sans nom'}
                    </Text>
                  </View>
                </View>

                <View className="mt-6">
                  {sections.map((section, i) => (
                    <View
                      key={section.id}
                      style={{
                        paddingVertical: 14,
                        borderTopWidth: i === 0 ? 0 : 1,
                        borderTopColor: hexWithAlpha(appearance.mutedColor, 0.22),
                      }}>
                      <SheetSectionEditor
                        section={section}
                        appearance={appearance}
                        fontFamily={fontFamily}
                        onUpdateMeta={(meta) =>
                          updateSectionMeta(section.id, meta)
                        }
                        onUpdateTitle={(t) => updateSectionTitle(section.id, t)}
                        onRemove={() => removeSection(section.id)}
                        bodyEditable={false}
                        ratingInteractive={false}
                      />
                    </View>
                  ))}
                </View>
                </SheetSurface>
                <StickerLayer
                  stickers={stickers}
                  selectedId={selectedStickerId}
                  onSelect={setSelectedStickerId}
                  onUpdateTransform={updateStickerTransform}
                  onDelete={(id) => {
                    removeSticker(id);
                    setSelectedStickerId(null);
                  }}
                  onReorder={reorderSticker}
                  onInteractChange={setStickerInteracting}
                />
              </Animated.View>
            </SheetPinchZoom>
          </ScrollView>

        </ScrollView>

        {/* SheetActionBar : ancrée bottom-center par défaut, draggable,
            toggle horizontal/vertical via long-press (cf. composant).
            Identique au fiche editor — save vit dans le header. */}
        <SheetActionBar
          actions={[
            {
              key: 'add-section',
              icon: 'playlist-add',
              label: 'Ajouter une section',
              onPress: () => setCategoryDrawerOpen(true),
            },
            {
              key: 'customize',
              icon: 'palette',
              label: "Personnaliser l'apparence",
              onPress: () => setCustomizerOpen(true),
            },
            {
              key: 'add-sticker',
              icon: 'emoji-emotions',
              label: 'Ajouter un sticker',
              onPress: () => setStickerPickerOpen(true),
            },
            // Publication : pas pertinent à la création (FinalizeDrawer s'en
            // charge au tap "Valider"), seulement en édition d'un existing.
            ...(isNew
              ? []
              : [
                  {
                    key: 'publish-status' as const,
                    icon: 'public' as const,
                    label: 'Publication',
                    description: 'Nom, catégories, partage public',
                    active: isPublic,
                    onPress: () => setPublishDrawerOpen(true),
                  },
                ]),
          ]}
        />

      </KeyboardAvoidingView>

      <SheetCustomizer
        open={customizerOpen}
        appearance={appearance}
        title="Personnaliser le template"
        subtitle={name.trim() || 'Sans nom'}
        onClose={() => setCustomizerOpen(false)}
        // Le bouton "Valider" du customizer ferme juste — les mutations
        // sont déjà appliquées en live via onChange. La persistance en DB
        // passe par le bouton global Suivant/Enregistrer.
        onSave={() => setCustomizerOpen(false)}
        drawer
        onChange={setAppearance}
      />

      <CategoryDrawer
        open={categoryDrawerOpen}
        onClose={() => setCategoryDrawerOpen(false)}
        categories={appearance.defaultCategories}
        usedTitles={sections.map((s) => s.title)}
        onAdd={(c) =>
          addSectionFromCategory(c.title, {
            materialIcon: c.materialIcon,
            materialIconColor: c.materialIconColor,
            emoji: c.emoji,
          })
        }
        onRemove={(title) => removeSectionByTitle(title)}
        onAddCustom={(r) =>
          addSectionFromCategory(r.title, {
            materialIcon: r.materialIcon,
            materialIconColor: r.materialIconColor,
            emoji: r.emoji,
          })
        }
      />

      <StickerPickerModal
        open={stickerPickerOpen}
        onClose={() => setStickerPickerOpen(false)}
        placedCount={stickers.length}
        maxCount={MAX_STICKERS_PER_SHEET}
        onPick={(stickerId) => {
          const placedId = placeSticker(stickerId);
          if (placedId) setSelectedStickerId(placedId);
        }}
      />

      {/* Drawer commun création + édition.
          - Mode 'create' (isNew) : collecte nom/genres/partage puis appelle
            persistCreate qui POST le template complet.
          - Mode 'edit' (existing) : "Enregistrer" appelle persistMetadata
            (updateTemplate partiel — name/genres/isPublic uniquement, le
            design n'est pas touché). Fermer sans valider (X / backdrop)
            revert au state persisté pour éviter qu'un toggle non-confirmé
            ne reste en mémoire. */}
      <FinalizeDrawer
        mode={isNew ? 'create' : 'edit'}
        open={isNew ? finalizeOpen : publishDrawerOpen}
        onClose={() => {
          if (isNew) {
            setFinalizeOpen(false);
            return;
          }
          setPublishDrawerOpen(false);
          revertMetadata();
        }}
        name={name}
        onChangeName={setName}
        defaultName={seed?.defaultName}
        genres={genres}
        selectedGenres={selectedGenres}
        onToggleGenre={toggleGenre}
        isPublic={isPublic}
        onToggleIsPublic={setIsPublic}
        saving={saving}
        onConfirm={isNew ? persistCreate : persistMetadata}
        theme={theme}
      />
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Drawer de finalisation / publication.
//   - Mode 'create' (template neuf) : collecte nom + catégories + partage,
//     puis persiste via "Créer le template" (onConfirm = createTemplate).
//   - Mode 'edit' (template existant) : édite les mêmes champs mais en
//     local state seulement. onConfirm ferme le drawer ; la persistance
//     passe par le bouton Enregistrer du header (le dirty check inclut
//     name/genres/isPublic).
// ═══════════════════════════════════════════════════════════════════════
function FinalizeDrawer({
  mode,
  open,
  onClose,
  name,
  onChangeName,
  defaultName,
  genres,
  selectedGenres,
  onToggleGenre,
  isPublic,
  onToggleIsPublic,
  saving,
  onConfirm,
  theme,
}: {
  mode: 'create' | 'edit';
  open: boolean;
  onClose: () => void;
  name: string;
  onChangeName: (v: string) => void;
  defaultName?: string;
  genres: { slug: string; label: string }[];
  selectedGenres: string[];
  onToggleGenre: (slug: string) => void;
  isPublic: boolean;
  onToggleIsPublic: (v: boolean) => void;
  saving: boolean;
  onConfirm: () => void;
  theme: { ink: string; inkMuted: string };
}) {
  const insets = useSafeAreaInsets();
  const heading = mode === 'create' ? 'Finaliser le template' : 'Publication';
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-ink/40" />
      <View
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-paper"
        style={{ paddingBottom: insets.bottom, maxHeight: '90%' }}>
        <View className="flex-row items-center justify-between px-5 pb-3 pt-4">
          <Text className="font-display text-xl text-ink">{heading}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
            <MaterialIcons name="close" size={18} color={theme.ink} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled">
          <Text className="font-sans-med text-sm text-ink">Nom du template</Text>
          <TextInput
            value={name}
            onChangeText={onChangeName}
            placeholder={defaultName ?? 'Ex. Romance contemporaine'}
            placeholderTextColor={theme.inkMuted}
            style={{ color: theme.ink }}
            className="mt-2 rounded-2xl bg-paper-warm px-4 py-3 text-base"
            maxLength={80}
          />

          <Text className="mt-5 font-sans-med text-sm text-ink">Catégories</Text>
          <Text className="text-xs text-ink-muted">
            Optionnel. Aide la communauté à trouver ton template.
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {genres.map((g) => {
              const active = selectedGenres.includes(g.slug);
              return (
                <Pressable
                  key={g.slug}
                  onPress={() => onToggleGenre(g.slug)}
                  className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:opacity-70 ${active ? 'bg-accent' : 'bg-paper-warm'}`}>
                  <MaterialIcons
                    name={active ? 'check' : 'add'}
                    size={13}
                    color={active ? '#fbf8f4' : theme.inkMuted}
                  />
                  <Text className={`text-sm ${active ? 'text-paper' : 'text-ink'}`}>
                    {g.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View className="mt-5 flex-row items-center justify-between rounded-2xl bg-paper-warm px-4 py-3">
            <View className="flex-1 pr-3">
              <Text className="font-sans-med text-sm text-ink">
                Partager à la communauté
              </Text>
              <Text className="text-xs text-ink-muted">
                Visible dans la galerie publique. Tu peux désactiver à tout moment.
              </Text>
            </View>
            <Switch value={isPublic} onValueChange={onToggleIsPublic} />
          </View>
        </ScrollView>

        <View className="flex-row gap-3 px-5 pt-3" style={{ paddingBottom: 12 }}>
          {mode === 'create' ? (
            <>
              <Pressable
                onPress={onClose}
                className="flex-1 items-center rounded-full bg-paper-warm px-4 py-3 active:bg-paper-shade">
                <Text className="font-sans-med text-sm text-ink">Retour</Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                disabled={saving}
                className="flex-1 items-center rounded-full bg-accent px-4 py-3 active:opacity-80"
                style={{ opacity: saving ? 0.6 : 1 }}>
                <Text className="font-sans-med text-sm text-paper">
                  {saving ? 'Enregistrement…' : 'Créer le template'}
                </Text>
              </Pressable>
            </>
          ) : (
            // Mode édition : "Enregistrer" persiste immédiatement la
            // metadata (name/genres/isPublic) via updateTemplate partiel.
            // Le design (sections/stickers/appearance) reste géré par le
            // save du header.
            <Pressable
              onPress={onConfirm}
              disabled={saving}
              className="flex-1 items-center rounded-full bg-accent px-4 py-3 active:opacity-80"
              style={{ opacity: saving ? 0.6 : 1 }}>
              <Text className="font-sans-med text-sm text-paper">
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

function defaultSections(): SheetSection[] {
  return [
    { id: newId(), title: 'Histoire', body: '', materialIcon: 'auto-stories' },
    { id: newId(), title: 'Personnages', body: '', materialIcon: 'group' },
    { id: newId(), title: "Ce que j'ai aimé", body: '', materialIcon: 'thumb-up' },
  ];
}

// Référence stable pour le dirty check quand `existing.stickers` est
// undefined — évite que `stickersEqual` traite chaque render comme un diff.
const EMPTY_STICKERS: PlacedSticker[] = [];
