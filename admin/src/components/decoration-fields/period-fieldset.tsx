type Props = {
  activeFrom: string;
  setActiveFrom: (s: string) => void;
  activeUntil: string;
  setActiveUntil: (s: string) => void;
  retiredAt: string;
  setRetiredAt: (s: string) => void;
};

// Bornes temporelles d'un asset du catalog. Toutes optionnelles : laisser
// vide = pas de borne. `retired_at` set = caché de tous les users (bypass des
// active_from/until).
export function PeriodFieldset({
  activeFrom,
  setActiveFrom,
  activeUntil,
  setActiveUntil,
  retiredAt,
  setRetiredAt,
}: Props) {
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
        Période
      </legend>
      <div className="field">
        <label>active_from</label>
        <input
          type="datetime-local"
          value={activeFrom}
          onChange={(e) => setActiveFrom(e.target.value)}
        />
      </div>
      <div className="field">
        <label>active_until</label>
        <input
          type="datetime-local"
          value={activeUntil}
          onChange={(e) => setActiveUntil(e.target.value)}
        />
      </div>
      <div className="field">
        <label>retired_at</label>
        <input
          type="datetime-local"
          value={retiredAt}
          onChange={(e) => setRetiredAt(e.target.value)}
        />
      </div>
    </fieldset>
  );
}
