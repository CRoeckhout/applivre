import type { GraphicKind } from '@/types/badge';
import LottieView from 'lottie-react-native';
import { useMemo } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

// Rend le visuel d'un badge : dispatch SVG (text-replace tokens) ou
// Lottie (animation JSON, tokens convertis en colorFilters par layer name).
//
// react-native-svg ignore les balises non supportées (script, foreignObject,
// CSS animations) — la sécurité côté Edge Function reste néanmoins le rempart
// principal pour le contenu uploadé via l'admin page.

type Props = {
  kind: GraphicKind;
  payload: string;
  tokens?: Record<string, string>;
  size?: number;
};

const SVG_TOKEN_RE = /\{\{(\w+)\}\}/g;

export function BadgeGraphic({ kind, payload, tokens = {}, size = 56 }: Props) {
  if (kind === 'lottie') {
    return <LottieGraphic payload={payload} tokens={tokens} size={size} />;
  }
  return <SvgGraphic payload={payload} tokens={tokens} size={size} />;
}

function SvgGraphic({
  payload,
  tokens,
  size,
}: {
  payload: string;
  tokens: Record<string, string>;
  size: number;
}) {
  const xml = useMemo(
    () => payload.replace(SVG_TOKEN_RE, (_, name: string) => tokens[name] ?? ''),
    [payload, tokens],
  );
  return <SvgXml xml={xml} width={size} height={size} />;
}

function LottieGraphic({
  payload,
  tokens,
  size,
}: {
  payload: string;
  tokens: Record<string, string>;
  size: number;
}) {
  const source = useMemo(() => {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }, [payload]);

  // Conversion tokens (`{ layerName: '#hex' }`) en colorFilters Lottie.
  const colorFilters = useMemo(
    () =>
      Object.entries(tokens).map(([keypath, color]) => ({
        keypath,
        color,
      })),
    [tokens],
  );

  if (!source) return <View style={{ width: size, height: size }} />;

  // Wrapper avec overflow hidden : sur web, dotlottie-react a un canvas
  // de taille intrinsèque (w/h du JSON). Le wrapper contraint visuellement
  // sans casser le rendu natif iOS/Android.
  return (
    <View style={{ width: size, height: size, overflow: 'hidden' }}>
      <LottieView
        source={source}
        autoPlay={true}
        loop={true}
        speed={1}
        colorFilters={colorFilters}
        style={{ width: '100%', height: '100%' }}
        resizeMode="contain"
      />
    </View>
  );
}
