// Drawer "Ajouter une catégorie" — affiche TOUTES les catégories par défaut
// du template (`appearance.defaultCategories`) sous forme de pills toggles :
//   - Pill active (catégorie déjà dans la fiche) : style accent + icône check.
//   - Pill inactive : style paper-warm + icône +.
// Tap toggle add/remove. Le drawer reste ouvert pour empiler des changements ;
// le user le ferme via la croix ou en tapant le backdrop.
//
// Le bouton "+ Section personnalisée" ferme le drawer puis ouvre
// l'IconPickerModal en mode `withTitle` (champ nom + icône) — on ne présente
// jamais deux Modal natifs simultanément (cf. openCustomSection). À validation,
// ajoute la section ; le user retourne directement à l'édition du body.

import { IconPickerModal } from '@/components/icon-picker-modal';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { RatingIcon } from '@/components/rating-row';
import type { SheetDefaultCategory } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type CustomSectionResult = {
  title: string;
  materialIcon?: string;
  materialIconColor?: string;
  emoji?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  // Toutes les catégories du template (pas pré-filtrées).
  categories: SheetDefaultCategory[];
  // Titres déjà présents dans la fiche (comparaison insensible à la casse).
  usedTitles: string[];
  // Tap sur une pill inactive → ajoute la section avec l'icône du template.
  onAdd: (category: SheetDefaultCategory) => void;
  // Tap sur une pill active → retire la section correspondante (matching
  // par titre normalisé côté caller).
  onRemove: (categoryTitle: string) => void;
  // "+ Section personnalisée" — saisi via IconPickerModal withTitle.
  onAddCustom: (result: CustomSectionResult) => void;
};

function norm(s: string) {
  return s.trim().toLocaleLowerCase('fr');
}

export function CategoryDrawer({
  open,
  onClose,
  categories,
  usedTitles,
  onAdd,
  onRemove,
  onAddCustom,
}: Props) {
  const insets = useSafeAreaInsets();
  const theme = useThemeColors();
  const [newSectionOpen, setNewSectionOpen] = useState(false);

  const usedSet = useMemo(
    () => new Set(usedTitles.map(norm)),
    [usedTitles],
  );

  // Ouverture de l'IconPickerModal : on ferme d'abord le CategoryDrawer puis,
  // son animation terminée, on présente le picker. On ne présente jamais deux
  // Modal natifs en même temps (un seul backdrop) — sur iOS l'empilement laisse
  // un backdrop résiduel qui gèle l'app (cf. pattern session-notes-drawer.tsx).
  const openCustomSection = () => {
    onClose();
    setTimeout(() => setNewSectionOpen(true), 220);
  };

  return (
    <>
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 bg-ink/40" />
      <View
        className="absolute bottom-0 left-0 right-0 rounded-t-3xl bg-paper"
        style={{ paddingBottom: insets.bottom, maxHeight: '75%' }}>
        <View className="flex-row items-center justify-between px-5 pb-3 pt-4">
          <View>
            <Text className="font-display text-xl text-ink">Catégories</Text>
            <Text className="mt-0.5 text-xs text-ink-muted">
              Touche pour ajouter ou retirer.
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
            <MaterialIcons name="close" size={18} color={theme.ink} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}>
          {categories.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {categories.map((c) => {
                const active = usedSet.has(norm(c.title));
                return (
                  <Pressable
                    key={c.title}
                    onPress={() =>
                      active ? onRemove(c.title) : onAdd(c)
                    }
                    className={`flex-row items-center gap-1.5 rounded-full px-4 py-2.5 active:opacity-70 ${active ? 'bg-accent' : 'bg-paper-warm'}`}>
                    <MaterialIcons
                      name={active ? 'check' : 'add'}
                      size={14}
                      color={active ? '#fbf8f4' : theme.inkMuted}
                    />
                    <Text
                      className={`text-sm ${active ? 'text-paper' : 'text-ink'}`}>
                      {c.title}
                    </Text>
                    {c.emoji ? (
                      <Text style={{ fontSize: 16 }}>{c.emoji}</Text>
                    ) : c.materialIcon ? (
                      <MaterialIcons
                        name={c.materialIcon as keyof typeof MaterialIcons.glyphMap}
                        size={16}
                        color={
                          active
                            ? '#fbf8f4'
                            : (c.materialIconColor ?? theme.ink)
                        }
                      />
                    ) : c.icon ? (
                      <RatingIcon kind={c.icon} filled size={16} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <Text className="text-sm text-ink-muted">
              Aucune catégorie dans le template.
            </Text>
          )}

          <Pressable
            onPress={openCustomSection}
            className="mt-5 flex-row items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 active:opacity-80">
            <MaterialIcons name="add" size={20} color="#fbf8f4" />
            <Text className="font-sans-med text-paper">Section personnalisée</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>

      {/* IconPickerModal en mode `withTitle` (champ nom + onglets icône/emoji).
          Rendu en FRÈRE du drawer (pas imbriqué) : le drawer est déjà fermé
          quand on l'ouvre (cf. openCustomSection), donc un seul Modal natif est
          présenté à la fois. C'est le même picker que pour éditer l'icône d'une
          catégorie existante — l'API est partagée. */}
      <IconPickerModal
        open={newSectionOpen}
        onClose={() => setNewSectionOpen(false)}
        withTitle
        title="Nouvelle section"
        titlePlaceholder="Ex. Personnages, Ambiance, Citations…"
        onPick={(result) => {
          const title = result.title?.trim();
          setNewSectionOpen(false);
          if (!title) return;
          // Le drawer est déjà fermé : il suffit d'ajouter la section. L'user
          // retourne directement à l'édition pour remplir le body.
          onAddCustom({
            title,
            materialIcon: result.name,
            materialIconColor: result.color,
            emoji: result.emoji,
          });
        }}
      />
    </>
  );
}
