import { signOut, useAuth } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  internalCheckUsernameAvailable,
  internalUpsertUsername,
} from "@/lib/sync/internals";
import { useProfile, validateUsernameLocal } from "@/store/profile";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

export default function CompleteProfileScreen() {
  const { session } = useAuth();
  const setUsername = useProfile((s) => s.setUsername);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const localError = value.length > 0 ? validateUsernameLocal(value) : null;
  const debounced = useDebouncedValue(value, 350);

  const { data: available, isFetching } = useQuery({
    queryKey: ["username-available", debounced],
    queryFn: () => internalCheckUsernameAvailable(debounced),
    enabled: !!debounced && !validateUsernameLocal(debounced),
    staleTime: 30_000,
  });

  const remoteError =
    available === false ? "Ce nom d\u2019utilisateur est déjà pris" : null;
  const error = localError ?? remoteError ?? saveError;
  const canSave =
    !!session && !!value.trim() && !localError && available === true && !saving;

  const onSave = async () => {
    if (!session || !canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      const trimmed = value.trim();
      await internalUpsertUsername(session.user.id, trimmed);
      setUsername(trimmed);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (msg.includes("duplicate") || msg.includes("23505")) {
        setSaveError("Ce nom d\u2019utilisateur vient d\u2019être pris");
      } else {
        setSaveError(msg || "Impossible d\u2019enregistrer, réessaye.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-paper">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View className="flex-1 justify-center px-8">
          <Animated.View entering={FadeInDown.duration(500)}>
            <Text className="font-display text-3xl text-ink">
              Choisis ton nom d&apos;utilisateur
            </Text>
            <Text className="mt-2 text-base text-ink-muted">
              Il apparaîtra sur ton profil. Tu pourras le modifier plus tard.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeIn.duration(400).delay(120)}
            className="mt-8"
          >
            <Text className="mb-2 text-xs uppercase tracking-wider text-ink-muted">
              Nom d&apos;utilisateur
            </Text>
            <View className="flex-row items-center gap-3 rounded-2xl bg-paper-warm px-5 py-3">
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
                className="flex-1 text-base text-ink"
              />
              {isFetching && <ActivityIndicator size="small" color="#c27b52" />}
              {!isFetching &&
                !error &&
                value.length >= 3 &&
                available === true && (
                  <Text className="text-sm text-accent-deep">✓</Text>
                )}
            </View>
            <View className="mt-3 min-h-5">
              {error ? (
                <Text className="text-sm text-accent-deep">{error}</Text>
              ) : null}
            </View>
          </Animated.View>

          <Pressable
            disabled={!canSave}
            onPress={onSave}
            className={`mt-6 rounded-full py-3 ${
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
                Continuer
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => signOut()}
            className="mt-6 py-2 active:opacity-70"
          >
            <Text className="text-center text-sm text-ink-muted">
              Me déconnecter
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
