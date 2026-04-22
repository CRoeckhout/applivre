import { isLikelyIsbn, toIsbn10 } from '@/lib/isbn';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View, type ImageStyle, type StyleProp } from 'react-native';

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
    return (
      <View
        style={style}
        className="items-center justify-center bg-paper-shade">
        {placeholderText ? (
          <Text className="px-2 text-center text-xs text-ink-muted">{placeholderText}</Text>
        ) : null}
      </View>
    );
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
