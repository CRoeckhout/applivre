// Rendu d'une section de fiche — partagé entre :
//   - L'éditeur de fiche `/sheet/[isbn]` (body éditable, rating cliquable,
//     titre éditable via IconPickerModal, suppression).
//   - L'éditeur de template `/template/[id]` (body en placeholder read-only,
//     rating non interactif).
//   - La vue read-only `/sheet/view/[id]` (tout read-only, pas de boutons).
//   - Tout futur consommateur qui rend une section.
//
// Le but est de garantir que la HAUTEUR du rendu soit STRICTEMENT identique
// quelle que soit la variation : pas de chemins de rendu divergents. Une
// section en vue a la même hauteur qu'une section en édition, donc les
// stickers (positions x/y absolu depuis le top) tombent aux mêmes
// coordonnées dans tous les contextes.
//
// Variations pilotées par la présence de callbacks :
//   - `onUpdateMeta` / `onUpdateTitle` absents → titre rendu en Text static
//     (pas de Pressable ni d'icône edit), pixel-perfect avec un Text solo.
//   - `onRemove` absent → bouton × masqué.
//   - `onSetRating` absent → rating items non pressables.
//   - `onMoveUp` / `onMoveDown` absents → pas de chevrons de réordering.
//   - `bodyEditable = false` → TextInput body en read-only (le placeholder
//     ou la valeur est rendue à l'identique d'un mode éditable).

import { IconPickerModal } from '@/components/icon-picker-modal';
import {
  ficheTextStyle,
  resolveSectionIcon,
  SHEET_TEXT_SHADOW,
} from '@/lib/sheet-appearance';
import type { SheetAppearance, SheetSection } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

export type SectionMetaUpdate = {
  title: string;
  materialIcon?: string;
  materialIconColor?: string;
  emoji?: string;
};

export type SheetSectionEditorProps = {
  section: SheetSection;
  appearance: SheetAppearance;
  fontFamily: string;
  // Update combiné titre + icône via l'IconPickerModal ouvert au tap sur
  // le titre. Si absent (et onUpdateTitle aussi), le titre est rendu en
  // Text statique non cliquable (pixel-perfect read-only).
  onUpdateMeta?: (meta: SectionMetaUpdate) => void;
  onUpdateTitle?: (title: string) => void;
  onUpdateBody?: (body: string) => void;
  onSetRating?: (value: number | undefined) => void;
  onRemove?: () => void;
  // Réordering simple via chevrons up/down à gauche du titre. Si fournis,
  // les boutons sont affichés ; `canMoveUp` / `canMoveDown` permettent
  // de griser le bouton quand l'action n'est pas possible (premier /
  // dernier élément).
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  // Si false, le body TextInput passe `editable={false}`. Default true.
  bodyEditable?: boolean;
  // Si false, les rating items ne sont pas pressables — l'affichage reste
  // fidèle à `section.rating?.value` (rempli vs vide via opacité). Dans le
  // template editor, la valeur stockée est déjà 0 (sanitize au clone), donc
  // l'affichage reste neutre sans avoir à forcer ici. Le wrapper Pressable
  // reste pour préserver la géométrie identique.
  ratingInteractive?: boolean;
};

export function SheetSectionEditor({
  section,
  appearance,
  fontFamily,
  onUpdateMeta,
  onUpdateTitle,
  onUpdateBody,
  onSetRating,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp = true,
  canMoveDown = true,
  bodyEditable = true,
  ratingInteractive = true,
}: SheetSectionEditorProps) {
  const ratingValue = section.rating?.value ?? 0;
  const resolvedIcon = resolveSectionIcon(section, appearance);
  const hasIcon = !!(resolvedIcon.emoji || resolvedIcon.materialIcon);
  // Tap sur le titre → ouvre l'IconPickerModal en mode `withTitle`.
  const [metaOpen, setMetaOpen] = useState(false);
  const titleEditable = !!(onUpdateMeta || onUpdateTitle);

  const titleText = (
    <Text
      numberOfLines={1}
      style={[
        {
          color: section.title
            ? appearance.textColor
            : appearance.mutedColor,
          fontFamily,
          ...ficheTextStyle(18),
          // Réserve la place pour l'icône edit en absolute (sinon
          // chevauchement avec le titre long). Si titre non éditable,
          // pas d'icône → pas besoin de padding.
          paddingRight: titleEditable ? 20 : 0,
        },
        SHEET_TEXT_SHADOW,
      ]}>
      {section.title || (titleEditable ? 'Titre de la catégorie' : '')}
    </Text>
  );

  return (
    <View>
      <View className="flex-row items-center gap-2">
        {titleEditable ? (
          <Pressable
            onPress={() => setMetaOpen(true)}
            accessibilityLabel="Modifier le titre et l'icône"
            hitSlop={4}
            className="flex-1"
            style={{ position: 'relative' }}>
            {titleText}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                justifyContent: 'center',
              }}>
              <MaterialIcons
                name="edit"
                size={14}
                color={appearance.mutedColor}
                style={{ opacity: 0.6 }}
              />
            </View>
          </Pressable>
        ) : (
          // Read-only : pas de Pressable autour, le Text est rendu seul
          // dans le flow (pixel-perfect avec la vue read-only historique).
          <View style={{ flex: 1 }}>{titleText}</View>
        )}
        {onMoveUp || onMoveDown ? (
          // Chevrons up/down — placés à droite, juste avant la croix de
          // suppression. Hauteur 24dp ≤ lineHeight du titre (25dp), donc la
          // row reste à 25dp et les stickers tombent au bon endroit.
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            {onMoveUp ? (
              <Pressable
                onPress={canMoveUp ? onMoveUp : undefined}
                disabled={!canMoveUp}
                accessibilityLabel="Déplacer la section vers le haut"
                hitSlop={6}>
                <MaterialIcons
                  name="keyboard-arrow-up"
                  size={24}
                  color={appearance.mutedColor}
                  style={{ opacity: canMoveUp ? 0.7 : 0.25 }}
                />
              </Pressable>
            ) : null}
            {onMoveDown ? (
              <Pressable
                onPress={canMoveDown ? onMoveDown : undefined}
                disabled={!canMoveDown}
                accessibilityLabel="Déplacer la section vers le bas"
                hitSlop={6}>
                <MaterialIcons
                  name="keyboard-arrow-down"
                  size={24}
                  color={appearance.mutedColor}
                  style={{ opacity: canMoveDown ? 0.7 : 0.25 }}
                />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {onRemove ? (
          <Pressable
            onPress={onRemove}
            hitSlop={12}
            // Pas de `h-8 w-8` : laisser le Text fixer la hauteur de la
            // ligne (lineHeight 25, identique au titre). Sinon la row
            // titre faisait 32dp et "centrait" le Text vers le bas →
            // décalage visible vs la vue read-only.
            accessibilityLabel="Supprimer la section">
            <Text
              style={[
                // fontSize 26 dans une lineHeight 25 reste lisible (le × est
                // un glyphe étroit avec beaucoup d'air vertical). On
                // n'augmente PAS le lineHeight pour ne pas pousser la row
                // au-delà de 25dp — sticker positions dépendent de ça.
                { color: appearance.mutedColor, fontSize: 26, lineHeight: 25 },
                SHEET_TEXT_SHADOW,
              ]}>
              ×
            </Text>
          </Pressable>
        ) : null}
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
                  ratingInteractive && onSetRating
                    ? () => onSetRating(next)
                    : undefined
                }
                hitSlop={6}
                style={{ opacity: filled ? 1 : 0.3 }}>
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
        placeholder={
          bodyEditable ? 'Écris ici ton avis, tes pensées…' : undefined
        }
        placeholderTextColor={appearance.mutedColor}
        multiline
        editable={bodyEditable}
        textAlignVertical="top"
        // Styles strictement alignés entre tous les contextes pour matcher
        // pixel-perfect. Padding forcé à 0 pour neutraliser le padding
        // implicite d'un TextInput multiline natif (iOS ~7dp, Android
        // similaire) qui sinon ajouterait un décalage.
        style={[
          {
            color: appearance.textColor,
            fontFamily,
            minHeight: 96,
            lineHeight: 22,
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: 0,
            paddingRight: 0,
          },
          SHEET_TEXT_SHADOW,
        ]}
        className="mt-3 text-base"
      />

      {titleEditable ? (
        <IconPickerModal
          open={metaOpen}
          onClose={() => setMetaOpen(false)}
          withTitle
          title="Modifier la section"
          initialTitle={section.title}
          selected={section.materialIcon}
          selectedColor={section.materialIconColor}
          selectedEmoji={section.emoji}
          onPick={(result) => {
            setMetaOpen(false);
            const nextTitle = (result.title ?? section.title).trim();
            if (onUpdateMeta) {
              onUpdateMeta({
                title: nextTitle || section.title,
                materialIcon: result.name,
                materialIconColor: result.color,
                emoji: result.emoji,
              });
            } else if (
              onUpdateTitle &&
              nextTitle &&
              nextTitle !== section.title
            ) {
              onUpdateTitle(nextTitle);
            }
          }}
        />
      ) : null}
    </View>
  );
}
