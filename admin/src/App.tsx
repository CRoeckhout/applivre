import { useEffect, useState } from "react";
import { BadgesSection } from "./sections/badges-section";
import { BingoPillsSection } from "./sections/bingo-pills-section";
import { BooksSection } from "./sections/books-section";
import { BordersSection } from "./sections/borders-section";
import { LoginForm } from "./components/login";
import { supabase } from "./lib/supabase";

type AuthState =
  | { kind: "loading" }
  | { kind: "logged_out" }
  | { kind: "not_admin" }
  | { kind: "admin" };

type Tab = "badges" | "borders" | "books" | "pills";
type Theme = "light" | "dark";

const TABS: Tab[] = ["badges", "borders", "books", "pills"];
const DEFAULT_TAB: Tab = "badges";
const THEME_KEY = "admin-theme";

function readInitialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

type Route = { tab: Tab; itemId: string | null };

function readRouteFromHash(): Route {
  // Format : `#/<tab>` ou `#/<tab>/<itemId>`. ItemId encodé URL.
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [tabRaw, ...rest] = raw.split("/");
  const tab = (TABS as string[]).includes(tabRaw) ? (tabRaw as Tab) : DEFAULT_TAB;
  const idRaw = rest.join("/");
  const itemId = idRaw.length > 0 ? safeDecode(idRaw) : null;
  return { tab, itemId };
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function buildHash(tab: Tab, itemId: string | null): string {
  return itemId ? `#/${tab}/${encodeURIComponent(itemId)}` : `#/${tab}`;
}

export function App() {
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
  const [route, setRoute] = useState<Route>(() => readRouteFromHash());
  const [theme, setTheme] = useState<Theme>(() => {
    const initial = readInitialTheme();
    applyTheme(initial);
    return initial;
  });

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    localStorage.setItem(THEME_KEY, next);
  }

  useEffect(() => {
    void resolveAuth();
    const sub = supabase.auth.onAuthStateChange(() => {
      void resolveAuth();
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(readRouteFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function selectTab(next: Tab) {
    if (route.tab === next) return;
    const nextRoute: Route = { tab: next, itemId: null };
    setRoute(nextRoute);
    const hash = buildHash(nextRoute.tab, nextRoute.itemId);
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }

  function selectItem(itemId: string | null) {
    if (route.itemId === itemId) return;
    const nextRoute: Route = { tab: route.tab, itemId };
    setRoute(nextRoute);
    const hash = buildHash(nextRoute.tab, nextRoute.itemId);
    if (window.location.hash !== hash) {
      window.history.replaceState(null, "", hash);
    }
  }

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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <header
        style={{
          padding: "10px 24px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "var(--surface)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <strong>Grimolia — admin</strong>
          <nav style={{ display: "flex", gap: 4 }}>
            <TabButton label="Badges" active={route.tab === "badges"} onClick={() => selectTab("badges")} />
            <TabButton label="Cadres" active={route.tab === "borders"} onClick={() => selectTab("borders")} />
            <TabButton label="Livres" active={route.tab === "books"} onClick={() => selectTab("books")} />
            <TabButton label="Défis bingo" active={route.tab === "pills"} onClick={() => selectTab("pills")} />
          </nav>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="btn"
            onClick={toggleTheme}
            title={theme === "dark" ? "Passer en clair" : "Passer en sombre"}
            aria-label="Basculer le thème"
          >
            {theme === "dark" ? "☀︎" : "☾"}
          </button>
          <button className="btn" onClick={() => supabase.auth.signOut()}>
            Se déconnecter
          </button>
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0 }}>
        {route.tab === "badges" && (
          <BadgesSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "borders" && (
          <BordersSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "books" && (
          <BooksSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "pills" && (
          <BingoPillsSection itemId={route.itemId} onItemChange={selectItem} />
        )}
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
        background: active ? "var(--accent)" : "var(--surface)",
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
