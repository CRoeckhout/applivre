// Barre horizontale de réactions sur une cible polymorphe. Les types
// disponibles viennent du registry (KindAdapter.allowedReactions) à moins
// qu'un override soit passé en prop.
//
// Layout : un bouton pill par réaction, contenant emoji + count. L'état
// actif (border + bg + couleur du count) s'applique à tout le bouton —
// y compris la zone du chiffre. Tap → toggle optimiste.
//
// La barre se rend même non authentifié : les counts s'affichent, les boutons
// sont disabled. Volontaire : la lecture de réactions reste utile même sans
// pouvoir poser la sienne.

import { useMemo } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { getKind, hasKind } from '../../kinds';
import type { TargetRef, UserId } from '../../types';
import { useReactionSummary, useToggleReaction } from '../hooks';
import { REACTION_DEFS, type ReactionType } from '../types';

export type ReactionBarProps = {
  target: TargetRef;
  currentUserId: UserId | null | undefined;
  // Override la liste autorisée (sinon lue depuis le KindAdapter du target).
  allowedReactions?: ReactionType[];
  style?: StyleProp<ViewStyle>;
};

const ACCENT = '#c27b52';
const MUTED = '#6b6259';

export function ReactionBar({
  target,
  currentUserId,
  allowedReactions,
  style,
}: ReactionBarProps) {
  const allowed = useMemo<ReactionType[]>(() => {
    if (allowedReactions && allowedReactions.length > 0) return allowedReactions;
    if (hasKind(target.kind)) {
      const adapter = getKind(target.kind);
      if (adapter.allowedReactions && adapter.allowedReactions.length > 0) {
        return adapter.allowedReactions;
      }
    }
    return ['like'];
  }, [allowedReactions, target.kind]);

  const summaryQuery = useReactionSummary(target, currentUserId);
  const toggle = useToggleReaction(target, currentUserId);

  const counts = summaryQuery.data?.counts;
  const mine = summaryQuery.data?.myReactions;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        },
        style,
      ]}
    >
      {allowed.map((type) => {
        const def = REACTION_DEFS[type];
        const count = counts?.[type] ?? 0;
        const reacted = mine?.[type] ?? false;
        const disabled = !currentUserId || toggle.isPending;
        return (
          <Pressable
            key={type}
            onPress={() => toggle.mutate({ type, next: !reacted })}
            disabled={disabled}
            accessibilityLabel={def.label}
            accessibilityState={{ selected: reacted, disabled }}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: reacted ? ACCENT : 'rgba(0,0,0,0.15)',
              backgroundColor: reacted
                ? 'rgba(194,123,82,0.22)'
                : 'transparent',
              opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            {/* Wrapper View explicite : sur RN, le flexDirection appliqué via
                la fonction style du Pressable n'est pas toujours respecté ;
                un View intermédiaire garantit le layout horizontal. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text style={{ fontSize: 18, lineHeight: 22 }}>{def.emoji}</Text>
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 22,
                  color: reacted ? ACCENT : MUTED,
                  fontWeight: reacted ? '600' : '500',
                  fontVariant: ['tabular-nums'],
                  minWidth: 12,
                  textAlign: 'center',
                }}
              >
                {count}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
