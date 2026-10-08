import React, { useEffect, useRef, useState } from "react";
import ChevronLeftIcon from "../assets/icons/chevron-left.svg?react";
import ChevronRightIcon from "../assets/icons/chevron-right.svg?react";
import InfoIcon from "../assets/icons/info.svg?react";
import LogoutIcon from "../assets/icons/logout.svg?react";
import MoonIcon from "../assets/icons/moon.svg?react";
import SunIcon from "../assets/icons/sun.svg?react";
import { supabase } from "../lib/supabase";
import type { Theme } from "../lib/use-theme";
import { TABS, TAB_ICONS, TAB_LABELS, type Tab } from "../tabs";
import {
  MOBILE_ASIDE_OVERLAY_STYLE,
  MobileAsideBackdrop,
} from "./collapsible-aside";

// Sidebar principale du backoffice : navigation entre onglets, badges de
// compteurs, bascule de thème, déconnexion et version. Repliable ; sur mobile
// la version dépliée passe en overlay (un placeholder de 64px garde la place
// de la version repliée pour ne pas faire sauter le contenu).
export function Sidebar({
  collapsed,
  overlay,
  activeTab,
  badges,
  theme,
  onToggle,
  onSelectTab,
  onToggleTheme,
}: {
  collapsed: boolean;
  overlay: boolean;
  activeTab: Tab;
  badges: Partial<Record<Tab, number>>;
  theme: Theme;
  onToggle: () => void;
  onSelectTab: (tab: Tab) => void;
  onToggleTheme: () => void;
}) {
  return (
    <>
      {overlay && (
        <div
          aria-hidden
          style={{
            width: 64,
            flexShrink: 0,
            borderRight: "1px solid var(--line)",
            background: "var(--surface)",
          }}
        />
      )}
      {overlay && <MobileAsideBackdrop onClose={onToggle} />}
      <aside
        style={{
          width: collapsed ? 64 : 220,
          flexShrink: 0,
          borderRight: "1px solid var(--line)",
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          transition: "width 180ms ease",
          ...(overlay ? MOBILE_ASIDE_OVERLAY_STYLE : null),
        }}
      >
        <div
          style={{
            padding: collapsed ? "12px 8px" : "12px 12px",
            borderBottom: "1px solid var(--line)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            justifyContent: collapsed ? "center" : "flex-start",
            minHeight: 52,
          }}
        >
          <button
            onClick={onToggle}
            title={collapsed ? "Déplier le menu" : "Replier le menu"}
            aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              padding: 0,
              borderRadius: 8,
              border: "1px solid var(--line)",
              background: "transparent",
              color: "var(--ink-muted)",
              cursor: "pointer",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--surface-2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </button>
          {!collapsed && (
            <span
              style={{
                fontWeight: 700,
                fontSize: 15,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              Grimolia — admin
            </span>
          )}
        </div>
        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            padding: collapsed ? 8 : 12,
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
          }}
        >
          {TABS.map((tab) => (
            <SidebarItem
              key={tab}
              label={TAB_LABELS[tab]}
              icon={TAB_ICONS[tab]}
              active={activeTab === tab}
              collapsed={collapsed}
              badge={badges[tab]}
              onClick={() => onSelectTab(tab)}
            />
          ))}
        </nav>
        <div
          style={{
            padding: collapsed ? 8 : 12,
            borderTop: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <SidebarAction
            label={theme === "dark" ? "Mode clair" : "Mode sombre"}
            icon={theme === "dark" ? <SunIcon /> : <MoonIcon />}
            collapsed={collapsed}
            onClick={onToggleTheme}
          />
          <SidebarAction
            label="Se déconnecter"
            icon={<LogoutIcon />}
            collapsed={collapsed}
            onClick={() => supabase.auth.signOut()}
          />
          <VersionBadge collapsed={collapsed} />
        </div>
      </aside>
    </>
  );
}

function SidebarItem({
  label,
  icon,
  active,
  collapsed,
  badge,
  onClick,
}: {
  label: string;
  icon: React.JSX.Element;
  active: boolean;
  collapsed: boolean;
  badge?: number | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        textAlign: "left",
        padding: collapsed ? "8px 0" : "8px 12px",
        justifyContent: collapsed ? "center" : "flex-start",
        borderRadius: 8,
        border: "1px solid transparent",
        borderColor: active ? "var(--accent)" : "transparent",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "white" : "var(--ink)",
        fontWeight: 600,
        fontSize: 13,
        cursor: "pointer",
        width: "100%",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <span
        style={{
          display: "inline-flex",
          flexShrink: 0,
          color: active ? "white" : "var(--ink-muted)",
        }}
      >
        {icon}
      </span>
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {badge != null && badge > 0 ? (
        collapsed ? (
          <span
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 999,
              background: "#ef4444",
              color: "white",
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {badge}
          </span>
        ) : (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 20,
              height: 20,
              padding: "0 6px",
              borderRadius: 999,
              background: active ? "white" : "#ef4444",
              color: active ? "var(--accent)" : "white",
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {badge}
          </span>
        )
      ) : null}
    </button>
  );
}

function SidebarAction({
  label,
  icon,
  collapsed,
  onClick,
}: {
  label: string;
  icon: React.JSX.Element;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        textAlign: "left",
        padding: collapsed ? "8px 0" : "8px 12px",
        justifyContent: collapsed ? "center" : "flex-start",
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
      <span
        style={{
          display: "inline-flex",
          flexShrink: 0,
          color: "var(--ink-muted)",
        }}
      >
        {icon}
      </span>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

// Badge version backoffice : déclencheur sobre (icône "i") dans le pied de
// sidebar. Tooltip révélé au hover (desktop) OU au click — le click pin
// l'état pour le tactile, où le hover CSS ne s'applique pas. Cliquer ailleurs
// referme. Pas de lib externe — un peu de state + CSS suffit.
function VersionBadge({ collapsed }: { collapsed: boolean }) {
  const [pinned, setPinned] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pinned) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setPinned(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [pinned]);

  return (
    <div ref={wrapRef} className="version-badge-wrap">
      <button
        onClick={() => setPinned((p) => !p)}
        aria-label={`Version backoffice : v${__ADMIN_VERSION__}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          textAlign: "left",
          padding: collapsed ? "6px 0" : "6px 12px",
          justifyContent: collapsed ? "center" : "flex-start",
          borderRadius: 8,
          border: "none",
          background: "transparent",
          color: "var(--ink-muted)",
          fontSize: 11,
          fontWeight: 500,
          cursor: "pointer",
          width: "100%",
          opacity: 0.7,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "0.7";
        }}
      >
        <span style={{ display: "inline-flex", flexShrink: 0 }}>
          <InfoIcon />
        </span>
        {!collapsed && <span>Backoffice</span>}
      </button>
      <div
        className={[
          "version-badge-tooltip",
          collapsed ? "centered" : "",
          pinned ? "pinned" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        Backoffice v{__ADMIN_VERSION__}
      </div>
    </div>
  );
}
