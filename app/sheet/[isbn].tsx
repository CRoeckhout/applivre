import { BookCover } from '@/components/book-cover';
import { RatingIcon } from '@/components/rating-row';
import { SheetCustomizer } from '@/components/sheet-customizer';
import {
  hexWithAlpha,
  isCustomAppearance,
  mergeAppearance,
  outerCardStyle,
} from '@/lib/sheet-appearance';
import { getFont } from '@/lib/theme/fonts';
import { useBookshelf } from '@/store/bookshelf';
import { usePreferences } from '@/store/preferences';
import { useReadingSheets } from '@/store/reading-sheets';
import { useSheetTemplates } from '@/store/sheet-templates';
import type {
  RatingIconKind,
  SheetAppearance,
  SheetDefaultCategory,
  SheetRatingIconConfig,
  SheetSection,
} from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SheetScreen() {
  const { isbn } = useLocalSearchParams<{ isbn: string }>();
  const router = useRouter();
  const books = useBookshelf((s) => s.books);
  const userBook = books.find((b) => b.book.isbn === isbn);

  const sheets = useReadingSheets((s) => s.sheets);
  const addSection = useReadingSheets((s) => s.addSection);
  const removeSheet = useReadingSheets((s) => s.removeSheet);
  const setSheetAppearance = useReadingSheets((s) => s.setAppearance);

  const globalTemplate = useSheetTemplates((s) => s.global);
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themePaper = usePreferences((s) => s.colorBg);

  const sheet = userBook ? sheets[userBook.id] : undefined;
  const sections = sheet?.sections ?? [];

  const appearance = useMemo<SheetAppearance>(
    () => mergeAppearance(globalTemplate, sheet?.appearance),
    [globalTemplate, sheet?.appearance],
  );
  const fontFamily = getFont(appearance.fontId as any).variants.display;

  const enabledRatingIcons = appearance.ratingIcons.filter((r) => r.enabled);

  const unusedDefaults = useMemo(() => {
    const used = new Set(sections.map((s) => s.title.toLowerCase()));
    return appearance.defaultCategories.filter(
      (s) => !used.has(s.title.toLowerCase()),
    );
  }, [sections, appearance.defaultCategories]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);

  if (!userBook) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper px-8">
        <Text className="font-display text-2xl text-ink">Livre introuvable</Text>
        <Text className="mt-2 text-center text-ink-muted">
          Ajoute d&apos;abord le livre à ta bibliothèque pour créer une fiche.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-8 rounded-full bg-accent px-6 py-3 active:opacity-80">
          <Text className="font-sans-med text-paper">Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const confirmDelete = () => {
    setMenuOpen(false);
    Alert.alert(
      'Supprimer la fiche ?',
      'Les sections et les notes seront perdues. Le livre reste dans ta biblio.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
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
    lines.push('');
    for (const s of sections) {
      if (!s.body.trim() && !s.rating) continue;
      lines.push(`— ${s.title || 'Sans titre'}`);
      if (s.rating) lines.push(`  ${'★'.repeat(s.rating.value)}${'☆'.repeat(5 - s.rating.value)}`);
      if (s.body.trim()) lines.push(`  ${s.body.trim()}`);
      lines.push('');
    }
    try {
      await Share.share({ message: lines.join('\n') });
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
    <SafeAreaView className="flex-1 bg-paper" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-60">
            <MaterialIcons name="arrow-back" size={22} color={themeInk} />
          </Pressable>
          <Pressable
            onPress={() => setMenuOpen(true)}
            hitSlop={8}
            accessibilityLabel="Actions de la fiche"
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-60">
            <MaterialIcons name="more-horiz" size={24} color={themeInk} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerClassName="px-4 pt-2 pb-32"
          keyboardShouldPersistTaps="handled">
          <Animated.View
            entering={FadeInDown.duration(400)}
            style={[
              outerCardStyle(appearance),
              {
                marginTop: 8,
                shadowColor: '#000',
                shadowOpacity: 0.12,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: 6,
              },
            ]}>
            <View className="flex-row items-center gap-3">
              <BookCover
                isbn={userBook.book.isbn}
                coverUrl={userBook.book.coverUrl}
                style={{ width: 48, height: 72, borderRadius: 6 }}
              />
              <View className="flex-1">
                <Text
                  style={{ color: appearance.mutedColor }}
                  className="text-xs uppercase tracking-wider">
                  Fiche de lecture
                </Text>
                <Text
                  numberOfLines={2}
                  style={{ color: appearance.textColor, fontFamily }}
                  className="text-xl">
                  {userBook.book.title}
                </Text>
                {isCustomAppearance(sheet?.appearance, globalTemplate) ? (
                  <View className="mt-1 flex-row items-center gap-1">
                    <MaterialIcons name="palette" size={12} color={appearance.mutedColor} />
                    <Text style={{ color: appearance.mutedColor, fontSize: 11 }}>
                      Personnalisée
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>

            {sections.length === 0 ? (
              <EmptyState
                appearance={appearance}
                fontFamily={fontFamily}
                onAdd={(c) => addSection(userBook.id, c.title, c.icon)}
                onAddCustom={() => addSection(userBook.id, '')}
                suggestions={unusedDefaults}
              />
            ) : (
              <View className="mt-6">
                {sections.map((section, i) => (
                  <Animated.View
                    key={section.id}
                    entering={FadeIn.duration(300).delay(i * 40)}
                    style={{
                      paddingVertical: 14,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: hexWithAlpha(appearance.mutedColor, 0.22),
                    }}>
                    <SectionEditor
                      userBookId={userBook.id}
                      section={section}
                      appearance={appearance}
                      fontFamily={fontFamily}
                      ratingIcons={enabledRatingIcons}
                    />
                  </Animated.View>
                ))}
              </View>
            )}

            {sections.length > 0 && unusedDefaults.length > 0 && (
              <View
                className="mt-4 pt-4"
                style={{
                  borderTopWidth: 1,
                  borderTopColor: hexWithAlpha(appearance.mutedColor, 0.22),
                }}>
                <Text
                  style={{ color: appearance.mutedColor }}
                  className="mb-3 text-sm">
                  Ajouter une catégorie
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {unusedDefaults.map((c) => (
                    <SuggestionPill
                      key={c.title}
                      category={c}
                      appearance={appearance}
                      onPress={() => addSection(userBook.id, c.title, c.icon)}
                    />
                  ))}
                </View>
              </View>
            )}

            {sections.length > 0 && (
              <Pressable
                onPress={() => addSection(userBook.id, '')}
                style={{ borderColor: appearance.mutedColor, borderWidth: 1 }}
                className="mt-4 rounded-full py-3 active:opacity-70">
                <Text
                  style={{ color: appearance.mutedColor }}
                  className="text-center">
                  + Section personnalisée
                </Text>
              </Pressable>
            )}
          </Animated.View>
        </ScrollView>
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
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View
          className="absolute right-4 w-64 overflow-hidden rounded-2xl shadow-lg"
          style={{ top: 56, elevation: 6, backgroundColor: themePaper }}>
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
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  sublabel?: string;
  onPress: () => void;
  destructive?: boolean;
  themeInk: string;
}) {
  const color = destructive ? '#c8322a' : themeInk;
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
    <Animated.View
      entering={FadeIn.duration(500).delay(100)}
      className="mt-6">
      <Text
        style={{ color: appearance.textColor, fontFamily }}
        className="text-2xl">
        Crée ta fiche
      </Text>
      <Text
        style={{ color: appearance.mutedColor }}
        className="mt-2">
        Note tes impressions sur ce livre. Ajoute les catégories qui t&apos;inspirent, crée les tiennes.
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
        className="mt-4 rounded-full px-6 py-3 active:opacity-80">
        <Text className="text-center font-sans-med text-paper">+ Section personnalisée</Text>
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
      className="flex-row items-center gap-1.5 rounded-full px-4 py-2 active:opacity-70">
      <Text style={{ color: appearance.textColor }} className="text-sm">
        + {category.title}
      </Text>
      {category.icon && <RatingIcon kind={category.icon} filled size={14} />}
    </Pressable>
  );
}

function SectionEditor({
  userBookId,
  section,
  appearance,
  fontFamily,
  ratingIcons,
}: {
  userBookId: string;
  section: SheetSection;
  appearance: SheetAppearance;
  fontFamily: string;
  ratingIcons: SheetRatingIconConfig[];
}) {
  const updateTitle = useReadingSheets((s) => s.updateSectionTitle);
  const updateBody = useReadingSheets((s) => s.updateSectionBody);
  const setRating = useReadingSheets((s) => s.setSectionRating);
  const removeSection = useReadingSheets((s) => s.removeSection);

  const handleAddRating = (icon: RatingIconKind) =>
    setRating(userBookId, section.id, { value: 0, icon });
  const handleChangeRating = (value: number) => {
    if (!section.rating) return;
    setRating(userBookId, section.id, { ...section.rating, value });
  };

  return (
    <View>
      <View className="flex-row items-start gap-2">
        <TextInput
          value={section.title}
          onChangeText={(v) => updateTitle(userBookId, section.id, v)}
          placeholder="Titre de la catégorie"
          placeholderTextColor={appearance.mutedColor}
          style={{ color: appearance.textColor, fontFamily, fontSize: 18 }}
          className="flex-1"
        />
        <Pressable
          onPress={() => removeSection(userBookId, section.id)}
          hitSlop={8}
          className="h-8 w-8 items-center justify-center rounded-full active:opacity-60">
          <Text style={{ color: appearance.mutedColor }} className="text-xl">
            ×
          </Text>
        </Pressable>
      </View>

      {section.rating ? (
        <View className="mt-2">
          <InlineRatingRow
            kind={section.rating.icon}
            value={section.rating.value}
            onChange={handleChangeRating}
            onRemove={() => setRating(userBookId, section.id, null)}
            mutedColor={appearance.mutedColor}
          />
        </View>
      ) : (
        <View className="mt-2">
          <InlineAddRating
            ratingIcons={ratingIcons}
            mutedColor={appearance.mutedColor}
            onAdd={handleAddRating}
          />
        </View>
      )}

      <TextInput
        value={section.body}
        onChangeText={(v) => updateBody(userBookId, section.id, v)}
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

function InlineRatingRow({
  kind,
  value,
  onChange,
  onRemove,
  mutedColor,
}: {
  kind: RatingIconKind;
  value: number;
  onChange: (v: number) => void;
  onRemove: () => void;
  mutedColor: string;
}) {
  return (
    <View className="flex-row items-center gap-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable
          key={i}
          onPress={() => onChange(value === i ? i - 1 : i)}
          hitSlop={6}>
          <RatingIcon kind={kind} filled={value >= i} size={26} />
        </Pressable>
      ))}
      <Pressable onPress={onRemove} hitSlop={6} className="ml-auto">
        <Text style={{ color: mutedColor, fontSize: 12 }}>retirer</Text>
      </Pressable>
    </View>
  );
}

function InlineAddRating({
  ratingIcons,
  mutedColor,
  onAdd,
}: {
  ratingIcons: SheetRatingIconConfig[];
  mutedColor: string;
  onAdd: (icon: RatingIconKind) => void;
}) {
  if (ratingIcons.length === 0) return null;
  return (
    <View className="flex-row items-center gap-2">
      <Text style={{ color: mutedColor, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }}>
        Noter :
      </Text>
      {ratingIcons.map((r) => (
        <Pressable
          key={r.kind}
          onPress={() => onAdd(r.kind)}
          accessibilityLabel={`Ajouter une note ${r.label.toLowerCase()}`}
          hitSlop={6}
          className="opacity-70 active:opacity-100">
          <RatingIcon kind={r.kind} filled size={20} />
        </Pressable>
      ))}
    </View>
  );
}

