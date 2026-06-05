import { Linking, Text, type StyleProp, type TextStyle } from 'react-native';

// Rendu d'un sous-ensemble de markdown inline en <Text> imbriqués, pour le
// contenu éditorial (fil d'actu, release notes) saisi en WYSIWYG côté admin.
// Marques supportées : **gras**, *italique* (ou _italique_), ***gras italique***
// et liens [libellé](url). Le parseur est volontairement simple (pas
// d'imbrication arbitraire) : la source est générée par TipTap, donc propre.
//
// Contrainte polices : les graisses DM Sans sont chargées par famille nommée
// (cf. app/_layout.tsx). En contexte « display » (titres) `fontWeight` /
// `fontStyle` ne suffisent pas → on bascule la fontFamily vers la variante
// adéquate. En contexte « sans » (corps, police système) on garde fontWeight /
// fontStyle natifs, qui fonctionnent sur iOS comme Android.

type Mark = { bold: boolean; italic: boolean; href?: string };
type Run = { text: string; mark: Mark };

// Familles DM Sans pour le rendu des titres (font-display = DMSans_600SemiBold).
const DISPLAY_BOLD = 'DMSans_700Bold';
const DISPLAY_ITALIC = 'DMSans_600SemiBold_Italic';
const DISPLAY_BOLD_ITALIC = 'DMSans_700Bold_Italic';

const TOKEN =
  // gras+italique | gras | italique(*) | italique(_) | lien
  /(\*\*\*([^*]+)\*\*\*)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(_([^_]+)_)|(\[([^\]]+)\]\(([^)]+)\))/g;

function parseInline(src: string): Run[] {
  const runs: Run[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src)) !== null) {
    if (m.index > last) {
      runs.push({ text: src.slice(last, m.index), mark: { bold: false, italic: false } });
    }
    if (m[2] !== undefined) {
      runs.push({ text: m[2], mark: { bold: true, italic: true } });
    } else if (m[4] !== undefined) {
      runs.push({ text: m[4], mark: { bold: true, italic: false } });
    } else if (m[6] !== undefined) {
      runs.push({ text: m[6], mark: { bold: false, italic: true } });
    } else if (m[8] !== undefined) {
      runs.push({ text: m[8], mark: { bold: false, italic: true } });
    } else if (m[10] !== undefined) {
      runs.push({ text: m[10], mark: { bold: false, italic: false, href: m[11] } });
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) {
    runs.push({ text: src.slice(last), mark: { bold: false, italic: false } });
  }
  return runs;
}

function markStyle(mark: Mark, font: 'sans' | 'display'): TextStyle {
  if (font === 'display') {
    if (mark.bold && mark.italic) return { fontFamily: DISPLAY_BOLD_ITALIC };
    if (mark.bold) return { fontFamily: DISPLAY_BOLD };
    if (mark.italic) return { fontFamily: DISPLAY_ITALIC };
    return {};
  }
  const style: TextStyle = {};
  if (mark.bold) style.fontWeight = '700';
  if (mark.italic) style.fontStyle = 'italic';
  return style;
}

function defaultLinkPress(href: string) {
  void Linking.openURL(href);
}

export function RichText({
  children,
  font = 'sans',
  className,
  style,
  numberOfLines,
  onLinkPress = defaultLinkPress,
}: {
  // Source markdown inline. Une chaîne brute (sans marque) reste valide.
  children: string;
  // « sans » = corps de texte (police système, marques natives). « display »
  // = titres en DM Sans (bascule de famille pour gras/italique).
  font?: 'sans' | 'display';
  className?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  onLinkPress?: (href: string) => void;
}) {
  const runs = parseInline(children ?? '');
  return (
    <Text className={className} style={style} numberOfLines={numberOfLines}>
      {runs.map((run, i) =>
        run.mark.href ? (
          <Text
            key={i}
            onPress={() => onLinkPress(run.mark.href!)}
            style={[markStyle(run.mark, font), { textDecorationLine: 'underline' }]}
          >
            {run.text}
          </Text>
        ) : (
          <Text key={i} style={markStyle(run.mark, font)}>
            {run.text}
          </Text>
        ),
      )}
    </Text>
  );
}
