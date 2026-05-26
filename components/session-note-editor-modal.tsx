// Bottom-sheet de saisie/édition pour la note d'une session de lecture.
// Sans-ado d'opinion sur la persistance — le parent passe un `onSave(text)`
// qui peut soit écrire dans le state `active.draftNote` du timer (pendant
// la session), soit appeler `updateSessionNote(sessionId, text)` (édition
// a posteriori).

import { useThemeColors } from '@/hooks/use-theme-colors';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const MAX_LENGTH = 5000;

type Props = {
  open: boolean;
  onClose: () => void;
  // Texte initial — pré-remplit le TextInput à l'ouverture. Les changements
  // ne sont commits qu'au tap "Enregistrer" : si l'user ferme via X ou
  // backdrop, le draft local est jeté (mais le parent reste responsable
  // de son propre state, on n'y touche pas).
  initialValue?: string;
  onSave: (text: string) => void;
  // Header. Défaut "Note de session".
  title?: string;
  // Sous-titre optionnel (ex: "12 mars · 32 min · p. 84").
  subtitle?: string;
  placeholder?: string;
  // Édition optionnelle de la page d'arrêt. Si `initialPage` est fourni,
  // un champ numérique apparaît au-dessus de la note. `onSavePage` est
  // appelé uniquement si la page a effectivement changé.
  initialPage?: number;
  totalPages?: number;
  onSavePage?: (page: number) => void;
};

export function SessionNoteEditorModal({
  open,
  onClose,
  initialValue,
  onSave,
  title = 'Note de session',
  subtitle,
  placeholder = 'Ce que tu retiens, un passage, une question…',
  initialPage,
  totalPages,
  onSavePage,
}: Props) {
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(initialValue ?? '');
  const pageEditable = initialPage !== undefined && !!onSavePage;
  const [pageDraft, setPageDraft] = useState(
    initialPage !== undefined ? String(initialPage) : '',
  );
  const inputRef = useRef<TextInput>(null);
  const pageInputRef = useRef<TextInput>(null);

  // Re-init les drafts à chaque ouverture pour éviter les fuites entre
  // sessions (deux rows différentes qui ouvrent le même modal).
  // Important : on ne déclenche PAS l'auto-focus de la note quand le champ
  // page est éditable. Le clavier qui s'ouvrait tout de suite faisait
  // sauter la modale via KeyboardAvoidingView au moment où l'user tentait
  // de toucher l'input page → champ insaisissable.
  useEffect(() => {
    if (open) {
      setDraft(initialValue ?? '');
      setPageDraft(initialPage !== undefined ? String(initialPage) : '');
      if (pageEditable) return;
      // Petit délai pour laisser l'animation slide finir avant focus —
      // sinon iOS rate l'auto-focus et le clavier n'apparait pas.
      const t = setTimeout(() => inputRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
  }, [open, initialValue, initialPage, pageEditable]);

  const trimmed = draft.trim();
  const noteDirty = trimmed !== (initialValue?.trim() ?? '');

  // Parse + clamp de la page saisie. `null` si entrée vide/invalide → on
  // ignore alors la modif de page au save (le champ note reste indépendant).
  const parsedPage: number | null = pageEditable
    ? (() => {
        const n = parseInt(pageDraft, 10);
        if (Number.isNaN(n) || n < 0) return null;
        if (totalPages && n > totalPages) return totalPages;
        return n;
      })()
    : null;
  const pageDirty =
    pageEditable && parsedPage !== null && parsedPage !== initialPage;

  const dirty = noteDirty || pageDirty;

  const handleSave = () => {
    if (noteDirty) onSave(trimmed);
    if (pageDirty && onSavePage && parsedPage !== null) onSavePage(parsedPage);
    onClose();
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable onPress={onClose} className="flex-1 bg-ink/40" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
      >
        <View
          className="rounded-t-3xl bg-paper"
          style={{ paddingBottom: insets.bottom, maxHeight: '90%' }}
        >
          <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
            <View className="flex-1 pr-3">
              <Text className="font-display text-xl text-ink">{title}</Text>
              {subtitle ? (
                <Text className="mt-0.5 text-xs text-ink-muted">{subtitle}</Text>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade"
              accessibilityLabel="Fermer"
            >
              <MaterialIcons name="close" size={18} color={theme.ink} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            {pageEditable ? (
              <Pressable
                onPress={() => pageInputRef.current?.focus()}
                className="mb-3 flex-row items-center justify-between rounded-2xl bg-paper-warm px-4 py-4 active:bg-paper-shade"
                accessibilityLabel="Modifier la page d'arrêt"
              >
                <Text className="text-base text-ink">Page d&apos;arrêt</Text>
                <View className="flex-row items-baseline gap-2">
                  <TextInput
                    ref={pageInputRef}
                    value={pageDraft}
                    onChangeText={(v) => setPageDraft(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    maxLength={5}
                    style={{
                      color: theme.ink,
                      fontSize: 18,
                      minWidth: 72,
                      paddingVertical: 4,
                      textAlign: 'right',
                    }}
                  />
                  {totalPages ? (
                    <Text className="text-sm text-ink-muted">
                      / {totalPages}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ) : null}
            <View className="rounded-2xl bg-paper-warm px-4 py-3">
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                placeholder={placeholder}
                placeholderTextColor={theme.inkMuted}
                multiline
                numberOfLines={6}
                maxLength={MAX_LENGTH}
                textAlignVertical="top"
                style={{ color: theme.ink, minHeight: 160, fontSize: 15 }}
              />
            </View>
            <Text className="mt-2 text-right text-xs text-ink-muted">
              {draft.length} / {MAX_LENGTH}
            </Text>
          </ScrollView>

          <View className="flex-row gap-3 px-5 pt-2" style={{ paddingBottom: 12 }}>
            <Pressable
              onPress={onClose}
              className="flex-1 items-center rounded-full bg-paper-warm px-4 py-3 active:bg-paper-shade"
            >
              <Text className="font-sans-med text-sm text-ink">Annuler</Text>
            </Pressable>
            <Pressable
              onPress={handleSave}
              disabled={!dirty}
              className="flex-1 items-center rounded-full bg-accent px-4 py-3 active:opacity-80"
              style={{ opacity: dirty ? 1 : 0.5 }}
            >
              <Text className="font-sans-med text-sm text-paper">
                Enregistrer
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
