// Modale de quote-repost : l'user peut ajouter un mot au-dessus de la
// publication originale avant de la republier dans son propre feed. Le
// note est facultatif (repost pur si vide).
//
// Idempotente côté SQL — un second submit sur la même entry n'écrase pas
// la note existante (cf. RPC repost_feed_entry).

import { KeyboardDismissBar } from '@/components/keyboard-dismiss-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { Feed } from '@grimolia/social';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';

type Props = {
  open: boolean;
  entryId: string | null;
  authorHandle?: string | null;
  onClose: () => void;
};

export function RepostModal({ open, entryId, authorHandle, onClose }: Props) {
  const summary = Feed.useRepostSummary(entryId);
  const toggle = Feed.useToggleRepost(entryId);

  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) setNote('');
  }, [open]);

  const handleSubmit = async () => {
    if (!entryId || toggle.isPending) return;
    try {
      const cleaned = note.trim();
      await toggle.mutateAsync({
        currentlyReposted: false,
        note: cleaned.length > 0 ? cleaned : null,
      });
      onClose();
    } catch {
      onClose();
    }
  };

  const subtitle = authorHandle
    ? `Publication de ${authorHandle}`
    : 'Republier dans ton feed';

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardDismissBar />
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/60"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}
        >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-3xl bg-paper p-5"
          style={{ maxHeight: '85%' }}
        >
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-pale">
              <MaterialIcons name="repeat" size={24} color="#8e5dc8" />
            </View>
            <View className="flex-1">
              <Text className="font-display text-xl text-ink">Republier</Text>
              <Text
                className="mt-0.5 text-sm text-ink-muted"
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            </View>
          </View>

          <Text className="mt-5 text-sm text-ink-muted">
            Ajouter un mot (optionnel)
          </Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Pourquoi tu mets cette publication en avant…"
            placeholderTextColor="#6b6259"
            multiline
            textAlignVertical="top"
            className="mt-2 min-h-24 rounded-2xl bg-paper-warm px-5 py-3 text-base text-ink"
          />

          <View className="mt-6 flex-row gap-2">
            <Pressable
              onPress={onClose}
              className="flex-1 rounded-full border border-ink-muted/30 py-3 active:opacity-70"
            >
              <Text className="text-center text-ink-muted">Annuler</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              disabled={toggle.isPending || !entryId}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-full py-3 ${
                toggle.isPending ? 'bg-paper-shade' : 'bg-accent active:opacity-80'
              }`}
            >
              {toggle.isPending ? (
                <ActivityIndicator color="#fbf8f4" size="small" />
              ) : null}
              <Text
                className={`text-center font-sans-med ${
                  toggle.isPending ? 'text-ink-muted' : 'text-paper'
                }`}
              >
                Republier
              </Text>
            </Pressable>
          </View>

          {summary.data && summary.data.count > 0 ? (
            <Text className="mt-3 text-center text-xs text-ink-muted">
              Déjà republié {summary.data.count} fois
            </Text>
          ) : null}
        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
