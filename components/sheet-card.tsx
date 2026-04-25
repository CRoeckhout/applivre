import { BookCover } from "@/components/book-cover";
import { hexWithAlpha, resolveSectionIcon } from "@/lib/sheet-appearance";
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
}: Props) {
  const fontDef = getFont(appearance.fontId as any);
  const displayFont = fontDef.variants.display;
  const sansFont = fontDef.variants.sans;
  const { frame, bgColor, textColor, mutedColor } = appearance;
  const borderWidth = frame.style === "none" ? 0 : frame.width;
  const divider = hexWithAlpha(mutedColor, 0.22);

  const containerStyle = {
    backgroundColor: bgColor,
    borderStyle: frame.style === "none" ? undefined : (frame.style as "solid"),
    borderWidth,
    borderColor: frame.color,
    borderRadius: frame.radius,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  } as const;

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
              style={{
                color: textColor,
                fontFamily: displayFont,
                fontSize: 16,
              }}
            >
              {userBook.book.title}
            </Text>
            {userBook.book.authors[0] ? (
              <Text
                numberOfLines={1}
                style={{
                  color: mutedColor,
                  fontFamily: sansFont,
                  fontSize: 12,
                  marginTop: 2,
                }}
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
                style={{
                  color: mutedColor,
                  fontFamily: sansFont,
                  fontSize: 11,
                }}
              >
                {timeAgo(sheet.updatedAt)}
              </Text>
            </View>
          </View>
        </View>
      )}

      {sheet.sections.length > 0 ? (
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

  if (readOnly || !onPress) {
    return <View style={containerStyle}>{inner}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      style={containerStyle}
      className="active:opacity-80"
    >
      {inner}
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
          style={{ color: textColor, fontFamily: displayFont, fontSize: 14 }}
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
                  <Text style={{ fontSize: 13 }}>{resolved.emoji}</Text>
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
          style={{
            color: textColor,
            fontFamily: sansFont,
            fontSize: 13,
            lineHeight: 18,
            marginTop: 3,
          }}
        >
          {section.body.trim()}
        </Text>
      ) : null}
    </View>
  );
}
