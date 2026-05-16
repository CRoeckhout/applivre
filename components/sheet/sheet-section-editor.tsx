// Éditeur d'une section de fiche — partagé entre :
//   - L'éditeur de fiche `/sheet/[isbn]` (body éditable, rating cliquable)
//   - L'éditeur de template `/template/[id]` (body en placeholder read-only,
//     rating affiché mais non interactif)
//   - Tout futur consommateur qui veut le rendu visuel d'une section.
//
// Le but est de garantir que la hauteur du rendu soit STRICTEMENT identique
// quelle que soit la variation : pas de chemins de rendu divergents. Une
// section template a la même hauteur qu'une section fiche fraîchement créée,
// donc les stickers (positions x/y en fraction de la fiche) tombent aux
// mêmes coordonnées absolues dans les deux contextes.
//
// Variations :
//   - `bodyEditable: false` → le TextInput body passe `editable={false}` ;
//     le placeholder reste affiché car body est vide. Aucun autre changement
//     visuel : mêmes minHeight, fontSize, lineHeight, marginTop.
//   - `ratingInteractive: false` → les 5 rating items sont rendus sans
//     callback de tap, mais le wrapper Pressable reste pour préserver la
//     géométrie identique.

import {
  ficheTextStyle,
  resolveSectionIcon,
  SHEET_TEXT_SHADOW,
} from '@/lib/sheet-appearance';
import type { SheetAppearance, SheetSection } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, TextInput, View } from 'react-native';

export type SheetSectionEditorProps = {
  section: SheetSection;
  appearance: SheetAppearance;
  fontFamily: string;
  onUpdateTitle: (title: string) => void;
  onUpdateBody?: (body: string) => void;
  onSetRating?: (value: number | undefined) => void;
  onRemove: () => void;
  // Si false, le body TextInput est read-only (placeholder visible, pas de
  // saisie). Utilisé par l'éditeur de template où le body n'est jamais
  // rempli côté template.
  bodyEditable?: boolean;
  // Si false, les rating items ne sont pas pressables et leur opacité est
  // forcée à 0.3 (simule un rating à 0, comme dans le template). Le wrapper
  // Pressable reste pour préserver la géométrie identique.
  ratingInteractive?: boolean;
};

export function SheetSectionEditor({
  section,
  appearance,
  fontFamily,
  onUpdateTitle,
  onUpdateBody,
  onSetRating,
  onRemove,
  bodyEditable = true,
  ratingInteractive = true,
}: SheetSectionEditorProps) {
  const ratingValue = ratingInteractive ? (section.rating?.value ?? 0) : 0;
  const resolvedIcon = resolveSectionIcon(section, appearance);
  const hasIcon = !!(resolvedIcon.emoji || resolvedIcon.materialIcon);
  return (
    <View>
      <View className="flex-row items-center gap-2">
        <TextInput
          value={section.title}
          onChangeText={onUpdateTitle}
          placeholder="Titre de la catégorie"
          placeholderTextColor={appearance.mutedColor}
          style={[
            { color: appearance.textColor, fontFamily, ...ficheTextStyle(18) },
            SHEET_TEXT_SHADOW,
          ]}
          className="flex-1"
        />
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          className="h-8 w-8 items-center justify-center rounded-full active:opacity-60">
          <Text
            style={[{ color: appearance.mutedColor }, SHEET_TEXT_SHADOW]}
            className="text-xl">
            ×
          </Text>
        </Pressable>
      </View>

      {hasIcon && (
        <View className="mt-2 flex-row items-center gap-2">
          {[1, 2, 3, 4, 5].map((i) => {
            const filled = i <= ratingValue;
            const next = ratingValue === i ? undefined : i;
            return (
              <Pressable
                key={i}
                onPress={
                  ratingInteractive && onSetRating ? () => onSetRating(next) : undefined
                }
                hitSlop={6}
                style={{ opacity: ratingInteractive ? (filled ? 1 : 0.3) : 0.3 }}>
                {resolvedIcon.emoji ? (
                  <Text style={[ficheTextStyle(22), SHEET_TEXT_SHADOW]}>
                    {resolvedIcon.emoji}
                  </Text>
                ) : (
                  <MaterialIcons
                    name={resolvedIcon.materialIcon as keyof typeof MaterialIcons.glyphMap}
                    size={22}
                    color={resolvedIcon.materialIconColor ?? appearance.textColor}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      <TextInput
        value={section.body}
        onChangeText={onUpdateBody}
        placeholder="Écris ici ton avis, tes pensées…"
        placeholderTextColor={appearance.mutedColor}
        multiline
        editable={bodyEditable}
        textAlignVertical="top"
        style={[
          { color: appearance.textColor, minHeight: 96, lineHeight: 22 },
          SHEET_TEXT_SHADOW,
        ]}
        className="mt-3 text-base"
      />
    </View>
  );
}
