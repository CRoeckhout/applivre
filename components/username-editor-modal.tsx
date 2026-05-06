import { useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  internalCheckUsernameAvailable,
  internalUpsertUsername,
} from "@/lib/sync/internals";
import { useProfile, validateUsernameLocal } from "@/store/profile";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function UsernameEditorModal({ open, onClose }: Props) {
  const { session } = useAuth();
  const current = useProfile((s) => s.username);
  const setUsername = useProfile((s) => s.setUsername);

  const [value, setValue] = useState(current ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset du champ quand on rouvre le modal
  useEffect(() => {
    if (open) {
      setValue(current ?? "");
      setSaveError(null);
    }
  }, [open, current]);

  const localError = value.length > 0 ? validateUsernameLocal(value) : null;
  const debounced = useDebouncedValue(value, 350);
  const unchanged = debounced === (current ?? "");

  const { data: available, isFetching } = useQuery({
    queryKey: ["username-available", debounced],
    queryFn: () => internalCheckUsernameAvailable(debounced),
    enabled: !!debounced && !validateUsernameLocal(debounced) && !unchanged,
    staleTime: 30_000,
  });

  const remoteError =
    !unchanged && available === false
      ? "Ce nom d\u2019utilisateur est déjà pris"
      : null;
  const error = localError ?? remoteError ?? saveError;
  const canSave =
    !!session &&
    !!value.trim() &&
    !localError &&
    !unchanged &&
    available === true &&
    !saving;

  const onSave = async () => {
    if (!session || !canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const trimmed = value.trim();
      await internalUpsertUsername(session.user.id, trimmed);
      setUsername(trimmed);
      onClose();
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("duplicate") || msg.includes("23505")) {
        setSaveError("Ce nom d\u2019utilisateur vient d\u2019être pris");
      } else {
        setSaveError(msg || "Impossible d\u2019enregistrer");
      }
    } finally {
      setSaving(false);
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
          <Text className="font-display text-2xl text-ink">
            Modifier le nom d&apos;utilisateur
          </Text>
          <Text className="mt-2 text-sm text-ink-muted">
            Il apparaîtra sur ton profil. Visible par les autres.
          </Text>

          <View className="mt-5 flex-row items-center gap-3 rounded-2xl bg-paper-warm px-5 py-3">
            <Text className="text-ink-muted">@</Text>
            <TextInput
              value={value}
              onChangeText={(v) => {
                setValue(v.replace(/\s/g, ""));
                setSaveError(null);
              }}
              placeholder="toi"
              placeholderTextColor="#6b6259"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              className="flex-1 text-base text-ink"
            />
            {isFetching && !unchanged && (
              <ActivityIndicator size="small" color="#c27b52" />
            )}
            {!isFetching &&
              !error &&
              value.length >= 3 &&
              !unchanged &&
              available === true && (
                <Text className="text-sm text-accent-deep">✓</Text>
              )}
          </View>

          <View className="mt-3 min-h-5">
            {error ? (
              <Text className="text-sm text-accent-deep">{error}</Text>
            ) : unchanged ? (
              <Text className="text-xs text-ink-muted">
                Identique au nom actuel.
              </Text>
            ) : null}
          </View>

          <View className="mt-6 gap-2">
            <Pressable
              disabled={!canSave}
              onPress={onSave}
              className={`rounded-full py-3 ${
                canSave ? "bg-accent active:opacity-80" : "bg-paper-shade"
              }`}
            >
              {saving ? (
                <ActivityIndicator color="#fbf8f4" />
              ) : (
                <Text
                  className={`text-center font-sans-med ${
                    canSave ? "text-paper" : "text-ink-muted"
                  }`}
                >
                  Enregistrer
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
        </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
