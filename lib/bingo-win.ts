import { BINGO_SIZE } from '@/types/bingo';

// 12 lignes gagnantes sur une grille 5x5 : 5 lignes + 5 colonnes + 2 diagonales.
// Chaque ligne est un Set<number> d'indices 0..24.
function buildLines(): number[][] {
  const lines: number[][] = [];
  for (let r = 0; r < BINGO_SIZE; r++) {
    const row: number[] = [];
    for (let c = 0; c < BINGO_SIZE; c++) row.push(r * BINGO_SIZE + c);
    lines.push(row);
  }
  for (let c = 0; c < BINGO_SIZE; c++) {
    const col: number[] = [];
    for (let r = 0; r < BINGO_SIZE; r++) col.push(r * BINGO_SIZE + c);
    lines.push(col);
  }
  const diag1: number[] = [];
  const diag2: number[] = [];
  for (let i = 0; i < BINGO_SIZE; i++) {
    diag1.push(i * BINGO_SIZE + i);
    diag2.push(i * BINGO_SIZE + (BINGO_SIZE - 1 - i));
  }
  lines.push(diag1, diag2);
  return lines;
}

const WIN_LINES = buildLines();

export function completedLines(readCells: Set<number>): number[][] {
  return WIN_LINES.filter((line) => line.every((i) => readCells.has(i)));
}

export function countCompletedLines(readCells: Set<number>): number {
  return completedLines(readCells).length;
}

export function hasAnyWin(readCells: Set<number>): boolean {
  return WIN_LINES.some((line) => line.every((i) => readCells.has(i)));
}
