// Modale "Partagez votre fiche !" déclenchée après que l'user a accepté de
// rendre sa fiche publique (Alert de confirmation en amont). Seul ce flow
// crée une entry feed shared_sheet via la RPC publish_shared_sheet —
// le simple flip is_public ne déclenche RIEN côté feed (cf. migration 0070).
//
// "Non merci" → onClose direct, aucune RPC, aucune feed_entry. La fiche
// reste publique (consultable via profil / lien) mais n'apparaît pas dans
// le feed social.
// "Publier" → publish_shared_sheet(sheet_id, post_text?) → insert d'une
// nouvelle entry avec post_text facultatif embarqué dans le meta.

import { KeyboardDismissBar } from '@/components/keyboard-dismiss-bar';
import { supabase } from '@/lib/supabase';
import { MaterialIcons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

type Props = {
  open: boolean;
  sheetId: string | null;
  bookTitle: string;
  onClose: () => void;
};

// La fiche de lecture est une notion propre à Grimolia (pas un primitive
// social réutilisable), donc on garde la RPC et son hook ici, à côté de la
// seule consommatrice.
function usePublishSharedSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: {
      sheetId: string;
      postText?: string | null;
    }) => {
      const { error } = await supabase.rpc('publish_shared_sheet', {
        p_sheet_id: vars.sheetId,
        p_post_text: vars.postText ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['social', 'feed'] });
    },
  });
}

export function ShareSheetModal({ open, sheetId, bookTitle, onClose }: Props) {
  const publishMut = usePublishSharedSheet();
  const [postText, setPostText] = useState('');

  useEffect(() => {
    if (open) setPostText('');
  }, [open]);

  const handlePublish = async () => {
    if (!sheetId || publishMut.isPending) return;
    try {
      const cleaned = postText.trim();
      await publishMut.mutateAsync({
        sheetId,
        postText: cleaned.length > 0 ? cleaned : null,
      });
      onClose();
    } catch {
      // En cas d'erreur RPC (réseau, sheet pas sync), on ferme quand même —
      // la fiche reste publique côté DB (le flip is_public est antérieur),
      // l'user pourra retenter via re-flip private→public.
      onClose();
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardDismissBar />
      <Pressable onPress={onClose} className="flex-1 bg-ink/60">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-3xl bg-paper p-5"
            style={{ maxHeight: '85%' }}>
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-pale">
                <MaterialIcons name="campaign" size={24} color="#8e5dc8" />
              </View>
              <View className="flex-1">
                <Text className="font-display text-xl text-ink">
                  Partagez votre fiche !
                </Text>
                <Text
                  className="mt-0.5 text-sm text-ink-muted"
                  numberOfLines={1}>
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
              placeholder="Pourquoi cette fiche, ce que tu en as retenu…"
              placeholderTextColor="#6b6259"
              multiline
              textAlignVertical="top"
              className="mt-2 min-h-24 rounded-2xl bg-paper-warm px-5 py-3 text-base text-ink"
            />

            <View className="mt-6 flex-row gap-2">
              <Pressable
                onPress={onClose}
                className="flex-1 rounded-full border border-ink-muted/30 py-3 active:opacity-70">
                <Text className="text-center text-ink-muted">Non merci</Text>
              </Pressable>
              <Pressable
                onPress={handlePublish}
                disabled={publishMut.isPending || !sheetId}
                className={`flex-1 flex-row items-center justify-center gap-2 rounded-full py-3 ${
                  publishMut.isPending || !sheetId
                    ? 'bg-paper-shade'
                    : 'bg-accent active:opacity-80'
                }`}>
                {publishMut.isPending || !sheetId ? (
                  <ActivityIndicator color="#fbf8f4" size="small" />
                ) : null}
                <Text
                  className={`text-center font-sans-med ${
                    publishMut.isPending || !sheetId
                      ? 'text-ink-muted'
                      : 'text-paper'
                  }`}>
                  {sheetId ? 'Publier' : 'Synchronisation…'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
