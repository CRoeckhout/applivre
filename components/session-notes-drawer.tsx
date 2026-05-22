// Drawer "Notes de sessions" : liste les notes des sessions liées à un
// userBook (= un livre dans la biblio d'un user). Read-only par défaut, tap
// sur une row pour éditer/lire la note complète via SessionNoteEditorModal.
//
// Vie principalement dans l'éditeur de fiche (/sheet/[isbn]) où l'user veut
// retrouver ses pensées au moment de rédiger l'avis. Réutilisable ailleurs.

import { SessionNoteEditorModal } from '@/components/session-note-editor-modal';
import { formatDurationHuman } from '@/hooks/use-elapsed-time';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useTimer } from '@/store/timer';
import type { ReadingSession } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  open: boolean;
  onClose: () => void;
  userBookId: string;
};

export function SessionNotesDrawer({ open, onClose, userBookId }: Props) {
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
  const sessions = useTimer((s) => s.sessions);
  const updateSessionNote = useTimer((s) => s.updateSessionNote);
  const [editing, setEditing] = useState<ReadingSession | null>(null);

  // iOS ne sait pas empiler proprement deux Modal natifs en même temps —
  // le second est avalé tant que le premier n'a pas fini son animation
  // de présentation. Pattern utilisé ailleurs dans le repo (cf.
  // report-menu-button) : on ferme le parent, on attend l'anim, puis on
  // ouvre l'éditeur.
  const openEditor = (s: ReadingSession) => {
    onClose();
    setTimeout(() => setEditing(s), 220);
  };

  const notedSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.userBookId === userBookId && s.note?.trim())
        .sort(
          (a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
        ),
    [sessions, userBookId],
  );

  return (
    <>
      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <Pressable onPress={onClose} className="flex-1 bg-ink/40" />
        <View
          className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-paper"
          style={{ paddingBottom: insets.bottom, maxHeight: '85%' }}
        >
          <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
            <View className="flex-1">
              <Text className="font-display text-xl text-ink">
                Notes de sessions
              </Text>
              <Text className="mt-0.5 text-xs text-ink-muted">
                {notedSessions.length === 0
                  ? "Aucune note pour l'instant."
                  : `${notedSessions.length} note${notedSessions.length > 1 ? 's' : ''} sur ce livre`}
              </Text>
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

          {notedSessions.length === 0 ? (
            <View className="items-center px-8 py-10">
              <MaterialIcons name="note-add" size={36} color={theme.inkMuted} />
              <Text className="mt-3 text-center text-sm text-ink-muted">
                Pendant ou à la fin d&apos;une session, ajoute une note pour
                garder une trace de tes pensées. Elles apparaitront ici.
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: 16,
              }}
            >
              {notedSessions.map((s) => (
                <NoteRow key={s.id} session={s} onPress={() => openEditor(s)} />
              ))}
            </ScrollView>
          )}
        </View>
      </Modal>

      <SessionNoteEditorModal
        open={!!editing}
        onClose={() => setEditing(null)}
        initialValue={editing?.note}
        onSave={(text) => {
          if (editing) updateSessionNote(editing.id, text);
        }}
        subtitle={
          editing
            ? `${formatSessionDate(editing.startedAt)} · ${formatDurationHuman(editing.durationSec)} · p. ${editing.stoppedAtPage}`
            : undefined
        }
      />
    </>
  );
}

function NoteRow({
  session,
  onPress,
}: {
  session: ReadingSession;
  onPress: () => void;
}) {
  const dateStr = formatSessionDate(session.startedAt);
  const note = session.note?.trim() ?? '';
  // Excerpt sur 4 lignes max — le tap ouvre l'éditeur pour le détail.
  return (
    <Pressable
      onPress={onPress}
      className="mb-2 rounded-2xl bg-paper-warm px-4 py-3 active:bg-paper-shade"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-xs text-ink-soft">{dateStr}</Text>
        <Text className="text-xs text-ink-muted">
          {formatDurationHuman(session.durationSec)} · p. {session.stoppedAtPage}
        </Text>
      </View>
      <Text
        numberOfLines={4}
        className="mt-2 text-sm text-ink"
        style={{ lineHeight: 20 }}
      >
        {note}
      </Text>
    </Pressable>
  );
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
