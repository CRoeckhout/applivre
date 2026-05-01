import { SheetSurface } from '@/components/sheet-surface';
import { hexWithAlpha } from '@/lib/sheet-appearance';
import { FONTS } from '@/lib/theme/fonts';
import type { SheetAppearance } from '@/types/book';
import { BINGO_CELLS, BINGO_SIZE, type BingoItem } from '@/types/bingo';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

// En dessous de cette largeur la grille est rendue compacte : labels cachés
// (illisibles à cette taille — ex. thumbnails de la liste des bingos).
const COMPACT_WIDTH_THRESHOLD = 150;

export type BingoGridCellState = {
  index: number;
  item?: BingoItem;
  completed: boolean; // au moins une completion sur cette case
  isRead: boolean; // livre placé et status = 'read'
};

type Props = {
  items: BingoItem[];
  // Indices de cellules avec un livre placé.
  completedCells?: Set<number>;
  // Indices de cellules avec livre en status 'read' (cellule gagnée visuellement).
  readCells?: Set<number>;
  // Indices faisant partie d'une ligne gagnante (highlight renforcé).
  winLineCells?: Set<number>;
  onCellPress?: (index: number, item: BingoItem | undefined) => void;
  renderBadge?: (state: BingoGridCellState) => ReactNode;
  // Rendu derrière le label de la case (ex: couverture du livre placé).
  renderBackground?: (state: BingoGridCellState) => ReactNode;
  highlightSelectedIndex?: number;
  // Mise en évidence d'une case cible pendant un drag.
  hoveredIndex?: number | null;
  // Case source du drag — atténuée visuellement (le contenu est porté par
  // une preview suivant le doigt).
  dragSourceIndex?: number | null;
  // Layout de chaque case relatif au container de la grille — utilisé
  // pour le hit-testing du drag&drop côté parent.
  onCellLayout?: (
    index: number,
    layout: { x: number; y: number; width: number; height: number },
  ) => void;
  // Snapshot de l'appearance de la grille. Si fourni, le wrapper et les cellules
  // utilisent les couleurs / le cadre / la police snapshotés au lieu du thème app.
  appearance?: SheetAppearance;
  // Surcharges de tokens forwardées au `SheetSurface` interne. Permet au parent
  // de remapper les tokens "fond" du cadre SVG vers la couleur d'environnement
  // immédiate (ex: home/liste où la grille est posée dans une card distincte
  // du `appearance.bgColor` snapshoté). Sans, le cadre se fond avec son propre
  // bgColor — ce qui peut détonner avec l'entourage réel.
  tokenOverrides?: Record<string, string>;
};

export function BingoGrid({
  items,
  completedCells,
  readCells,
  winLineCells,
  onCellPress,
  renderBadge,
  renderBackground,
  highlightSelectedIndex,
  hoveredIndex,
  dragSourceIndex,
  onCellLayout,
  appearance,
  tokenOverrides,
}: Props) {
  const byIndex = new Map<number, BingoItem>();
  for (const it of items) byIndex.set(it.position, it);

  const [compact, setCompact] = useState(false);
  const rowYsRef = useRef<number[]>([]);
  const cellLocalRef = useRef(
    new Map<number, { x: number; y: number; width: number; height: number }>(),
  );

  const reportCell = useCallback(
    (index: number) => {
      if (!onCellLayout) return;
      const r = Math.floor(index / BINGO_SIZE);
      const local = cellLocalRef.current.get(index);
      const rowY = rowYsRef.current[r];
      if (!local || rowY == null) return;
      onCellLayout(index, {
        x: local.x,
        y: rowY + local.y,
        width: local.width,
        height: local.height,
      });
    },
    [onCellLayout],
  );

  const fontFamily = useMemo(() => {
    if (!appearance) return undefined;
    const f = FONTS.find((x) => x.id === appearance.fontId) ?? FONTS[0];
    return f.variants.display;
  }, [appearance]);

  const renderRows = (
    <View
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        const next = w > 0 && w < COMPACT_WIDTH_THRESHOLD;
        if (next !== compact) setCompact(next);
      }}>
      {Array.from({ length: BINGO_SIZE }).map((_, r) => (
        <View
          key={r}
          className="flex-row"
          onLayout={(e) => {
            rowYsRef.current[r] = e.nativeEvent.layout.y;
            for (let c = 0; c < BINGO_SIZE; c++) reportCell(r * BINGO_SIZE + c);
          }}>
          {Array.from({ length: BINGO_SIZE }).map((_, c) => {
            const index = r * BINGO_SIZE + c;
            const item = byIndex.get(index);
            const completed = completedCells?.has(index) ?? false;
            const isRead = readCells?.has(index) ?? false;
            const isWin = winLineCells?.has(index) ?? false;
            const isSelected = highlightSelectedIndex === index;
            const isHovered = hoveredIndex === index;
            const isDragSource = dragSourceIndex === index;

            // Style appearance vs fallback Tailwind.
            let cellStyle: object;
            let textStyle: object;
            if (appearance) {
              const { bgColor, textColor, mutedColor, accentColor } = appearance;
              const cellBg = isHovered
                ? hexWithAlpha(accentColor, 0.3)
                : isRead
                  ? hexWithAlpha(accentColor, 0.5)
                  : isSelected
                    ? hexWithAlpha(accentColor, 0.2)
                    : item
                      ? bgColor
                      : hexWithAlpha(mutedColor, 0.12);
              const cellBorderColor = isHovered || isRead
                ? accentColor
                : isSelected
                  ? accentColor
                  : hexWithAlpha(mutedColor, 0.25);
              cellStyle = {
                backgroundColor: cellBg,
                borderColor: cellBorderColor,
              };
              textStyle = {
                color: textColor,
                fontFamily,
                fontWeight: '700',
                textShadowColor: hexWithAlpha(bgColor, 0.9),
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 3,
              };
            } else {
              cellStyle = {};
              textStyle = {
                fontWeight: '700',
                textShadowColor: 'rgba(255,255,255,0.9)',
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 3,
              };
            }

            const fallbackBg = isHovered
              ? 'bg-accent/30'
              : isRead
                ? 'bg-accent-pale'
                : isSelected
                  ? 'bg-accent/20'
                  : item
                    ? 'bg-paper'
                    : 'bg-paper-shade';
            const fallbackBorder = isHovered
              ? 'border-accent-deep'
              : isRead
                ? 'border-accent-deep'
                : isSelected
                  ? 'border-accent'
                  : 'border-paper-shade';

            return (
              <Pressable
                key={c}
                onPress={() => onCellPress?.(index, item)}
                onLayout={
                  onCellLayout
                    ? (e) => {
                        cellLocalRef.current.set(index, e.nativeEvent.layout);
                        reportCell(index);
                      }
                    : undefined
                }
                disabled={!onCellPress}
                style={{
                  aspectRatio: compact ? 1 : 2 / 3,
                  flex: 1,
                  margin: 2,
                  borderWidth: isRead || isSelected || isHovered ? 2 : 1,
                  borderRadius: 8,
                  padding: 4,
                  opacity: isDragSource ? 0.25 : 1,
                  ...cellStyle,
                }}
                className={
                  appearance
                    ? 'items-center justify-center active:opacity-70'
                    : `${fallbackBg} ${fallbackBorder} items-center justify-center active:opacity-70`
                }>
                {renderBackground
                  ? renderBackground({ index, item, completed, isRead })
                  : null}
                {!compact && (
                  <Text
                    numberOfLines={4}
                    adjustsFontSizeToFit
                    style={textStyle}
                    className={
                      appearance
                        ? 'text-center text-xs'
                        : `text-center text-xs ${
                            isRead ? 'font-sans-med text-accent-deep' : 'text-ink'
                          }`
                    }>
                    {item ? item.label : ''}
                  </Text>
                )}
                {renderBadge
                  ? renderBadge({ index, item, completed, isRead })
                  : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );

  if (appearance) {
    return (
      <SheetSurface
        appearance={appearance}
        padding={8}
        tokenOverrides={tokenOverrides}>
        {renderRows}
      </SheetSurface>
    );
  }

  return <View className="rounded-2xl bg-paper-warm p-2">{renderRows}</View>;
}

export { BINGO_CELLS };
