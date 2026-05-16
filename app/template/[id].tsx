import { BookPlaceholder } from '@/components/book-placeholder';
import { SheetSectionEditor } from '@/components/sheet/sheet-section-editor';
import { SheetCustomizer } from '@/components/sheet-customizer';
import { SheetSurface } from '@/components/sheet-surface';
import { StickerLayer } from '@/components/sticker-layer';
import { StickerPickerModal } from '@/components/sticker-picker-modal';
import { useAuth } from '@/hooks/use-auth';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { newId } from '@/lib/id';
import {
  DEFAULT_APPEARANCE,
  hexWithAlpha,
  SHEET_TEXT_SHADOW,
} from '@/lib/sheet-appearance';
import { MAX_STICKERS_PER_SHEET } from '@/lib/stickers/catalog';
import { getFont } from '@/lib/theme/fonts';
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
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

  const [name, setName] = useState(existing?.name ?? seed?.defaultName ?? '');
  const [appearance, setAppearance] = useState<SheetAppearance>(
    existing?.appearance ?? seed?.appearance ?? DEFAULT_APPEARANCE,
  );
  const [sections, setSections] = useState<SheetSection[]>(
    existing?.sections ?? seed?.sections ?? defaultSections(),
  );
  const [stickers, setStickers] = useState<PlacedSticker[]>(
    existing?.stickers ?? seed?.stickers ?? [],
  );
  const [selectedGenres, setSelectedGenres] = useState<string[]>(existing?.genres ?? []);
  const [isPublic, setIsPublic] = useState<boolean>(existing?.isPublic ?? false);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(null);
  const [stickerInteracting, setStickerInteracting] = useState(false);

  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hydrate quand l'existing arrive après le mount (fetchMine en cours).
  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setAppearance(existing.appearance);
    setSections(existing.sections);
    setStickers(existing.stickers ?? []);
    setSelectedGenres(existing.genres);
    setIsPublic(existing.isPublic);
  }, [existing]);

  const toggleGenre = (slug: string) => {
    setSelectedGenres((prev) =>
      prev.includes(slug) ? prev.filter((g) => g !== slug) : [...prev, slug],
    );
  };

  // ═════════ Sections (titre uniquement, body strippé côté template) ═════════
  const addSection = () => {
    setSections((prev) => [...prev, { id: newId(), title: 'Nouvelle section', body: '' }]);
  };
  const updateSectionTitle = (sid: string, title: string) => {
    setSections((prev) => prev.map((s) => (s.id === sid ? { ...s, title } : s)));
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
    const t = await updateTemplate(existing.id, {
      name,
      appearance,
      sections,
      stickers,
      genres: selectedGenres,
      isPublic,
    });
    setSaving(false);
    if (!t) {
      Alert.alert('Erreur', 'Impossible d’enregistrer les changements.');
      return;
    }
    router.back();
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
      <SafeAreaView className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator color="#c27b52" />
      </SafeAreaView>
    );
  }

  const fontDef = getFont(appearance.fontId as any);
  const fontFamily = fontDef.variants.display;

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
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
          <Text className="font-display text-lg text-ink">
            {isNew ? 'Nouveau template' : 'Édition du template'}
          </Text>
          {existing ? (
            <Pressable
              onPress={handleDelete}
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-60">
              <MaterialIcons name="delete-outline" size={22} color="#c8322a" />
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
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
            <Animated.View
              entering={FadeInDown.duration(400)}
              style={{ width: SHEET_MAX_WIDTH, marginTop: 8, position: 'relative' }}>
              <SheetSurface
                appearance={appearance}
                style={{
                  shadowColor: '#000',
                  shadowOpacity: 0.12,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 6 },
                  elevation: 6,
                }}>
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
          </ScrollView>

          <View
            style={{
              maxWidth: SHEET_MAX_WIDTH,
              width: '100%',
              alignSelf: 'center',
              paddingHorizontal: 16,
            }}>
            {/* Le bouton "+ Ajouter une section" est volontairement HORS de
                la SheetSurface (en sibling du wrapper Animated.View), comme
                sur la fiche éditeur. Sinon la SheetSurface grandit d'autant
                et les positions Y fractionnaires des stickers projettent
                plus bas que sur la fiche réelle (axe StickerLayer biaisé). */}
            <Pressable
              onPress={addSection}
              style={{ borderColor: theme.ink, borderWidth: 1 }}
              className="mt-4 rounded-full py-3 active:opacity-70">
              <Text style={{ color: theme.ink }} className="text-center font-sans-med">
                + Ajouter une section
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setCustomizerOpen(true)}
              className="mt-2 flex-row items-center justify-center gap-2 rounded-full py-3 active:opacity-70"
              style={{ borderWidth: 1, borderColor: theme.ink }}>
              <MaterialIcons name="palette" size={16} color={theme.ink} />
              <Text style={{ color: theme.ink }} className="font-sans-med">
                Personnaliser l’apparence
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setStickerPickerOpen(true)}
              className="mt-2 flex-row items-center justify-center gap-2 rounded-full py-3 active:opacity-70"
              style={{ borderWidth: 1, borderColor: theme.ink }}>
              <MaterialIcons name="emoji-emotions" size={16} color={theme.ink} />
              <Text style={{ color: theme.ink }} className="font-sans-med">
                Stickers · {stickers.length}/{MAX_STICKERS_PER_SHEET}
              </Text>
            </Pressable>
          </View>
        </ScrollView>

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: insets.bottom + 16,
          }}
          className="items-center"
          pointerEvents="box-none">
          <Pressable
            onPress={handleNext}
            disabled={saving}
            style={{
              backgroundColor: '#c27b52',
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 8,
              opacity: saving ? 0.6 : 1,
            }}
            className="flex-row items-center gap-2 rounded-full px-6 py-3 active:opacity-85">
            <MaterialIcons
              name={isNew ? 'arrow-forward' : 'check'}
              size={20}
              color="#fff"
            />
            <Text className="font-sans-med text-paper">
              {saving ? 'Enregistrement…' : isNew ? 'Suivant' : 'Enregistrer'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <SheetCustomizer
        open={customizerOpen}
        appearance={appearance}
        title="Personnaliser le template"
        subtitle={name.trim() || 'Sans nom'}
        onClose={() => setCustomizerOpen(false)}
        onSave={(next) => {
          setAppearance(next);
          setCustomizerOpen(false);
        }}
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

      <FinalizeDrawer
        open={finalizeOpen}
        onClose={() => setFinalizeOpen(false)}
        name={name}
        onChangeName={setName}
        defaultName={seed?.defaultName}
        genres={genres}
        selectedGenres={selectedGenres}
        onToggleGenre={toggleGenre}
        isPublic={isPublic}
        onToggleIsPublic={setIsPublic}
        saving={saving}
        onConfirm={persistCreate}
        theme={theme}
      />
    </SafeAreaView>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Drawer de finalisation : ouvert après l'édition pour collecter
// nom + catégories + partage. Le bouton "Créer le template" persiste en DB.
// ═══════════════════════════════════════════════════════════════════════
function FinalizeDrawer({
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
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-ink/40" />
      <View
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-paper"
        style={{ paddingBottom: insets.bottom, maxHeight: '90%' }}>
        <View className="flex-row items-center justify-between px-5 pb-3 pt-4">
          <Text className="font-display text-xl text-ink">Finaliser le template</Text>
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
