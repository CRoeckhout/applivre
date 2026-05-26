import {
  Canvas,
  Group,
  Image as SkiaImage,
  ImageSVG,
  Skia,
  rect as skRect,
  useImage,
  type SkSVG,
} from '@shopify/react-native-skia';
import { ReactNode, useMemo } from 'react';
import type {
  BorderBandMode,
  BorderRepeatMode,
  BorderSliceExtras,
} from '../lib/types';

// SkiaBorderPreview : preview pixel-perfect de la grille N-slice dans le BO,
// utilisant exactement le même rendering Skia que l'app mobile. Garantit le
// 1:1 visuel entre le rendu du BO et celui sur device, fini le drift que
// donnait l'ancienne preview JS basée sur <img> + clipping CSS.
//
// Les fonctions math (buildBoundaries, distributeBands, computeTransform,
// per-row distribution + corner forcing) sont copiées de
// components/nine-slice-frame.tsx côté app pour rester en sync.

type Insets = { top: number; right: number; bottom: number; left: number };

type Props = {
  // Source URI (PNG http(s)://...) ou SVG xml inline. Au moins l'un des deux.
  src: string;
  isSvg: boolean;
  imageWidth: number;
  imageHeight: number;
  sliceTop: number;
  sliceRight: number;
  sliceBottom: number;
  sliceLeft: number;
  // bgInsets : zone du bg "rouge" qui matche `innerBackgroundColor` mobile.
  bgInsetTop: number;
  bgInsetRight: number;
  bgInsetBottom: number;
  bgInsetLeft: number;
  repeatMode: BorderRepeatMode;
  // sliceExtras : si défini ⇒ N-slice manuel (cuts + per-cell modes).
  // Sinon ⇒ 9-slice classique dérivé du slice T/R/B/L + repeatMode.
  extras?: BorderSliceExtras;
  outerWidth: number;
  outerHeight: number;
};

function buildBoundaries(total: number, cuts: number[]): number[] {
  const set = new Set<number>([0, total]);
  for (const c of cuts) {
    if (Number.isFinite(c)) {
      const v = Math.max(0, Math.min(total, Math.round(c)));
      set.add(v);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

export type SliceInsets = Insets;

export function deriveDefault9Slice(
  iw: number,
  ih: number,
  slice: Insets,
  repeat: BorderRepeatMode,
): BorderSliceExtras {
  const cutsX: number[] = [];
  if (slice.left > 0) cutsX.push(slice.left);
  if (slice.right > 0 && iw - slice.right !== slice.left) cutsX.push(iw - slice.right);
  const cutsY: number[] = [];
  if (slice.top > 0) cutsY.push(slice.top);
  if (slice.bottom > 0 && ih - slice.bottom !== slice.top) cutsY.push(ih - slice.bottom);
  const xs = buildBoundaries(iw, cutsX);
  const ys = buildBoundaries(ih, cutsY);
  const cols = xs.length - 1;
  const rows = ys.length - 1;
  const lastCol = cols - 1;
  const lastRow = rows - 1;
  const modes: BorderBandMode[][] = [];
  for (let j = 0; j < rows; j += 1) {
    const row: BorderBandMode[] = [];
    for (let i = 0; i < cols; i += 1) {
      const isCorner = (i === 0 || i === lastCol) && (j === 0 || j === lastRow);
      row.push(isCorner ? 'fixed' : repeat);
    }
    modes.push(row);
  }
  return { cutsX, cutsY, modes };
}

function rowHasFixedMode(modes: BorderBandMode[][], row: number): boolean {
  return modes[row]?.some((m) => m === 'fixed') ?? false;
}

function distributeBands(
  bands: { size: number; fixed: boolean }[],
  total: number,
): number[] {
  let fixedTotal = 0;
  let flexSourceTotal = 0;
  for (const b of bands) {
    if (b.fixed) fixedTotal += b.size;
    else flexSourceTotal += b.size;
  }
  const remaining = Math.max(0, total - fixedTotal);
  return bands.map((b) => {
    if (b.fixed) return b.size;
    return flexSourceTotal > 0 ? (b.size / flexSourceTotal) * remaining : 0;
  });
}

function cumulative(sizes: number[]): number[] {
  const pos: number[] = [];
  let acc = 0;
  for (const s of sizes) {
    pos.push(acc);
    acc += s;
  }
  return pos;
}

type CellSpec = {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  xMode: BorderBandMode;
  yMode: BorderBandMode;
};

function computeTransform(cell: CellSpec) {
  const treatXAsFixed = cell.xMode === 'fixed' && Math.abs(cell.width - cell.sw) > 0.5;
  const treatYAsFixed = cell.yMode === 'fixed' && Math.abs(cell.height - cell.sh) > 0.5;
  const scaleX = treatXAsFixed ? 1 : cell.width / cell.sw;
  const scaleY = treatYAsFixed ? 1 : cell.height / cell.sh;
  return {
    translateX: cell.left - cell.sx * scaleX,
    translateY: cell.top - cell.sy * scaleY,
    scaleX,
    scaleY,
  };
}

// Taille intrinsèque d'un SVG lue sur son XML (viewBox d'abord — souvent
// fractionnaire dans les exports Illustrator —, puis width/height absolus).
// Déterministe et cross-platform, contrairement à `skSvg.width()/height()`.
// Idem nine-slice-frame-impl.tsx côté app.
function parseSvgIntrinsicSize(
  svgXml: string | null | undefined,
): { w: number; h: number } | null {
  if (!svgXml) return null;
  const head = svgXml.slice(0, 1000);
  const vb = head.match(
    /viewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([-\d.]+)[ ,]+([-\d.]+)/i,
  );
  if (vb) {
    const w = Number.parseFloat(vb[1]);
    const h = Number.parseFloat(vb[2]);
    if (w > 0 && h > 0) return { w, h };
  }
  const wm = head.match(/\bwidth\s*=\s*["']\s*([\d.]+)(px)?\s*["']/i);
  const hm = head.match(/\bheight\s*=\s*["']\s*([\d.]+)(px)?\s*["']/i);
  if (wm && hm) {
    const w = Number.parseFloat(wm[1]);
    const h = Number.parseFloat(hm[1]);
    if (w > 0 && h > 0) return { w, h };
  }
  return null;
}

export function SkiaBorderPreview({
  src,
  isSvg,
  imageWidth: iw,
  imageHeight: ih,
  sliceTop,
  sliceRight,
  sliceBottom,
  sliceLeft,
  bgInsetTop,
  bgInsetRight,
  bgInsetBottom,
  bgInsetLeft,
  repeatMode,
  extras,
  outerWidth,
  outerHeight,
}: Props) {
  const slice = useMemo<Insets>(
    () => ({ top: sliceTop, right: sliceRight, bottom: sliceBottom, left: sliceLeft }),
    [sliceTop, sliceRight, sliceBottom, sliceLeft],
  );

  // Source : PNG via useImage(uri), SVG via Skia.SVG.MakeFromString.
  // Skia.SVG.MakeFromString ne fonctionne qu'après que CanvasKit-WASM soit
  // chargé (cf. main.tsx). Tant que pas chargé, retourne null et la preview
  // skip le rendu.
  const skImage = useImage(!isSvg ? src : null);
  const skSvg = useMemo<SkSVG | null>(() => {
    if (!isSvg || !src) return null;
    if (typeof Skia === 'undefined' || !Skia.SVG) return null;
    // src est une data URI `data:image/svg+xml;utf8,...` — on extrait le XML
    // et on le passe à MakeFromString.
    const decoded = decodeDataUriSvg(src);
    if (!decoded) return null;
    return Skia.SVG.MakeFromString(decoded);
  }, [isSvg, src]);
  const svgIntrinsic = useMemo(
    () => (isSvg && src ? parseSvgIntrinsicSize(decodeDataUriSvg(src)) : null),
    [isSvg, src],
  );

  const grid = useMemo<BorderSliceExtras>(() => {
    return extras ?? deriveDefault9Slice(iw, ih, slice, repeatMode);
  }, [extras, iw, ih, slice, repeatMode]);

  const xs = useMemo(() => buildBoundaries(iw, grid.cutsX), [iw, grid.cutsX]);
  const ys = useMemo(() => buildBoundaries(ih, grid.cutsY), [ih, grid.cutsY]);

  // Layout : Y partagé global ; X distribué par row (per-row distribution).
  // 4 corners forcés fixed, top/bottom rows forcées fixed-height, left/right
  // cols forcées fixed-width dans chaque row.
  const layout = useMemo(() => {
    if (outerWidth <= 0 || outerHeight <= 0) return null;
    const colsCount = xs.length - 1;
    const rowsCount = ys.length - 1;
    if (colsCount <= 0 || rowsCount <= 0) return null;
    const lastCol = colsCount - 1;
    const lastRow = rowsCount - 1;
    const rowBands = Array.from({ length: rowsCount }, (_, j) => ({
      size: ys[j + 1] - ys[j],
      fixed: j === 0 || j === lastRow ? true : rowHasFixedMode(grid.modes, j),
    }));
    const rowSizes = distributeBands(rowBands, outerHeight);
    const rowPos = cumulative(rowSizes);
    const colSizesPerRow: number[][] = [];
    const colPosPerRow: number[][] = [];
    for (let j = 0; j < rowsCount; j += 1) {
      const colBands = Array.from({ length: colsCount }, (_, i) => ({
        size: xs[i + 1] - xs[i],
        fixed:
          i === 0 || i === lastCol
            ? true
            : grid.modes[j]?.[i] === 'fixed',
      }));
      const colSizes = distributeBands(colBands, outerWidth);
      colSizesPerRow.push(colSizes);
      colPosPerRow.push(cumulative(colSizes));
    }
    return { rowSizes, rowPos, colSizesPerRow, colPosPerRow, colsCount, rowsCount };
  }, [outerWidth, outerHeight, xs, ys, grid.modes]);

  const cellSpecs = useMemo<CellSpec[] | null>(() => {
    if (!layout) return null;
    const { rowSizes, rowPos, colSizesPerRow, colPosPerRow, colsCount, rowsCount } = layout;
    const lastRow = rowsCount - 1;
    const out: CellSpec[] = [];
    for (let j = 0; j < rowsCount; j += 1) {
      const sh = ys[j + 1] - ys[j];
      const cellH = rowSizes[j];
      if (sh <= 0 || cellH <= 0) continue;
      const rowFixed =
        j === 0 || j === lastRow || rowHasFixedMode(grid.modes, j);
      const colSizes = colSizesPerRow[j];
      const colPos = colPosPerRow[j];
      for (let i = 0; i < colsCount; i += 1) {
        const sw = xs[i + 1] - xs[i];
        const cellW = colSizes[i];
        if (sw <= 0 || cellW <= 0) continue;
        const cellMode = grid.modes[j]?.[i] ?? repeatMode;
        out.push({
          key: `${j}-${i}`,
          left: colPos[i],
          top: rowPos[j],
          width: cellW,
          height: cellH,
          sx: xs[i],
          sy: ys[j],
          sw,
          sh,
          xMode: cellMode,
          yMode: rowFixed ? 'fixed' : cellMode,
        });
      }
    }
    return out;
  }, [layout, xs, ys, grid.modes, repeatMode]);

  const drawNodes = useMemo<ReactNode>(() => {
    if (!cellSpecs) return null;
    if (!skImage && !skSvg) return null;
    // Le SVG est dessiné à sa taille intrinsèque (viewBox) puis scalé pour
    // remplir (0,0,iw,ih) — espace de coords des slices/cuts. `drawSvg` ne
    // scale pas le SVG vers w×h sur web (no-op), donc un viewBox fractionnaire
    // (export Illustrator) plus petit que l'imageSize laisserait les bords
    // bas/droit non peints. Idem nine-slice-frame-impl.tsx côté app.
    const svgW = svgIntrinsic?.w ?? ((skSvg && skSvg.width()) || iw);
    const svgH = svgIntrinsic?.h ?? ((skSvg && skSvg.height()) || ih);
    const renderSourceAtNative = (key: string) =>
      skImage ? (
        <SkiaImage
          key={key}
          image={skImage}
          fit="fill"
          x={0}
          y={0}
          width={iw}
          height={ih}
        />
      ) : (
        <Group key={key} transform={[{ scaleX: iw / svgW }, { scaleY: ih / svgH }]}>
          <ImageSVG svg={skSvg} x={0} y={0} width={svgW} height={svgH} />
        </Group>
      );

    return cellSpecs.map((cell) => {
      const tileX = cell.xMode === 'round';
      const tileY = cell.yMode === 'round';
      const clip = skRect(cell.left, cell.top, cell.width, cell.height);

      if (tileX || tileY) {
        // Mode round : clip rect par tile (pas seulement par cell), sinon
        // l'overshoot de la source entière débordée par le transform pollue
        // les tiles voisins. Cf. nine-slice-frame-impl.tsx pour la même
        // logique côté app.
        const nx = tileX ? Math.max(1, Math.round(cell.width / cell.sw)) : 1;
        const ny = tileY ? Math.max(1, Math.round(cell.height / cell.sh)) : 1;
        const tileW = cell.width / nx;
        const tileH = cell.height / ny;
        const tiles: ReactNode[] = [];
        for (let ty = 0; ty < ny; ty += 1) {
          for (let tx = 0; tx < nx; tx += 1) {
            const tileLeft = cell.left + tx * tileW;
            const tileTop = cell.top + ty * tileH;
            const t = computeTransform({
              ...cell,
              left: tileLeft,
              top: tileTop,
              width: tileW,
              height: tileH,
            });
            const tileClip = skRect(tileLeft, tileTop, tileW, tileH);
            tiles.push(
              <Group key={`${ty}-${tx}`} clip={tileClip}>
                <Group
                  transform={[
                    { translateX: t.translateX },
                    { translateY: t.translateY },
                    { scaleX: t.scaleX },
                    { scaleY: t.scaleY },
                  ]}>
                  {renderSourceAtNative(`tile-${ty}-${tx}`)}
                </Group>
              </Group>,
            );
          }
        }
        return <Group key={cell.key}>{tiles}</Group>;
      }

      const t = computeTransform(cell);
      return (
        <Group key={cell.key} clip={clip}>
          <Group
            transform={[
              { translateX: t.translateX },
              { translateY: t.translateY },
              { scaleX: t.scaleX },
              { scaleY: t.scaleY },
            ]}>
            {renderSourceAtNative('cell')}
          </Group>
        </Group>
      );
    });
  }, [cellSpecs, skImage, skSvg, svgIntrinsic, iw, ih]);

  return (
    <div style={{ position: 'relative', width: outerWidth, height: outerHeight }}>
      {/* Bg "rouge" matchant la zone innerBackgroundColor de l'app : permet
          de visualiser où la couleur de fond serait peinte par la card. */}
      <div
        style={{
          position: 'absolute',
          top: bgInsetTop,
          right: bgInsetRight,
          bottom: bgInsetBottom,
          left: bgInsetLeft,
          backgroundColor: '#ff0000',
        }}
      />
      <Canvas style={{ position: 'absolute', inset: 0, width: outerWidth, height: outerHeight }}>
        {drawNodes}
      </Canvas>
    </div>
  );
}

// Décode une data URI `data:image/svg+xml;utf8,…` en string XML brute.
// Le BO sérialise les SVG ainsi pour les passer à <img src=…>.
function decodeDataUriSvg(uri: string): string | null {
  const prefix = 'data:image/svg+xml;utf8,';
  if (!uri.startsWith(prefix)) {
    // Variante percent-encoded : `data:image/svg+xml;…,%3csvg…`
    const m = uri.match(/^data:image\/svg\+xml(?:;[^,]*)?,(.*)$/);
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  try {
    return decodeURIComponent(uri.slice(prefix.length));
  } catch {
    return uri.slice(prefix.length);
  }
}
