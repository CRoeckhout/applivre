import type { ReactNode } from 'react';

// Rendu d'un sous-ensemble de markdown inline (**gras**, *italique*,
// ***gras italique***, [lien](url)) en éléments React, pour les aperçus de
// l'admin. Miroir web de components/rich-text.tsx côté app : même grammaire,
// même limite (pas d'imbrication arbitraire — la source vient de TipTap).

const TOKEN =
  /(\*\*\*([^*]+)\*\*\*)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(_([^_]+)_)|(\[([^\]]+)\]\(([^)]+)\))/g;

export function renderInlineMarkdown(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(src)) !== null) {
    if (m.index > last) out.push(src.slice(last, m.index));
    if (m[2] !== undefined) {
      out.push(
        <strong key={key++}>
          <em>{m[2]}</em>
        </strong>,
      );
    } else if (m[4] !== undefined) {
      out.push(<strong key={key++}>{m[4]}</strong>);
    } else if (m[6] !== undefined) {
      out.push(<em key={key++}>{m[6]}</em>);
    } else if (m[8] !== undefined) {
      out.push(<em key={key++}>{m[8]}</em>);
    } else if (m[10] !== undefined) {
      out.push(
        <span key={key++} style={{ textDecoration: 'underline' }}>
          {m[10]}
        </span>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}
