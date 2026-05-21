// Modal de signalement réutilisable, polymorphe via `target.kind` :
// 'feed_entry' | 'comment' | 'sheet' | 'bingo' | 'user'. Catégorie
// obligatoire (chips), détails optionnels.
//
// Appelle le RPC `report_content` qui applique l'anti-spam au niveau DB :
// un user ne signale pas deux fois la même cible (unique constraint sur
// social_reports). Une erreur "already reported" est affichée comme un
// message neutre — pas une erreur technique.

import { KeyboardDismissBar } from "@/components/keyboard-dismiss-bar";
import { supabase } from "@/lib/supabase";
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

export type ReportTargetKind =
  | "feed_entry"
  | "comment"
  | "sheet"
  | "bingo"
  | "user"
  | "template";

export type ReportTarget = {
  kind: ReportTargetKind;
  id: string;
};

type ReasonKey =
  | "spam"
  | "harassment"
  | "hate"
  | "sexual"
  | "illegal"
  | "self_harm"
  | "misinformation"
  | "other";

const REASONS: { key: ReasonKey; label: string }[] = [
  { key: "spam", label: "Spam" },
  { key: "harassment", label: "Harcèlement" },
  { key: "hate", label: "Haine" },
  { key: "sexual", label: "Contenu sexuel" },
  { key: "illegal", label: "Illégal" },
  { key: "self_harm", label: "Auto-mutilation" },
  { key: "misinformation", label: "Désinformation" },
  { key: "other", label: "Autre" },
];

const KIND_LABELS: Record<ReportTargetKind, string> = {
  feed_entry: "cette publication",
  comment: "ce commentaire",
  sheet: "cette fiche de lecture",
  bingo: "ce bingo",
  user: "ce profil",
  template: "ce template",
};

type Props = {
  open: boolean;
  onClose: () => void;
  target: ReportTarget | null;
};

export function ReportModal({ open, onClose, target }: Props) {
  const [reason, setReason] = useState<ReasonKey | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setReason(null);
      setDetails("");
      setError(null);
      setSubmitting(false);
      setSuccess(false);
    }
  }, [open]);

  const canSubmit = !!reason && !!target && !submitting && !success;

  const onSubmit = async () => {
    if (!canSubmit || !target) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: rpcError } = await supabase.rpc("report_content", {
        p_target_kind: target.kind,
        p_target_id: target.id,
        p_reason: reason,
        p_details: details.trim().length > 0 ? details.trim() : null,
      });
      if (rpcError) {
        // 23505 = déjà signalé → message neutre, pas une erreur rouge.
        if (rpcError.message?.includes("already reported")) {
          setError("Tu as déjà signalé ce contenu.");
        } else if (rpcError.message?.includes("cannot report your own")) {
          setError("Tu ne peux pas signaler ton propre contenu.");
        } else {
          setError(rpcError.message || "Erreur lors de l'envoi");
        }
        setSubmitting(false);
        return;
      }
      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    } catch (e) {
      setError((e as Error).message || "Erreur réseau");
      setSubmitting(false);
    }
  };

  const subjectLabel = target ? KIND_LABELS[target.kind] : "ce contenu";

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardDismissBar />
      <Pressable onPress={onClose} className="flex-1 bg-ink/60">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-3xl bg-paper p-5"
            style={{ maxHeight: "85%" }}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              <View className="flex-row items-center gap-3">
                <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-pale">
                  <MaterialIcons name="flag" size={24} color="#8e5dc8" />
                </View>
                <View className="flex-1">
                  <Text className="font-display text-xl text-ink">
                    Signaler
                  </Text>
                  <Text className="mt-0.5 text-sm text-ink-muted">
                    Pourquoi signales-tu {subjectLabel} ?
                  </Text>
                </View>
              </View>

              <View className="mt-5">
                <Text className="mb-2 text-xs font-sans-med uppercase text-ink-muted">
                  Catégorie
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {REASONS.map((r) => {
                    const selected = reason === r.key;
                    return (
                      <Pressable
                        key={r.key}
                        onPress={() => setReason(r.key)}
                        disabled={submitting || success}
                        className={`rounded-full px-3 py-2 ${
                          selected
                            ? "bg-accent"
                            : "border border-ink-muted/30 bg-paper-warm"
                        } active:opacity-70`}
                      >
                        <Text
                          className={`text-sm ${
                            selected
                              ? "font-sans-med text-paper"
                              : "text-ink-muted"
                          }`}
                        >
                          {r.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View className="mt-4">
                <Text className="mb-2 text-xs font-sans-med uppercase text-ink-muted">
                  Détails (optionnel)
                </Text>
                <TextInput
                  value={details}
                  onChangeText={setDetails}
                  placeholder="Ajoute un contexte si tu veux…"
                  placeholderTextColor="#6b6259"
                  multiline
                  maxLength={2000}
                  textAlignVertical="top"
                  editable={!submitting && !success}
                  className="min-h-24 rounded-2xl bg-paper-warm px-4 py-3 text-base text-ink"
                />
              </View>

              <View className="mt-3 min-h-5">
                {error ? (
                  <Text className="text-sm text-accent-deep">{error}</Text>
                ) : success ? (
                  <Text className="text-sm text-accent-deep">
                    Signalement envoyé. Merci !
                  </Text>
                ) : null}
              </View>

              <View className="mt-4 flex-row gap-2">
                <Pressable
                  onPress={onClose}
                  className="flex-1 rounded-full border border-ink-muted/30 py-3 active:opacity-70"
                >
                  <Text className="text-center text-ink-muted">Annuler</Text>
                </Pressable>
                <Pressable
                  onPress={onSubmit}
                  disabled={!canSubmit}
                  className={`flex-1 flex-row items-center justify-center gap-2 rounded-full py-3 ${
                    canSubmit ? "bg-accent active:opacity-80" : "bg-paper-shade"
                  }`}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fbf8f4" size="small" />
                  ) : null}
                  <Text
                    className={`text-center font-sans-med ${
                      canSubmit ? "text-paper" : "text-ink-muted"
                    }`}
                  >
                    Envoyer
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
