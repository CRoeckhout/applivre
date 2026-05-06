import { APP_SLUG } from '@/constants/app';
import { DEFAULT_AVATAR_FRAME_ID } from '@/lib/avatar-frames/catalog';
import { DEFAULT_BORDER_ID } from '@/lib/borders/catalog';
import { DEFAULT_FOND_ID } from '@/lib/fonds/catalog';
import { newId } from '@/lib/id';
import { DEFAULT_FONT_ID, type FontId } from '@/lib/theme/fonts';
import {
  customThemeId,
  DEFAULT_THEME_ID,
  extractCustomId,
  getTheme,
  isCustomThemeId,
  type CustomTheme,
} from '@/lib/theme/themes';
import { getSyncUserId } from '@/lib/sync/session';
import { syncUpsertPreferences } from '@/lib/sync/writers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type HomeCardId = 'library' | 'sheets' | 'defi' | 'start_reading';

export const AVAILABLE_HOME_CARDS: HomeCardId[] = [
  'start_reading',
  'library',
  'sheets',
  'defi',
];

export type Preferences = {
  dailyReadingGoalMinutes: number;
  homeCardOrder: HomeCardId[];
  themeId: string;
  fontId: FontId;
  colorPrimary: string;
  colorSecondary: string;
  colorBg: string;
  customThemes: CustomTheme[];
  borderId: string;
  fondId: string;
  // Opacité globale appliquée au fond du thème (0..1). Sert quand le fond
  // est rendu via `prefs.fondId` directement (home cards) ou hérité (fiches
  // sans `appearance.fond` explicite). Les fiches/grilles avec un fond
  // explicite ont leur propre `fond.opacity` et ignorent cette valeur.
  fondOpacity: number;
  // Cadre rond appliqué autour de la photo de profil. 'none' = pas de cadre.
  avatarFrameId: string;
};

const papier = getTheme(DEFAULT_THEME_ID);

export const DEFAULT_PREFERENCES: Preferences = {
  dailyReadingGoalMinutes: 10,
  homeCardOrder: [...AVAILABLE_HOME_CARDS],
  themeId: papier.id,
  fontId: DEFAULT_FONT_ID,
  colorPrimary: papier.primary,
  colorSecondary: papier.secondary,
  colorBg: papier.bg,
  customThemes: [],
  borderId: DEFAULT_BORDER_ID,
  fondId: DEFAULT_FOND_ID,
  fondOpacity: 1,
  avatarFrameId: DEFAULT_AVATAR_FRAME_ID,
};

type PreferencesState = Preferences & {
  setDailyReadingGoalMinutes: (minutes: number) => void;
  setHomeCardOrder: (order: HomeCardId[]) => void;
  applyTheme: (themeId: string) => void;
  setFontId: (fontId: FontId) => void;
  setColorPrimary: (hex: string) => void;
  setColorSecondary: (hex: string) => void;
  setColorBg: (hex: string) => void;
  saveCurrentAsCustomTheme: (label: string) => CustomTheme;
  deleteCustomTheme: (id: string) => void;
  setBorderId: (id: string) => void;
  setFondId: (id: string) => void;
  setFondOpacity: (opacity: number) => void;
  setAvatarFrameId: (id: string) => void;
  resetToDefaults: () => void;
};

export const MAX_DAILY_GOAL_MINUTES = 1440; // 24h

function clampMinutes(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PREFERENCES.dailyReadingGoalMinutes;
  return Math.max(1, Math.min(MAX_DAILY_GOAL_MINUTES, Math.floor(n)));
}

// Supabase.upsert sur la colonne JSONB `preferences` remplace la valeur entière.
// Donc toute sync doit envoyer l'ÉTAT COMPLET des préférences, pas seulement
// le champ qui vient de changer — sinon on écrase les autres côté serveur.
function pushFullPrefs(state: Preferences): void {
  const userId = getSyncUserId();
  if (!userId) return;
  void syncUpsertPreferences(userId, {
    dailyReadingGoalMinutes: state.dailyReadingGoalMinutes,
    homeCardOrder: state.homeCardOrder,
    themeId: state.themeId,
    fontId: state.fontId,
    colorPrimary: state.colorPrimary,
    colorSecondary: state.colorSecondary,
    colorBg: state.colorBg,
    customThemes: state.customThemes,
    borderId: state.borderId,
    fondId: state.fondId,
    fondOpacity: state.fondOpacity,
    avatarFrameId: state.avatarFrameId,
  });
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set, get) => ({
      ...DEFAULT_PREFERENCES,
      setDailyReadingGoalMinutes: (minutes) => {
        const value = clampMinutes(minutes);
        set({ dailyReadingGoalMinutes: value });
        pushFullPrefs(get());
      },
      setHomeCardOrder: (order) => {
        // Ne conserver que les IDs connus, compléter avec les manquants en fin.
        const known = order.filter((id): id is HomeCardId =>
          AVAILABLE_HOME_CARDS.includes(id),
        );
        const missing = AVAILABLE_HOME_CARDS.filter((id) => !known.includes(id));
        const safe = [...known, ...missing];
        set({ homeCardOrder: safe });
        pushFullPrefs(get());
      },
      applyTheme: (themeId) => {
        if (isCustomThemeId(themeId)) {
          const cid = extractCustomId(themeId);
          const custom = get().customThemes.find((t) => t.id === cid);
          if (!custom) return;
          set({
            themeId,
            fontId: custom.fontId,
            colorPrimary: custom.primary,
            colorSecondary: custom.secondary,
            colorBg: custom.bg,
          });
        } else {
          const theme = getTheme(themeId);
          set({
            themeId: theme.id,
            fontId: theme.fontId,
            colorPrimary: theme.primary,
            colorSecondary: theme.secondary,
            colorBg: theme.bg,
          });
        }
        pushFullPrefs(get());
      },
      setFontId: (fontId) => {
        set({ fontId });
        pushFullPrefs(get());
      },
      setColorPrimary: (hex) => {
        set({ colorPrimary: hex });
        pushFullPrefs(get());
      },
      setColorSecondary: (hex) => {
        set({ colorSecondary: hex });
        pushFullPrefs(get());
      },
      setColorBg: (hex) => {
        set({ colorBg: hex });
        pushFullPrefs(get());
      },
      saveCurrentAsCustomTheme: (label) => {
        const state = get();
        const theme: CustomTheme = {
          id: newId(),
          label: label.trim() || 'Sans nom',
          fontId: state.fontId,
          primary: state.colorPrimary,
          secondary: state.colorSecondary,
          bg: state.colorBg,
        };
        set({
          customThemes: [...state.customThemes, theme],
          themeId: customThemeId(theme.id),
        });
        pushFullPrefs(get());
        return theme;
      },
      setBorderId: (id) => {
        set({ borderId: id });
        pushFullPrefs(get());
      },
      setFondId: (id) => {
        set({ fondId: id });
        pushFullPrefs(get());
      },
      setFondOpacity: (opacity) => {
        const v = Math.max(0, Math.min(1, opacity));
        set({ fondOpacity: v });
        pushFullPrefs(get());
      },
      setAvatarFrameId: (id) => {
        set({ avatarFrameId: id });
        pushFullPrefs(get());
      },
      deleteCustomTheme: (id) => {
        const state = get();
        const next = state.customThemes.filter((t) => t.id !== id);
        // Si le thème supprimé était actif, retombe sur Papier sans toucher aux couleurs.
        const wasActive = state.themeId === customThemeId(id);
        set({
          customThemes: next,
          ...(wasActive ? { themeId: DEFAULT_THEME_ID } : {}),
        });
        pushFullPrefs(get());
      },
      resetToDefaults: () => {
        set({ ...DEFAULT_PREFERENCES });
        pushFullPrefs(get());
      },
    }),
    {
      name: `${APP_SLUG}-preferences`,
      version: 10,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted: unknown, version: number) => {
        // Toute version antérieure → merge avec defaults : ajoute les champs
        // manquants (theme/font/colors, customThemes) sans perdre l'existant.
        const prev = (persisted ?? {}) as Partial<Preferences> & {
          avatarUrl?: string | null;
        };
        const merged = { ...DEFAULT_PREFERENCES, ...prev };
        // v5 utilisait '' comme sentinel auto-default. v6 abandonne cette
        // sémantique : les cadres "default" sont maintenant ceux dispo pour
        // tous (sans unlock), pas un cadre auto-appliqué. On retombe sur
        // 'none' (pas de cadre) ; user re-pick s'il veut un cadre.
        if (version < 6 && merged.borderId === '') {
          merged.borderId = 'none';
        }
        // v7 : avatarUrl déménage vers useProfile (SSOT = profiles.avatar_url
        // côté DB). On strip la clé du blob persisté ici.
        if (version < 7) {
          delete (merged as Record<string, unknown>).avatarUrl;
        }
        // v8 : ajout de fondId (default 'none'). Les versions <8 le récupèrent
        // depuis DEFAULT_PREFERENCES via le merge ci-dessus, rien à forcer.
        // v9 : ajout de fondOpacity (default 1). Idem, le merge ajoute
        // automatiquement le champ pour les états persistés sans, donc rien
        // à forcer non plus.
        // v10 : ajout de avatarFrameId (default 'none'). Le merge le remplit
        // automatiquement, rien à forcer.
        return merged;
      },
    },
  ),
);
