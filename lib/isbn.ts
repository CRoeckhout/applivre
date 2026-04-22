// Conversion ISBN-13 → ISBN-10 pour usage avec les URLs Amazon historiques.
// Seuls les ISBN-13 préfixés par 978 ont un équivalent ISBN-10.
// Les préfixes 979 (attribués depuis 2007 à de nouveaux éditeurs) n'en ont pas.

function normalize(input: string): string {
  return input.replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function toIsbn10(input: string): string | null {
  const clean = normalize(input);

  if (clean.length === 10) return clean;
  if (clean.length !== 13) return null;
  if (!clean.startsWith('978')) return null;

  const core = clean.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const d = parseInt(core[i], 10);
    if (Number.isNaN(d)) return null;
    sum += d * (10 - i);
  }
  const rem = sum % 11;
  const checkVal = (11 - rem) % 11;
  const checkChar = checkVal === 10 ? 'X' : String(checkVal);

  return core + checkChar;
}

export function isLikelyIsbn(input: string): boolean {
  const clean = normalize(input);
  return clean.length === 10 || clean.length === 13;
}
