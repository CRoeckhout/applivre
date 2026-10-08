import { AccessDenied } from "./components/access-denied";
import { LoginForm } from "./components/login";
import { Sidebar } from "./components/sidebar";
import { useAdminAuth } from "./lib/use-admin-auth";
import { useHashRoute } from "./lib/use-hash-route";
import { usePendingCounts } from "./lib/use-pending-counts";
import { useSidebarCollapsed } from "./lib/use-sidebar-collapsed";
import { useTheme } from "./lib/use-theme";
import { AvatarFramesSection } from "./sections/avatar-frames-section";
import { BadgesSection } from "./sections/badges-section";
import { BingoPillsSection } from "./sections/bingo-pills-section";
import { BooksSection } from "./sections/books-section";
import { BordersSection } from "./sections/borders-section";
import { EditorialSection } from "./sections/editorial-section";
import { FondsSection } from "./sections/fonds-section";
import { MusiquesSection } from "./sections/musiques-section";
import { ReleaseNotesSection } from "./sections/release-notes-section";
import { ReportsSection } from "./sections/reports-section";
import { StickersSection } from "./sections/stickers-section";
import { SubscriptionsSection } from "./sections/subscriptions-section";
import { TemplateGenresSection } from "./sections/template-genres-section";
import { UsersSection } from "./sections/users-section";

export function App() {
  const [auth, resolveAuth] = useAdminAuth();
  const { route, selectTab, selectItem } = useHashRoute();
  const [theme, toggleTheme] = useTheme();
  const sidebar = useSidebarCollapsed();
  const counts = usePendingCounts(auth.kind === "admin");

  if (auth.kind === "loading") {
    return <div style={{ padding: 40 }}>Chargement…</div>;
  }
  if (auth.kind === "logged_out") {
    return <LoginForm onLoggedIn={() => void resolveAuth()} />;
  }
  if (auth.kind === "not_admin") {
    return <AccessDenied />;
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <Sidebar
        collapsed={sidebar.collapsed}
        overlay={sidebar.overlay}
        activeTab={route.tab}
        badges={{
          pills: counts.proposedPills,
          reports: counts.pendingReports,
        }}
        theme={theme}
        onToggle={sidebar.toggle}
        onSelectTab={(tab) => {
          selectTab(tab);
          // Sur mobile, on referme la sidebar overlay après navigation pour
          // dégager le body.
          sidebar.closeOverlay();
        }}
        onToggleTheme={toggleTheme}
      />

      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        {route.tab === "users" && (
          <UsersSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "reports" && (
          <ReportsSection
            itemId={route.itemId}
            onItemChange={selectItem}
            onPendingCountChange={counts.setPendingReports}
          />
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
          <AvatarFramesSection
            itemId={route.itemId}
            onItemChange={selectItem}
          />
        )}
        {route.tab === "books" && (
          <BooksSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "pills" && (
          <BingoPillsSection
            itemId={route.itemId}
            onItemChange={selectItem}
            onProposedCountChange={counts.setProposedPills}
          />
        )}
        {route.tab === "musiques" && (
          <MusiquesSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "subscriptions" && (
          <SubscriptionsSection
            itemId={route.itemId}
            onItemChange={selectItem}
          />
        )}
        {route.tab === "editorial" && (
          <EditorialSection itemId={route.itemId} onItemChange={selectItem} />
        )}
        {route.tab === "release-notes" && (
          <ReleaseNotesSection
            itemId={route.itemId}
            onItemChange={selectItem}
          />
        )}
        {route.tab === "template-genres" && (
          <TemplateGenresSection
            itemId={route.itemId}
            onItemChange={selectItem}
          />
        )}
      </div>
    </div>
  );
}
