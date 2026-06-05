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
import { ReactNode, useCallback, useMemo, useState } from 'react';
import {
  ImageSourcePropType,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import type {
  BorderBandMode,
  BorderSliceExtras,
} from '@/lib/borders/catalog';
import { useSkiaCachedUri } from '@/lib/skia-image-cache';

type Insets = { top: number; right: number; bottom: number; left: number };

// Rentré (dp) appliqué au bord bas/droit d'un fond IMAGE pleine-couverture,
// pour qu'il ne dépasse pas sous le contour anti-aliasé du cadre. Cf. usage.
const FOND_EDGE_INSET = 1;

export type RepeatMode = 'stretch' | 'round';

type Props = {
  source?: ImageSourcePropType;
  svgXml?: string;
  imageSize: { width: number; height: number };
  slice: Insets;
  padding?: Insets;
  fillCenter?: boolean;
  innerBackgroundColor?: string;
  innerBackground?: ReactNode;
  innerBackgroundCover?: 'insets' | 'full';
  bgInsets?: Insets;
  repeat?: RepeatMode;
  sliceExtras?: BorderSliceExtras;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

// ─── Layout helpers ────────────────────────────────────────────────

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

function deriveDefault9Slice(
  iw: number,
  ih: number,
  slice: Insets,
  repeat: RepeatMode,
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

// ─── Skia rendering ────────────────────────────────────────────────
//
// Architecture : un seul `<Canvas>` natif par frame. Toutes les cells sont
// drawn dedans via `<Group clip>` + `<Image>` ou `<ImageSVG>`. Le source
// (PNG ou SVG) est chargé/parsé une seule fois et partagé entre toutes
// les cells. Pour 50 cells, 1 native view au lieu de 50, et 50 draw calls
// GPU batchés au lieu de 50 native ImageView/SvgXml créées via le bridge.

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

// Calcule la transform 2D (translate + scale) à appliquer au draw natif
// (0,0,iw,ih) de la source pour que (sx,sy,sw,sh) apparaisse exactement à
// (left,top,width,height). Plus stable que de positionner directement
// l'<Image>/<ImageSVG> avec des coordonnées négatives, qui semble poser
// problème à Skia v2 sur les SVG (clipping et rendering pas fiables).
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

// Taille intrinsèque d'un SVG, lue depuis son XML. On parse d'abord le
// `viewBox` (les exports Illustrator n'ont qu'un viewBox, souvent fractionnaire
// ex. `0 0 197.22 98.12`), puis les attributs width/height numériques en
// fallback. Source DÉTERMINISTE et cross-platform : `skSvg.width()/height()`
// peut renvoyer 0 sur Skia natif quand le <svg> n'a pas d'attributs width/
// height — on ne s'y fie donc qu'en dernier recours. Sert à scaler le SVG pour
// remplir exactement l'imageSize déclarée (cf. drawNodes).
function parseSvgIntrinsicSize(
  svgXml: string | undefined,
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
  // width/height seulement s'ils sont en unités absolues (pas `%`).
  const wm = head.match(/\bwidth\s*=\s*["']\s*([\d.]+)(px)?\s*["']/i);
  const hm = head.match(/\bheight\s*=\s*["']\s*([\d.]+)(px)?\s*["']/i);
  if (wm && hm) {
    const w = Number.parseFloat(wm[1]);
    const h = Number.parseFloat(hm[1]);
    if (w > 0 && h > 0) return { w, h };
  }
  return null;
}

// NineSliceFrame : grille N-slice rendue dans un canvas Skia unique. Layout
// math identique au 9-slice classique, rendering accéléré GPU. Une seule
// native view par frame ; les cells sont des draw calls dans le canvas.
// Sur web, fonctionne via CanvasKit-WASM chargé au boot par RootLayout
// (cf. app/_layout.tsx, useSkiaWebReady). Sur native, utilise la lib Skia
// linkée nativement via JSI.
export function NineSliceFrame({
  source,
  svgXml,
  imageSize,
  slice,
  padding,
  fillCenter = true,
  innerBackgroundColor,
  innerBackground,
  innerBackgroundCover = 'insets',
  bgInsets,
  repeat = 'stretch',
  sliceExtras,
  style,
  children,
}: Props) {
  const { width: iw, height: ih } = imageSize;
  const { top: T, right: R, bottom: B, left: L } = slice;
  const pad = padding ?? slice;
  const bgi = bgInsets ?? {
    top: Math.round(T / 2),
    right: Math.round(R / 2),
    bottom: Math.round(B / 2),
    left: Math.round(L / 2),
  };

  // Source : PNG via useImage(uri ou number), SVG via Skia.SVG.MakeFromString.
  // Loaded une fois ici, partagé pour toutes les cells dans le canvas.
  const skSource = useMemo<string | number | null>(() => {
    if (!source) return null;
    if (typeof source === 'number') return source;
    if (typeof source === 'object' && 'uri' in source && typeof source.uri === 'string') {
      return source.uri;
    }
    return null;
  }, [source]);
  // Skia n'utilise pas le cache d'expo-image → on résout l'URL distante vers un
  // file:// local pour que la bordure reste rendable hors ligne.
  const cachedUri = useSkiaCachedUri(typeof skSource === 'string' ? skSource : null);
  const skImage = useImage(typeof skSource === 'number' ? skSource : cachedUri);
  const skSvg = useMemo<SkSVG | null>(() => {
    if (!svgXml) return null;
    return Skia.SVG.MakeFromString(svgXml);
  }, [svgXml]);
  // Dimensions intrinsèques du SVG (viewBox), lues sur le XML — déterministe
  // et indépendant de la plateforme. Sert à scaler le SVG pour qu'il remplisse
  // l'imageSize déclarée même si son viewBox diffère (cf. drawNodes).
  const svgIntrinsic = useMemo(() => parseSvgIntrinsicSize(svgXml), [svgXml]);

  const grid = useMemo<BorderSliceExtras>(() => {
    return sliceExtras ?? deriveDefault9Slice(iw, ih, slice, repeat);
  }, [sliceExtras, iw, ih, slice.top, slice.right, slice.bottom, slice.left, repeat]);

  const xs = useMemo(() => buildBoundaries(iw, grid.cutsX), [iw, grid.cutsX]);
  const ys = useMemo(() => buildBoundaries(ih, grid.cutsY), [ih, grid.cutsY]);

  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  const onFrameLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    // Arrondi au pixel SUPÉRIEUR : le canvas du cadre couvre alors toujours au
    // moins toute la box du contenu (hauteur presque toujours fractionnaire).
    // Indispensable pour les bg UNIS : sans ça le bord bas du cadre tombe sur
    // une frontière sous-pixel → anti-aliasing → liseré de la couleur de fond.
    const w = Math.ceil(width);
    const h = Math.ceil(height);
    setFrameSize((prev) => {
      if (prev && prev.w === w && prev.h === h) return prev;
      return { w, h };
    });
  }, []);

  // Layout : Y partagé (rowSizes/rowPos globaux) ; X distribué INDÉPENDAMMENT
  // par row, pour que les modes fixed d'une row n'imposent pas la largeur
  // des autres rows. Concrètement : si le top a un fixed à col i et le
  // bottom n'en a pas, le bottom traite col i comme stretch (flex-share)
  // au lieu d'être forcé à la source-width par le col forcing global.
  // Exception : les 4 corners du grid (cells aux 4 angles) sont toujours
  // forcés fixed à l'affichage — ce sont les "vrais" coins du frame, et
  // les laisser stretch déformerait l'ornement de coin. Idem pour la 1ʳᵉ
  // et dernière row qui sont forcées fixed-height (= les edges top/bottom).
  const layout = useMemo(() => {
    if (!frameSize || frameSize.w <= 0 || frameSize.h <= 0) return null;
    const colsCount = xs.length - 1;
    const rowsCount = ys.length - 1;
    if (colsCount <= 0 || rowsCount <= 0) return null;
    const lastCol = colsCount - 1;
    const lastRow = rowsCount - 1;
    // Y global. Les rows 0 et last sont toujours fixed-height (= edges
    // top/bottom). Les rows internes suivent le rule "any cell fixed".
    const rowBands = Array.from({ length: rowsCount }, (_, j) => ({
      size: ys[j + 1] - ys[j],
      fixed: j === 0 || j === lastRow ? true : rowHasFixedMode(grid.modes, j),
    }));
    const rowSizes = distributeBands(rowBands, frameSize.h);
    const rowPos = cumulative(rowSizes);
    // X per-row. Cols 0 et last forcés fixed dans CHAQUE row (= corners
    // du grid + side edges). Inner cols (1..last-1) suivent le mode de
    // la cell dans cette row.
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
      const colSizes = distributeBands(colBands, frameSize.w);
      colSizesPerRow.push(colSizes);
      colPosPerRow.push(cumulative(colSizes));
    }
    return { rowSizes, rowPos, colSizesPerRow, colPosPerRow, colsCount, rowsCount };
  }, [frameSize, xs, ys, grid.modes]);

  // Compute the cells specs (positions, modes) — JS only, pas de JSX ici.
  // Width/left lus par-row (colSizesPerRow), height/top globaux (rowSizes).
  // Cellules skippées (interior + non-fixed avec fillCenter=false) ne sont
  // pas dans la liste.
  const cellSpecs = useMemo<CellSpec[] | null>(() => {
    if (!layout) return null;
    const { rowSizes, rowPos, colSizesPerRow, colPosPerRow, colsCount, rowsCount } = layout;
    const lastRow = rowsCount - 1;
    const out: CellSpec[] = [];
    for (let j = 0; j < rowsCount; j += 1) {
      const sh = ys[j + 1] - ys[j];
      const cellH = rowSizes[j];
      if (sh <= 0 || cellH <= 0) continue;
      // Row forcée fixed si row 0/last (top/bottom edges) ou si une cell
      // de la row a mode='fixed'. yMode des cells suit cette logique.
      const rowFixed =
        j === 0 || j === lastRow || rowHasFixedMode(grid.modes, j);
      const colSizes = colSizesPerRow[j];
      const colPos = colPosPerRow[j];
      for (let i = 0; i < colsCount; i += 1) {
        const sw = xs[i + 1] - xs[i];
        const cellW = colSizes[i];
        if (sw <= 0 || cellW <= 0) continue;
        const cellMode = grid.modes[j]?.[i] ?? repeat;
        const isBoundary =
          i === 0 || i === colsCount - 1 || j === 0 || j === rowsCount - 1;
        const isInteriorFill = !isBoundary && cellMode !== 'fixed';
        if (isInteriorFill && !fillCenter) continue;
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
          // xMode = mode direct de la cellule (per-row, pas de col-forcing).
          // yMode = forcé à 'fixed' si la row a un fixed (= la row est
          // sized en source-height) ; sinon = mode direct.
          xMode: cellMode,
          yMode: rowFixed ? 'fixed' : cellMode,
        });
      }
    }
    return out;
  }, [layout, xs, ys, grid.modes, repeat, fillCenter]);

  // Render Skia draws for all cells. PNG via <Image>, SVG via <ImageSVG>.
  // Architecture : Group avec clip rect (la cell) + Group inner avec
  // transform (translate + scale) qui mappe la source native (0,0,iw,ih)
  // sur la cell. L'<Image>/<ImageSVG> est dessiné à coords (0,0,iw,ih)
  // dans cette transform — Skia rend de manière fiable. Pour round mode,
  // on draw multiple tiles avec leurs propres transforms dans le clip.
  const drawNodes = useMemo<ReactNode>(() => {
    if (!cellSpecs) return null;
    if (!skImage && !skSvg) return null;
    const isPng = !!skImage;
    // Le SVG est dessiné à sa taille intrinsèque (viewBox) puis scalé pour
    // remplir exactement (0,0,iw,ih) — l'espace de coords dans lequel les
    // slices/cuts sont définis. Nécessaire car `canvas.drawSvg(svg, w, h)` ne
    // scale PAS le SVG vers w×h sur toutes les plateformes (no-op sur web) :
    // sans ce scale, un viewBox fractionnaire (export Illustrator, ex.
    // 197.22×98.12) plus petit que l'imageSize déclarée (ex. 200×100) laisse
    // les bords bas/droit non peints → liseré du fond visible + cadre tronqué.
    const svgW = svgIntrinsic?.w ?? ((skSvg && skSvg.width()) || iw);
    const svgH = svgIntrinsic?.h ?? ((skSvg && skSvg.height()) || ih);
    const renderSourceAtNative = (key: string) =>
      isPng ? (
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
        // Mode round : on draw N×M tiles. Chaque tile rend la source ENTIÈRE
        // avec un transform qui mappe (sx,sy,sw,sh) sur le rect du tile —
        // mais le reste de l'image (en dehors de la bande source) s'étend
        // au-delà du tile rect. Sans clip par-tile, ces overshoots viennent
        // s'imprimer dans les tiles voisins (chaque tile montre alors la
        // source entière au lieu de la bande). Solution : un clip rect par
        // tile, à sa zone (tileLeft, tileTop, tileW, tileH).
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

  // Source absente OU loading pas terminé → on render juste le bg + children
  // (le grid s'affichera dès que skImage/skSvg est dispo). Pour le PNG,
  // useImage est async ; pour le SVG, MakeFromString est synchrone.
  const sourceReady = !!(skImage || skSvg);

  return (
    <View style={style}>
      {/* Backing solide rendu EN PREMIER (sous tout). Deux rôles :
          1. cadre sans fond image → c'est le bg uni de la fiche ;
          2. cadre AVEC fond image → backing derrière le fond. La couche fond
             image est rentrée de 1px en bas/à droite (cf. plus bas) ; ce
             backing remplit ce liseré avec sa couleur (= theme.paper côté
             CardFrame = couleur du bord du cadre), au lieu de laisser
             transparaître la couche encore en dessous (bgColor du pinch-zoom,
             page…). Invisible car ça matche le bord du cadre. */}
      {innerBackgroundColor ? (
        <View
          pointerEvents="none"
          style={
            innerBackgroundCover === 'full'
              ? [StyleSheet.absoluteFillObject, { backgroundColor: innerBackgroundColor }]
              : {
                  position: 'absolute',
                  top: bgi.top,
                  right: bgi.right,
                  bottom: bgi.bottom,
                  left: bgi.left,
                  backgroundColor: innerBackgroundColor,
                }
          }
        />
      ) : null}
      {innerBackground ? (
        <View
          pointerEvents="none"
          style={
            innerBackgroundCover === 'full'
              ? {
                  // Couche fond IMAGE (expo-image / react-native-svg) : une
                  // native view séparée du canvas Skia du cadre. Au bord
                  // bas/droit, ces deux vues ne s'alignent pas au sous-pixel →
                  // l'image dépasse sous le contour anti-aliasé du cadre =
                  // liseré du fond (le bg solide, lui, est une simple couleur
                  // de View qui compose proprement, d'où l'absence de bug).
                  // On rentre le fond de 1px en bas/à droite : caché sous le
                  // contour épais du cadre, et le backing solide remplit ce
                  // liseré → invisible à l'intérieur comme au bord.
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: FOND_EDGE_INSET,
                  bottom: FOND_EDGE_INSET,
                  overflow: 'hidden',
                }
              : {
                  position: 'absolute',
                  top: bgi.top,
                  right: bgi.right,
                  bottom: bgi.bottom,
                  left: bgi.left,
                  overflow: 'hidden',
                }
          }>
          {innerBackground}
        </View>
      ) : null}

      {/* Skia canvas en absoluteFill, sized par le frame (driven par children
          + padding ou par parent constraint). Une seule native view, tous les
          cells drawn dedans en GPU. */}
      <View
        style={StyleSheet.absoluteFillObject}
        onLayout={onFrameLayout}
        pointerEvents="none">
        {sourceReady && frameSize && frameSize.w > 0 && frameSize.h > 0 && (
          <Canvas style={{ width: frameSize.w, height: frameSize.h }}>
            {drawNodes}
          </Canvas>
        )}
      </View>

      {/* Children layer : drives le sizing du frame quand le parent ne
          contraint pas (le canvas en absoluteFill suit). */}
      <View
        style={{
          paddingTop: pad.top,
          paddingRight: pad.right,
          paddingBottom: pad.bottom,
          paddingLeft: pad.left,
        }}>
        {children}
      </View>
    </View>
  );
}
