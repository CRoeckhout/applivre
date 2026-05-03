// Composants et helpers partagés entre les forms d'admin pour les
// "décorations" (cadres et fonds) : tous deux supportent PNG/SVG, des tokens
// SVG, des périodes (active_from / until / retired_at) et un flag de
// disponibilité publique. Ce module factorise les blocs UI et helpers
// communs ; les forms spécifiques (border-form, fond-form) y greffent leurs
// champs propres (slice/bg_inset/card_padding pour les cadres, repeat
// cover/tile pour les fonds).

export { KindFileFieldset } from './kind-file-fieldset';
export { TokensField } from './tokens-field';
export { PeriodFieldset } from './period-fieldset';
export { AvailabilityFieldset, VisibilityFieldset } from './visibility-fieldset';
export { AvailabilityBadge } from './availability-badge';
export { SizeSlider } from './size-slider';
export {
  applySvgPreviewOverrides,
  escapeRegex,
  extractSvgDims,
  parseOptInt,
  TOKEN_LABELS,
  type DecorationKind,
  type TokenLabelEntry,
} from './helpers';
