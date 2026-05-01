type Props = {
  isDefault: boolean;
  setIsDefault: (v: boolean) => void;
  // Texte d'aide spécifique (cadres parlent de user_borders, fonds de
  // user_fonds). Le caller fournit la phrase exacte.
  helper: string;
};

// Toggle "Disponible pour tous". Coché ⇒ visible par tous les users sans
// unlock. Décoché ⇒ verrouillé, le user doit débloquer l'asset (table
// user_borders/user_fonds) pour le voir.
export function VisibilityFieldset({ isDefault, setIsDefault, helper }: Props) {
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
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
        />
        <span style={{ fontWeight: 600, fontSize: 13 }}>Disponible pour tous</span>
      </label>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
        {helper}
      </div>
    </fieldset>
  );
}
