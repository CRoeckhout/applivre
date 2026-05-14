import type { ReleaseNoteBlock } from '@/types/release-note';
import { Image } from 'expo-image';
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
    case 'list':
      return <ListBlock items={block.items} />;
    case 'table':
      return <TableBlock headers={block.headers} rows={block.rows} />;
    case 'image':
      return <ImageBlock url={block.url} alt={block.alt} />;
  }
}

function TitleBlock({ text }: { text: string }) {
  return <Text className="font-display text-base text-ink">{text}</Text>;
}

function TextBlock({ text }: { text: string }) {
  return (
    <Text className="text-sm text-ink" style={{ lineHeight: 20 }}>
      {text}
    </Text>
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
          <Text className="flex-1 text-sm text-ink" style={{ lineHeight: 20 }}>
            {item}
          </Text>
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
  return (
    <View className="gap-1">
      <Image
        source={{ uri: url }}
        style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12 }}
        contentFit="cover"
        accessibilityLabel={alt}
      />
      {alt ? (
        <Text className="text-xs text-ink-muted" style={{ textAlign: 'center' }}>
          {alt}
        </Text>
      ) : null}
    </View>
  );
}
