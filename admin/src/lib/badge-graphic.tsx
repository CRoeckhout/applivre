import lottie from 'lottie-web';
import { useEffect, useMemo, useRef } from 'react';
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
    return <LottiePreview payload={payload} tokens={tokens} size={size} />;
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

// ──────────────────────────────────────────────────────────────────
// Lottie

function LottiePreview({
  payload,
  tokens,
  size,
}: {
  payload: string;
  tokens: Record<string, string>;
  size: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Dep par contenu (stringify tokens) — sinon nouvelle ref à chaque
  // render parent → useEffect re-fire → animation reload.
  const tokensKey = useMemo(() => JSON.stringify(tokens), [tokens]);
  const data = useMemo(() => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      return null;
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Array.isArray((parsed as { layers?: unknown }).layers) ||
      typeof (parsed as { w?: unknown }).w !== 'number' ||
      typeof (parsed as { h?: unknown }).h !== 'number'
    ) {
      return null;
    }
    return applyTokenColors(parsed, JSON.parse(tokensKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, tokensKey]);

  // Direct lottie-web : bypass `lottie-react` wrapper qui mishandle
  // loop sous React StrictMode (mount → cleanup → remount cassé).
  useEffect(() => {
    if (!containerRef.current || !data) return;
    const anim = lottie.loadAnimation({
      container: containerRef.current,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: data,
    });
    return () => anim.destroy();
  }, [data]);

  if (!data) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--surface-2)',
          color: 'var(--ink-muted)',
          fontSize: 11,
          borderRadius: 8,
          padding: 8,
          textAlign: 'center',
        }}>
        Coller un JSON Lottie valide (champs <code>v</code>, <code>w</code>,{' '}
        <code>h</code>, <code>layers[]</code>)
      </div>
    );
  }

  return <div ref={containerRef} style={{ width: size, height: size }} />;
}

// Deep clone + override fills/strokes des layers dont le nom correspond
// à une clé de tokens. tokens : { "Layer Name": "#hex" }.
function applyTokenColors(
  source: unknown,
  tokens: Record<string, string>,
): unknown {
  const cloned = JSON.parse(JSON.stringify(source)) as {
    layers?: LottieLayer[];
  };
  const tokenKeys = Object.keys(tokens);
  if (tokenKeys.length === 0) return cloned;

  for (const layer of cloned.layers ?? []) {
    const hex = tokens[layer.nm ?? ''];
    if (!hex) continue;
    const rgba = hexToRgba(hex);
    if (!rgba) continue;
    overrideShapeColors(layer.shapes ?? [], rgba);
  }
  return cloned;
}

type LottieLayer = {
  nm?: string;
  shapes?: LottieShape[];
};

type LottieShape = {
  ty?: string;
  it?: LottieShape[];
  c?: { k?: number[]; a?: number };
};

function overrideShapeColors(shapes: LottieShape[], rgba: number[]): void {
  for (const shape of shapes) {
    if (shape.ty === 'fl' || shape.ty === 'st') {
      if (shape.c && Array.isArray(shape.c.k)) {
        shape.c.k = rgba;
      }
      continue;
    }
    if (shape.ty === 'gr' && Array.isArray(shape.it)) {
      overrideShapeColors(shape.it, rgba);
    }
  }
}

function hexToRgba(hex: string): number[] | null {
  const v = hex.trim().replace(/^#/, '');
  if (v.length !== 6) return null;
  const r = Number.parseInt(v.slice(0, 2), 16);
  const g = Number.parseInt(v.slice(2, 4), 16);
  const b = Number.parseInt(v.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return [r / 255, g / 255, b / 255, 1];
}
