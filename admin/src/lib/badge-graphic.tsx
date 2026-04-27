import Lottie from 'lottie-react';
import { useMemo } from 'react';
import type { GraphicKind } from './types';

// Rendu côté admin (web). SVG via dangerouslySetInnerHTML après token-replace.
// Lottie via lottie-react. Sanitize officielle = Edge Function au save.

type Props = {
  kind: GraphicKind;
  payload: string;
  tokens?: Record<string, string>;
  size?: number;
};

const SVG_TOKEN_RE = /\{\{(\w+)\}\}/g;

export function BadgeGraphicWeb({ kind, payload, tokens = {}, size = 96 }: Props) {
  if (kind === 'lottie') {
    return <LottiePreview payload={payload} size={size} />;
  }
  return <SvgPreview payload={payload} tokens={tokens} size={size} />;
}

function SvgPreview({
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
  return (
    <div
      style={{ width: size, height: size, display: 'inline-block' }}
      dangerouslySetInnerHTML={{ __html: xml }}
    />
  );
}

function LottiePreview({ payload, size }: { payload: string; size: number }) {
  const data = useMemo(() => {
    try {
      const parsed = JSON.parse(payload);
      // Validation structurelle minimale : Lottie nécessite au moins
      // layers (array), v, w, h. Sans ça lottie-react crash sur layers.length.
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        !Array.isArray(parsed.layers) ||
        typeof parsed.w !== 'number' ||
        typeof parsed.h !== 'number'
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, [payload]);

  if (!data) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f0ea',
          color: '#6b6259',
          fontSize: 11,
          borderRadius: 8,
          padding: 8,
          textAlign: 'center',
        }}>
        Coller un JSON Lottie valide (champs <code>v</code>, <code>w</code>, <code>h</code>, <code>layers[]</code>)
      </div>
    );
  }

  return (
    <div style={{ width: size, height: size }}>
      <Lottie animationData={data} loop={true} autoplay={true} />
    </div>
  );
}
