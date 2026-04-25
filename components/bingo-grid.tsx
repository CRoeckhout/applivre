import { BINGO_CELLS, BINGO_SIZE, type BingoItem } from '@/types/bingo';
import { type ReactNode, useCallback, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';

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
  highlightSelectedIndex?: number;
  // Mise en évidence d'une case cible pendant un drag.
  hoveredIndex?: number | null;
  // Layout de chaque case relatif au container de la grille — utilisé
  // pour le hit-testing du drag&drop côté parent.
  onCellLayout?: (
    index: number,
    layout: { x: number; y: number; width: number; height: number },
  ) => void;
};

export function BingoGrid({
  items,
  completedCells,
  readCells,
  winLineCells,
  onCellPress,
  renderBadge,
  highlightSelectedIndex,
  hoveredIndex,
  onCellLayout,
}: Props) {
  const byIndex = new Map<number, BingoItem>();
  for (const it of items) byIndex.set(it.position, it);

  // `onLayout` retourne des coords relatives au parent direct. Comme chaque
  // cellule est imbriquée dans une row, son y est ~0 dans la row. On combine
  // donc rowY (mesurée sur la row) + cellLocal pour reporter un layout
  // cohérent (relatif au container de la grille) au parent.
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

  return (
    <View className="rounded-2xl bg-paper-warm p-2">
      {Array.from({ length: BINGO_SIZE }).map((_, r) => (
        <View
          key={r}
          className="flex-row"
          onLayout={(e) => {
            rowYsRef.current[r] = e.nativeEvent.layout.y;
            // Une row peut être mesurée après ses cellules → re-report.
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

            const bg = isHovered
              ? 'bg-accent/30'
              : isRead
                ? 'bg-accent-pale'
                : isSelected
                  ? 'bg-accent/20'
                  : item
                    ? 'bg-paper'
                    : 'bg-paper-shade';
            const border = isHovered
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
                  aspectRatio: 1,
                  flex: 1,
                  margin: 2,
                  borderWidth: isRead || isSelected || isHovered ? 2 : 1,
                  borderRadius: 8,
                  padding: 4,
                  opacity: isWin ? 1 : 1,
                }}
                className={`${bg} ${border} items-center justify-center active:opacity-70`}>
                <Text
                  numberOfLines={4}
                  adjustsFontSizeToFit
                  className={`text-center text-xs ${
                    isRead ? 'font-sans-med text-accent-deep' : 'text-ink'
                  }`}>
                  {item ? item.label : ''}
                </Text>
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
}

export { BINGO_CELLS };
