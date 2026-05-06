// Barre de saisie d'un commentaire (root ou réponse). Extraite de
// FeedItemFrame pour être rendue en footer sticky de l'écran dédié, à
// l'intérieur d'un KeyboardAvoidingView qui pousse le tout au-dessus du
// clavier (l'input ne peut pas vivre dans la ScrollView, sinon le clavier
// le couvre quand on scroll).

import { useAuth } from "@/hooks/use-auth";
import { hexWithAlpha } from "@/lib/sheet-appearance";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { Comments, useProfile, type TargetRef } from "@grimolia/social";
import { Image } from "expo-image";
import type { RefObject } from "react";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

const AVATAR_SIZE = 28;

export type ReplyTarget = { commentId: string; username: string };

export function CommentInputRow({
  target,
  replyTo,
  onReplyToChange,
  inputRef,
}: {
  target: TargetRef;
  replyTo: ReplyTarget | null;
  onReplyToChange: (next: ReplyTarget | null) => void;
  inputRef: RefObject<TextInput | null>;
}) {
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themeAccent = usePreferences((s) => s.colorPrimary);
  const themePaper = usePreferences((s) => s.colorBg);
  const { session } = useAuth();
  const currentUserId = session?.user.id ?? null;
  const profileQuery = useProfile(currentUserId);
  const profile = profileQuery.data;

  const [text, setText] = useState("");
  const addMut = Comments.useAddComment(target, currentUserId);

  const submit = () => {
    const body = text.trim();
    if (body.length === 0 || !currentUserId) return;
    addMut.mutate(
      { body, parentId: replyTo?.commentId ?? null },
      {
        onSuccess: () => {
          setText("");
          onReplyToChange(null);
        },
      },
    );
  };

  const placeholder = replyTo
    ? `Réponse à @${replyTo.username}…`
    : "Écrire un commentaire…";

  return (
    <View
      style={{
        backgroundColor: themePaper,
        borderTopWidth: 1,
        borderTopColor: hexWithAlpha(themeInk, 0.1),
      }}
    >
      {replyTo ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 14,
            paddingTop: 8,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: hexWithAlpha(themeInk, 0.7),
            }}
          >
            Réponse à @{replyTo.username}
          </Text>
          <Pressable
            onPress={() => onReplyToChange(null)}
            hitSlop={6}
            accessibilityLabel="Annuler la réponse"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <MaterialIcons
              name="close"
              size={14}
              color={hexWithAlpha(themeInk, 0.7)}
            />
          </Pressable>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: replyTo ? 6 : 10,
          paddingBottom: 10,
        }}
      >
        <View
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: AVATAR_SIZE / 2,
            overflow: "hidden",
            backgroundColor: hexWithAlpha(themeInk, 0.1),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {profile?.avatar_url ? (
            <Image
              source={{ uri: profile.avatar_url }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
            />
          ) : (
            <MaterialIcons
              name="person"
              size={16}
              color={hexWithAlpha(themeInk, 0.6)}
            />
          )}
        </View>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={hexWithAlpha(themeInk, 0.4)}
          editable={Boolean(currentUserId) && !addMut.isPending}
          onSubmitEditing={submit}
          returnKeyType="send"
          blurOnSubmit={false}
          style={{
            flex: 1,
            fontSize: 13,
            color: themeInk,
            backgroundColor: hexWithAlpha(themeInk, 0.06),
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        />
        <Pressable
          onPress={submit}
          accessibilityLabel="Publier le commentaire"
          disabled={
            text.trim().length === 0 || addMut.isPending || !currentUserId
          }
          style={({ pressed }) => ({
            padding: 6,
            opacity:
              text.trim().length === 0 || addMut.isPending || !currentUserId
                ? 0.3
                : pressed
                  ? 0.6
                  : 1,
          })}
        >
          <MaterialIcons name="send" size={20} color={themeAccent} />
        </Pressable>
      </View>
    </View>
  );
}
