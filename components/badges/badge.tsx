import { BADGES } from '@/lib/badges/catalog';
import type { BadgeKey } from '@/types/badge';
import { useState } from 'react';
import { Pressable } from 'react-native';
import { BadgeIcon } from './badge-icon';
import { BadgeTooltip } from './badge-tooltip';

type Props = {
  badgeKey: BadgeKey;
  earnedAt?: string;
  size?: number;
};

export function Badge({ badgeKey, earnedAt, size = 32 }: Props) {
  const def = BADGES[badgeKey];
  const [open, setOpen] = useState(false);

  if (!def) return null;

  const count = def.showCount ? def.tier : undefined;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel={def.title}
        hitSlop={6}>
        <BadgeIcon primaryColor={def.primaryColor} count={count} size={size} />
      </Pressable>
      <BadgeTooltip
        visible={open}
        onClose={() => setOpen(false)}
        title={def.title}
        description={def.description}
        primaryColor={def.primaryColor}
        count={count}
        earnedAt={earnedAt}
      />
    </>
  );
}
