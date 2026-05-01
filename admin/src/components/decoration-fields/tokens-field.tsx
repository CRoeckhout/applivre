import { TOKEN_LABELS } from './helpers';

type Props = {
  tokensJson: string;
  setTokensJson: (s: string) => void;
  // Override de couleurs locales pour la preview (jamais persisté). Permet
  // de mimer le rendu d'un thème dans l'app.
  previewOverrides: Record<string, string>;
  setPreviewOverrides: (next: Record<string, string>) => void;
  parsedTokens: Record<string, string>;
  tokensError: string | null;
};

// UI tokens : pills toggle (ajout/retrait par slot connu) + textarea JSON
// brute (override avancé) + mini color pickers locaux pour preview overrides.
// Les pills mutent `tokensJson` directement via JSON.stringify — la source
// de vérité côté caller reste le texte JSON.
export function TokensField({
  tokensJson,
  setTokensJson,
  previewOverrides,
  setPreviewOverrides,
  parsedTokens,
  tokensError,
}: Props) {
  return (
    <div className="field">
      <label>Tokens (JSON)</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {TOKEN_LABELS.map((t) => {
          const present = Object.prototype.hasOwnProperty.call(parsedTokens, t.name);
          const overrideHex = previewOverrides[t.name];
          return (
            <div
              key={t.name}
              style={{
                display: 'inline-flex',
                alignItems: 'stretch',
                borderRadius: 999,
                border: present
                  ? '1px solid var(--accent, #c27b52)'
                  : '1px solid var(--line)',
                background: present
                  ? 'var(--accent-pale, #fff5ee)'
                  : 'var(--surface)',
                opacity: tokensError ? 0.5 : 1,
                overflow: 'hidden',
              }}>
              <button
                type="button"
                disabled={!!tokensError}
                onClick={() => {
                  const next = { ...parsedTokens };
                  if (present) {
                    delete next[t.name];
                    const copy = { ...previewOverrides };
                    delete copy[t.name];
                    setPreviewOverrides(copy);
                  } else {
                    next[t.name] = '#000000';
                  }
                  setTokensJson(JSON.stringify(next, null, 2));
                }}
                title={present ? `Retirer ${t.name}` : `Ajouter ${t.name}`}
                style={{
                  fontSize: 11,
                  padding: '3px 10px',
                  border: 'none',
                  background: 'transparent',
                  color: present ? 'var(--accent-deep, #9b5a38)' : 'var(--ink)',
                  cursor: tokensError ? 'default' : 'pointer',
                }}>
                {t.label}
                <span
                  style={{
                    marginLeft: 6,
                    color: present ? 'var(--accent-deep, #9b5a38)' : 'var(--ink-muted)',
                    fontSize: 10,
                  }}>
                  {t.name}
                </span>
              </button>
              {present && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '0 8px 0 6px',
                    borderLeft: '1px solid var(--accent, #c27b52)',
                  }}>
                  <label
                    title={
                      overrideHex
                        ? `Preview override : ${overrideHex}`
                        : 'Choisir une couleur de preview'
                    }
                    style={{
                      position: 'relative',
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      border: '1px solid var(--line)',
                      background: overrideHex ?? 'transparent',
                      cursor: 'pointer',
                      display: 'inline-block',
                    }}>
                    <input
                      type="color"
                      value={overrideHex ?? '#000000'}
                      onChange={(e) =>
                        setPreviewOverrides({
                          ...previewOverrides,
                          [t.name]: e.target.value,
                        })
                      }
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        opacity: 0,
                        border: 'none',
                        padding: 0,
                        margin: 0,
                        cursor: 'pointer',
                      }}
                    />
                  </label>
                  {overrideHex && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        const copy = { ...previewOverrides };
                        delete copy[t.name];
                        setPreviewOverrides(copy);
                      }}
                      title="Reset preview override"
                      style={{
                        fontSize: 10,
                        lineHeight: 1,
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--ink)',
                        padding: 0,
                      }}>
                      ×
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <textarea
        rows={3}
        value={tokensJson}
        onChange={(e) => setTokensJson(e.target.value)}
        spellCheck={false}
      />
      {tokensError && <div className="error">{tokensError}</div>}
    </div>
  );
}
