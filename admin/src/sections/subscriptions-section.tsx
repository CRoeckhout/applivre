import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import type { FreemiumSettingsRow } from "../lib/types";

// Section "Abonnements" — pour l'instant, une seule sous-section "Freemium"
// éditant les limites du plan gratuit (table freemium_settings, singleton id=1).
// Les autres sous-sections (produits in-app, badges-unlock, etc.) viendront
// quand les phases 2/3 seront en place.

type Props = {
  itemId: string | null;
  onItemChange: (id: string | null) => void;
};

type SubTab = "freemium";

const SUBTABS: SubTab[] = ["freemium"];
const SUBTAB_LABELS: Record<SubTab, string> = {
  freemium: "Freemium",
};

export function SubscriptionsSection({ itemId, onItemChange }: Props) {
  const sub: SubTab = (SUBTABS as string[]).includes(itemId ?? "")
    ? (itemId as SubTab)
    : "freemium";

  function selectSub(next: SubTab) {
    if (next === sub) return;
    onItemChange(next);
  }

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          borderRight: "1px solid var(--line)",
          background: "var(--surface)",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--ink-muted)",
            textTransform: "uppercase",
            padding: "4px 8px 8px",
          }}>
          Abonnements
        </div>
        {SUBTABS.map((s) => (
          <button
            key={s}
            onClick={() => selectSub(s)}
            style={{
              textAlign: "left",
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid transparent",
              borderColor: sub === s ? "var(--accent)" : "transparent",
              background: sub === s ? "var(--accent)" : "transparent",
              color: sub === s ? "white" : "var(--ink)",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              width: "100%",
            }}>
            {SUBTAB_LABELS[s]}
          </button>
        ))}
      </aside>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto" }}>
        {sub === "freemium" && <FreemiumPanel />}
      </div>
    </div>
  );
}

function FreemiumPanel() {
  const [row, setRow] = useState<FreemiumSettingsRow | null>(null);
  const [maxSheets, setMaxSheets] = useState<string>("");
  const [maxActiveBingos, setMaxActiveBingos] = useState<string>("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoadError(null);
    const { data, error } = await supabase
      .from("freemium_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) {
      setLoadError(error.message);
      return;
    }
    if (data) {
      const r = data as FreemiumSettingsRow;
      setRow(r);
      setMaxSheets(String(r.max_sheets));
      setMaxActiveBingos(String(r.max_active_bingos));
    }
  }

  async function save() {
    setSaveError(null);
    setSuccess(null);
    const ms = Number.parseInt(maxSheets, 10);
    const mb = Number.parseInt(maxActiveBingos, 10);
    if (!Number.isFinite(ms) || ms <= 0) {
      setSaveError("Max fiches : entier > 0 requis");
      return;
    }
    if (!Number.isFinite(mb) || mb <= 0) {
      setSaveError("Max bingos en cours : entier > 0 requis");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase
      .from("freemium_settings")
      .update({ max_sheets: ms, max_active_bingos: mb })
      .eq("id", 1)
      .select()
      .single();
    setSubmitting(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    const r = data as FreemiumSettingsRow;
    setRow(r);
    setMaxSheets(String(r.max_sheets));
    setMaxActiveBingos(String(r.max_active_bingos));
    setSuccess("Enregistré.");
  }

  const dirty =
    row !== null &&
    (Number.parseInt(maxSheets, 10) !== row.max_sheets ||
      Number.parseInt(maxActiveBingos, 10) !== row.max_active_bingos);

  return (
    <main style={{ padding: 0, overflowY: "auto" }}>
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "16px 24px 24px",
        }}>
        <h2 style={{ marginTop: 0 }}>Freemium</h2>
        <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
          Limites appliquées aux utilisateurs sans abonnement premium. Modifiable à
          tout moment ; l&apos;app lit la table <code>freemium_settings</code> au
          démarrage.
        </p>

        {loadError && (
          <div className="error" style={{ marginBottom: 12 }}>
            Load error: {loadError}
          </div>
        )}

        <fieldset
          style={{
            border: "1px solid var(--line)",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}>
          <legend
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--ink-muted)",
              textTransform: "uppercase",
              padding: "0 6px",
            }}>
            Limites du plan gratuit
          </legend>

          <div className="field">
            <label>Fiches de lecture max</label>
            <input
              type="number"
              min={1}
              value={maxSheets}
              onChange={(e) => setMaxSheets(e.target.value)}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Nombre maximal de fiches de lecture actives qu&apos;un user freemium
              peut posséder. Atteindre la limite bloque la création d&apos;une
              nouvelle fiche jusqu&apos;à suppression d&apos;une existante (ou
              passage premium).
            </div>
          </div>

          <div className="field">
            <label>Bingos en cours max</label>
            <input
              type="number"
              min={1}
              value={maxActiveBingos}
              onChange={(e) => setMaxActiveBingos(e.target.value)}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Nombre maximal de bingos non terminés simultanés. Les bingos terminés
              ne comptent pas. Atteindre la limite bloque la création d&apos;un
              nouveau bingo.
            </div>
          </div>
        </fieldset>

        {saveError && (
          <div className="error" style={{ marginBottom: 12 }}>
            {saveError}
          </div>
        )}
        {success && (
          <div className="success" style={{ marginBottom: 12 }}>
            {success}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={submitting || !dirty}>
            {submitting ? "Enregistrement…" : "Enregistrer"}
          </button>
          {row && (
            <span className="muted" style={{ fontSize: 11 }}>
              Mis à jour le {new Date(row.updated_at).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </main>
  );
}
