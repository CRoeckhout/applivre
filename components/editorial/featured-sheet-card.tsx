import {
  fetchSheetBundle,
  type SheetBundle,
} from '@/components/feed/shared-sheet-body';
import { SheetCard } from '@/components/sheet-card';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  makeFondTokenOverrides,
  resolvePublicAppearance,
} from '@/lib/sheet-appearance';
import { usePreferences } from '@/store/preferences';
import type { ReadingSheet, UserBook } from '@/types/book';
import { editorialHref, type EditorialPost } from '@/types/editorial';
import { Feed, useProfile } from '@grimolia/social';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  Text,
  View,
} from 'react-native';
import { CardProgressBar } from './card-progress-bar';

// Template custom de la carte « Fiche à la une » : la preview de la fiche
// telle qu'elle apparaît dans la liste des fiches (SheetCard headerOnly :
// cover + titre + apparence snapshot, sans les sections). Même RPC + même clé
// de cache que SharedSheetBody / l'écran /sheet/view. Le tap ouvre la fiche
// complète via editorialHref.
//
// Deux modes : feed (chip au-dessus de la preview) et bannière « À la une »
// (`height` imposé par le carrousel, trop bas pour empiler chip + preview →
// preview pleine carte + chip en pastille superposée + barre de progression).
export function FeaturedSheetCard({
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
  const themeInk = usePreferences((s) => s.colorSecondary);
  const go = () => router.push(editorialHref(post) as Href);

  // Deux provenances (cf. admin_editorial_candidates) : ref direct sur la
  // fiche (ref_kind='sheet'), ou publication de feed « shared_sheet »
  // (ref_kind='feed_entry') → on résout l'entrée pour retrouver la fiche.
  const directSheetId = post.refKind === 'sheet' ? post.refId : null;
  const entryId = post.refKind === 'feed_entry' ? post.refId : null;
  const entryQuery = useQuery({
    queryKey: ['social', 'feed', 'entry', entryId],
    queryFn: () => Feed.fetchFeedEntry(entryId!),
    enabled: Boolean(entryId),
    staleTime: 1000 * 60,
  });
  const sheetId =
    directSheetId ??
    (entryQuery.data?.target_kind === 'sheet' ? entryQuery.data.target_id : null);

  const bundleQuery = useQuery({
    queryKey: ['public-sheet', sheetId],
    queryFn: () => fetchSheetBundle(sheetId!),
    enabled: Boolean(sheetId),
    staleTime: 1000 * 60,
  });
  const bundle: SheetBundle | null = bundleQuery.data ?? null;
  const loading =
    (entryId ? entryQuery.isLoading : false) || bundleQuery.isLoading;

  // Même synthèse que SharedSheetBody : on reconstruit le minimum d'UserBook /
  // ReadingSheet que SheetCard consomme en mode headerOnly.
  const userBook = useMemo(() => {
    if (!bundle) return null;
    return {
      book: {
        isbn: bundle.book_isbn,
        title: bundle.book_title,
        coverUrl: bundle.book_cover_url ?? undefined,
        authors: bundle.book_authors ?? [],
      },
    } as unknown as UserBook;
  }, [bundle]);

  const sheet = useMemo(() => {
    if (!bundle) return null;
    return {
      userBookId: bundle.user_book_id,
      sections: bundle.content?.sections ?? [],
      stickers: bundle.content?.stickers ?? [],
      appearance: bundle.content?.appearance ?? undefined,
      updatedAt: bundle.updated_at,
    } as ReadingSheet;
  }, [bundle]);

  const appearance = useMemo(
    () => resolvePublicAppearance(bundle?.content?.appearance ?? null),
    [bundle?.content?.appearance],
  );

  // La card éditoriale est en paperWarm : on remappe les tokens de fond du
  // cadre SVG dessus, sinon la matière autour du tracé reste en theme.paper
  // et fait un liseré visible (cf. makeFondTokenOverrides).
  const theme = useThemeColors();
  const tokenOverrides = useMemo(
    () => makeFondTokenOverrides(theme.paperWarm),
    [theme.paperWarm],
  );

  // Auteur de la fiche mis en avant (avatar + username), comme sur la carte
  // « Avis à la une ». Cache RQ partagé avec le feed → souvent instantané.
  const ownerProfile = useProfile(bundle?.owner_id);
  const owner = ownerProfile.data ?? null;
  const ownerName = owner?.username
    ? `@${owner.username}`
    : owner?.display_name || null;

  // ─── Mode bannière (carrousel « À la une ») ───
  if (height != null) {
    return (
      <Pressable
        onPress={go}
        onLongPress={onLongPress}
        style={{ width: '100%', height }}
        className="overflow-hidden rounded-2xl border border-accent/30 bg-paper-warm active:opacity-80"
      >
        {/* Pas de padding vertical : la fiche (~96) est centrée dans la
            hauteur de bannière, le slack vertical fait office de marge. */}
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 14 }}>
          {loading ? (
            <View style={{ alignItems: 'center' }}>
              <ActivityIndicator color={themeInk} />
            </View>
          ) : bundle && userBook && sheet ? (
            <SheetCard
              userBook={userBook}
              sheet={sheet}
              appearance={appearance}
              isCustom={false}
              headerOnly
              readOnly
              tokenOverrides={tokenOverrides}
            />
          ) : null}
        </View>
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 8, right: 8 }}
          className="flex-row items-center gap-1.5 rounded-full bg-ink/60 px-2.5 py-1"
        >
          <View style={{ width: 5, height: 5, borderRadius: 3 }} className="bg-white" />
          <Text className="font-sans-semi text-[10px] uppercase tracking-wide text-white">
            Fiche à la une
          </Text>
        </View>
        {/* Auteur de la fiche, en pastille miroir du chip. */}
        {ownerName ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 8, left: 8 }}
            className="flex-row items-center gap-1.5 rounded-full bg-ink/60 px-2.5 py-1"
          >
            {owner?.avatar_url ? (
              <Image
                source={{ uri: owner.avatar_url }}
                style={{ width: 14, height: 14, borderRadius: 7 }}
                transition={150}
              />
            ) : null}
            <Text className="font-sans-semi text-[10px] text-white" numberOfLines={1}>
              {ownerName}
            </Text>
          </View>
        ) : null}
        {progress ? <CardProgressBar progress={progress} overlay={false} /> : null}
      </Pressable>
    );
  }

  // ─── Mode feed : chip au-dessus de la preview ───
  return (
    <Pressable
      onPress={go}
      className="gap-2.5 overflow-hidden rounded-2xl border border-accent/30 bg-paper-warm p-3.5 active:opacity-80"
    >
      <View className="flex-row items-center gap-1.5">
        <View style={{ width: 5, height: 5, borderRadius: 3 }} className="bg-accent" />
        <Text className="font-sans-semi text-[11px] uppercase tracking-wide text-accent">
          Fiche à la une
        </Text>
      </View>

      {/* Auteur de la fiche (avatar + username), comme sur la carte avis. */}
      {ownerName ? (
        <View className="flex-row items-center gap-2">
          {owner?.avatar_url ? (
            <Image
              source={{ uri: owner.avatar_url }}
              style={{ width: 18, height: 18, borderRadius: 9 }}
              transition={150}
            />
          ) : null}
          <Text className="flex-shrink text-xs text-ink-muted" numberOfLines={1}>
            {ownerName}
          </Text>
        </View>
      ) : null}

      {loading ? (
        <View style={{ paddingVertical: 20, alignItems: 'center' }}>
          <ActivityIndicator color={themeInk} />
        </View>
      ) : bundle && userBook && sheet ? (
        // Léger retrait : la preview respire dans la card au lieu de coller
        // au bord du padding de base.
        <View style={{ paddingHorizontal: 4, paddingBottom: 2 }}>
          <SheetCard
            userBook={userBook}
            sheet={sheet}
            appearance={appearance}
            isCustom={false}
            headerOnly
            readOnly
            tokenOverrides={tokenOverrides}
          />
        </View>
      ) : null}
    </Pressable>
  );
}
