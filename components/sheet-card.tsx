import { BookCover } from "@/components/book-cover";
import { SheetSurface } from "@/components/sheet-surface";
import { useThemeColors } from "@/hooks/use-theme-colors";
import {
  hexWithAlpha,
  resolveSectionIcon,
  SHEET_TEXT_SHADOW,
} from "@/lib/sheet-appearance";
import { getFont } from "@/lib/theme/fonts";
import type {
  ReadingSheet,
  SheetAppearance,
  SheetSection,
  UserBook,
} from "@/types/book";
import { MaterialIcons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";

type Props = {
  userBook: UserBook;
  sheet: ReadingSheet;
  appearance: SheetAppearance;
  isCustom: boolean;
  onPress?: () => void;
  // Masque le bloc cover/titre/auteur en tête. Utile sur la page livre
  // où ces infos sont déjà affichées plus haut.
  hideBookHeader?: boolean;
  // Si true, rend un container static (non pressable) mais conserve le style.
  readOnly?: boolean;
  // Masque le contenu des sections : ne rend que le header (cover/titre/
  // auteur/date). Utilisé dans la liste des fiches.
  headerOnly?: boolean;
  // Default true : la card s'enveloppe d'un wrapper paper-bg + radius +
  // ombre pour se détacher du background. À mettre à false quand un parent
  // gère déjà l'ombre (typt. consommateur dans un Swipeable, dont
  // `overflow:'hidden'` clipperait l'ombre interne).
  withShadow?: boolean;
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return "aujourd'hui";
  if (d === 1) return "hier";
  if (d < 7) return `il y a ${d} jours`;
  if (d < 30) return `il y a ${Math.floor(d / 7)} sem.`;
  if (d < 365) return `il y a ${Math.floor(d / 30)} mois`;
  return `il y a ${Math.floor(d / 365)} an${d >= 730 ? "s" : ""}`;
}

export function SheetCard({
  userBook,
  sheet,
  appearance,
  isCustom,
  onPress,
  hideBookHeader,
  readOnly,
  headerOnly,
  withShadow = true,
}: Props) {
  const theme = useThemeColors();
  const fontDef = getFont(appearance.fontId as any);
  const displayFont = fontDef.variants.display;
  const sansFont = fontDef.variants.sans;
  const { textColor, mutedColor } = appearance;
  const divider = hexWithAlpha(mutedColor, 0.22);

  const inner = (
    <>
      {hideBookHeader ? null : (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <BookCover
            isbn={userBook.book.isbn}
            coverUrl={userBook.book.coverUrl}
            style={{ width: 48, height: 72, borderRadius: 6 }}
          />
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={2}
              style={[
                {
                  color: textColor,
                  fontFamily: displayFont,
                  fontSize: 16,
                },
                SHEET_TEXT_SHADOW,
              ]}
            >
              {userBook.book.title}
            </Text>
            {userBook.book.authors[0] ? (
              <Text
                numberOfLines={1}
                style={[
                  {
                    color: mutedColor,
                    fontFamily: sansFont,
                    fontSize: 12,
                    marginTop: 2,
                  },
                  SHEET_TEXT_SHADOW,
                ]}
              >
                {userBook.book.authors[0]}
              </Text>
            ) : null}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 4,
              }}
            >
              {isCustom ? (
                <MaterialIcons name="palette" size={12} color={mutedColor} />
              ) : null}
              <Text
                style={[
                  {
                    color: mutedColor,
                    fontFamily: sansFont,
                    fontSize: 11,
                  },
                  SHEET_TEXT_SHADOW,
                ]}
              >
                {timeAgo(sheet.updatedAt)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {!headerOnly && sheet.sections.length > 0 ? (
        <View style={{ marginTop: hideBookHeader ? 0 : 10 }}>
          {sheet.sections.map((section, idx) => (
            <SectionContent
              key={section.id}
              section={section}
              appearance={appearance}
              displayFont={displayFont}
              sansFont={sansFont}
              textColor={textColor}
              mutedColor={mutedColor}
              showDivider={idx > 0}
              dividerColor={divider}
            />
          ))}
        </View>
      ) : null}
    </>
  );

  // Ombre : on enveloppe la SheetSurface dans un wrapper `paper-bg + radius`
  // pour qu'iOS calcule un `shadowPath` qui suit la forme arrondie (sans
  // backgroundColor, le shadow tombe en rectangle sur le bbox). `paper` =
  // couleur du bg de page → wrapper visuellement invisible. Désactivable
  // via `withShadow={false}` quand un parent (Swipeable etc.) prend la
  // responsabilité de l'ombre.
  const inner_surface = (
    <SheetSurface appearance={appearance} padding={12}>
      {inner}
    </SheetSurface>
  );
  const surface = withShadow ? (
    <View
      style={{
        borderRadius: appearance.frame.radius,
        backgroundColor: theme.paper,
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
      }}>
      {inner_surface}
    </View>
  ) : (
    inner_surface
  );

  if (readOnly || !onPress) {
    return surface;
  }
  return (
    <Pressable onPress={onPress} className="active:opacity-80">
      {surface}
    </Pressable>
  );
}

function SectionContent({
  section,
  appearance,
  displayFont,
  sansFont,
  textColor,
  mutedColor,
  showDivider,
  dividerColor,
}: {
  section: SheetSection;
  appearance: SheetAppearance;
  displayFont: string;
  sansFont: string;
  textColor: string;
  mutedColor: string;
  showDivider: boolean;
  dividerColor: string;
}) {
  const resolved = resolveSectionIcon(section, appearance);
  return (
    <View
      style={{
        paddingTop: 8,
        marginTop: showDivider ? 6 : 0,
        borderTopWidth: showDivider ? 1 : 0,
        borderTopColor: dividerColor,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Text
          style={[
            { color: textColor, fontFamily: displayFont, fontSize: 14 },
            SHEET_TEXT_SHADOW,
          ]}
        >
          {section.title || "Sans titre"}
        </Text>
      </View>
      {section.rating && (resolved.emoji || resolved.materialIcon) ? (
        <View style={{ flexDirection: "row", gap: 3, marginTop: 3 }}>
          {[1, 2, 3, 4, 5].map((i) => {
            const filled = i <= section.rating!.value;
            return (
              <View key={i} style={{ opacity: filled ? 1 : 0.3 }}>
                {resolved.emoji ? (
                  <Text style={[{ fontSize: 13 }, SHEET_TEXT_SHADOW]}>
                    {resolved.emoji}
                  </Text>
                ) : (
                  <MaterialIcons
                    name={
                      resolved.materialIcon as keyof typeof MaterialIcons.glyphMap
                    }
                    size={13}
                    color={resolved.materialIconColor ?? textColor}
                  />
                )}
              </View>
            );
          })}
        </View>
      ) : null}
      {section.body.trim() ? (
        <Text
          style={[
            {
              color: textColor,
              fontFamily: sansFont,
              fontSize: 13,
              lineHeight: 18,
              marginTop: 3,
            },
            SHEET_TEXT_SHADOW,
          ]}
        >
          {section.body.trim()}
        </Text>
      ) : null}
    </View>
  );
}
