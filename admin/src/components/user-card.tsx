import type { ReactNode } from "react";
import type { UserCardData } from "../lib/types";

type Stat = { label: string; value: number };

type Props = {
  user: UserCardData | null;
  loading?: boolean;
  error?: string | null;
  emptyLabel?: string;
  stats?: Stat[];
  footer?: ReactNode;
};

const cardStyle: React.CSSProperties = {
  border: "1px solid var(--line)",
  background: "var(--surface)",
  borderRadius: 12,
  padding: 14,
};

export function UserCard({
  user,
  loading,
  error,
  emptyLabel,
  stats,
  footer,
}: Props) {
  if (loading) {
    return (
      <div style={cardStyle}>
        <div className="muted" style={{ fontSize: 13 }}>
          Chargement…
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div style={cardStyle}>
        <div className="error" style={{ fontSize: 13 }}>
          Erreur : {error}
        </div>
      </div>
    );
  }
  if (!user) {
    return (
      <div style={cardStyle}>
        <div className="muted" style={{ fontSize: 13 }}>
          {emptyLabel ?? "Utilisateur inconnu."}
        </div>
      </div>
    );
  }

  const name =
    user.display_name || user.username || user.email || "Utilisateur";
  const initials =
    name
      .split(/[\s.@_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            overflow: "hidden",
            flexShrink: 0,
            background: "var(--line)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: 18,
            color: "var(--text-muted, #888)",
          }}
        >
          {user.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            initials
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
            {user.username ?? user.display_name ?? "—"}
          </div>
          <div
            className="muted"
            style={{
              fontSize: 12,
              fontFamily: "monospace",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={user.email ?? ""}
          >
            {user.email ?? "—"}
          </div>
        </div>
      </div>

      {stats && stats.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
            gap: 8,
            marginTop: 12,
          }}
        >
          {stats.map((s) => (
            <UserCardStat key={s.label} label={s.label} value={s.value} />
          ))}
        </div>
      )}

      {(footer || user.account_created_at) && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid var(--line)",
            fontSize: 12,
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {user.account_created_at && (
            <span className="muted">
              Compte :{" "}
              <strong style={{ color: "var(--text)" }}>
                {new Date(user.account_created_at).toLocaleDateString()}
              </strong>
            </span>
          )}
          {footer}
        </div>
      )}
    </div>
  );
}

function UserCardStat({ label, value }: Stat) {
  return (
    <div
      style={{
        background: "var(--bg, transparent)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        padding: "8px 10px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>
        {value}
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}
