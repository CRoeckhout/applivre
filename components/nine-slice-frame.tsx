import { Image } from 'expo-image';
import { ReactNode, useMemo, useState } from 'react';
import {
  ImageSourcePropType,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { SvgXml } from 'react-native-svg';

type Insets = { top: number; right: number; bottom: number; left: number };

export type RepeatMode = 'stretch' | 'round';

type Props = {
  // Soit `source` (PNG/raster via expo-image), soit `svgXml` (SVG inline).
  // Slicing math identique pour les deux : `imageSize` définit l'espace de
  // coords dans lequel `slice` est exprimé. Pour SVG, ce sera typiquement
  // le viewBox du fichier.
  source?: ImageSourcePropType;
  svgXml?: string;
  imageSize: { width: number; height: number };
  slice: Insets;
  padding?: Insets;
  fillCenter?: boolean;
  // Couleur de fond rendue en layer absolu sous les slices, bornée par
  // `bgInsets`. Slices PNG/SVG s'affichent par-dessus → leurs bits transparents
  // laissent voir ce fond. Ignorée si `innerBackground` est fourni.
  innerBackgroundColor?: string;
  // Override complet de la couche de fond interne : ReactNode rendu en
  // absolute fill dans la zone bornée par `bgInsets`. Permet d'injecter un
  // fond image (FondLayer) au lieu d'une simple solid color. Substitue
  // `innerBackgroundColor` si fourni.
  innerBackground?: ReactNode;
  // Distance depuis chaque bord externe vers l'intérieur où commence le bg.
  // Default = slice/2 : le bg pénètre à mi-distance dans les edges, ce qui
  // évite (a) le halo si on couvre tout le host (bg dépasse le visible)
  // (b) le gap si on s'arrête au boundary du center cell (bg ne rejoint pas
  // l'encre dessinée dans l'edge). À tuner par cadre selon où l'encre tombe
  // dans l'edge slice.
  bgInsets?: Insets;
  // Mode de remplissage des bandes edges et center. `stretch` (default) =
  // étire le slice pour combler la bande. `round` = tile le slice avec
  // count entier, scale ajusté pour que les tiles rentrent pile (équivalent
  // CSS `border-image-repeat: round`).
  repeat?: RepeatMode;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

// Painter abstrait : dessine la source à (drawW × drawH) positionnée à
// (ox, oy) en absolu dans le slice container. Le slice container est le View
// overflow:hidden de chaque zone — la source est plus grande que le container
// et décalée pour qu'on ne voie que la sous-zone (sx,sy,sw,sh).
type Painter = (drawW: number, drawH: number, ox: number, oy: number) => ReactNode;

// Équivalent React Native de `border-image` CSS. Découpe la source (PNG ou
// SVG) en 9 zones selon `slice`, place les coins fixes, étire/tile les bords
// sur leurs axes, et remplit le centre derrière le contenu si `fillCenter`.
export function NineSliceFrame({
  source,
  svgXml,
  imageSize,
  slice,
  padding,
  fillCenter = true,
  innerBackgroundColor,
  innerBackground,
  bgInsets,
  repeat = 'stretch',
  style,
  children,
}: Props) {
  const { width: iw, height: ih } = imageSize;
  const { top: T, right: R, bottom: B, left: L } = slice;
  const mw = iw - L - R;
  const mh = ih - T - B;
  const pad = padding ?? slice;
  const bgi = bgInsets ?? {
    top: Math.round(T / 2),
    right: Math.round(R / 2),
    bottom: Math.round(B / 2),
    left: Math.round(L / 2),
  };

  // Painter dépend uniquement de la source. Mémoizé pour éviter de recréer
  // un closure à chaque render (réutilisé par 9+ slices et N tiles).
  const painter: Painter | null = useMemo(() => {
    if (svgXml) {
      // SvgXml fill sa View parent ; la taille effective vient du wrapping
      // View positionné en absolu. preserveAspectRatio="none" pour matcher
      // le comportement contentFit="fill" de l'Image (scale non-uniforme).
      return (drawW, drawH, ox, oy) => (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: ox, top: oy, width: drawW, height: drawH }}>
          <SvgXml
            xml={svgXml}
            width="100%"
            height="100%"
            preserveAspectRatio="none"
          />
        </View>
      );
    }
    if (source) {
      return (drawW, drawH, ox, oy) => (
        <Image
          source={source}
          contentFit="fill"
          style={{ position: 'absolute', width: drawW, height: drawH, left: ox, top: oy }}
        />
      );
    }
    return null;
  }, [source, svgXml]);

  if (!painter) return <View style={style}>{children}</View>;

  // Le middle row ne doit utiliser `flex: 1` que si le parent contraint la
  // hauteur (style avec flex/height/minHeight). Sans contrainte, flex:1 +
  // basis 0 collapse à 0 et le frame se réduit à top+bottom uniquement —
  // bug visible quand on utilise NineSliceFrame dans une preview de fiche
  // (parent auto-sized). En mode auto, on laisse le middle row sizer à son
  // contenu (le children intrinsèque détermine la hauteur).
  const flatStyle = StyleSheet.flatten(style ?? {}) as ViewStyle;
  const parentConstrainsHeight =
    flatStyle.flex != null ||
    flatStyle.height != null ||
    flatStyle.minHeight != null;
  const middleRowStyle: ViewStyle = parentConstrainsHeight
    ? { flexDirection: 'row', flex: 1 }
    : { flexDirection: 'row' };

  return (
    <View style={style}>
      {innerBackground ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: bgi.top,
            right: bgi.right,
            bottom: bgi.bottom,
            left: bgi.left,
            overflow: 'hidden',
          }}>
          {innerBackground}
        </View>
      ) : innerBackgroundColor ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: bgi.top,
            right: bgi.right,
            bottom: bgi.bottom,
            left: bgi.left,
            backgroundColor: innerBackgroundColor,
          }}
        />
      ) : null}
      <View style={{ flexDirection: 'row', height: T }}>
        <Slice painter={painter} iw={iw} ih={ih} sx={0} sy={0} sw={L} sh={T} kind="corner" w={L} h={T} repeat={repeat} />
        <Slice painter={painter} iw={iw} ih={ih} sx={L} sy={0} sw={mw} sh={T} kind="row" h={T} repeat={repeat} />
        <Slice painter={painter} iw={iw} ih={ih} sx={iw - R} sy={0} sw={R} sh={T} kind="corner" w={R} h={T} repeat={repeat} />
      </View>

      <View style={middleRowStyle}>
        <Slice painter={painter} iw={iw} ih={ih} sx={0} sy={T} sw={L} sh={mh} kind="col" w={L} repeat={repeat} />
        <View style={{ flex: 1 }}>
          {fillCenter && (
            <Slice painter={painter} iw={iw} ih={ih} sx={L} sy={T} sw={mw} sh={mh} kind="fill" repeat={repeat} />
          )}
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
        <Slice painter={painter} iw={iw} ih={ih} sx={iw - R} sy={T} sw={R} sh={mh} kind="col" w={R} repeat={repeat} />
      </View>

      <View style={{ flexDirection: 'row', height: B }}>
        <Slice painter={painter} iw={iw} ih={ih} sx={0} sy={ih - B} sw={L} sh={B} kind="corner" w={L} h={B} repeat={repeat} />
        <Slice painter={painter} iw={iw} ih={ih} sx={L} sy={ih - B} sw={mw} sh={B} kind="row" h={B} repeat={repeat} />
        <Slice painter={painter} iw={iw} ih={ih} sx={iw - R} sy={ih - B} sw={R} sh={B} kind="corner" w={R} h={B} repeat={repeat} />
      </View>
    </View>
  );
}

type SliceProps = {
  painter: Painter;
  iw: number;
  ih: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  kind: 'corner' | 'row' | 'col' | 'fill';
  w?: number;
  h?: number;
  repeat: RepeatMode;
};

// Affiche une portion (sx,sy,sw,sh) de la source soit étirée sur (aw,ah)
// (mode stretch), soit tilée avec count entier scalé pour rentrer pile
// (mode round).
function Slice({ painter, iw, ih, sx, sy, sw, sh, kind, w, h, repeat }: SliceProps) {
  const measured = kind === 'corner';
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: w ?? 0,
    h: h ?? 0,
  });

  const aw = measured ? (w ?? 0) : size.w;
  const ah = measured ? (h ?? 0) : size.h;

  const wrapperStyle: ViewStyle =
    kind === 'corner'
      ? { width: w, height: h }
      : kind === 'row'
        ? { flex: 1, height: h }
        : kind === 'col'
          ? { width: w, alignSelf: 'stretch' }
          : StyleSheet.absoluteFillObject;

  const onLayout = !measured
    ? (e: LayoutChangeEvent) => {
        const { width: lw, height: lh } = e.nativeEvent.layout;
        if (lw !== size.w || lh !== size.h) setSize({ w: lw, h: lh });
      }
    : undefined;

  const ready = aw > 0 && ah > 0;
  const doRound = repeat === 'round' && kind !== 'corner';

  let content: ReactNode = null;
  if (ready) {
    if (doRound) {
      // Tiles placés en absolu avec overlap +1px : RN flex laisse des seams
      // 1px sur les pixels fractionnels (tileSize non entier). Outer
      // overflow:hidden + chaque tile élargie de 1px → tile i+1 recouvre
      // le seam de tile i. Pour un PNG seamless le motif masque l'overlap.
      const OVERLAP = 1;
      if (kind === 'row') {
        const n = Math.max(1, Math.round(aw / sw));
        const tileW = aw / n;
        content = (
          <>
            {Array.from({ length: n }).map((_, i) => (
              <Tile
                key={i}
                painter={painter}
                iw={iw}
                ih={ih}
                sx={sx}
                sy={sy}
                sw={sw}
                sh={sh}
                w={tileW + OVERLAP}
                h={ah}
                left={i * tileW}
                top={0}
              />
            ))}
          </>
        );
      } else if (kind === 'col') {
        const n = Math.max(1, Math.round(ah / sh));
        const tileH = ah / n;
        content = (
          <>
            {Array.from({ length: n }).map((_, i) => (
              <Tile
                key={i}
                painter={painter}
                iw={iw}
                ih={ih}
                sx={sx}
                sy={sy}
                sw={sw}
                sh={sh}
                w={aw}
                h={tileH + OVERLAP}
                left={0}
                top={i * tileH}
              />
            ))}
          </>
        );
      } else {
        const nx = Math.max(1, Math.round(aw / sw));
        const ny = Math.max(1, Math.round(ah / sh));
        const tileW = aw / nx;
        const tileH = ah / ny;
        content = (
          <>
            {Array.from({ length: ny }).map((_, j) =>
              Array.from({ length: nx }).map((_, i) => (
                <Tile
                  key={`${j}-${i}`}
                  painter={painter}
                  iw={iw}
                  ih={ih}
                  sx={sx}
                  sy={sy}
                  sw={sw}
                  sh={sh}
                  w={tileW + OVERLAP}
                  h={tileH + OVERLAP}
                  left={i * tileW}
                  top={j * tileH}
                />
              )),
            )}
          </>
        );
      }
    } else {
      content = painter(
        iw * (aw / sw),
        ih * (ah / sh),
        -sx * (aw / sw),
        -sy * (ah / sh),
      );
    }
  }

  return (
    <View style={[wrapperStyle, { overflow: 'hidden' }]} onLayout={onLayout} pointerEvents="none">
      {content}
    </View>
  );
}

type TileProps = {
  painter: Painter;
  iw: number;
  ih: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  w: number;
  h: number;
  left: number;
  top: number;
};

// Tile élémentaire en mode round : rend la portion (sx,sy,sw,sh) à taille
// (w,h) positionnée en absolu à (left,top). Utilisé en série pour tiler
// une bande / un center.
function Tile({ painter, iw, ih, sx, sy, sw, sh, w, h, left, top }: TileProps) {
  return (
    <View
      style={{ position: 'absolute', left, top, width: w, height: h, overflow: 'hidden' }}
      pointerEvents="none">
      {painter(
        iw * (w / sw),
        ih * (h / sh),
        -sx * (w / sw),
        -sy * (h / sh),
      )}
    </View>
  );
}
