// Modale formulaire d'avis : note 5★ obligatoire + commentaire optionnel.
// Sert à la création ET à l'édition (on pré-remplit avec myReview si
// présente).
//
// Le parent décide quoi faire après onSubmitted :
//   - création  → ouvrir la share-modal
//   - édition   → fermer simplement
// On expose `created` dans la callback pour qu'il puisse trancher.

import { KeyboardDismissBar } from '@/components/keyboard-dismiss-bar';
import { useAuth } from '@/hooks/use-auth';
import { MaterialIcons } from '@expo/vector-icons';
import { Reviews } from '@grimolia/social';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { StarRatingInput } from './star-rating';

type SubmitResult = { reviewId: string; created: boolean };

type Props = {
  open: boolean;
  bookIsbn: string;
  bookTitle: string;
  onClose: () => void;
  onSubmitted: (result: SubmitResult) => void;
};

export function ReviewFormModal({
  open,
  bookIsbn,
  bookTitle,
  onClose,
  onSubmitted,
}: Props) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const myReviewQuery = Reviews.useMyReview(userId, bookIsbn);
  const upsertMut = Reviews.useUpsertReview(userId, bookIsbn);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  // Sync l'état local avec l'avis existant à l'ouverture.
  useEffect(() => {
    if (!open) return;
    const existing = myReviewQuery.data;
    setRating(existing?.rating ?? 0);
    setComment(existing?.comment ?? '');
  }, [open, myReviewQuery.data]);

  const isEditing = Boolean(myReviewQuery.data);
  const canSubmit = rating >= 1 && rating <= 5 && !upsertMut.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      const cleanComment = comment.trim();
      const result = await upsertMut.mutateAsync({
        rating,
        comment: cleanComment.length > 0 ? cleanComment : null,
      });
      onSubmitted({ reviewId: result.id, created: result.created });
    } catch {
      // Silencieux : le hook expose error si besoin de feedback.
    }
  };

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
              <MaterialIcons name="rate-review" size={24} color="#8e5dc8" />
            </View>
            <View className="flex-1">
              <Text className="font-display text-xl text-ink">
                {isEditing ? 'Modifier mon avis' : 'Donner mon avis'}
              </Text>
              <Text
                className="mt-0.5 text-sm text-ink-muted"
                numberOfLines={1}
              >
                {bookTitle}
              </Text>
            </View>
          </View>

          <Text className="mt-5 text-sm text-ink-muted">Ta note</Text>
          <View className="mt-2 items-center">
            <StarRatingInput value={rating} onChange={setRating} />
          </View>

          <Text className="mt-5 text-sm text-ink-muted">
            Commentaire (optionnel)
          </Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Partage ton ressenti, ce qui t'a marqué…"
            placeholderTextColor="#6b6259"
            multiline
            textAlignVertical="top"
            className="mt-2 min-h-28 rounded-2xl bg-paper-warm px-5 py-3 text-base text-ink"
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
              disabled={!canSubmit}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-full py-3 ${
                canSubmit ? 'bg-accent active:opacity-80' : 'bg-paper-shade'
              }`}
            >
              {upsertMut.isPending ? (
                <ActivityIndicator color="#fbf8f4" size="small" />
              ) : null}
              <Text
                className={`text-center font-sans-med ${
                  canSubmit ? 'text-paper' : 'text-ink-muted'
                }`}
              >
                {isEditing ? 'Enregistrer' : 'Publier'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
