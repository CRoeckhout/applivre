// Menu "..." attaché à un contenu signalable. Affiche une icône more-vert ;
// au tap, ouvre un bottom-sheet listant les actions disponibles. V1 : une
// seule action "Signaler". L'archi laisse la place pour étendre (Masquer,
// Bloquer l'auteur, etc.).
//
// Self-contained : embarque ReportModal. Le parent passe juste le target.

import { ReportModal, type ReportTarget } from "@/components/report/report-modal";
import { hexWithAlpha } from "@/lib/sheet-appearance";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

type Props = {
  target: ReportTarget | null;
  // Taille de l'icône. Défaut 18px.
  size?: number;
  // Hide totalement le bouton (ex: pour son propre contenu — on ne signale
  // pas soi-même). Le serveur rejette aussi, mais autant ne pas afficher.
  hidden?: boolean;
  // Override la couleur de l'icône. Défaut : ink-muted.
  color?: string;
};

export function ReportMenuButton({ target, size = 18, hidden, color }: Props) {
  const themeInk = usePreferences((s) => s.colorSecondary);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  if (hidden) return null;

  const onPickReport = () => {
    setMenuOpen(false);
    // Petit délai pour laisser le menu se fermer avant d'ouvrir la modal,
    // sinon iOS empile deux modaux et le second n'est jamais visible.
    setTimeout(() => setReportOpen(true), 150);
  };

  return (
    <>
      <Pressable
        onPress={() => setMenuOpen(true)}
        hitSlop={8}
        accessibilityLabel="Options"
        style={({ pressed }) => ({
          padding: 4,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <MaterialIcons
          name="more-vert"
          size={size}
          color={color ?? hexWithAlpha(themeInk, 0.6)}
        />
      </Pressable>

      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          onPress={() => setMenuOpen(false)}
          className="flex-1 justify-end bg-ink/60"
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-t-3xl bg-paper px-4 pb-8 pt-4"
          >
            <View className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-ink/15" />
            <Pressable
              onPress={onPickReport}
              className="flex-row items-center gap-3 rounded-2xl px-3 py-4 active:bg-paper-warm"
            >
              <MaterialIcons name="flag" size={22} color="#c54a4a" />
              <View className="flex-1">
                <Text className="font-sans-med text-base text-ink">
                  Signaler
                </Text>
                <Text className="text-xs text-ink-muted">
                  Notifier l'équipe Grimolia
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => setMenuOpen(false)}
              className="mt-2 rounded-full border border-ink-muted/30 py-3 active:opacity-70"
            >
              <Text className="text-center text-ink-muted">Annuler</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        target={target}
      />
    </>
  );
}
