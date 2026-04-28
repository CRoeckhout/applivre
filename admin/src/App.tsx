import { useEffect, useState } from "react";
import { BadgesSection } from "./sections/badges-section";
import { BooksSection } from "./sections/books-section";
import { BordersSection } from "./sections/borders-section";
import { LoginForm } from "./components/login";
import { supabase } from "./lib/supabase";

type AuthState =
  | { kind: "loading" }
  | { kind: "logged_out" }
  | { kind: "not_admin" }
  | { kind: "admin" };

type Tab = "badges" | "borders" | "books";

export function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
  const [tab, setTab] = useState<Tab>("badges");

  useEffect(() => {
    void resolveAuth();
    const sub = supabase.auth.onAuthStateChange(() => {
      void resolveAuth();
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  async function resolveAuth() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setAuth({ kind: "logged_out" });
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", session.user.id)
      .maybeSingle();
    setAuth({ kind: profile?.is_admin ? "admin" : "not_admin" });
  }

  if (auth.kind === "loading") {
    return <div style={{ padding: 40 }}>Chargement…</div>;
  }
  if (auth.kind === "logged_out") {
    return <LoginForm onLoggedIn={() => void resolveAuth()} />;
  }
  if (auth.kind === "not_admin") {
    return (
      <div
        style={{
          maxWidth: 480,
          margin: "80px auto",
          padding: 24,
          background: "white",
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          padding: "10px 24px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "white",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <strong>Grimolia — admin</strong>
          <nav style={{ display: "flex", gap: 4 }}>
            <TabButton label="Badges" active={tab === "badges"} onClick={() => setTab("badges")} />
            <TabButton label="Cadres" active={tab === "borders"} onClick={() => setTab("borders")} />
            <TabButton label="Livres" active={tab === "books"} onClick={() => setTab("books")} />
          </nav>
        </div>
        <button className="btn" onClick={() => supabase.auth.signOut()}>
          Se déconnecter
        </button>
      </header>

      <div style={{ flex: 1, minHeight: 0 }}>
        {tab === "badges" && <BadgesSection />}
        {tab === "borders" && <BordersSection />}
        {tab === "books" && <BooksSection />}
      </div>
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 8,
        border: "1px solid",
        borderColor: active ? "var(--accent)" : "var(--line)",
        background: active ? "var(--accent)" : "white",
        color: active ? "white" : "var(--ink)",
        fontWeight: 600,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
