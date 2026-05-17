import { SHEET_ICON_COLORS, SHEET_ICON_GROUPS } from '@/lib/sheet-icons';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';

export type IconPickerResult = {
  name?: string;
  color?: string;
  emoji?: string;
  // Présent uniquement quand le picker a été ouvert avec `withTitle=true`
  // (mode "Nouvelle section"). Le caller décide quoi en faire — typiquement
  // créer une section avec ce titre + l'icône.
  title?: string;
};

type Props = {
  open: boolean;
  selected?: string;
  selectedColor?: string;
  selectedEmoji?: string;
  onPick: (result: IconPickerResult) => void;
  onClose: () => void;
  // Affiche un champ nom au-dessus des onglets icônes/emojis. Le résultat
  // contient alors `title`. Le bouton "Valider" est désactivé tant que
  // le nom est vide.
  withTitle?: boolean;
  // Valeur initiale du champ nom (par défaut vide). N'est appliqué qu'au
  // (re)mount du modal.
  initialTitle?: string;
  // Texte du header — par défaut "Choisir une icône" ; "Nouvelle section"
  // est plus pertinent en mode withTitle.
  title?: string;
  titlePlaceholder?: string;
};

type Tab = 'icon' | 'emoji';

export function IconPickerModal({
  open,
  selected,
  selectedColor,
  selectedEmoji,
  onPick,
  onClose,
  withTitle = false,
  initialTitle,
  title: headerTitle,
  titlePlaceholder,
}: Props) {
  const [color, setColor] = useState<string>(selectedColor ?? SHEET_ICON_COLORS[0]);
  const [pendingName, setPendingName] = useState<string | undefined>(selected);
  const [pendingEmoji, setPendingEmoji] = useState<string>(selectedEmoji ?? '');
  const [pendingTitle, setPendingTitle] = useState<string>(initialTitle ?? '');
  const [tab, setTab] = useState<Tab>(selectedEmoji ? 'emoji' : 'icon');

  useEffect(() => {
    if (open) {
      setColor(selectedColor ?? SHEET_ICON_COLORS[0]);
      setPendingName(selected);
      setPendingEmoji(selectedEmoji ?? '');
      setPendingTitle(initialTitle ?? '');
      setTab(selectedEmoji ? 'emoji' : 'icon');
    }
  }, [open, selectedColor, selected, selectedEmoji, initialTitle]);

  const canValidate = !withTitle || pendingTitle.trim().length > 0;

  const validate = () => {
    if (!canValidate) return;
    const base: IconPickerResult =
      tab === 'emoji'
        ? { emoji: pendingEmoji.trim() || undefined }
        : {
            name: pendingName,
            color: pendingName ? color : undefined,
          };
    if (withTitle) base.title = pendingTitle.trim();
    onPick(base);
  };

  const clearAll = () => {
    if (tab === 'emoji') setPendingEmoji('');
    else setPendingName(undefined);
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/50">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 24 }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full max-w-xl rounded-3xl bg-paper p-4"
          style={{ maxHeight: '85%' }}>
          <View className="flex-row items-center justify-between px-2 pb-2">
            <Text className="font-display text-xl text-ink">
              {headerTitle ?? 'Choisir une icône'}
            </Text>
            <Pressable
              onPress={clearAll}
              className="rounded-full bg-paper-warm px-3 py-1 active:opacity-70">
              <Text className="text-sm text-ink-muted">Aucune</Text>
            </Pressable>
          </View>

          {withTitle ? (
            <View className="px-2 pb-2">
              <Text className="mb-1.5 text-xs uppercase tracking-wider text-ink-muted">
                Nom de la section
              </Text>
              <TextInput
                value={pendingTitle}
                onChangeText={setPendingTitle}
                placeholder={titlePlaceholder ?? 'Ex. Personnages, Ambiance…'}
                placeholderTextColor="#9a8f82"
                className="rounded-2xl bg-paper-warm px-4 py-3 text-base text-ink"
                maxLength={60}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={validate}
              />
            </View>
          ) : null}

          <View className="mt-1 flex-row gap-2 rounded-full bg-paper-warm p-1">
            <TabPill active={tab === 'icon'} onPress={() => setTab('icon')}>
              Icônes
            </TabPill>
            <TabPill active={tab === 'emoji'} onPress={() => setTab('emoji')}>
              Emojis
            </TabPill>
          </View>

          {tab === 'icon' ? (
            <IconTab
              color={color}
              setColor={setColor}
              pendingName={pendingName}
              setPendingName={setPendingName}
            />
          ) : (
            <EmojiTab pendingEmoji={pendingEmoji} setPendingEmoji={setPendingEmoji} />
          )}

          <View className="mt-4 flex-row gap-2">
            <Pressable
              onPress={onClose}
              className="flex-1 rounded-full border border-ink-muted/30 py-3 active:opacity-70">
              <Text className="text-center text-ink-muted">Annuler</Text>
            </Pressable>
            <Pressable
              onPress={validate}
              disabled={!canValidate}
              className="flex-1 rounded-full bg-accent py-3 active:opacity-80"
              style={{ opacity: canValidate ? 1 : 0.5 }}>
              <Text className="text-center font-sans-med text-paper">
                {withTitle ? 'Ajouter' : 'Valider'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function TabPill({
  active,
  onPress,
  children,
}: {
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-full py-2 ${
        active ? 'bg-accent' : 'active:bg-paper-shade'
      }`}>
      <Text
        className={`text-sm ${active ? 'font-sans-med text-paper' : 'text-ink-muted'}`}>
        {children}
      </Text>
    </Pressable>
  );
}

function IconTab({
  color,
  setColor,
  pendingName,
  setPendingName,
}: {
  color: string;
  setColor: (c: string) => void;
  pendingName: string | undefined;
  setPendingName: (n: string | undefined) => void;
}) {
  return (
    <>
      <View className="px-2 pb-1 pt-3">
        <Text className="text-xs uppercase tracking-wider text-ink-muted">
          Couleur
        </Text>
        <View className="mt-2 flex-row flex-wrap" style={{ gap: 8 }}>
          {SHEET_ICON_COLORS.map((c) => {
            const active = c === color;
            return (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                accessibilityLabel={`Couleur ${c}`}
                style={{
                  width: 32,
                  height: 32,
                  backgroundColor: c,
                  borderWidth: active ? 3 : 0,
                  borderColor: '#1f1a16',
                }}
                className="rounded-full active:opacity-80"
              />
            );
          })}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="mt-3">
          <Text className="px-2 text-xs uppercase tracking-wider text-ink-muted">
            Aucune icône
          </Text>
          <View className="mt-2 flex-row" style={{ gap: 8 }}>
            <Pressable
              onPress={() => setPendingName(undefined)}
              accessibilityLabel="Aucune icône"
              style={{
                width: 48,
                height: 48,
                backgroundColor: '#ffffff',
                borderWidth: pendingName === undefined ? 2.5 : 1,
                borderColor: pendingName === undefined ? color : '#e8e1d6',
              }}
              className="items-center justify-center rounded-2xl active:opacity-80">
              <MaterialIcons name="block" size={24} color="#9a8f82" />
            </Pressable>
          </View>
        </View>
        {SHEET_ICON_GROUPS.map((group) => (
          <View key={group.title} className="mt-3">
            <Text className="px-2 text-xs uppercase tracking-wider text-ink-muted">
              {group.title}
            </Text>
            <View className="mt-2 flex-row flex-wrap" style={{ gap: 8 }}>
              {group.icons.map((icon) => {
                const active = pendingName === icon.name;
                return (
                  <Pressable
                    key={icon.name}
                    onPress={() => setPendingName(icon.name)}
                    accessibilityLabel={icon.label}
                    style={{
                      width: 48,
                      height: 48,
                      backgroundColor: '#ffffff',
                      borderWidth: active ? 2.5 : 1,
                      borderColor: active ? color : '#e8e1d6',
                    }}
                    className="items-center justify-center rounded-2xl active:opacity-80">
                    <MaterialIcons
                      name={icon.name as keyof typeof MaterialIcons.glyphMap}
                      size={24}
                      color={color}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </>
  );
}

// Extrait le dernier grapheme cluster (= 1 emoji visuel) depuis une string.
// Utilise Intl.Segmenter quand dispo (Hermes récent) sinon fallback codepoint.
function pickLastGrapheme(s: string): string {
  if (!s) return '';
  const SegmenterCtor = (Intl as unknown as { Segmenter?: new (loc: string, opts: { granularity: 'grapheme' }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (typeof SegmenterCtor === 'function') {
    const seg = new SegmenterCtor('fr', { granularity: 'grapheme' });
    const segments = Array.from(seg.segment(s));
    if (segments.length === 0) return '';
    return segments[segments.length - 1].segment;
  }
  const cps = Array.from(s);
  return cps[cps.length - 1] ?? '';
}

function EmojiTab({
  pendingEmoji,
  setPendingEmoji,
}: {
  pendingEmoji: string;
  setPendingEmoji: (e: string) => void;
}) {
  return (
    <View className="items-center px-4 py-6">
      <View
        style={{
          width: 96,
          height: 96,
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: '#e8e1d6',
        }}
        className="items-center justify-center rounded-3xl">
        <Text style={{ fontSize: 56 }}>{pendingEmoji || '✏️'}</Text>
      </View>

      <Text className="mt-4 text-sm text-ink-muted">
        Tape un emoji depuis ton clavier
      </Text>
      <TextInput
        value={pendingEmoji}
        onChangeText={(v) => setPendingEmoji(pickLastGrapheme(v))}
        placeholder="📚"
        placeholderTextColor="#9a8f82"
        autoCorrect={false}
        autoCapitalize="none"
        style={{ fontSize: 28 }}
        className="mt-3 min-w-[120px] rounded-2xl bg-paper-warm px-5 py-3 text-center text-ink"
      />
    </View>
  );
}
