import { isLikelyIsbn, toIsbn10 } from '@/lib/isbn';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, type ImageStyle, type StyleProp } from 'react-native';

type Props = {
  isbn: string;
  coverUrl?: string;
  style?: StyleProp<ImageStyle>;
  placeholderText?: string;
  contentFit?: 'cover' | 'contain';
  transition?: number;
};

// Seuil en-dessous duquel on considère une image comme un placeholder
// (OL et Amazon renvoient souvent une tuile 1×1 ou ~50×50 pour les ISBN inconnus).
const MIN_VALID_DIMENSION = 60;

function buildCandidates(isbn: string, primary?: string): string[] {
  const out: string[] = [];
  if (primary) out.push(primary);
  if (!isLikelyIsbn(isbn)) return out;

  const clean = isbn.replace(/[^0-9X]/gi, '');

  // Open Library par ISBN — filet gratuit, même si le JSON n'avait pas de cover_i
  const olIsbnUrl = `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg`;
  if (!primary?.includes('openlibrary.org')) out.push(olIsbnUrl);

  // Amazon via ISBN-10 (couverture maximale pour les livres commerciaux)
  const isbn10 = toIsbn10(clean);
  if (isbn10) {
    out.push(`https://images-na.ssl-images-amazon.com/images/P/${isbn10}.jpg`);
  }

  return out;
}

export function BookCover({
  isbn,
  coverUrl,
  style,
  placeholderText,
  contentFit = 'cover',
  transition = 200,
}: Props) {
  const candidates = useMemo(() => buildCandidates(isbn, coverUrl), [isbn, coverUrl]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  // Reset quand on change de livre
  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [isbn, coverUrl]);

  const tryNext = useCallback(() => {
    setIndex((prev) => {
      if (prev + 1 < candidates.length) return prev + 1;
      setFailed(true);
      return prev;
    });
  }, [candidates.length]);

  if (failed || candidates.length === 0) {
    return <CoverPlaceholder style={style} placeholderText={placeholderText} />;
  }

  return (
    <Image
      source={{ uri: candidates[index] }}
      style={style}
      contentFit={contentFit}
      transition={transition}
      onError={tryNext}
      onLoad={(e) => {
        const w = e?.source?.width ?? 0;
        const h = e?.source?.height ?? 0;
        if (w > 0 && h > 0 && (w < MIN_VALID_DIMENSION || h < MIN_VALID_DIMENSION)) {
          tryNext();
        }
      }}
    />
  );
}

// Fallback affiché à la place de l'image quand aucune cover n'est disponible
// ou que tous les candidats ont échoué. La taille d'icône suit la plus petite
// dimension mesurée du conteneur (utile quand `style` utilise des
// pourcentages, ex: case du bingo en `100%`).
function CoverPlaceholder({
  style,
  placeholderText,
}: {
  style?: StyleProp<ImageStyle>;
  placeholderText?: string;
}) {
  const flat = StyleSheet.flatten(style) as
    | { width?: number; height?: number }
    | undefined;
  const initial =
    typeof flat?.width === 'number' && typeof flat?.height === 'number'
      ? Math.min(flat.width, flat.height)
      : typeof flat?.width === 'number'
        ? flat.width
        : typeof flat?.height === 'number'
          ? flat.height
          : 0;
  const [minDim, setMinDim] = useState(initial);
  const iconSize = Math.max(16, Math.round((minDim || 48) * 0.45));
  return (
    <View
      style={style}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        const next = Math.min(width, height);
        if (Math.abs(next - minDim) > 1) setMinDim(next);
      }}
      className="items-center justify-center bg-paper-shade">
      <MaterialIcons name="menu-book" size={iconSize} color="#9a8f82" />
      {placeholderText ? (
        <Text className="mt-1 px-2 text-center text-xs text-ink-muted">{placeholderText}</Text>
      ) : null}
    </View>
  );
}
