import type { GraphicKind } from '@/types/badge';
import { Modal, Pressable, Text } from 'react-native';
import { BadgeGraphic } from './badge-graphic';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  description: string;
  graphicKind: GraphicKind;
  graphicPayload: string;
  graphicTokens: Record<string, string>;
  earnedAt?: string;
};

export function BadgeTooltip({
  visible,
  onClose,
  title,
  description,
  graphicKind,
  graphicPayload,
  graphicTokens,
  earnedAt,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-ink/40 px-8">
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="w-full max-w-xs items-center gap-3 rounded-3xl bg-paper p-5">
          <BadgeGraphic
            kind={graphicKind}
            payload={graphicPayload}
            tokens={graphicTokens}
            size={96}
          />
          <Text className="font-display text-lg text-ink" numberOfLines={2}>
            {title}
          </Text>
          <Text className="text-center text-sm text-ink-muted">{description}</Text>
          {earnedAt ? (
            <Text className="text-xs text-ink-muted">Obtenu le {formatDate(earnedAt)}</Text>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}
