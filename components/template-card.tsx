import { BookCover } from '@/components/book-cover';
import { BookPlaceholder } from '@/components/book-placeholder';
import { SheetSurface } from '@/components/sheet-surface';
import { StaticStickerLayer } from '@/components/static-sticker-layer';
import {
  hexWithAlpha,
  resolveSectionIcon,
  SHEET_TEXT_SHADOW,
} from '@/lib/sheet-appearance';
import { getFont } from '@/lib/theme/fonts';
import type {
  PublicReadingSheetTemplate,
  ReadingSheetTemplate,
  SheetSection,
  UserBook,
} from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

type Props = {
  template: ReadingSheetTemplate | PublicReadingSheetTemplate;
  // Si fourni, on rend le livre réel à la place du placeholder (preview du
  // template appliqué sur un livre en cours de création de fiche).
  previewWithBook?: UserBook;
  // headerOnly = cache les sections, ne rend que la "couverture" + titre du
  // template + métadonnées. Utilisé dans les listings.
  headerOnly?: boolean;
  onPress?: () => void;
  // Si true, rendu en taille compacte (gallery 2 colonnes).
  compact?: boolean;
  // Affiche une étoile "premium" en coin si true.
  premiumBadge?: boolean;
};

export function TemplateCard({
  template,
  previewWithBook,
  headerOnly,
  onPress,
  compact,
  premiumBadge,
}: Props) {
  const appearance = template.appearance;
  const fontDef = getFont(appearance.fontId as any);
  const displayFont = fontDef.variants.display;
  const sansFont = fontDef.variants.sans;
  const { textColor, mutedColor } = appearance;
  const divider = hexWithAlpha(mutedColor, 0.22);

  const coverWidth = compact ? 40 : 48;
  const coverHeight = compact ? 60 : 72;

  const inner = (
    <>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {previewWithBook ? (
          <BookCover
            isbn={previewWithBook.book.isbn}
            coverUrl={previewWithBook.book.coverUrl}
            style={{ width: coverWidth, height: coverHeight, borderRadius: 6 }}
          />
        ) : (
          <BookPlaceholder
            style={{ width: coverWidth, height: coverHeight, borderRadius: 6 }}
          />
        )}
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={2}
            style={[
              {
                color: textColor,
                fontFamily: displayFont,
                fontSize: compact ? 14 : 16,
              },
              SHEET_TEXT_SHADOW,
            ]}>
            {previewWithBook ? previewWithBook.book.title : template.name}
          </Text>
          {previewWithBook && previewWithBook.book.authors[0] ? (
            <Text
              numberOfLines={1}
              style={[
                { color: mutedColor, fontFamily: sansFont, fontSize: 12, marginTop: 2 },
                SHEET_TEXT_SHADOW,
              ]}>
              {previewWithBook.book.authors[0]}
            </Text>
          ) : (
            <Text
              numberOfLines={1}
              style={[
                {
                  color: mutedColor,
                  fontFamily: sansFont,
                  fontSize: 11,
                  marginTop: 2,
                },
                SHEET_TEXT_SHADOW,
              ]}>
              Template · {template.sections.length} section
              {template.sections.length > 1 ? 's' : ''}
            </Text>
          )}
        </View>
        {premiumBadge ? (
          <View
            style={{
              backgroundColor: 'rgba(245, 158, 11, 0.15)',
              borderRadius: 999,
              padding: 4,
              alignSelf: 'flex-start',
            }}>
            <MaterialIcons name="star" size={14} color="#f59e0b" />
          </View>
        ) : null}
      </View>

      {!headerOnly && template.sections.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          {template.sections.slice(0, compact ? 2 : 5).map((section, idx) => (
            <SectionPreview
              key={section.id}
              section={section}
              appearance={appearance}
              displayFont={displayFont}
              sansFont={sansFont}
              textColor={textColor}
              mutedColor={mutedColor}
              showDivider={idx > 0}
              dividerColor={divider}
              simulateBody={!headerOnly && !compact}
            />
          ))}
        </View>
      ) : null}
    </>
  );

  // Wrapper position:relative pour aligner les bornes du StaticStickerLayer
  // sur celles de la SheetSurface (cf. app/sheet/view/[id].tsx) — les
  // positions x/y des stickers sont en fraction [0,1] de cette boîte.
  const surface = (
    <View style={{ position: 'relative' }}>
      <SheetSurface
        appearance={appearance}
        padding={compact ? 10 : 12}
        style={{
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 2,
        }}>
        {inner}
      </SheetSurface>
      {/* Stickers cachés en headerOnly (galerie/liste) : la mini-card n'a
          pas les bonnes proportions pour rendre les positions x/y telles
          quelles. Affichés en preview pleine (édition, viewer public). */}
      {!headerOnly && template.stickers && template.stickers.length > 0 ? (
        <StaticStickerLayer stickers={template.stickers} />
      ) : null}
    </View>
  );

  if (!onPress) return surface;
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      {surface}
    </Pressable>
  );
}

function SectionPreview({
  section,
  appearance,
  displayFont,
  sansFont,
  textColor,
  mutedColor,
  showDivider,
  dividerColor,
  simulateBody,
}: {
  section: SheetSection;
  appearance: ReadingSheetTemplate['appearance'];
  displayFont: string;
  sansFont: string;
  textColor: string;
  mutedColor: string;
  showDivider: boolean;
  dividerColor: string;
  // En preview pleine (éditeur / viewer communautaire), on simule le rendu
  // d'une fiche fraîchement créée à partir du template : 5 rating icons à 0
  // (si type défini) + zone body avec placeholder muet. Évite à l'user
  // d'avoir à imaginer ce que le template donnera une fois utilisé.
  simulateBody?: boolean;
}) {
  const resolved = resolveSectionIcon(section, appearance);
  const hasRatingType = !!section.rating && (resolved.emoji || resolved.materialIcon);
  return (
    <View
      style={{
        paddingVertical: simulateBody ? 14 : 6,
        marginTop: showDivider && !simulateBody ? 4 : 0,
        borderTopWidth: showDivider ? 1 : 0,
        borderTopColor: dividerColor,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {resolved.emoji ? (
          <Text style={[{ fontSize: simulateBody ? 14 : 12 }, SHEET_TEXT_SHADOW]}>
            {resolved.emoji}
          </Text>
        ) : resolved.materialIcon ? (
          <MaterialIcons
            name={resolved.materialIcon as keyof typeof MaterialIcons.glyphMap}
            size={simulateBody ? 14 : 12}
            color={resolved.materialIconColor ?? textColor}
          />
        ) : null}
        <Text
          numberOfLines={simulateBody ? undefined : 1}
          style={[
            {
              color: textColor,
              fontFamily: displayFont,
              fontSize: simulateBody ? 18 : 13,
            },
            SHEET_TEXT_SHADOW,
          ]}>
          {section.title || 'Sans titre'}
        </Text>
      </View>
      {simulateBody && hasRatingType ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ opacity: 0.3 }}>
              {resolved.emoji ? (
                <Text style={[{ fontSize: 22 }, SHEET_TEXT_SHADOW]}>{resolved.emoji}</Text>
              ) : (
                <MaterialIcons
                  name={resolved.materialIcon as keyof typeof MaterialIcons.glyphMap}
                  size={22}
                  color={resolved.materialIconColor ?? textColor}
                />
              )}
            </View>
          ))}
        </View>
      ) : null}
      {/* Reproduit le body TextInput vide de la fiche : pas de fontFamily
          (police système), pas d'italic, mêmes dimensions → hauteur de
          section identique à la fiche réelle, donc stickers à la même place. */}
      {simulateBody ? (
        <Text
          style={[
            {
              color: mutedColor,
              fontSize: 16,
              lineHeight: 22,
              minHeight: 96,
              marginTop: 12,
            },
            SHEET_TEXT_SHADOW,
          ]}>
          Écris ici ton avis, tes pensées…
        </Text>
      ) : null}
    </View>
  );
}
