import { createContext, useContext } from 'react';

// Context fourni par `CardFrame` quand une décoration custom (cadre OU fond)
// est active. Permet aux card components consommateurs de neutraliser leur
// styling hardcodé (padding p-5/p-6, background bg-paper-warm) au profit
// du visuel apporté par la décoration. Sans décoration active, le context
// reste à sa valeur default `inFrame=false` — les cards rendent comme
// aujourd'hui (padding + bg).

export type CardFrameContextValue = {
  // True quand une décoration custom (cadre catalog ou fond) enveloppe les
  // enfants. Les cards utilisent ce flag pour override leur padding interne
  // ET leur background — le bg-paper-warm hardcodé masquerait sinon le fond
  // image rendu derrière par CardFrame.
  inFrame: boolean;
  // Valeur de padding (px) à appliquer dans la card en mode framed. 0 par
  // default ; configurable via `border_catalog.card_padding` (admin). Pour
  // les fonds seuls (sans cadre), reste à 0.
  padding: number;
};

const defaultValue: CardFrameContextValue = { inFrame: false, padding: 0 };

const CardFrameContext = createContext<CardFrameContextValue>(defaultValue);

export const CardFrameProvider = CardFrameContext.Provider;

export function useCardFrame(): CardFrameContextValue {
  return useContext(CardFrameContext);
}
