// Modale "Envoyer à un contact". Liste les mutuals (intersection des follows)
// du user courant. Sélection → ensure_thread + envoi d'un message portant
// une référence à la feed entry, format `[grimolia:feed:<entryId>]`.
// Le rendu côté chat décode ce marqueur et rend une preview tappable.

import { AvatarFrame } from "@/components/avatar-frame";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { hexWithAlpha } from "@/lib/sheet-appearance";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { Messaging, useProfiles } from "@grimolia/social";
import { Image } from "expo-image";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
  entryId: string | null;
  currentUserId: string | null;
  onClose: () => void;
};

export function buildFeedShareBody(entryId: string): string {
  return `[grimolia:feed:${entryId}]`;
}

export function parseFeedShareBody(body: string): string | null {
  const m = body.match(/^\[grimolia:feed:([0-9a-f-]+)\]/i);
  return m?.[1] ?? null;
}

export function SendToContactModal({
  open,
  entryId,
  currentUserId,
  onClose,
}: Props) {
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themeAccent = usePreferences((s) => s.colorPrimary);

  const mutualsQuery = Messaging.useMyMutuals(currentUserId);
  const profilesQuery = useProfiles(mutualsQuery.data ?? []);
  // Threads = source de vérité pour le tri par "dernier contact". On
  // mappe other.id → last_message_at pour pouvoir ordonner les mutuals.
  const threadsQuery = Messaging.useThreads(currentUserId);
  const ensureThread = Messaging.useEnsureThread();

  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Reset le champ recherche à chaque ouverture pour ne pas garder un état
  // surprenant entre 2 partages.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const profiles = useMemo(() => {
    const ids = mutualsQuery.data ?? [];
    const map = profilesQuery.data ?? {};
    const lastSeen = new Map<string, string>();
    for (const t of threadsQuery.data ?? []) {
      if (t.last_message_at) lastSeen.set(t.other.id, t.last_message_at);
    }
    const enriched = ids.map((id) => ({
      id,
      profile: map[id] ?? null,
      lastContactAt: lastSeen.get(id) ?? null,
    }));
    // Tri : threads récents d'abord (desc), puis le reste alphabétique
    // par display_name/username pour rester déterministe.
    enriched.sort((a, b) => {
      if (a.lastContactAt && b.lastContactAt) {
        return b.lastContactAt.localeCompare(a.lastContactAt);
      }
      if (a.lastContactAt) return -1;
      if (b.lastContactAt) return 1;
      const an = a.profile?.display_name || a.profile?.username || "";
      const bn = b.profile?.display_name || b.profile?.username || "";
      return an.localeCompare(bn, "fr", { sensitivity: "base" });
    });
    return enriched;
  }, [mutualsQuery.data, profilesQuery.data, threadsQuery.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return profiles;
    return profiles.filter((p) => {
      const display = (p.profile?.display_name ?? "").toLowerCase();
      const username = (p.profile?.username ?? "").toLowerCase();
      return display.includes(q) || username.includes(q);
    });
  }, [profiles, query]);

  const handlePick = async (otherId: string) => {
    if (!entryId || !currentUserId || pendingId) return;
    setPendingId(otherId);
    try {
      const threadId = await ensureThread.mutateAsync(otherId);
      await Messaging.sendMessage({
        threadId,
        senderId: currentUserId,
        body: buildFeedShareBody(entryId),
      });
      setSentTo(otherId);
      // Bref délai pour que le user voie le check, puis on ferme.
      setTimeout(() => {
        setSentTo(null);
        onClose();
      }, 700);
    } catch {
      // Échec silencieux v1.
    } finally {
      setPendingId(null);
    }
  };

  const isLoading = mutualsQuery.isLoading || profilesQuery.isLoading;
  const isEmpty = !isLoading && profiles.length === 0;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      {/* Backdrop plein écran : doit rester collé aux 4 bords pour que la
          teinte sombre ne laisse pas apparaître le fond derrière le clavier. */}
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/60"
      >
        {/* KeyboardAvoidingView À L'INTÉRIEUR du backdrop, uniquement pour
            replacer le contenu — l'overlay lui ne bouge pas. */}
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "center", paddingHorizontal: 24 }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-3xl bg-paper p-5"
            style={{ maxHeight: "85%" }}
          >
          <View className="flex-row items-center gap-3">
            <View
              className="h-12 w-12 items-center justify-center rounded-full"
              style={{ backgroundColor: hexWithAlpha(themeAccent, 0.15) }}
            >
              <MaterialIcons name="send" size={22} color={themeAccent} />
            </View>
            <View className="flex-1">
              <Text className="font-display text-xl text-ink">Envoyer à</Text>
              <Text className="mt-0.5 text-sm text-ink-muted">
                Partage cette publication avec un contact
              </Text>
            </View>
          </View>

          {isLoading || isEmpty ? null : (
            <View
              style={{
                marginTop: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: hexWithAlpha(themeInk, 0.06),
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 8,
              }}
            >
              <MaterialIcons
                name="search"
                size={18}
                color={hexWithAlpha(themeInk, 0.55)}
              />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Rechercher un contact"
                placeholderTextColor={hexWithAlpha(themeInk, 0.45)}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                // minWidth: 0 + flexShrink: 1 — sans ça, le TextInput refuse
                // de descendre sous sa largeur intrinsèque (= largeur du texte
                // du placeholder), ce qui peut tronquer côté iOS quand le
                // parent flex est juste assez large.
                style={{
                  flex: 1,
                  flexShrink: 1,
                  minWidth: 0,
                  fontSize: 14,
                  color: themeInk,
                  paddingVertical: 0,
                  // Important sur iOS où le placeholder peut être tronqué par
                  // le sizing automatique d'UITextField. Hauteur explicite
                  // pour stabiliser le rendu.
                  height: 20,
                }}
              />
              {query.length > 0 ? (
                <Pressable
                  onPress={() => setQuery("")}
                  hitSlop={6}
                  accessibilityLabel="Effacer la recherche"
                >
                  <MaterialIcons
                    name="close"
                    size={16}
                    color={hexWithAlpha(themeInk, 0.55)}
                  />
                </Pressable>
              ) : null}
            </View>
          )}

          <View className="mt-3" style={{ minHeight: 120 }}>
            {isLoading ? (
              <View className="items-center py-8">
                <ActivityIndicator color={themeInk} />
              </View>
            ) : isEmpty ? (
              <View className="items-center py-6 px-2">
                <MaterialIcons
                  name="people-outline"
                  size={32}
                  color={hexWithAlpha(themeInk, 0.45)}
                />
                <Text className="mt-2 text-center text-sm text-ink-muted">
                  Aucun contact mutuel pour l'instant.{"\n"}
                  Tu pourras envoyer une publication aux lecteurs qui te
                  suivent et que tu suis en retour.
                </Text>
              </View>
            ) : filtered.length === 0 ? (
              <View className="items-center py-6 px-2">
                <Text className="text-center text-sm text-ink-muted">
                  Aucun contact ne correspond à « {query} ».
                </Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(p) => p.id}
                style={{ maxHeight: 400 }}
                ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <ContactRow
                    profile={item.profile}
                    sending={pendingId === item.id}
                    sent={sentTo === item.id}
                    onPress={() => handlePick(item.id)}
                  />
                )}
              />
            )}
          </View>

          <Pressable
            onPress={onClose}
            className="mt-4 rounded-full border border-ink-muted/30 py-3 active:opacity-70"
          >
            <Text className="text-center text-ink-muted">Fermer</Text>
          </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function ContactRow({
  profile,
  sending,
  sent,
  onPress,
}: {
  profile: import("@grimolia/social").SocialProfile | null;
  sending: boolean;
  sent: boolean;
  onPress: () => void;
}) {
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themeAccent = usePreferences((s) => s.colorPrimary);
  const paperShade = useThemeColors().paperShade;

  const displayName =
    profile?.display_name || profile?.username || "Anonyme";
  const handle = profile?.username ? `@${profile.username}` : null;
  const initials =
    displayName
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";

  // Style statique (pas de fonction) — même contrainte que ThreadRow :
  // le style en fonction `({pressed}) => ({...})` n'est pas appliqué dans
  // ce runtime.
  return (
    <Pressable
      onPress={onPress}
      disabled={sending || sent}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: hexWithAlpha(themeInk, 0.12),
        backgroundColor: paperShade,
        opacity: sending ? 0.6 : 1,
      }}
    >
      <AvatarFrame
        size={40}
        frameId={
          ((profile?.appearance as Record<string, unknown> | null | undefined)?.[
            "avatarFrameId"
          ] as string | undefined) ?? "none"
        }
      >
        {profile?.avatar_url ? (
          <Image
            source={{ uri: profile.avatar_url }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        ) : (
          <View
            style={{
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: hexWithAlpha(themeInk, 0.1),
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: hexWithAlpha(themeInk, 0.7),
              }}
            >
              {initials}
            </Text>
          </View>
        )}
      </AvatarFrame>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 15, fontWeight: "600", color: themeInk }}
        >
          {displayName}
        </Text>
        {handle ? (
          <Text
            numberOfLines={1}
            style={{ fontSize: 12, color: hexWithAlpha(themeInk, 0.55) }}
          >
            {handle}
          </Text>
        ) : null}
      </View>
      {sent ? (
        <MaterialIcons name="check-circle" size={22} color={themeAccent} />
      ) : sending ? (
        <ActivityIndicator color={themeAccent} />
      ) : (
        <MaterialIcons
          name="send"
          size={18}
          color={hexWithAlpha(themeInk, 0.45)}
        />
      )}
    </Pressable>
  );
}

