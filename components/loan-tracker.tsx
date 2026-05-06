import { useLoans } from '@/store/loans';
import type { BookLoan } from '@/types/book';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

type Props = {
  userBookId: string;
};

export function LoanTracker({ userBookId }: Props) {
  const allLoans = useLoans((s) => s.loans);
  const loans = useMemo(
    () => allLoans.filter((l) => l.userBookId === userBookId),
    [allLoans, userBookId],
  );
  const active = loans.find((l) => !l.dateBack);
  const past = loans.filter((l) => !!l.dateBack);

  const [modalOpen, setModalOpen] = useState(false);
  const closeLoan = useLoans((s) => s.closeLoan);

  return (
    <View className="mt-8">
      <Text className="mb-3 font-display text-xl text-ink">Prêts</Text>

      {active ? (
        <ActiveLoanCard loan={active} onClose={() => closeLoan(active.id)} />
      ) : (
        <View className="flex-row gap-2">
          <Pressable
            onPress={() => setModalOpen(true)}
            className="flex-1 rounded-full bg-paper-warm px-4 py-3 active:bg-paper-shade">
            <Text className="text-center text-ink">Prêté à…</Text>
          </Pressable>
          <Pressable
            onPress={() => setModalOpen(true)}
            className="flex-1 rounded-full bg-paper-warm px-4 py-3 active:bg-paper-shade">
            <Text className="text-center text-ink">Emprunté de…</Text>
          </Pressable>
        </View>
      )}

      {past.length > 0 && (
        <View className="mt-4">
          <Text className="mb-2 text-xs uppercase tracking-wider text-ink-muted">Historique</Text>
          {past.slice(0, 5).map((l) => (
            <PastLoanRow key={l.id} loan={l} />
          ))}
        </View>
      )}

      <NewLoanModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        userBookId={userBookId}
      />
    </View>
  );
}

function ActiveLoanCard({ loan, onClose }: { loan: BookLoan; onClose: () => void }) {
  const days = daysSince(loan.dateOut);
  const label = loan.direction === 'lent' ? 'Prêté à' : 'Emprunté de';
  const closeLabel = loan.direction === 'lent' ? 'Livre rendu' : 'Livre rendu au prêteur';

  return (
    <Animated.View entering={FadeIn.duration(300)} className="rounded-2xl bg-accent-pale p-5">
      <Text className="text-xs uppercase tracking-wider text-accent-deep">{label}</Text>
      <Text className="mt-1 font-display text-2xl text-ink">{loan.contactName}</Text>
      <Text className="mt-1 text-sm text-ink-soft">
        depuis {formatDate(loan.dateOut)} · {days} jour{days > 1 ? 's' : ''}
      </Text>
      {loan.note ? (
        <Text className="mt-2 text-sm italic text-ink-muted">« {loan.note} »</Text>
      ) : null}
      <Pressable
        onPress={onClose}
        className="mt-4 rounded-full bg-accent py-2 active:opacity-80">
        <Text className="text-center font-sans-med text-paper">{closeLabel}</Text>
      </Pressable>
    </Animated.View>
  );
}

function PastLoanRow({ loan }: { loan: BookLoan }) {
  const duration = loan.dateBack
    ? daysBetween(loan.dateOut, loan.dateBack)
    : null;
  const label = loan.direction === 'lent' ? 'Prêté à' : 'Emprunté de';
  return (
    <View className="mb-2 flex-row items-center justify-between rounded-xl bg-paper-warm px-4 py-3">
      <View className="flex-1 pr-2">
        <Text className="text-sm text-ink-muted">{label}</Text>
        <Text className="text-base text-ink">{loan.contactName}</Text>
      </View>
      <Text className="text-sm text-ink-muted">
        {duration !== null ? `${duration} j` : ''}
      </Text>
    </View>
  );
}

function NewLoanModal({
  open,
  onClose,
  userBookId,
}: {
  open: boolean;
  onClose: () => void;
  userBookId: string;
}) {
  const createLoan = useLoans((s) => s.createLoan);
  const [direction, setDirection] = useState<'lent' | 'borrowed'>('lent');
  const [contact, setContact] = useState('');
  const [note, setNote] = useState('');

  const canSave = contact.trim().length > 0;

  const onSave = () => {
    if (!canSave) return;
    createLoan({ userBookId, contactName: contact, direction, note });
    setContact('');
    setNote('');
    onClose();
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/60">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}
        >
        <Pressable className="rounded-3xl bg-paper p-6" onPress={(e) => e.stopPropagation()}>
          <Text className="font-display text-2xl text-ink">Nouveau prêt</Text>

          <View className="mt-4 flex-row rounded-full bg-paper-warm p-1">
            <DirectionPill
              active={direction === 'lent'}
              onPress={() => setDirection('lent')}>
              Prêté à quelqu&apos;un
            </DirectionPill>
            <DirectionPill
              active={direction === 'borrowed'}
              onPress={() => setDirection('borrowed')}>
              Emprunté
            </DirectionPill>
          </View>

          <Text className="mt-5 text-sm text-ink-muted">
            {direction === 'lent' ? 'Nom de la personne qui a le livre' : 'Nom du prêteur'}
          </Text>
          <TextInput
            value={contact}
            onChangeText={setContact}
            autoFocus
            placeholder="Prénom, pseudo, « maman »…"
            placeholderTextColor="#6b6259"
            className="mt-2 rounded-2xl bg-paper-warm px-5 py-3 text-base text-ink"
          />

          <Text className="mt-4 text-sm text-ink-muted">Note (optionnel)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="ex: à lui rendre avant l'été"
            placeholderTextColor="#6b6259"
            multiline
            className="mt-2 min-h-16 rounded-2xl bg-paper-warm px-5 py-3 text-base text-ink"
          />

          <View className="mt-6 gap-2">
            <Pressable
              disabled={!canSave}
              onPress={onSave}
              className={`rounded-full py-3 ${canSave ? 'bg-accent active:opacity-80' : 'bg-paper-shade'}`}>
              <Text
                className={`text-center font-sans-med ${canSave ? 'text-paper' : 'text-ink-muted'}`}>
                Enregistrer
              </Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              className="rounded-full border border-ink-muted/30 py-3 active:opacity-70">
              <Text className="text-center text-ink-muted">Annuler</Text>
            </Pressable>
          </View>
        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function DirectionPill({
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
      className={`flex-1 items-center rounded-full py-2 ${active ? 'bg-ink' : ''}`}>
      <Text className={active ? 'font-sans-med text-paper' : 'text-ink-soft'}>{children}</Text>
    </Pressable>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.max(
    0,
    Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86400000),
  );
}
