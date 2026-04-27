import { useState } from 'react';
import { supabase } from '../lib/supabase';

// OTP code flow : Supabase envoie un code 6 chiffres par email (template
// configuré sans magic link, juste {{ .Token }}). L'admin saisit l'email,
// reçoit le code, le colle pour finaliser.

type Step = 'email' | 'code';

export function LoginForm({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setStep('code');
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    onLoggedIn();
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: '80px auto',
        padding: 24,
        background: 'white',
        borderRadius: 12,
        border: '1px solid var(--line)',
      }}>
      <h1 style={{ marginTop: 0 }}>Admin badges</h1>
      <p className="muted">
        Connexion par code email. Le compte doit avoir <code>profiles.is_admin = true</code>.
      </p>

      {step === 'email' ? (
        <form onSubmit={sendCode}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn btn-primary" disabled={loading || !email} type="submit">
            {loading ? 'Envoi…' : 'Recevoir le code'}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyCode}>
          <p className="muted">
            Code envoyé à <strong>{email}</strong>.
          </p>
          <div className="field">
            <label>Code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              autoFocus
              maxLength={10}
              style={{ letterSpacing: '0.2em', fontFamily: 'ui-monospace, Menlo, monospace' }}
            />
          </div>
          {error && <div className="error">{error}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={loading || !code} type="submit">
              {loading ? 'Vérification…' : 'Valider'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}>
              Changer d'email
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
