import { supabase } from "../lib/supabase";

// Écran affiché quand la session est valide mais que le profil n'a pas
// `is_admin`.
export function AccessDenied() {
  return (
    <div
      style={{
        maxWidth: 480,
        margin: "80px auto",
        padding: 24,
        background: "var(--surface)",
        borderRadius: 12,
        border: "1px solid var(--line)",
      }}
    >
      <h1>Accès refusé</h1>
      <p>
        Ce compte n'a pas <code>profiles.is_admin = true</code>.
      </p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>
        Se déconnecter
      </button>
    </div>
  );
}
