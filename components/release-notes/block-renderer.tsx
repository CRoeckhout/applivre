import { RichText } from '@/components/rich-text';
import type { ReleaseNoteBlock } from '@/types/release-note';
import { Image, type ImageLoadEventData } from 'expo-image';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

// Rendu natif des blocs d'une release note. Chaque type a son composant ;
// le dispatcher choisit le bon en fonction de `block.type`. Le `body`
// parsé est defensive (cf. parseReleaseNoteBlocks) — on suppose ici que
// les blocs sont valides.

export function ReleaseNoteBlocks({ blocks }: { blocks: ReleaseNoteBlock[] }) {
  return (
    <View className="gap-3">
      {blocks.map((block, idx) => (
        <BlockItem key={idx} block={block} />
      ))}
    </View>
  );
}

function BlockItem({ block }: { block: ReleaseNoteBlock }) {
  switch (block.type) {
    case 'title':
      return <TitleBlock text={block.text} />;
    case 'text':
      return <TextBlock text={block.text} />;
    case 'quote':
      return <QuoteBlock text={block.text} />;
    case 'list':
      return <ListBlock items={block.items} />;
    case 'table':
      return <TableBlock headers={block.headers} rows={block.rows} />;
    case 'image':
      return <ImageBlock url={block.url} alt={block.alt} />;
  }
}

function TitleBlock({ text }: { text: string }) {
  return (
    <RichText font="display" className="font-display text-base text-ink">
      {text}
    </RichText>
  );
}

function TextBlock({ text }: { text: string }) {
  // Le contenu peut mêler paragraphes et titres markdown (#, ##) issus du
  // sélecteur de taille de l'admin. On rend ligne à ligne ; les lignes vides
  // (séparateurs de paragraphes markdown) sont ignorées.
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;
  return (
    <View className="gap-2">
      {lines.map((line, idx) => {
        const heading = line.match(/^(#{1,2})\s+(.*)$/);
        if (heading) {
          const big = heading[1].length === 1;
          return (
            <RichText
              key={idx}
              font="display"
              className={`font-display text-ink ${big ? 'text-xl' : 'text-lg'}`}
            >
              {heading[2]}
            </RichText>
          );
        }
        return (
          <RichText key={idx} className="text-sm text-ink" style={{ lineHeight: 20 }}>
            {line}
          </RichText>
        );
      })}
    </View>
  );
}

// Citation : barre verticale à gauche + texte en italique léger, sur fond
// papier chaud pour le distinguer du corps.
function QuoteBlock({ text }: { text: string }) {
  return (
    <View className="flex-row gap-3">
      <View style={{ width: 3, borderRadius: 2 }} className="bg-accent" />
      <RichText
        className="flex-1 text-sm italic text-ink-muted"
        style={{ lineHeight: 20 }}
      >
        {text}
      </RichText>
    </View>
  );
}

function ListBlock({ items }: { items: string[] }) {
  return (
    <View className="gap-1.5">
      {items.map((item, idx) => (
        <View key={idx} className="flex-row items-start gap-2">
          <View
            style={{
              marginTop: 8,
              width: 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: '#f59e0b',
            }}
          />
          <RichText className="flex-1 text-sm text-ink" style={{ lineHeight: 20 }}>
            {item}
          </RichText>
        </View>
      ))}
    </View>
  );
}

// Tableau scrollable horizontalement : sur mobile, des cellules de
// largeur fixe (~120 px) sont plus lisibles qu'une grille auto-fit qui
// finirait par squeezer le texte.
const TABLE_CELL_WIDTH = 120;

function TableBlock({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View className="rounded-xl border border-ink/10 overflow-hidden">
        <View className="flex-row bg-paper-warm">
          {headers.map((h, idx) => (
            <View
              key={idx}
              style={{ width: TABLE_CELL_WIDTH, padding: 8 }}
              className={idx > 0 ? 'border-l border-ink/10' : undefined}>
              <Text className="font-sans-med text-xs text-ink">{h}</Text>
            </View>
          ))}
        </View>
        {rows.map((row, rowIdx) => (
          <View
            key={rowIdx}
            className={`flex-row ${rowIdx > 0 ? 'border-t border-ink/10' : ''}`}>
            {row.map((cell, cellIdx) => (
              <View
                key={cellIdx}
                style={{ width: TABLE_CELL_WIDTH, padding: 8 }}
                className={cellIdx > 0 ? 'border-l border-ink/10' : undefined}>
                <Text className="text-xs text-ink" style={{ lineHeight: 16 }}>
                  {cell}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function ImageBlock({ url, alt }: { url: string; alt?: string }) {
  // Garde le ratio natif de l'image (screenshot mobile portrait, GIF carré,
  // illustration paysage…). Tant qu'`onLoad` n'a pas répondu, on affiche un
  // placeholder 16/9 pour réserver l'espace et éviter un saut de layout.
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  const handleLoad = (event: ImageLoadEventData) => {
    const { width, height } = event.source;
    if (width > 0 && height > 0) {
      setAspectRatio(width / height);
    }
  };

  return (
    <Image
      source={{ uri: url }}
      style={{
        width: '100%',
        aspectRatio: aspectRatio ?? 16 / 9,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.04)',
      }}
      contentFit="contain"
      onLoad={handleLoad}
      accessibilityLabel={alt}
    />
  );
}
