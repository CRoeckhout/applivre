import { createContext, useContext } from 'react';

// Context fourni par `CardFrame` quand un cadre custom est actif. Permet
// aux card components consommateurs de neutraliser leur padding hardcodé
// (p-5 / p-6) au profit de la valeur définie par le cadre. Sans cadre
// actif (ou `borderId='none'`), le context reste à sa valeur default
// `inFrame=false` — les cards rendent comme aujourd'hui.

export type CardFrameContextValue = {
  // True quand un cadre custom enveloppe les enfants. Les cards utilisent
  // ce flag pour override leur padding interne.
  inFrame: boolean;
  // Valeur de padding (px) à appliquer dans la card en mode framed. 0 par
  // default ; configurable via `border_catalog.card_padding` (admin).
  padding: number;
};

const defaultValue: CardFrameContextValue = { inFrame: false, padding: 0 };

const CardFrameContext = createContext<CardFrameContextValue>(defaultValue);

export const CardFrameProvider = CardFrameContext.Provider;

export function useCardFrame(): CardFrameContextValue {
  return useContext(CardFrameContext);
}
