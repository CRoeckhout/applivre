import { KeyboardDismissBar } from '@/components/keyboard-dismiss-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';

type Props = {
  open: boolean;
  totalPages?: number;
  initialPage?: number;
  initialSummary?: string;
  onClose: () => void;
  onConfirm: (page: number | undefined, summary: string | undefined) => void;
};

export function PauseBookModal({
  open,
  totalPages,
  initialPage,
  initialSummary,
  onClose,
  onConfirm,
}: Props) {
  const [pageStr, setPageStr] = useState('');
  const [summary, setSummary] = useState('');

  useEffect(() => {
    if (open) {
      setPageStr(initialPage != null ? String(initialPage) : '');
      setSummary(initialSummary ?? '');
    }
  }, [open, initialPage, initialSummary]);

  const parsedPage = pageStr.trim() === '' ? undefined : Math.max(0, parseInt(pageStr, 10));
  const pageInvalid =
    pageStr.trim() !== '' &&
    (Number.isNaN(parsedPage) || (totalPages != null && (parsedPage ?? 0) > totalPages));

  const handleConfirm = () => {
    if (pageInvalid) return;
    const cleanedSummary = summary.trim().length > 0 ? summary.trim() : undefined;
    onConfirm(parsedPage, cleanedSummary);
    onClose();
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardDismissBar />
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/60">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}
        >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-3xl bg-paper p-5"
          style={{ maxHeight: '85%' }}>
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-pale">
              <MaterialIcons name="pause-circle-filled" size={26} color="#8e5dc8" />
            </View>
            <View className="flex-1">
              <Text className="font-display text-xl text-ink">Mettre en pause</Text>
              <Text className="mt-0.5 text-sm text-ink-muted">
                Garde une trace pour reprendre plus tard.
              </Text>
            </View>
          </View>

          <Text className="mt-5 text-sm text-ink-muted">
            Page atteinte{totalPages ? ` (sur ${totalPages})` : ''}
          </Text>
          <TextInput
            value={pageStr}
            onChangeText={(v) => setPageStr(v.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="ex : 142"
            placeholderTextColor="#6b6259"
            className="mt-2 rounded-2xl bg-paper-warm px-5 py-3 text-base text-ink"
          />
          {pageInvalid && (
            <Text className="mt-1 text-xs text-[#b8503a]">
              {totalPages != null && (parsedPage ?? 0) > totalPages
                ? `Le livre ne fait que ${totalPages} pages.`
                : 'Numéro de page invalide.'}
            </Text>
          )}

          <Text className="mt-4 text-sm text-ink-muted">Récapitulatif</Text>
          <TextInput
            value={summary}
            onChangeText={setSummary}
            placeholder="Suggestion : personnages / moment clés / points importants"
            placeholderTextColor="#6b6259"
            multiline
            textAlignVertical="top"
            className="mt-2 min-h-24 rounded-2xl bg-paper-warm px-5 py-3 text-base text-ink"
          />

          <View className="mt-6 flex-row gap-2">
            <Pressable
              onPress={onClose}
              className="flex-1 rounded-full border border-ink-muted/30 py-3 active:opacity-70">
              <Text className="text-center text-ink-muted">Annuler</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              disabled={pageInvalid}
              className={`flex-1 rounded-full py-3 ${
                pageInvalid ? 'bg-paper-shade' : 'bg-accent active:opacity-80'
              }`}>
              <Text
                className={`text-center font-sans-med ${
                  pageInvalid ? 'text-ink-muted' : 'text-paper'
                }`}>
                Mettre en pause
              </Text>
            </Pressable>
          </View>
        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
