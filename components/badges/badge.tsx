import { useBadgeCatalog } from '@/store/badge-catalog';
import type { BadgeKey } from '@/types/badge';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { BadgeGraphic } from './badge-graphic';
import { BadgeTooltip } from './badge-tooltip';

type Props = {
  badgeKey: BadgeKey;
  earnedAt?: string;
  size?: number;
};

export function Badge({ badgeKey, earnedAt, size = 32 }: Props) {
  const entry = useBadgeCatalog((s) => s.entries[badgeKey]);
  const [open, setOpen] = useState(false);

  if (!entry) return null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel={entry.title}
        hitSlop={6}>
        <BadgeGraphic
          kind={entry.graphicKind}
          payload={entry.graphicPayload}
          tokens={entry.graphicTokens}
          size={size}
        />
      </Pressable>
      <BadgeTooltip
        visible={open}
        onClose={() => setOpen(false)}
        title={entry.title}
        description={entry.description}
        graphicKind={entry.graphicKind}
        graphicPayload={entry.graphicPayload}
        graphicTokens={entry.graphicTokens}
        earnedAt={earnedAt}
      />
    </>
  );
}
