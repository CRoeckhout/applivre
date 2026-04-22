import { isLikelyIsbn, toIsbn10 } from '@/lib/isbn';

// Paires ISBN-13 ↔ ISBN-10 calculées via l'algorithme standard
// (vérifiables sur Wikipedia et via les calculateurs officiels).

describe('toIsbn10', () => {
  test('convertit Harry Potter 1 (9780747532699 → 0747532699)', () => {
    expect(toIsbn10('9780747532699')).toBe('0747532699');
  });

  test('convertit un exemple Wikipedia (9780306406157 → 0306406152)', () => {
    expect(toIsbn10('9780306406157')).toBe('0306406152');
  });

  test('produit X quand le reste donne 10 (Le Petit Prince Folio → 207036822X)', () => {
    expect(toIsbn10('9782070368228')).toBe('207036822X');
  });

  test('ignore tirets et espaces', () => {
    expect(toIsbn10('978-0-747-53269-9')).toBe('0747532699');
    expect(toIsbn10('978 0 747 53269 9')).toBe('0747532699');
  });

  test('retourne null pour ISBN-979 (pas d\'équivalent)', () => {
    expect(toIsbn10('9791234567896')).toBeNull();
  });

  test('retourne null pour entrées invalides', () => {
    expect(toIsbn10('')).toBeNull();
    expect(toIsbn10('1234')).toBeNull();
    expect(toIsbn10('abcdefghij')).toBeNull();
  });

  test('retourne tel quel si déjà ISBN-10', () => {
    expect(toIsbn10('0747532699')).toBe('0747532699');
    expect(toIsbn10('207036822X')).toBe('207036822X');
  });
});

describe('isLikelyIsbn', () => {
  test('valide 10 ou 13 chiffres, avec ou sans X final', () => {
    expect(isLikelyIsbn('2070368228')).toBe(true);
    expect(isLikelyIsbn('9782070368228')).toBe(true);
    expect(isLikelyIsbn('207036822X')).toBe(true);
  });

  test('rejette ce qui n\'est pas un ISBN', () => {
    expect(isLikelyIsbn('manual-abc')).toBe(false);
    expect(isLikelyIsbn('123')).toBe(false);
    expect(isLikelyIsbn('')).toBe(false);
  });
});
