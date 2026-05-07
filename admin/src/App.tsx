import { useEffect, useState } from "react";
import { AvatarFramesSection } from "./sections/avatar-frames-section";
import { BadgesSection } from "./sections/badges-section";
import { BingoPillsSection } from "./sections/bingo-pills-section";
import { BooksSection } from "./sections/books-section";
import { BordersSection } from "./sections/borders-section";
import { FondsSection } from "./sections/fonds-section";
import { MusiquesSection } from "./sections/musiques-section";
import { StickersSection } from "./sections/stickers-section";
import { SubscriptionsSection } from "./sections/subscriptions-section";
import { UsersSection } from "./sections/users-section";
import { LoginForm } from "./components/login";
import { supabase } from "./lib/supabase";

type AuthState =
  | { kind: "loading" }
  | { kind: "logged_out" }
  | { kind: "not_admin" }
  | { kind: "admin" };

type Tab =
  | "users"
  | "badges"
  | "borders"
  | "fonds"
  | "stickers"
  | "avatar-frames"
  | "books"
  | "pills"
  | "musiques"
  | "subscriptions";
type Theme = "light" | "dark";

const TABS: Tab[] = [
  "users",
  "badges",
  "borders",
  "fonds",
  "stickers",
  "avatar-frames",
  "books",
  "pills",
  "musiques",
  "subscriptions",
];
const TAB_LABELS: Record<Tab, string> = {
  users: "Utilisateurs",
  badges: "Badges",
  borders: "Cadres",
  fonds: "Fonds",
  stickers: "Stickers",
  "avatar-frames": "Cadres photo",
  books: "Livres",
  pills: "Défis bingo",
  musiques: "Musiques",
  subscriptions: "Abonnements",
};
const TAB_ICONS: Record<Tab, JSX.Element> = {
  users: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  badges: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="6" />
      <path d="m9 14-2 7 5-3 5 3-2-7" />
    </svg>
  ),
  borders: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </svg>
  ),
  fonds: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  ),
  stickers: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 14 9l6 .5-4.5 4 1.5 6L12 16l-5 3.5 1.5-6L4 9.5 10 9z" />
    </svg>
  ),
  "avatar-frames": (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6.5 18a6 6 0 0 1 11 0" />
    </svg>
  ),
  books: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    </svg>
  ),
  pills: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  ),
  musiques: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  ),
  subscriptions: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
};
const DEFAULT_TAB: Tab = "users";
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
    <div style={{ display: "flex", height: "100vh" }}>
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: "1px solid var(--line)",
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--line)",
            fontWeight: 700,
            fontSize: 15,
          }}
        >
          Grimolia — admin
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2, padding: 12, flex: 1, minHeight: 0, overflowY: "auto" }}>
          {TABS.map((tab) => (
            <SidebarItem
              key={tab}
              label={TAB_LABELS[tab]}
              icon={TAB_ICONS[tab]}
              active={route.tab === tab}
              onClick={() => selectTab(tab)}
            />
          ))}
        </nav>
        <div
          style={{
            padding: 12,
            borderTop: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <SidebarAction
            label={theme === "dark" ? "Mode clair" : "Mode sombre"}
            icon={theme === "dark" ? <SunIcon /> : <MoonIcon />}
            onClick={toggleTheme}
          />
          <SidebarAction
            label="Se déconnecter"
            icon={<LogoutIcon />}
            onClick={() => supabase.auth.signOut()}
          />
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        {route.tab === "users" && (
          <UsersSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "badges" && (
          <BadgesSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "borders" && (
          <BordersSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "fonds" && (
          <FondsSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "stickers" && (
          <StickersSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "avatar-frames" && (
          <AvatarFramesSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "books" && (
          <BooksSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "pills" && (
          <BingoPillsSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "musiques" && (
          <MusiquesSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "subscriptions" && (
          <SubscriptionsSection itemId={route.itemId} onItemChange={selectItem} />
        )}
      </div>
    </div>
  );
}

function SidebarItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: JSX.Element;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        textAlign: "left",
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid transparent",
        borderColor: active ? "var(--accent)" : "transparent",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "white" : "var(--ink)",
        fontWeight: 600,
        fontSize: 13,
        cursor: "pointer",
        width: "100%",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ display: "inline-flex", flexShrink: 0, color: active ? "white" : "var(--ink-muted)" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function SidebarAction({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: JSX.Element;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        textAlign: "left",
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid transparent",
        background: "transparent",
        color: "var(--ink)",
        fontWeight: 500,
        fontSize: 13,
        cursor: "pointer",
        width: "100%",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ display: "inline-flex", flexShrink: 0, color: "var(--ink-muted)" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
