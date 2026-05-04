import { BookCover } from "@/components/book-cover";
import { KeyboardDismissBar } from "@/components/keyboard-dismiss-bar";
import { PremiumPaywallModal } from "@/components/premium-paywall-modal";
import { RatingIcon } from "@/components/rating-row";
import { SheetCustomizer } from "@/components/sheet-customizer";
import { SheetSurface } from "@/components/sheet-surface";
import { StickerLayer } from "@/components/sticker-layer";
import { StickerPickerModal } from "@/components/sticker-picker-modal";
import { useFreemiumGate } from "@/hooks/use-freemium-gate";
import { useKeyboardOffset } from "@/hooks/use-keyboard-offset";
import { newId } from "@/lib/id";
import {
  ficheTextStyle,
  hexWithAlpha,
  isCustomAppearance,
  mergeAppearance,
  resolveSectionIcon,
  SHEET_TEXT_SHADOW,
} from "@/lib/sheet-appearance";
import { MAX_STICKERS_PER_SHEET } from "@/lib/stickers/catalog";
import { getFont } from "@/lib/theme/fonts";
import { useBookshelf } from "@/store/bookshelf";
import { usePreferences } from "@/store/preferences";
import { useReadingSheets } from "@/store/reading-sheets";
import { useSheetTemplates } from "@/store/sheet-templates";
import { useTimer } from "@/store/timer";
import type {
  PlacedSticker,
  SheetAppearance,
  SheetDefaultCategory,
  SheetSection,
} from "@/types/book";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

export default function SheetScreen() {
  const { isbn } = useLocalSearchParams<{ isbn: string }>();
  const router = useRouter();
  const books = useBookshelf((s) => s.books);
  const userBook = books.find((b) => b.book.isbn === isbn);

  const sheets = useReadingSheets((s) => s.sheets);
  const setSections = useReadingSheets((s) => s.setSections);
  const removeSheet = useReadingSheets((s) => s.removeSheet);
  const setSheetAppearance = useReadingSheets((s) => s.setAppearance);
  const setStickers = useReadingSheets((s) => s.setStickers);
  const setSheetIsPublic = useReadingSheets((s) => s.setIsPublic);

  const globalTemplate = useSheetTemplates((s) => s.global);
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themePaper = usePreferences((s) => s.colorBg);
  const themePrimary = usePreferences((s) => s.colorPrimary);

  const sheet = userBook ? sheets[userBook.id] : undefined;
  const storedSections = sheet?.sections ?? EMPTY_SECTIONS;
  const storedStickers = sheet?.stickers ?? EMPTY_STICKERS;

  // Draft local. Toute édition (titre, body, note, add/remove section,
  // placement/edition/suppression de stickers) n'affecte que ce draft —
  // rien n'est persisté avant tap sur le bouton Enregistrer.
  const [draft, setDraft] = useState<SheetSection[]>(() => storedSections);
  const [draftStickers, setDraftStickers] = useState<PlacedSticker[]>(
    () => storedStickers,
  );

  const sectionsDirty = useMemo(
    () => !sectionsEqual(draft, storedSections),
    [draft, storedSections],
  );
  const stickersDirty = useMemo(
    () => !stickersEqual(draftStickers, storedStickers),
    [draftStickers, storedStickers],
  );
  const dirty = sectionsDirty || stickersDirty;

  const appearance = useMemo<SheetAppearance>(
    () => mergeAppearance(globalTemplate, sheet?.appearance),
    [globalTemplate, sheet?.appearance],
  );
  const fontFamily = getFont(appearance.fontId as any).variants.display;

  const unusedDefaults = useMemo(() => {
    const used = new Set(draft.map((s) => s.title.toLowerCase()));
    return appearance.defaultCategories.filter(
      (s) => !used.has(s.title.toLowerCase()),
    );
  }, [draft, appearance.defaultCategories]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(
    null,
  );
  // True dès qu'un finger touche un sticker — désactive le scroll de la
  // fiche pour que le ScrollView ne capte pas le 2e doigt avant que pinch
  // ou rotate puisse s'activer.
  const [stickerInteracting, setStickerInteracting] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const gate = useFreemiumGate();

  const addSectionDraft = (
    title: string,
    opts?: {
      materialIcon?: string;
      materialIconColor?: string;
      emoji?: string;
    },
  ) => {
    setDraft((d) => [
      ...d,
      {
        id: newId(),
        title: title.trim() || "Sans titre",
        body: "",
        materialIcon: opts?.materialIcon,
        materialIconColor: opts?.materialIconColor,
        emoji: opts?.emoji,
      },
    ]);
  };
  const updateTitleDraft = (sectionId: string, title: string) => {
    setDraft((d) => d.map((s) => (s.id === sectionId ? { ...s, title } : s)));
  };
  const updateBodyDraft = (sectionId: string, body: string) => {
    setDraft((d) => d.map((s) => (s.id === sectionId ? { ...s, body } : s)));
  };
  const setRatingValueDraft = (
    sectionId: string,
    value: number | undefined,
  ) => {
    setDraft((d) =>
      d.map((s) => {
        if (s.id !== sectionId) return s;
        if (value == null) {
          // Clear rating entirely.

          const { rating, ...rest } = s;
          return rest as SheetSection;
        }
        // Conserve `icon` legacy si présent ; sinon stub 'star' (non rendu).
        return {
          ...s,
          rating: { value, icon: s.rating?.icon ?? "star" },
        };
      }),
    );
  };
  const removeSectionDraft = (sectionId: string) => {
    setDraft((d) => d.filter((s) => s.id !== sectionId));
  };

  const handleSaveDraft = () => {
    if (!userBook) return;
    // Limite freemium : la création d'une nouvelle fiche (sheet absent du
    // store) est gated. Une mise à jour de fiche existante passe toujours.
    // setSections([], ...) supprime la fiche — on ne gate pas non plus.
    const isNewSheet = !sheet && draft.length > 0;
    if (isNewSheet && !gate.canCreateSheet()) {
      setPaywallOpen(true);
      return;
    }
    setSections(userBook.id, draft);
    if (stickersDirty) {
      setStickers(userBook.id, draftStickers);
    }
  };

  // ═══════════════ Stickers (draft) ═══════════════
  // Mutations locales du `draftStickers`. Le commit en store se fait via
  // `handleSaveDraft` (bouton Enregistrer) — aligné sur le pattern des
  // sections. Avant ça, l'utilisateur peut placer/déplacer/supprimer
  // librement, et un retour arrière sans save lui propose de discarder.

  const placeStickerDraft = (stickerId: string): string | null => {
    if (draftStickers.length >= MAX_STICKERS_PER_SHEET) return null;
    const id = newId();
    setDraftStickers((prev) => [
      ...prev,
      { id, stickerId, x: 0.5, y: 0.5, scale: 1, rotation: 0 },
    ]);
    return id;
  };

  const updateStickerDraftTransform = (
    placementId: string,
    next: { x: number; y: number; scale: number; rotation: number },
  ) => {
    setDraftStickers((prev) =>
      prev.map((s) => (s.id === placementId ? { ...s, ...next } : s)),
    );
  };

  const removeStickerDraft = (placementId: string) => {
    setDraftStickers((prev) => prev.filter((s) => s.id !== placementId));
  };

  const reorderStickerDraft = (placementId: string, direction: 1 | -1) => {
    setDraftStickers((prev) => {
      const idx = prev.findIndex((s) => s.id === placementId);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleBack = () => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert(
      "Modifications non enregistrées",
      "Tu as des changements non sauvegardés. Les perdre ?",
      [
        { text: "Continuer l’édition", style: "cancel" },
        {
          text: "Quitter sans sauver",
          style: "destructive",
          onPress: () => router.back(),
        },
      ],
    );
  };

  if (!userBook) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper px-8">
        <Text className="font-display text-2xl text-ink">
          Livre introuvable
        </Text>
        <Text className="mt-2 text-center text-ink-muted">
          Ajoute d&apos;abord le livre à ta bibliothèque pour créer une fiche.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-8 rounded-full bg-accent px-6 py-3 active:opacity-80"
        >
          <Text className="font-sans-med text-paper">Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const confirmDelete = () => {
    setMenuOpen(false);
    Alert.alert(
      "Supprimer la fiche ?",
      "Les sections et les notes seront perdues. Le livre reste dans ta biblio.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            removeSheet(userBook.id);
            router.back();
          },
        },
      ],
    );
  };

  const handleShare = async () => {
    setMenuOpen(false);
    const lines: string[] = [`Fiche : ${userBook.book.title}`];
    if (userBook.book.authors[0]) lines.push(`par ${userBook.book.authors[0]}`);
    lines.push("");
    for (const s of draft) {
      if (!s.body.trim() && !s.rating) continue;
      lines.push(`— ${s.title || "Sans titre"}`);
      if (s.rating)
        lines.push(
          `  ${"★".repeat(s.rating.value)}${"☆".repeat(5 - s.rating.value)}`,
        );
      if (s.body.trim()) lines.push(`  ${s.body.trim()}`);
      lines.push("");
    }
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      // user cancelled — no-op
    }
  };

  const handleCustomize = () => {
    setMenuOpen(false);
    setCustomizerOpen(true);
  };

  const handleSaveAppearance = (next: SheetAppearance) => {
    // Snapshot complet. Le template global n'influence plus la fiche après création.
    setSheetAppearance(userBook.id, next);
    setCustomizerOpen(false);
  };

  const handleResetAppearance = () => {
    // Re-snapshot du global courant, à la demande explicite de l'user.
    setSheetAppearance(userBook.id, undefined);
    setCustomizerOpen(false);
  };

  const handleTogglePublic = () => {
    setMenuOpen(false);
    if (!userBook) return;
    const next = !(sheet?.isPublic ?? false);
    setSheetIsPublic(userBook.id, next);
    Alert.alert(
      next ? "Fiche publiée" : "Fiche redevenue privée",
      next
        ? "Les autres lecteurs peuvent maintenant voir cette fiche depuis la page du livre."
        : "Plus personne d'autre que toi ne peut la consulter.",
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top", "bottom"]}>
      <KeyboardDismissBar />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
          <Pressable
            onPress={handleBack}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
          >
            <MaterialIcons name="arrow-back" size={22} color={themeInk} />
          </Pressable>
          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            accessibilityLabel="Actions de la fiche"
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
          >
            <MaterialIcons name="more-horiz" size={24} color={themeInk} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerClassName="px-4 pt-2 pb-32"
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!stickerInteracting}
        >
          {/* La fiche est rendue à largeur fixe (SHEET_MAX_WIDTH) sur
              tous les devices, pour garantir un rendu identique cross-device
              (positions x des stickers, wrapping du texte, layout). Sur les
              écrans plus larges, la fiche est centrée ; sur les écrans plus
              étroits, l'utilisateur peut scroller latéralement. Le scroll
              horizontal est désactivé pendant un geste sticker pour ne pas
              capturer le 2e doigt avant pinch/rotate. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!stickerInteracting}
            contentContainerStyle={{
              minWidth: "100%",
              justifyContent: "center",
            }}
          >
            <Animated.View
              entering={FadeInDown.duration(400)}
              style={{
                width: SHEET_MAX_WIDTH,
                marginTop: 8,
                position: "relative",
              }}
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
                    isbn={userBook.book.isbn}
                    coverUrl={userBook.book.coverUrl}
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
                      {userBook.book.title}
                    </Text>
                    {isCustomAppearance(sheet?.appearance, globalTemplate) ? (
                      <View className="mt-1 flex-row items-center gap-1">
                        <MaterialIcons
                          name="palette"
                          size={12}
                          color={appearance.mutedColor}
                        />
                        <Text
                          style={[
                            {
                              color: appearance.mutedColor,
                              ...ficheTextStyle(11),
                            },
                            SHEET_TEXT_SHADOW,
                          ]}
                        >
                          Personnalisée
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <ReadCountSheetBadge
                    userBookId={userBook.id}
                    mutedColor={appearance.mutedColor}
                    accentColor={appearance.accentColor}
                  />
                </View>

                {draft.length === 0 ? (
                  <EmptyState
                    appearance={appearance}
                    fontFamily={fontFamily}
                    onAdd={(c) =>
                      addSectionDraft(c.title, {
                        materialIcon: c.materialIcon,
                        materialIconColor: c.materialIconColor,
                        emoji: c.emoji,
                      })
                    }
                    onAddCustom={() => addSectionDraft("")}
                    suggestions={unusedDefaults}
                  />
                ) : (
                  <View className="mt-6">
                    {draft.map((section, i) => (
                      <Animated.View
                        key={section.id}
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
                        <SectionEditor
                          section={section}
                          appearance={appearance}
                          fontFamily={fontFamily}
                          onUpdateTitle={(title) =>
                            updateTitleDraft(section.id, title)
                          }
                          onUpdateBody={(body) =>
                            updateBodyDraft(section.id, body)
                          }
                          onSetRating={(v) =>
                            setRatingValueDraft(section.id, v)
                          }
                          onRemove={() => removeSectionDraft(section.id)}
                        />
                      </Animated.View>
                    ))}
                  </View>
                )}
              </SheetSurface>
              {/* Couche stickers : sibling de SheetSurface (l'un des deux a
                overflow:hidden si fond image, l'autre overflow:visible pour
                laisser les stickers déborder visuellement). Bornes alignées
                via le wrapper Animated.View en position:relative. */}
              <StickerLayer
                stickers={draftStickers}
                selectedId={selectedStickerId}
                onSelect={setSelectedStickerId}
                onUpdateTransform={updateStickerDraftTransform}
                onDelete={(id) => {
                  removeStickerDraft(id);
                  setSelectedStickerId(null);
                }}
                onReorder={reorderStickerDraft}
                onInteractChange={setStickerInteracting}
              />
            </Animated.View>
          </ScrollView>

          {/* Boutons sous la fiche : restent à la largeur du device (avec
              padding du ScrollView outer), capés à SHEET_MAX_WIDTH sur
              desktop et centrés. Pas de scroll latéral nécessaire car
              ils tiennent toujours dans la fenêtre. */}
          <View
            style={{
              maxWidth: SHEET_MAX_WIDTH,
              width: "100%",
              alignSelf: "center",
            }}
          >
            {draft.length > 0 && unusedDefaults.length > 0 && (
              <View
                className="mt-4 pt-4"
                style={{
                  borderTopWidth: 1,
                  borderTopColor: hexWithAlpha(appearance.mutedColor, 0.22),
                }}
              >
                <Text
                  style={[{ color: appearance.mutedColor }, SHEET_TEXT_SHADOW]}
                  className="mb-3 text-sm"
                >
                  Ajouter une catégorie
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {unusedDefaults.map((c) => (
                    <SuggestionPill
                      key={c.title}
                      category={c}
                      appearance={appearance}
                      onPress={() =>
                        addSectionDraft(c.title, {
                          materialIcon: c.materialIcon,
                          materialIconColor: c.materialIconColor,
                          emoji: c.emoji,
                        })
                      }
                    />
                  ))}
                </View>
              </View>
            )}

            {draft.length > 0 && (
              <Pressable
                onPress={() => addSectionDraft("")}
                style={{ borderColor: appearance.mutedColor, borderWidth: 1 }}
                className="mt-4 rounded-full py-3 active:opacity-70"
              >
                <Text
                  style={[{ color: appearance.mutedColor }, SHEET_TEXT_SHADOW]}
                  className="text-center"
                >
                  + Section personnalisée
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={handleCustomize}
              className="mt-4 flex-row items-center justify-center gap-2 rounded-full py-3 active:opacity-70"
              style={{ borderWidth: 1, borderColor: themeInk }}
            >
              <MaterialIcons name="palette" size={16} color={themeInk} />
              <Text style={{ color: themeInk }} className="font-sans-med">
                Personnaliser la fiche
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setStickerPickerOpen(true)}
              className="mt-2 flex-row items-center justify-center gap-2 rounded-full py-3 active:opacity-70"
              style={{ borderWidth: 1, borderColor: themeInk }}
            >
              <MaterialIcons name="emoji-emotions" size={16} color={themeInk} />
              <Text style={{ color: themeInk }} className="font-sans-med">
                Stickers · {draftStickers.length}/{MAX_STICKERS_PER_SHEET}
              </Text>
            </Pressable>
          </View>
        </ScrollView>

        {dirty && (
          <SaveFab
            onPress={handleSaveDraft}
            accentColor={themePrimary}
            // "Supprimer la fiche" uniquement si on persiste un état
            // vraiment vide (ni sections, ni stickers). Sinon "Enregistrer".
            isEmpty={draft.length === 0 && draftStickers.length === 0}
          />
        )}
      </KeyboardAvoidingView>

      <ActionMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onCustomize={handleCustomize}
        onShare={handleShare}
        onDelete={confirmDelete}
        onTogglePublic={handleTogglePublic}
        isPublic={sheet?.isPublic ?? false}
        themePaper={themePaper}
        themeInk={themeInk}
      />

      <SheetCustomizer
        open={customizerOpen}
        appearance={appearance}
        title="Personnaliser la fiche"
        subtitle={userBook.book.title}
        onClose={() => setCustomizerOpen(false)}
        onSave={handleSaveAppearance}
        onReset={
          isCustomAppearance(sheet?.appearance, globalTemplate)
            ? handleResetAppearance
            : undefined
        }
        resetLabel="Utiliser le template global"
      />

      <StickerPickerModal
        open={stickerPickerOpen}
        onClose={() => setStickerPickerOpen(false)}
        placedCount={draftStickers.length}
        maxCount={MAX_STICKERS_PER_SHEET}
        onPick={(stickerId) => {
          // Pose dans le draft local ; persistance via le bouton Enregistrer.
          // Auto-sélection du nouveau placement pour afficher la barre flottante.
          const placedId = placeStickerDraft(stickerId);
          if (placedId) setSelectedStickerId(placedId);
        }}
      />

      <PremiumPaywallModal
        open={paywallOpen}
        reason="feature_limit"
        feature="sheets"
        onClose={() => setPaywallOpen(false)}
      />
    </SafeAreaView>
  );
}

function ReadCountSheetBadge({
  userBookId,
  mutedColor,
  accentColor,
}: {
  userBookId: string;
  mutedColor: string;
  accentColor: string;
}) {
  const max = useTimer((s) => {
    const list = s.cycles.filter((c) => c.userBookId === userBookId);
    return list.reduce((m, c) => (c.index > m ? c.index : m), 0);
  });
  if (max < 2) return null;
  return (
    <View
      style={{ borderColor: mutedColor, borderWidth: 1 }}
      className="items-center justify-center rounded-full px-2 py-0.5"
    >
      <Text
        style={{ color: accentColor }}
        className="text-[10px] font-sans-med"
      >
        {max}× lu
      </Text>
    </View>
  );
}

function ActionMenu({
  open,
  onClose,
  onCustomize,
  onShare,
  onDelete,
  onTogglePublic,
  isPublic,
  themePaper,
  themeInk,
}: {
  open: boolean;
  onClose: () => void;
  onCustomize: () => void;
  onShare: () => void;
  onDelete: () => void;
  onTogglePublic: () => void;
  isPublic: boolean;
  themePaper: string;
  themeInk: string;
}) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1"
        style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      >
        <View
          className="absolute right-4 w-64 overflow-hidden rounded-2xl shadow-lg"
          style={{ top: 56, elevation: 6, backgroundColor: themePaper }}
        >
          <MenuRow
            icon="palette"
            label="Personnaliser"
            sublabel="Cadre, police, couleurs…"
            themeInk={themeInk}
            onPress={onCustomize}
          />
          <MenuRow
            icon={isPublic ? "public" : "lock-outline"}
            label={isPublic ? "Rendre privée" : "Publier publiquement"}
            sublabel={
              isPublic
                ? "Visible uniquement par toi"
                : "Lisible par les autres lecteurs"
            }
            themeInk={themeInk}
            onPress={onTogglePublic}
          />
          <MenuRow
            icon="ios-share"
            label="Partager"
            sublabel="Exporter en texte"
            themeInk={themeInk}
            onPress={onShare}
          />
          <MenuRow
            icon="delete-outline"
            label="Supprimer"
            sublabel="Perdre la fiche"
            destructive
            themeInk={themeInk}
            onPress={onDelete}
          />
        </View>
      </Pressable>
    </Modal>
  );
}

function MenuRow({
  icon,
  label,
  sublabel,
  onPress,
  destructive,
  themeInk,
}: {
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  label: string;
  sublabel?: string;
  onPress: () => void;
  destructive?: boolean;
  themeInk: string;
}) {
  const color = destructive ? "#c8322a" : themeInk;
  return (
    <Pressable onPress={onPress} className="px-4 py-3 active:bg-paper-warm">
      <View className="flex-row items-center gap-3">
        <MaterialIcons name={icon} size={20} color={color} />
        <View className="flex-1">
          <Text style={{ color }} className="font-sans-med text-base">
            {label}
          </Text>
          {sublabel ? (
            <Text className="text-xs text-ink-muted">{sublabel}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function EmptyState({
  onAdd,
  onAddCustom,
  suggestions,
  appearance,
  fontFamily,
}: {
  onAdd: (c: SheetDefaultCategory) => void;
  onAddCustom: () => void;
  suggestions: SheetDefaultCategory[];
  appearance: SheetAppearance;
  fontFamily: string;
}) {
  return (
    <Animated.View entering={FadeIn.duration(500).delay(100)} className="mt-6">
      <Text
        style={[{ color: appearance.textColor, fontFamily }, SHEET_TEXT_SHADOW]}
        className="text-2xl"
      >
        Crée ta fiche
      </Text>
      <Text
        style={[{ color: appearance.mutedColor }, SHEET_TEXT_SHADOW]}
        className="mt-2"
      >
        Note tes impressions sur ce livre. Ajoute les catégories qui
        t&apos;inspirent, crée les tiennes.
      </Text>
      <View className="mt-5 flex-row flex-wrap gap-2">
        {suggestions.map((c) => (
          <SuggestionPill
            key={c.title}
            category={c}
            appearance={appearance}
            onPress={() => onAdd(c)}
          />
        ))}
      </View>
      <Pressable
        onPress={onAddCustom}
        style={{ backgroundColor: appearance.accentColor }}
        className="mt-4 rounded-full px-6 py-3 active:opacity-80"
      >
        <Text
          style={SHEET_TEXT_SHADOW}
          className="text-center font-sans-med text-paper"
        >
          + Section personnalisée
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function SuggestionPill({
  category,
  appearance,
  onPress,
}: {
  category: SheetDefaultCategory;
  appearance: SheetAppearance;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ borderColor: appearance.mutedColor, borderWidth: 1 }}
      className="flex-row items-center gap-1.5 rounded-full px-4 py-2 active:opacity-70"
    >
      <Text
        style={[{ color: appearance.textColor }, SHEET_TEXT_SHADOW]}
        className="text-sm"
      >
        + {category.title}
      </Text>
      {category.emoji ? (
        <Text style={[ficheTextStyle(14), SHEET_TEXT_SHADOW]}>
          {category.emoji}
        </Text>
      ) : category.materialIcon ? (
        <MaterialIcons
          name={category.materialIcon as keyof typeof MaterialIcons.glyphMap}
          size={14}
          color={category.materialIconColor ?? appearance.textColor}
        />
      ) : category.icon ? (
        <RatingIcon kind={category.icon} filled size={14} />
      ) : null}
    </Pressable>
  );
}

function SectionEditor({
  section,
  appearance,
  fontFamily,
  onUpdateTitle,
  onUpdateBody,
  onSetRating,
  onRemove,
}: {
  section: SheetSection;
  appearance: SheetAppearance;
  fontFamily: string;
  onUpdateTitle: (title: string) => void;
  onUpdateBody: (body: string) => void;
  onSetRating: (value: number | undefined) => void;
  onRemove: () => void;
}) {
  const ratingValue = section.rating?.value ?? 0;
  const resolvedIcon = resolveSectionIcon(section, appearance);
  const hasIcon = !!(resolvedIcon.emoji || resolvedIcon.materialIcon);
  return (
    <View>
      <View className="flex-row items-center gap-2">
        <TextInput
          value={section.title}
          onChangeText={onUpdateTitle}
          placeholder="Titre de la catégorie"
          placeholderTextColor={appearance.mutedColor}
          style={[
            { color: appearance.textColor, fontFamily, ...ficheTextStyle(18) },
            SHEET_TEXT_SHADOW,
          ]}
          className="flex-1"
        />
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          className="h-8 w-8 items-center justify-center rounded-full active:opacity-60"
        >
          <Text
            style={[{ color: appearance.mutedColor }, SHEET_TEXT_SHADOW]}
            className="text-xl"
          >
            ×
          </Text>
        </Pressable>
      </View>

      {hasIcon && (
        <View className="mt-2 flex-row items-center gap-2">
          {[1, 2, 3, 4, 5].map((i) => {
            const filled = i <= ratingValue;
            const next = ratingValue === i ? undefined : i;
            return (
              <Pressable
                key={i}
                onPress={() => onSetRating(next)}
                hitSlop={6}
                style={{ opacity: filled ? 1 : 0.3 }}
              >
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
              </Pressable>
            );
          })}
        </View>
      )}

      <TextInput
        value={section.body}
        onChangeText={onUpdateBody}
        placeholder="Écris ici ton avis, tes pensées…"
        placeholderTextColor={appearance.mutedColor}
        multiline
        textAlignVertical="top"
        style={[
          { color: appearance.textColor, minHeight: 96, lineHeight: 22 },
          SHEET_TEXT_SHADOW,
        ]}
        className="mt-3 text-base"
      />
    </View>
  );
}

function SaveFab({
  onPress,
  accentColor,
  isEmpty,
}: {
  onPress: () => void;
  accentColor: string;
  isEmpty: boolean;
}) {
  const kb = useKeyboardOffset();
  const insets = useSafeAreaInsets();
  const safeBottom =
    Platform.OS === "ios" ? Math.max(insets.bottom - 16, 0) : insets.bottom;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: (kb > 0 ? kb : safeBottom) + 24,
      }}
      className="items-center"
    >
      <Animated.View entering={FadeInDown.duration(220)}>
        <Pressable
          onPress={onPress}
          accessibilityLabel="Enregistrer la fiche"
          style={{
            backgroundColor: accentColor,
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          }}
          className="flex-row items-center gap-2 rounded-full px-6 py-3 active:opacity-85"
        >
          <MaterialIcons
            name={isEmpty ? "delete-outline" : "check"}
            size={20}
            color="#fff"
          />
          <Text className="font-sans-med text-paper">
            {isEmpty ? "Supprimer la fiche" : "Enregistrer"}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const EMPTY_SECTIONS: SheetSection[] = [];
// Référence stable pour quand `sheet?.stickers` est undefined — évite que
// `<StickerLayer>` reçoive un nouveau tableau à chaque render et resync ses
// shared values pour rien.
const EMPTY_STICKERS: PlacedSticker[] = [];

// Largeur fixe de la fiche, en dp. Toutes les fiches sont rendues à cette
// largeur sur tous les devices : mobile scrolle latéralement si l'écran est
// plus étroit, desktop/tablette centre la fiche. Garantit un wrapping textuel
// et une position des stickers identiques d'un device à l'autre.
const SHEET_MAX_WIDTH = 380;

function sectionsEqual(a: SheetSection[], b: SheetSection[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.title !== y.title ||
      x.body !== y.body ||
      x.rating?.value !== y.rating?.value ||
      x.rating?.icon !== y.rating?.icon
    ) {
      return false;
    }
  }
  return true;
}

// Égalité shallow par champ — l'ordre du tableau compte (= z-order). Compare
// uniquement les champs persistés ; ignore d'éventuelles refs intermédiaires.
function stickersEqual(a: PlacedSticker[], b: PlacedSticker[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.stickerId !== y.stickerId ||
      x.x !== y.x ||
      x.y !== y.y ||
      x.scale !== y.scale ||
      x.rotation !== y.rotation
    ) {
      return false;
    }
  }
  return true;
}
