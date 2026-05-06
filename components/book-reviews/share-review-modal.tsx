// Modale "Partagez votre avis !" déclenchée UNIQUEMENT à la création d'un
// nouvel avis (jamais à l'édition). One-shot : "Non merci" est définitif,
// on ne re-propose jamais le partage côté UI.
//
// Le post_text est facultatif. Il vit dans social_feed_entries.meta
// (transmis via Reviews.publishReviewToFeed), pas dans book_reviews —
// séparation entre l'artefact durable et le contenu social.

import { KeyboardDismissBar } from '@/components/keyboard-dismiss-bar';
import { MaterialIcons } from '@expo/vector-icons';
import { Reviews } from '@grimolia/social';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';

type Props = {
  open: boolean;
  reviewId: string | null;
  bookTitle: string;
  onClose: () => void;
};

export function ShareReviewModal({ open, reviewId, bookTitle, onClose }: Props) {
  const publishMut = Reviews.usePublishReview();
  const [postText, setPostText] = useState('');

  useEffect(() => {
    if (open) setPostText('');
  }, [open]);

  const handlePublish = async () => {
    if (!reviewId || publishMut.isPending) return;
    try {
      const cleaned = postText.trim();
      await publishMut.mutateAsync({
        reviewId,
        postText: cleaned.length > 0 ? cleaned : null,
      });
      onClose();
    } catch {
      // Idempotent côté SQL — la modale peut se fermer même si l'appel
      // échoue (l'avis lui-même est déjà créé).
      onClose();
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
              <MaterialIcons name="campaign" size={24} color="#8e5dc8" />
            </View>
            <View className="flex-1">
              <Text className="font-display text-xl text-ink">
                Partagez votre avis !
              </Text>
              <Text
                className="mt-0.5 text-sm text-ink-muted"
                numberOfLines={1}
              >
                {bookTitle}
              </Text>
            </View>
          </View>

          <Text className="mt-5 text-sm text-ink-muted">
            Ajouter un mot pour ta publication (optionnel)
          </Text>
          <TextInput
            value={postText}
            onChangeText={setPostText}
            placeholder="Pourquoi tu recommandes (ou pas) ce livre…"
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
              <Text className="text-center text-ink-muted">Non merci</Text>
            </Pressable>
            <Pressable
              onPress={handlePublish}
              disabled={publishMut.isPending}
              className={`flex-1 flex-row items-center justify-center gap-2 rounded-full py-3 ${
                publishMut.isPending ? 'bg-paper-shade' : 'bg-accent active:opacity-80'
              }`}
            >
              {publishMut.isPending ? (
                <ActivityIndicator color="#fbf8f4" size="small" />
              ) : null}
              <Text
                className={`text-center font-sans-med ${
                  publishMut.isPending ? 'text-ink-muted' : 'text-paper'
                }`}
              >
                Publier
              </Text>
            </Pressable>
          </View>
        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
