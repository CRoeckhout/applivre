import { createContext, useContext } from 'react';

// Context fourni par `CardFrame` quand une décoration custom (cadre OU fond)
// est active. Permet aux card components consommateurs de neutraliser leur
// styling hardcodé (padding p-5/p-6, background bg-paper-warm) au profit
// du visuel apporté par la décoration. Sans décoration active, le context
// reste à sa valeur default `inFrame=false` — les cards rendent comme
// aujourd'hui (padding + bg).

export type CardFrameContextValue = {
  // True quand une décoration custom (cadre catalog ou fond) enveloppe les
  // enfants. Les cards utilisent ce flag pour neutraliser leur background
  // hardcodé — le bg-paper-warm masquerait sinon le fond image rendu derrière
  // par CardFrame, et le cadre catalog impose son propre visuel.
  inFrame: boolean;
  // Padding (px) imposé par un cadre catalog (depuis `border_catalog.card_padding`).
  // `undefined` ⇒ la card conserve son padding CSS natif (p-5 / p-6 selon
  // la card). Utilisé pour le mode fond-only (sans cadre) : on garde le
  // padding visuel d'origine pour que le fond image occupe la même zone
  // arrondie que le bg-paper-warm.
  padding?: number;
};

const defaultValue: CardFrameContextValue = { inFrame: false };

const CardFrameContext = createContext<CardFrameContextValue>(defaultValue);

export const CardFrameProvider = CardFrameContext.Provider;

export function useCardFrame(): CardFrameContextValue {
  return useContext(CardFrameContext);
}
