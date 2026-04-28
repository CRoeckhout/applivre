import { BookCover } from "@/components/book-cover";
import { KeyboardDismissBar } from "@/components/keyboard-dismiss-bar";
import { useKeyboardOffset } from "@/hooks/use-keyboard-offset";
import { RatingIcon } from "@/components/rating-row";
import { SheetCustomizer } from "@/components/sheet-customizer";
import { SheetSurface } from "@/components/sheet-surface";
import { newId } from "@/lib/id";
import {
  hexWithAlpha,
  isCustomAppearance,
  mergeAppearance,
  resolveSectionIcon,
} from "@/lib/sheet-appearance";
import { getFont } from "@/lib/theme/fonts";
import { useBookshelf } from "@/store/bookshelf";
import { usePreferences } from "@/store/preferences";
import { useReadingSheets } from "@/store/reading-sheets";
import { useSheetTemplates } from "@/store/sheet-templates";
import { useTimer } from "@/store/timer";
import type {
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
import { SafeAreaView } from "react-native-safe-area-context";

export default function SheetScreen() {
  const { isbn } = useLocalSearchParams<{ isbn: string }>();
  const router = useRouter();
  const books = useBookshelf((s) => s.books);
  const userBook = books.find((b) => b.book.isbn === isbn);

  const sheets = useReadingSheets((s) => s.sheets);
  const setSections = useReadingSheets((s) => s.setSections);
  const removeSheet = useReadingSheets((s) => s.removeSheet);
  const setSheetAppearance = useReadingSheets((s) => s.setAppearance);

  const globalTemplate = useSheetTemplates((s) => s.global);
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themePaper = usePreferences((s) => s.colorBg);
  const themePrimary = usePreferences((s) => s.colorPrimary);

  const sheet = userBook ? sheets[userBook.id] : undefined;
  const storedSections = sheet?.sections ?? EMPTY_SECTIONS;

  // Draft local. Toute édition (titre, body, note, add/remove section) n'affecte
  // que ce draft — rien n'est persisté avant tap sur le bouton Enregistrer.
  const [draft, setDraft] = useState<SheetSection[]>(() => storedSections);

  const dirty = useMemo(
    () => !sectionsEqual(draft, storedSections),
    [draft, storedSections],
  );

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
    setSections(userBook.id, draft);
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
        >
          <Animated.View entering={FadeInDown.duration(400)} style={{ marginTop: 8 }}>
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
                  style={{ color: appearance.mutedColor }}
                  className="text-xs uppercase tracking-wider"
                >
                  Fiche de lecture
                </Text>
                <Text
                  numberOfLines={2}
                  style={{ color: appearance.textColor, fontFamily }}
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
                      style={{ color: appearance.mutedColor, fontSize: 11 }}
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
                      borderTopColor: hexWithAlpha(appearance.mutedColor, 0.22),
                    }}
                  >
                    <SectionEditor
                      section={section}
                      appearance={appearance}
                      fontFamily={fontFamily}
                      onUpdateTitle={(title) =>
                        updateTitleDraft(section.id, title)
                      }
                      onUpdateBody={(body) => updateBodyDraft(section.id, body)}
                      onSetRating={(v) => setRatingValueDraft(section.id, v)}
                      onRemove={() => removeSectionDraft(section.id)}
                    />
                  </Animated.View>
                ))}
              </View>
            )}

            {draft.length > 0 && unusedDefaults.length > 0 && (
              <View
                className="mt-4 pt-4"
                style={{
                  borderTopWidth: 1,
                  borderTopColor: hexWithAlpha(appearance.mutedColor, 0.22),
                }}
              >
                <Text
                  style={{ color: appearance.mutedColor }}
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
                  style={{ color: appearance.mutedColor }}
                  className="text-center"
                >
                  + Section personnalisée
                </Text>
              </Pressable>
            )}
            </SheetSurface>
          </Animated.View>

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
        </ScrollView>

        {dirty && (
          <SaveFab
            onPress={handleSaveDraft}
            accentColor={themePrimary}
            isEmpty={draft.length === 0}
          />
        )}
      </KeyboardAvoidingView>

      <ActionMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onCustomize={handleCustomize}
        onShare={handleShare}
        onDelete={confirmDelete}
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
  themePaper,
  themeInk,
}: {
  open: boolean;
  onClose: () => void;
  onCustomize: () => void;
  onShare: () => void;
  onDelete: () => void;
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
        style={{ color: appearance.textColor, fontFamily }}
        className="text-2xl"
      >
        Crée ta fiche
      </Text>
      <Text style={{ color: appearance.mutedColor }} className="mt-2">
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
        <Text className="text-center font-sans-med text-paper">
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
      <Text style={{ color: appearance.textColor }} className="text-sm">
        + {category.title}
      </Text>
      {category.emoji ? (
        <Text style={{ fontSize: 14 }}>{category.emoji}</Text>
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
          style={{ color: appearance.textColor, fontFamily, fontSize: 18 }}
          className="flex-1"
        />
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          className="h-8 w-8 items-center justify-center rounded-full active:opacity-60"
        >
          <Text style={{ color: appearance.mutedColor }} className="text-xl">
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
                  <Text style={{ fontSize: 22 }}>{resolvedIcon.emoji}</Text>
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
        style={{ color: appearance.textColor, minHeight: 96, lineHeight: 22 }}
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
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: (kb > 0 ? kb : 0) + 24 }}
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
