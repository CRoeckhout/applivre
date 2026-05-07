import type { CSSProperties } from "react";
import { BadgeGraphicWeb } from "../lib/badge-graphic";
import { publicAssetUrl } from "../lib/storage";
import type {
  AdminUserAppearance,
  AdminUserProfile,
  AvatarFrameCatalogRow,
  BadgeCatalogRow,
  BorderCatalogRow,
  FondCatalogRow,
} from "../lib/types";

type Stat = { label: string; value: string | number };

type Props = {
  profile: AdminUserProfile | null;
  email: string | null;
  lastActivityAt: string | null;
  // Liste ordonnée des badges débloqués (badge_key) — limit 5 affichés.
  unlockedBadgeKeys: string[];
  // Catalogs résolus pour le rendu des cosmétiques. Tous nullables : si null
  // → fallback nu (pas de fond, border simple, pas de frame).
  badgeCatalog: BadgeCatalogRow[];
  border: BorderCatalogRow | null;
  fond: FondCatalogRow | null;
  frame: AvatarFrameCatalogRow | null;
  stats?: Stat[];
};

const RICH_AVATAR_SIZE = 64;
const RICH_BADGE_SIZE = 28;
const MAX_VISIBLE_BADGES = 5;

// Mapping fontId → font-family CSS. Doit rester aligné avec
// `lib/theme/fonts.ts` côté mobile : mêmes id, mais on cible la famille
// Google Fonts (chargée dans index.html) plutôt que les variantes Expo.
const FONT_ID_TO_CSS: Record<string, string> = {
  "dm-sans": '"DM Sans", system-ui, sans-serif',
  lora: '"Lora", Georgia, serif',
  caveat: '"Caveat", "Comic Sans MS", cursive',
  unifraktur: '"UnifrakturMaguntia", serif',
  orbitron: '"Orbitron", "Trebuchet MS", sans-serif',
  "space-mono": '"Space Mono", ui-monospace, monospace',
};

// hexA(#rrggbb, alpha) → "#rrggbbaa". Renvoie undefined si pas un hex
// 6-digits (on veut un fallback safe côté caller).
function hexA(hex: string | undefined, alpha: number): string | undefined {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

export function UserRichCard({
  profile,
  email,
  lastActivityAt,
  unlockedBadgeKeys,
  badgeCatalog,
  border,
  fond,
  frame,
  stats,
}: Props) {
  if (!profile) {
    return (
      <div className="card" style={baseCardStyle}>
        <div className="muted" style={{ fontSize: 13 }}>
          Profil indisponible.
        </div>
      </div>
    );
  }

  const appearance = readAppearance(profile.preferences);
  const primary = profile.username || profile.display_name || "Utilisateur";
  const secondary =
    profile.username &&
    profile.display_name &&
    profile.display_name !== profile.username
      ? profile.display_name
      : null;
  const initials = initialsOf(primary);

  // Apparence : on lit les 4 entrées CSS-able du blob preferences.
  // - fontFamily : police user (Google Fonts, cf. index.html). Appliquée à
  //   toute la carte via `style={{ fontFamily }}` sur le wrapper interne.
  // - inkColor : `colorSecondary` du user = couleur du texte (ink) côté
  //   mobile. Fallback CSS var.
  // - mutedColor : version 60% opacity (parité avec hexWithAlpha mobile).
  // - accentColor : `colorPrimary` (utilisé pour les bordures de stats /
  //   séparateur footer).
  const fontFamily = appearance.fontId
    ? FONT_ID_TO_CSS[appearance.fontId] ?? `"${appearance.fontId}", inherit`
    : undefined;
  const inkColor = appearance.colorSecondary ?? "var(--ink)";
  const mutedColor = hexA(appearance.colorSecondary, 0.6) ?? "var(--ink-muted)";
  const accentColor = appearance.colorPrimary ?? "var(--accent)";

  // Style du wrapper : fond image (cover/tile) + border 9-slice si dispo +
  // colorBg si défini (priorité bg image > colorBg > var(--surface)).
  const wrapperStyle = buildWrapperStyle(border, fond, appearance.colorBg);

  const visibleBadges = unlockedBadgeKeys
    .slice(0, MAX_VISIBLE_BADGES)
    .map((key) => badgeCatalog.find((b) => b.badge_key === key))
    .filter((b): b is BadgeCatalogRow => Boolean(b));

  return (
    <div style={wrapperStyle}>
      <div
        style={{
          position: "relative",
          padding: 16,
          fontFamily,
          color: inkColor,
        }}>
        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "flex-start",
          }}>
          <AvatarWithFrame
            avatarUrl={profile.avatar_url}
            initials={initials}
            frame={frame}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
                marginBottom: 4,
              }}>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: inkColor,
                }}>
                {primary}
              </span>
              {profile.is_premium ? <PremiumChip /> : null}
              {profile.is_admin ? <AdminChip /> : null}
            </div>
            {secondary ? (
              <div
                style={{
                  fontSize: 13,
                  marginBottom: 6,
                  color: mutedColor,
                }}>
                {secondary}
              </div>
            ) : null}
            {visibleBadges.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 4,
                }}>
                {visibleBadges.map((b) => (
                  <div
                    key={b.badge_key}
                    title={b.title}
                    style={{
                      width: RICH_BADGE_SIZE,
                      height: RICH_BADGE_SIZE,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                    <BadgeGraphicWeb
                      kind={b.graphic_kind}
                      payload={b.graphic_payload}
                      tokens={b.graphic_tokens}
                      size={RICH_BADGE_SIZE}
                    />
                  </div>
                ))}
                {unlockedBadgeKeys.length > MAX_VISIBLE_BADGES ? (
                  <span
                    style={{
                      fontSize: 11,
                      alignSelf: "center",
                      marginLeft: 4,
                      color: mutedColor,
                    }}>
                    +{unlockedBadgeKeys.length - MAX_VISIBLE_BADGES}
                  </span>
                ) : null}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: mutedColor }}>
                Aucun badge débloqué.
              </div>
            )}
          </div>
        </div>

        {stats && stats.length > 0 ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
              gap: 8,
              marginTop: 14,
            }}>
            {stats.map((s) => (
              <StatTile
                key={s.label}
                label={s.label}
                value={s.value}
                inkColor={inkColor}
                mutedColor={mutedColor}
                accentColor={accentColor}
              />
            ))}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${
              hexA(appearance.colorSecondary, 0.18) ?? "var(--line)"
            }`,
            fontSize: 12,
            color: mutedColor,
          }}>
          <span>
            Email :{" "}
            <strong style={{ color: inkColor, fontFamily: "monospace" }}>
              {email ?? "—"}
            </strong>
          </span>
          <span>
            Compte :{" "}
            <strong style={{ color: inkColor }}>
              {new Date(profile.created_at).toLocaleDateString()}
            </strong>
          </span>
          <span>
            Dernière activité :{" "}
            <strong style={{ color: inkColor }}>
              {lastActivityAt
                ? formatRelative(lastActivityAt)
                : "jamais"}
            </strong>
          </span>
          {profile.is_premium && profile.premium_until ? (
            <span>
              Premium jusqu'au :{" "}
              <strong style={{ color: inkColor }}>
                {new Date(profile.premium_until).toLocaleDateString()}
              </strong>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ─── Avatar + frame overlay ────────────────────────────────────────────

function AvatarWithFrame({
  avatarUrl,
  initials,
  frame,
}: {
  avatarUrl: string | null;
  initials: string;
  frame: AvatarFrameCatalogRow | null;
}) {
  const size = RICH_AVATAR_SIZE;

  // Pas de cadre ou cadre Lottie (non supporté en V1) → rendu nu.
  const frameUri =
    frame && frame.kind === "png" ? publicAssetUrl("avatarFrame", frame.storage_path) : null;

  if (!frameUri) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
          background: "var(--surface-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 22,
          color: "var(--ink-muted)",
          flexShrink: 0,
        }}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          initials
        )}
      </div>
    );
  }

  // Convention identique à components/avatar-frame.tsx (mobile) : on garde
  // l'avatar à `size` et on étend le PNG du cadre vers l'extérieur via un
  // ratio dérivé de image_scale + image_padding (en espace natif).
  const nativeWidth = frame!.image_width || size;
  const paddingScaled =
    nativeWidth > 0 ? (frame!.image_padding * size) / nativeWidth : 0;
  const ratio = Math.max(0.05, frame!.image_scale - (2 * paddingScaled) / size);
  const frameOuterSize = size / ratio;
  const frameOffset = (frameOuterSize - size) / 2;

  return (
    <div
      style={{
        width: size,
        height: size,
        position: "relative",
        flexShrink: 0,
      }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: size / 2,
          overflow: "hidden",
          background: "var(--surface-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 22,
          color: "var(--ink-muted)",
        }}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          initials
        )}
      </div>
      <img
        src={frameUri}
        alt=""
        aria-hidden
        style={{
          position: "absolute",
          top: -frameOffset,
          left: -frameOffset,
          width: frameOuterSize,
          height: frameOuterSize,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// ─── Chips ─────────────────────────────────────────────────────────────

function PremiumChip() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        color: "#5a3b00",
        background:
          "linear-gradient(135deg, #f7d76e 0%, #d4a017 50%, #f5d76e 100%)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.08)",
      }}>
      Premium
    </span>
  );
}

function AdminChip() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        color: "white",
        background: "var(--accent)",
      }}>
      Admin
    </span>
  );
}

// ─── Stat tile ─────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  inkColor,
  mutedColor,
  accentColor,
}: Stat & { inkColor: string; mutedColor: string; accentColor: string }) {
  // Bordure tintée à 40% de l'accent : visible mais pas criarde, et reste
  // lisible sur n'importe quel fond image en arrière-plan.
  const borderColor = hexA(
    accentColor.startsWith("#") ? accentColor : undefined,
    0.4,
  ) ?? "var(--line)";
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.55)",
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        padding: "8px 10px",
        textAlign: "center",
      }}>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          lineHeight: 1.1,
          color: inkColor,
        }}>
        {value}
      </div>
      <div style={{ fontSize: 11, marginTop: 2, color: mutedColor }}>
        {label}
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────

const baseCardStyle: CSSProperties = {
  border: "1px solid var(--line)",
  background: "var(--surface)",
  borderRadius: 12,
  padding: 14,
};

function buildWrapperStyle(
  border: BorderCatalogRow | null,
  fond: FondCatalogRow | null,
  colorBg: string | undefined,
): CSSProperties {
  // Border (9-slice PNG only en V1, fallback contour simple sinon).
  let borderStyles: CSSProperties = {
    border: "1px solid var(--line)",
    borderRadius: 12,
  };
  if (border && border.kind === "png_9slice") {
    const url = publicAssetUrl("border", border.storage_path);
    if (url) {
      const repeat = border.repeat_mode === "round" ? "round" : "stretch";
      borderStyles = {
        borderStyle: "solid",
        borderWidth: `${border.slice_top}px ${border.slice_right}px ${border.slice_bottom}px ${border.slice_left}px`,
        borderImageSource: `url("${url}")`,
        borderImageSlice: `${border.slice_top} ${border.slice_right} ${border.slice_bottom} ${border.slice_left}`,
        borderImageRepeat: repeat,
        borderRadius: 0,
      };
    }
  }

  // Fond : priorité bg image > colorBg user > var(--surface). Le mobile
  // applique aussi colorBg comme backdrop quand un fond image existe (il
  // teinte les pixels transparents du PNG) — on fait pareil ici via
  // backgroundColor en plus de backgroundImage.
  const fallbackBg = colorBg ?? "var(--surface)";
  let bgStyles: CSSProperties = { background: fallbackBg };
  if (fond && fond.kind === "png_9slice") {
    const url = publicAssetUrl("fond", fond.storage_path);
    if (url) {
      bgStyles = {
        backgroundImage: `url("${url}")`,
        backgroundColor: fallbackBg,
        backgroundSize: fond.repeat_mode === "tile" ? "auto" : "cover",
        backgroundRepeat: fond.repeat_mode === "tile" ? "repeat" : "no-repeat",
        backgroundPosition: "center",
      };
    }
  }

  return {
    ...bgStyles,
    ...borderStyles,
    overflow: "hidden",
  };
}

function readAppearance(
  preferences: Record<string, unknown> | null | undefined,
): AdminUserAppearance {
  if (!preferences) return {};
  const out: AdminUserAppearance = {};
  for (const k of [
    "fontId",
    "colorPrimary",
    "colorSecondary",
    "colorBg",
    "borderId",
    "fondId",
    "avatarFrameId",
  ] as const) {
    const v = preferences[k];
    if (typeof v === "string") out[k] = v;
  }
  if (typeof preferences.fondOpacity === "number") {
    out.fondOpacity = preferences.fondOpacity;
  }
  return out;
}

function initialsOf(name: string): string {
  const parts = name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return parts || "?";
}

function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  const diffMs = Date.now() - ts;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "à l'instant";
  const min = Math.round(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} j`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `il y a ${mo} mois`;
  return new Date(iso).toLocaleDateString();
}
