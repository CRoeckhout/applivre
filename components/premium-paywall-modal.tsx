import type { CatalogLockReason } from '@/lib/borders/catalog';
import { MaterialIcons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

type Props = {
  open: boolean;
  onClose: () => void;
  // Source du déclencheur — informe le titre/le message principal pour
  // éviter une UX générique. `feature_limit` = blocage de création (fiches /
  // bingos atteignant la limite freemium) ; les `CatalogLockReason` couvrent
  // les items du catalog (cadre/fond/sticker/avatar verrouillé).
  reason: CatalogLockReason | 'feature_limit';
  // Pour `feature_limit`, précise quelle limite a déclenché la modale (UX :
  // affiche une formulation adaptée au contexte). Ignoré pour les autres
  // reasons.
  feature?: 'sheets' | 'bingos';
};

// Modale paywall partagée. Phase 2 : CTA disabled avec "Bientôt disponible".
// Le wiring effectif vers RevenueCat / store de paiement vient en phase 3.
// Le contenu textuel est délibérément un placeholder ; à finaliser avec la
// copie marketing avant release.
export function PremiumPaywallModal({ open, onClose, reason, feature }: Props) {
  const title = pickTitle(reason, feature);
  const lead = pickLead(reason, feature);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/60 px-6"
        style={{ justifyContent: 'center' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-3xl bg-paper p-5"
          style={{ maxHeight: '85%' }}>
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-pale">
              <MaterialIcons name="star" size={26} color="#f59e0b" />
            </View>
            <View className="flex-1">
              <Text className="font-display text-lg text-ink">{title}</Text>
              <Text className="text-xs text-ink-muted">{lead}</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
              <MaterialIcons name="close" size={18} color="rgb(58 50 43)" />
            </Pressable>
          </View>

          <ScrollView
            style={{ marginTop: 16 }}
            showsVerticalScrollIndicator={false}>
            <Text className="font-sans-med text-sm text-ink">
              Ce que tu débloques avec Premium
            </Text>
            <View className="mt-3 gap-2">
              <Bullet text="Fiches de lecture en illimité" />
              <Bullet text="Plusieurs bingos en cours simultanément" />
              <Bullet text="Cadres, fonds, stickers et cadres photo exclusifs" />
              <Bullet text="Soutiens le développement de l'app 💛" />
            </View>

            <Text
              className="mt-4 text-xs text-ink-muted"
              style={{ lineHeight: 16 }}>
              Abonnement mensuel — résiliable à tout moment depuis ton compte
              App Store / Google Play.
            </Text>
          </ScrollView>

          <View className="mt-5 gap-2">
            <View
              className="rounded-2xl bg-ink/10 px-4 py-3"
              style={{ alignItems: 'center' }}>
              <Text className="font-sans-med text-base text-ink-muted">
                S&apos;abonner — 2 € / mois
              </Text>
              <Text className="text-xs text-ink-muted" style={{ marginTop: 2 }}>
                Bientôt disponible
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              className="rounded-2xl bg-paper-warm active:bg-paper-shade px-4 py-3"
              style={{ alignItems: 'center' }}>
              <Text className="font-sans-med text-sm text-ink">Plus tard</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View className="flex-row items-start gap-2">
      <View
        style={{
          marginTop: 6,
          width: 6,
          height: 6,
          borderRadius: 3,
          backgroundColor: '#f59e0b',
        }}
      />
      <Text className="flex-1 text-sm text-ink" style={{ lineHeight: 20 }}>
        {text}
      </Text>
    </View>
  );
}

function pickTitle(reason: Props['reason'], feature: Props['feature']): string {
  if (reason === 'feature_limit') {
    if (feature === 'sheets') return 'Limite de fiches atteinte';
    if (feature === 'bingos') return 'Limite de bingos atteinte';
    return 'Limite atteinte';
  }
  return 'Devenez Premium';
}

function pickLead(reason: Props['reason'], feature: Props['feature']): string {
  if (reason === 'feature_limit') {
    if (feature === 'sheets') {
      return 'Passe Premium pour créer des fiches en illimité.';
    }
    if (feature === 'bingos') {
      return 'Passe Premium pour gérer plusieurs bingos en parallèle.';
    }
    return 'Passe Premium pour débloquer cette fonctionnalité.';
  }
  return 'Débloque cet élément et tout le contenu Premium.';
}
