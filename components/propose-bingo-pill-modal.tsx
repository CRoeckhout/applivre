import { useBingos } from "@/store/bingo";
import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  // ID de la pill à proposer. Si null, modale fermée. La modale est volontairement
  // contrôlée par ID pour rester réactive si la row de la pill bouge en async.
  pillId: string | null;
  onClose: () => void;
  // Callback déclenché après une soumission réussie. Le caller peut afficher
  // un toast / fermer le picker derrière.
  onProposed?: (pillId: string) => void;
};

// Modale post-création (et action « Rendre public » du menu kebab).
//
// Affiche le label de la pill, un texte d'invitation, et un champ libre pour
// la justification. À la validation, appelle `proposePill(id, message)` qui
// transitionne le statut côté DB via la RPC `propose_bingo_pill` (cf. 0060).
//
// Visible aussi en mode read-only (pill déjà proposée) si on veut juste
// montrer la justification écrite, mais on garde alors le bouton « Plus tard ».
export function ProposeBingoPillModal({ pillId, onClose, onProposed }: Props) {
  const pill = useBingos((s) =>
    pillId ? s.pills.find((p) => p.id === pillId) ?? null : null,
  );
  const proposePill = useBingos((s) => s.proposePill);

  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pillId) {
      setMessage(pill?.proposalMessage ?? "");
      setError(null);
      setSubmitting(false);
    }
  }, [pillId, pill?.proposalMessage]);

  const open = pillId !== null;
  const isAlreadyProposed = pill?.status === "proposed";
  const isRejected =
    pill?.status === "private" && (pill?.decisionReason ?? null) !== null;

  const onSubmit = async () => {
    if (!pill || submitting) return;
    setSubmitting(true);
    setError(null);
    const trimmed = message.trim();
    const result = await proposePill(pill.id, trimmed.length > 0 ? trimmed : null);
    setSubmitting(false);
    if (!result) {
      setError("Échec de l'envoi. Réessaie dans un moment.");
      return;
    }
    onProposed?.(pill.id);
    onClose();
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-ink/60">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{
            flex: 1,
            justifyContent: "center",
            paddingHorizontal: 24,
          }}>
          <Pressable
            className="rounded-3xl bg-paper p-6"
            onPress={(e) => e.stopPropagation()}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text className="font-display text-2xl text-ink">
                Votre défi est superbe !
              </Text>
              <Text className="mt-2 text-sm text-ink-muted">
                Proposez-le aux administrateurs, il pourra alors être rendu
                public !
              </Text>

              {pill ? (
                <View className="mt-5 rounded-2xl bg-paper-warm px-4 py-3">
                  <Text className="text-xs font-sans-med uppercase text-ink-muted">
                    Votre défi
                  </Text>
                  <Text
                    className="mt-1 text-base text-ink"
                    numberOfLines={3}>
                    {pill.label}
                  </Text>
                </View>
              ) : null}

              {isAlreadyProposed ? (
                <View className="mt-4 flex-row items-center gap-2 rounded-2xl bg-paper-warm px-4 py-3">
                  <MaterialIcons name="hourglass-empty" size={16} color="#6b6259" />
                  <Text className="text-sm text-ink-muted">
                    Déjà proposé. Tu peux modifier le message et resoumettre.
                  </Text>
                </View>
              ) : null}

              {isRejected ? (
                <View className="mt-4 rounded-2xl border border-red-500/30 bg-paper-warm px-4 py-3">
                  <Text className="text-xs font-sans-med uppercase text-red-700">
                    Refusé précédemment
                  </Text>
                  <Text className="mt-1 text-sm text-ink">
                    {pill?.decisionReason}
                  </Text>
                </View>
              ) : null}

              <View className="mt-4">
                <Text className="mb-2 text-xs font-sans-med uppercase text-ink-muted">
                  Pourquoi ce défi mérite-t-il d'être public ? (optionnel)
                </Text>
                <View className="rounded-2xl bg-paper-warm px-4 py-3">
                  <TextInput
                    value={message}
                    onChangeText={setMessage}
                    placeholder="Quelques mots pour aider l'admin à se décider…"
                    placeholderTextColor="#6b6259"
                    multiline
                    numberOfLines={4}
                    maxLength={500}
                    textAlignVertical="top"
                    className="min-h-20 text-base text-ink"
                  />
                </View>
              </View>

              {error ? (
                <Text className="mt-3 text-sm text-red-600">{error}</Text>
              ) : null}

              <View className="mt-5 flex-row justify-end gap-3">
                <Pressable
                  onPress={onClose}
                  disabled={submitting}
                  className="rounded-full px-5 py-3 active:opacity-70">
                  <Text className="text-sm font-sans-med text-ink-muted">
                    Plus tard
                  </Text>
                </Pressable>
                <Pressable
                  onPress={onSubmit}
                  disabled={!pill || submitting}
                  className="flex-row items-center gap-2 rounded-full bg-ink px-5 py-3 active:opacity-80"
                  style={{ opacity: !pill || submitting ? 0.5 : 1 }}>
                  {submitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <MaterialIcons
                      name="send"
                      size={16}
                      color="white"
                    />
                  )}
                  <Text className="text-sm font-sans-med text-white">
                    Proposer
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
