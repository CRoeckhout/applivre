import { ReleaseNoteBlocks } from '@/components/release-notes/block-renderer';
import type { ReleaseNote } from '@/types/release-note';
import { MaterialIcons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';

type Props = {
  open: boolean;
  onClose: () => void;
  notes: ReleaseNote[];
  // Affiche un spinner à la place du contenu. Utilisé en mode manuel
  // (depuis Profil) le temps que le fetch se termine — en mode auto au
  // boot, le host ne rend la modale qu'une fois les notes prêtes.
  loading?: boolean;
};

// Modale "Dernières nouveautés". Présentationnelle : prend la liste des
// notes à montrer en prop, ne décide pas elle-même si elle doit s'afficher
// (cf. components/release-notes/release-notes-host.tsx pour le trigger
// auto au boot, et l'écran réglages pour le déclenchement manuel).

export function ReleaseNotesModal({ open, onClose, notes, loading = false }: Props) {
  const subtitle = loading
    ? 'Chargement…'
    : notes.length === 0
      ? 'Aucune nouveauté pour le moment'
      : notes.length > 1
        ? `${notes.length} versions à découvrir`
        : 'Quoi de neuf dans cette version';

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/60 px-6"
        style={{ justifyContent: 'center' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-3xl bg-paper p-5"
          style={{ maxHeight: '85%' }}>
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-pale">
              <MaterialIcons name="auto-awesome" size={24} color="#f59e0b" />
            </View>
            <View className="flex-1">
              <Text className="font-display text-lg text-ink">
                Dernières nouveautés
              </Text>
              <Text className="text-xs text-ink-muted">{subtitle}</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
              <MaterialIcons name="close" size={18} color="rgb(58 50 43)" />
            </Pressable>
          </View>

          <ScrollView
            style={{ marginTop: 16 }}
            showsVerticalScrollIndicator={false}>
            {loading ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <ActivityIndicator color="#c27b52" />
              </View>
            ) : notes.length === 0 ? (
              <View style={{ paddingVertical: 24 }}>
                <Text
                  className="text-sm text-ink-muted"
                  style={{ textAlign: 'center', lineHeight: 20 }}>
                  Reviens après la prochaine mise à jour pour découvrir les
                  nouveautés.
                </Text>
              </View>
            ) : (
              <View className="gap-6">
                {notes.map((note) => (
                  <View key={note.id} className="gap-3">
                    <View className="flex-row items-baseline gap-2">
                      <Text className="font-sans-med text-base text-ink">
                        {note.title}
                      </Text>
                      <Text className="text-xs text-ink-muted">v{note.version}</Text>
                    </View>
                    <ReleaseNoteBlocks blocks={note.body} />
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <Pressable
            onPress={onClose}
            className="mt-5 rounded-2xl bg-paper-warm active:bg-paper-shade px-4 py-3"
            style={{ alignItems: 'center' }}>
            <Text className="font-sans-med text-sm text-ink">Compris</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
