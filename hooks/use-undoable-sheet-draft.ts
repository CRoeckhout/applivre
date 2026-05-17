import type {
  PlacedSticker,
  SheetAppearance,
  SheetSection,
} from '@/types/book';
import { useCallback, useEffect, useRef, useState } from 'react';

// Historique undo/redo du draft (sections + stickers + appearance). Le
// snapshot capture les trois ensemble pour que les actions liées (placer
// un sticker juste après avoir ajouté une catégorie, changer la couleur
// après avoir édité une note) puissent être défaites une étape à la fois
// sans diverger. Les mutations "structurelles" (add/remove/reorder section,
// rating, icône, placement/déplacement/scale/rotation/suppression de sticker,
// tout changement de l'appearance depuis le customizer) snapshot
// immédiatement. La saisie texte ouvre une "session d'édition" qui ne
// snapshot qu'au début (la rafale de keystrokes ne pollue pas l'historique)
// et se ferme après 700ms d'inactivité.
//
// Partagé entre l'éditeur de fiche (app/sheet/[isbn].tsx) et l'éditeur de
// template (app/template/[id].tsx) — ces deux UX manipulent les mêmes
// primitives draft et bénéficient du même undo unifié.
type DraftSnapshot = {
  sections: SheetSection[];
  stickers: PlacedSticker[];
  appearance: SheetAppearance;
};

export function useUndoableSheetDraft(
  initialSections: SheetSection[],
  initialStickers: PlacedSticker[],
  initialAppearance: SheetAppearance,
) {
  const [draft, setDraftRaw] = useState<SheetSection[]>(initialSections);
  const [draftStickers, setDraftStickersRaw] =
    useState<PlacedSticker[]>(initialStickers);
  const [draftAppearance, setDraftAppearanceRaw] =
    useState<SheetAppearance>(initialAppearance);
  const undoStack = useRef<DraftSnapshot[]>([]);
  const redoStack = useRef<DraftSnapshot[]>([]);
  // historyVersion : force le re-render quand undoStack/redoStack mutent
  // sans qu'aucun state observable ne change (utile pour rafraîchir canUndo
  // après undo qui repop le redo).
  const [, setHistoryVersion] = useState(0);
  const bump = () => setHistoryVersion((v) => v + 1);
  const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref miroir des dernières valeurs — permet de snapshoter sans dépendre
  // des closures dans les callbacks.
  const stateRef = useRef<DraftSnapshot>({
    sections: initialSections,
    stickers: initialStickers,
    appearance: initialAppearance,
  });
  useEffect(() => {
    stateRef.current = {
      sections: draft,
      stickers: draftStickers,
      appearance: draftAppearance,
    };
  }, [draft, draftStickers, draftAppearance]);

  const MAX_HISTORY = 50;
  const pushHistory = useCallback(() => {
    undoStack.current.push({
      sections: stateRef.current.sections,
      stickers: stateRef.current.stickers,
      appearance: stateRef.current.appearance,
    });
    if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift();
    redoStack.current = [];
    bump();
  }, []);

  // Variantes "logged" : push history avant de muter. Utilisées pour toutes
  // les actions structurelles.
  const setDraft = useCallback(
    (updater: SheetSection[] | ((prev: SheetSection[]) => SheetSection[])) => {
      pushHistory();
      setDraftRaw(updater);
    },
    [pushHistory],
  );
  const setDraftStickers = useCallback(
    (
      updater:
        | PlacedSticker[]
        | ((prev: PlacedSticker[]) => PlacedSticker[]),
    ) => {
      pushHistory();
      setDraftStickersRaw(updater);
    },
    [pushHistory],
  );
  const setDraftAppearance = useCallback(
    (
      updater:
        | SheetAppearance
        | ((prev: SheetAppearance) => SheetAppearance),
    ) => {
      pushHistory();
      setDraftAppearanceRaw(updater);
    },
    [pushHistory],
  );

  // Variantes "silent" : pas de push. Utilisées par l'effet d'hydratation
  // de template (état initial) et par les helpers texte qui pilotent leur
  // propre fenêtre de snapshot.
  const setDraftSilent = setDraftRaw;
  const setDraftStickersSilent = setDraftStickersRaw;
  const setDraftAppearanceSilent = setDraftAppearanceRaw;

  const beginTextEdit = useCallback(() => {
    if (textTimerRef.current === null) {
      pushHistory();
    } else {
      clearTimeout(textTimerRef.current);
    }
    textTimerRef.current = setTimeout(() => {
      textTimerRef.current = null;
    }, 700);
  }, [pushHistory]);

  const closeTextEdit = () => {
    if (textTimerRef.current) {
      clearTimeout(textTimerRef.current);
      textTimerRef.current = null;
    }
  };

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push({
      sections: stateRef.current.sections,
      stickers: stateRef.current.stickers,
      appearance: stateRef.current.appearance,
    });
    setDraftRaw(prev.sections);
    setDraftStickersRaw(prev.stickers);
    setDraftAppearanceRaw(prev.appearance);
    closeTextEdit();
    bump();
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push({
      sections: stateRef.current.sections,
      stickers: stateRef.current.stickers,
      appearance: stateRef.current.appearance,
    });
    setDraftRaw(next.sections);
    setDraftStickersRaw(next.stickers);
    setDraftAppearanceRaw(next.appearance);
    closeTextEdit();
    bump();
  }, []);

  const resetHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    closeTextEdit();
    bump();
  }, []);

  return {
    draft,
    draftStickers,
    draftAppearance,
    setDraft,
    setDraftStickers,
    setDraftAppearance,
    setDraftSilent,
    setDraftStickersSilent,
    setDraftAppearanceSilent,
    beginTextEdit,
    undo,
    redo,
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
    resetHistory,
  };
}

// Égalité shallow par champ — l'ordre du tableau compte. Compare uniquement
// les champs persistés ; ignore d'éventuelles refs intermédiaires.
export function sectionsEqual(a: SheetSection[], b: SheetSection[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.title !== y.title ||
      x.body !== y.body ||
      x.rating?.value !== y.rating?.value ||
      x.rating?.icon !== y.rating?.icon
    ) {
      return false;
    }
  }
  return true;
}

// Égalité shallow par champ — l'ordre du tableau compte (= z-order).
export function stickersEqual(a: PlacedSticker[], b: PlacedSticker[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.id !== y.id ||
      x.stickerId !== y.stickerId ||
      x.x !== y.x ||
      x.y !== y.y ||
      x.scale !== y.scale ||
      x.rotation !== y.rotation
    ) {
      return false;
    }
  }
  return true;
}

// SheetAppearance est nested (frame.colorOverrides, fond.colorOverrides,
// defaultCategories…) → deep equal via JSON.stringify. Acceptable car la
// struct est entièrement sérialisable (no Date, no Map, no circular) et
// l'appel n'a lieu qu'au render du dirty check, jamais en boucle serrée.
export function appearancesEqual(
  a: SheetAppearance,
  b: SheetAppearance,
): boolean {
  if (a === b) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}
