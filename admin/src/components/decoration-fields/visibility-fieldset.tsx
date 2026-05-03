import {
  CATALOG_AVAILABILITIES,
  CATALOG_AVAILABILITY_LABELS,
  type CatalogAvailability,
} from '../../lib/types';

type Props = {
  availability: CatalogAvailability;
  setAvailability: (v: CatalogAvailability) => void;
  // Texte d'aide spécifique au type d'asset (cadre/fond/sticker/avatar).
  // Le caller fournit la phrase exacte décrivant ce qui se passe pour les
  // modes `badge` / `premium` côté app.
  helper: string;
};

// Selecteur "Visibilité" à 4 modes mutuellement exclusifs (cf. enum
// public.catalog_availability). `unit` est désactivé en attendant la mécanique
// d'achat à l'unité (TBD). `badge` ne demande pas encore de badge_key — l'admin
// le branchera plus tard via une section dédiée.
export function AvailabilityFieldset({ availability, setAvailability, helper }: Props) {
  return (
    <fieldset
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: 12,
        marginBottom: 16,
      }}>
      <legend
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--ink-muted)',
          textTransform: 'uppercase',
          padding: '0 6px',
        }}>
        Visibilité
      </legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {CATALOG_AVAILABILITIES.map((mode) => {
          const disabled = mode === 'unit';
          const checked = availability === mode;
          return (
            <label
              key={mode}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
              }}>
              <input
                type="radio"
                name="catalog-availability"
                value={mode}
                checked={checked}
                disabled={disabled}
                onChange={() => {
                  if (!disabled) setAvailability(mode);
                }}
              />
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                {CATALOG_AVAILABILITY_LABELS[mode]}
              </span>
              {disabled && (
                <span className="muted" style={{ fontSize: 11 }}>(à venir)</span>
              )}
            </label>
          );
        })}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        {helper}
      </div>
    </fieldset>
  );
}

// Alias retro-compat pour ne pas casser les imports existants pendant la
// transition. À retirer une fois les forms migrés.
export const VisibilityFieldset = AvailabilityFieldset;
