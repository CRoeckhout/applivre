import { useAuth } from "@/hooks/use-auth";
import {
  pickBugScreenshot,
  submitReport,
  type BugScreenshot,
  type ReportKind,
} from "@/lib/bug-report";
import { MaterialIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
  open: boolean;
  onClose: () => void;
};

type Copy = {
  heading: string;
  intro: string;
  titlePlaceholder: string;
  descriptionPlaceholder: string;
  success: string;
  errorFallback: string;
};

const COPY: Record<ReportKind, Copy> = {
  bug: {
    heading: "Signaler un bug",
    intro: "Décris le problème. Une tâche sera créée pour qu'on puisse regarder.",
    titlePlaceholder: "Ex. Le scan ISBN crashe",
    descriptionPlaceholder: "Étapes pour reproduire, ce qui s'est passé...",
    success: "Rapport envoyé. Merci !",
    errorFallback: "Impossible d'envoyer le rapport",
  },
  feedback: {
    heading: "Donner un avis",
    intro: "Partage ton ressenti. Ça aidera à faire évoluer l'app.",
    titlePlaceholder: "Ex. J'adore la nouvelle interface",
    descriptionPlaceholder: "Ce que tu en penses, ce qui te manque...",
    success: "Avis envoyé. Merci !",
    errorFallback: "Impossible d'envoyer l'avis",
  },
};

export function BugReportModal(props: Props) {
  return <ReportModal kind="bug" {...props} />;
}

export function FeedbackModal(props: Props) {
  return <ReportModal kind="feedback" {...props} />;
}

function ReportModal({
  kind,
  open,
  onClose,
}: Props & { kind: ReportKind }) {
  const copy = COPY[kind];
  const { session } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<BugScreenshot | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setScreenshot(null);
      setError(null);
      setSuccess(false);
      setSubmitting(false);
    }
  }, [open]);

  const canSubmit =
    !!session && title.trim().length >= 3 && !submitting && !success;

  const onPickScreenshot = async () => {
    setError(null);
    try {
      const s = await pickBugScreenshot();
      if (s) setScreenshot(s);
    } catch (e) {
      setError((e as Error).message ?? "Impossible d'ouvrir la galerie");
    }
  };

  const onSubmit = async () => {
    if (!session || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitReport({
        kind,
        userId: session.user.id,
        title: title.trim(),
        description: description.trim(),
        screenshot,
      });
      setSuccess(true);
      setTimeout(() => onClose(), 1200);
    } catch (e) {
      setError((e as Error).message ?? copy.errorFallback);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/60"
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}
        >
        <Pressable
          className="rounded-3xl bg-paper p-6"
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text className="font-display text-2xl text-ink">
              {copy.heading}
            </Text>
            <Text className="mt-2 text-sm text-ink-muted">{copy.intro}</Text>

            <View className="mt-5">
              <Text className="mb-2 text-xs font-sans-med uppercase text-ink-muted">
                Titre
              </Text>
              <View className="rounded-2xl bg-paper-warm px-4 py-3">
                <TextInput
                  value={title}
                  onChangeText={(v) => {
                    setTitle(v);
                    setError(null);
                  }}
                  placeholder={copy.titlePlaceholder}
                  placeholderTextColor="#6b6259"
                  maxLength={200}
                  className="text-base text-ink"
                />
              </View>
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-sans-med uppercase text-ink-muted">
                Description (optionnel)
              </Text>
              <View className="rounded-2xl bg-paper-warm px-4 py-3">
                <TextInput
                  value={description}
                  onChangeText={(v) => {
                    setDescription(v);
                    setError(null);
                  }}
                  placeholder={copy.descriptionPlaceholder}
                  placeholderTextColor="#6b6259"
                  multiline
                  numberOfLines={4}
                  maxLength={5000}
                  textAlignVertical="top"
                  className="min-h-24 text-base text-ink"
                />
              </View>
            </View>

            <View className="mt-4">
              <Text className="mb-2 text-xs font-sans-med uppercase text-ink-muted">
                Screenshot (optionnel)
              </Text>
              {screenshot ? (
                <View className="overflow-hidden rounded-2xl bg-paper-warm">
                  <Image
                    source={{
                      uri: `data:${screenshot.mimeType};base64,${screenshot.base64}`,
                    }}
                    style={{ width: "100%", height: 180 }}
                    resizeMode="cover"
                  />
                  <Pressable
                    onPress={() => setScreenshot(null)}
                    className="flex-row items-center justify-center gap-2 py-3 active:opacity-70"
                  >
                    <MaterialIcons name="close" size={16} color="#6b6259" />
                    <Text className="text-sm text-ink-muted">Retirer</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={onPickScreenshot}
                  className="flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-muted/40 py-4 active:opacity-70"
                >
                  <MaterialIcons name="image" size={18} color="#6b6259" />
                  <Text className="text-sm text-ink-muted">
                    Choisir une image
                  </Text>
                </Pressable>
              )}
            </View>

            <View className="mt-3 min-h-5">
              {error ? (
                <Text className="text-sm text-accent-deep">{error}</Text>
              ) : success ? (
                <Text className="text-sm text-accent-deep">{copy.success}</Text>
              ) : null}
            </View>

            <View className="mt-4 gap-2">
              <Pressable
                disabled={!canSubmit}
                onPress={onSubmit}
                className={`rounded-full py-3 ${
                  canSubmit ? "bg-accent active:opacity-80" : "bg-paper-shade"
                }`}
              >
                {submitting ? (
                  <ActivityIndicator color="#fbf8f4" />
                ) : (
                  <Text
                    className={`text-center font-sans-med ${
                      canSubmit ? "text-paper" : "text-ink-muted"
                    }`}
                  >
                    Envoyer
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={onClose}
                className="rounded-full border border-ink-muted/30 py-3 active:opacity-70"
              >
                <Text className="text-center text-ink-muted">Annuler</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
