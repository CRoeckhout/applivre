import { PremiumPaywallModal } from '@/components/premium-paywall-modal';
import { ReportMenuButton } from '@/components/report/report-menu-button';
import { TemplateCard } from '@/components/template-card';
import { UserCard } from '@/components/user-card';
import { useAuth } from '@/hooks/use-auth';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { useReadingSheetTemplates } from '@/store/reading-sheet-templates';
import { usePremium } from '@/store/premium';
import type { PublicReadingSheetTemplate } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

// Viewer read-only d'un template public (ou du tien si tu y arrives par hasard).
// Affiche un preview pleine taille + creator card + actions :
//   - Like / Unlike (instantané, optimistic)
//   - "Sauvegarder dans mes templates" → RPC clone, redirige vers l'éditeur
//   - "Utiliser sur un livre" → flow de sélection (route futur ; pour V1, on
//     redirige vers /sheet/new avec un paramètre query template_id)
export default function TemplateViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useThemeColors();
  const { session } = useAuth();
  const userId = session?.user.id;

  const getPublic = useReadingSheetTemplates((s) => s.getPublic);
  const toggleLike = useReadingSheetTemplates((s) => s.toggleLike);
  const cloneTemplate = useReadingSheetTemplates((s) => s.cloneTemplate);
  const isPremium = usePremium((s) => s.isPremium);

  const [template, setTemplate] = useState<PublicReadingSheetTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [cloning, setCloning] = useState(false);
  const [paywall, setPaywall] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    getPublic(id).then((t) => {
      if (cancelled) return;
      setTemplate(t);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id, getPublic]);

  const handleLike = async () => {
    if (!template) return;
    const next = await toggleLike(template.id, template.isLiked);
    setTemplate({
      ...template,
      isLiked: next,
      likesCount: next ? template.likesCount + 1 : Math.max(0, template.likesCount - 1),
    });
  };

  const handleClone = async () => {
    if (!template) return;
    if (template.isPremium && !isPremium) {
      setPaywall(true);
      return;
    }
    setCloning(true);
    const cloned = await cloneTemplate(template.id);
    setCloning(false);
    if (!cloned) {
      Alert.alert('Erreur', 'Impossible de sauvegarder ce template. Réessaie.');
      return;
    }
    router.replace(`/template/${cloned.id}` as never);
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper">
        <ActivityIndicator color="#c27b52" />
      </SafeAreaView>
    );
  }
  if (!template) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper px-8">
        <Text className="font-display text-2xl text-ink">Template introuvable</Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-8 rounded-full bg-accent px-6 py-3 active:opacity-80">
          <Text className="font-sans-med text-paper">Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const locked = template.isPremium && !isPremium;
  const isOwner = userId === template.userId;

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-60">
          <MaterialIcons name="arrow-back" size={22} color={theme.ink} />
        </Pressable>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={handleLike}
            hitSlop={8}
            className="flex-row items-center gap-1 rounded-full bg-paper-warm px-3 py-1.5 active:bg-paper-shade">
            <MaterialIcons
              name={template.isLiked ? 'favorite' : 'favorite-border'}
              size={16}
              color={template.isLiked ? '#d4493e' : theme.ink}
            />
            <Text className="font-sans-med text-sm text-ink">{template.likesCount}</Text>
          </Pressable>
          {/* Signaler : visible uniquement sur un template qui n'est pas le
              nôtre (hidden=isOwner masque totalement — on ne signale pas
              son propre contenu, le serveur le rejetterait aussi). */}
          <ReportMenuButton
            target={{ kind: 'template', id: template.id }}
            size={20}
            color={theme.ink}
            hidden={isOwner}
          />
        </View>
      </View>

      <ScrollView contentContainerClassName="px-4 pb-32">
        <Animated.View entering={FadeIn.duration(300)} className="mt-2 items-center">
          <View style={{ width: 380, maxWidth: '100%' }}>
            <TemplateCard template={template} premiumBadge={template.isPremium} />
          </View>
        </Animated.View>

        <View className="mt-5">
          <UserCard userId={template.userId} variant="compact" size="md" />
        </View>

        {template.genres.length > 0 ? (
          <View className="mt-3 flex-row flex-wrap gap-2">
            {template.genres.map((g) => (
              <View key={g} className="rounded-full bg-paper-warm px-3 py-1">
                <Text className="text-xs text-ink-muted">{g}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {locked ? (
          <View className="mt-5 flex-row items-center gap-2 rounded-2xl bg-accent-pale/40 p-4">
            <MaterialIcons name="star" size={18} color="#f59e0b" />
            <Text className="flex-1 text-sm text-ink">
              Template Premium — passe Premium pour l’utiliser ou le sauvegarder.
            </Text>
          </View>
        ) : null}

        <View className="mt-5 gap-3">
          {!isOwner ? (
            <Pressable
              onPress={handleClone}
              disabled={cloning}
              className="flex-row items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 active:opacity-80"
              style={{ opacity: cloning ? 0.6 : 1 }}>
              <MaterialIcons name="bookmark-add" size={18} color="#fbf8f4" />
              <Text className="font-sans-med text-paper">
                {cloning ? 'Copie en cours…' : 'Sauvegarder dans mes templates'}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => router.replace(`/template/${template.id}` as never)}
              className="flex-row items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 active:opacity-80">
              <MaterialIcons name="edit" size={18} color="#fbf8f4" />
              <Text className="font-sans-med text-paper">Modifier mon template</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      <PremiumPaywallModal
        open={paywall}
        reason="template_premium"
        onClose={() => setPaywall(false)}
      />
    </SafeAreaView>
  );
}
