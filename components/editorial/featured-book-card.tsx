import { BookCover } from '@/components/book-cover';
import { RichText } from '@/components/rich-text';
import { editorialHref, type EditorialPost } from '@/types/editorial';
import { useRouter, type Href } from 'expo-router';
import { Animated, Pressable, Text, View } from 'react-native';
import { CardProgressBar } from './card-progress-bar';

// Template custom de la carte « Livre du mois » : texte (chip + titre +
// auteurs + CTA) à gauche, couverture du livre à droite — plutôt que l'image
// en pleine largeur du layout générique. Le tap ouvre la fiche livre via
// editorialHref. En bannière, le carrousel impose `height` et passe la barre
// de progression.
export function FeaturedBookCard({
  post,
  height,
  progress,
  onLongPress,
}: {
  post: EditorialPost;
  height?: number;
  progress?: Animated.Value;
  // Bannière : avale l'appui long (maintien = pause du carrousel).
  onLongPress?: () => void;
}) {
  const router = useRouter();
  const go = () => router.push(editorialHref(post) as Href);
  const banner = height != null;

  return (
    <Pressable
      onPress={go}
      onLongPress={onLongPress}
      style={banner ? { width: '100%', height } : undefined}
      className="overflow-hidden rounded-2xl border border-accent/30 bg-paper-warm p-3.5 active:opacity-80"
    >
      <View className="flex-1 flex-row items-center gap-3">
        <View className="flex-1 justify-center gap-1.5">
          <View className="flex-row items-center gap-1.5">
            <View style={{ width: 5, height: 5, borderRadius: 3 }} className="bg-accent" />
            <Text className="font-sans-semi text-[11px] uppercase tracking-wide text-accent">
              Livre du mois
            </Text>
          </View>

          <RichText font="display" className="font-display text-base text-ink" numberOfLines={2}>
            {post.title}
          </RichText>

          {post.subtitle ? (
            <RichText className="text-sm text-ink-muted" numberOfLines={1} style={{ lineHeight: 19 }}>
              {post.subtitle}
            </RichText>
          ) : null}

          {post.cta ? (
            <Text className="mt-1 font-sans-med text-sm text-accent-deep">
              {post.cta.label} →
            </Text>
          ) : null}
        </View>

        <BookCover
          isbn={post.refId!}
          coverUrl={post.coverUrl ?? undefined}
          style={{ width: 60, height: 90, borderRadius: 6 }}
        />
      </View>
      {progress ? <CardProgressBar progress={progress} overlay={false} /> : null}
    </Pressable>
  );
}
