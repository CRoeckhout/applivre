import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  BINGO_PILL_STATUS_LABELS,
  type BingoPillRow,
  type BingoPillStatus,
  type UserCardData,
} from '../lib/types';
import { UserRichCardLoader } from './user-rich-card-loader';

type Props = {
  initial: BingoPillRow | null;
  onSaved: (pill: BingoPillRow) => void;
  onDeleted: (id: string) => void;
};

type DecisionKind = 'approve' | 'reject' | 'disable';

const STATUS_COLORS: Record<BingoPillStatus, string> = {
  private: '#94a3b8',
  proposed: '#f59e0b',
  public: '#34d399',
  disabled: '#ef4444',
};

export function BingoPillForm({ initial, onSaved, onDeleted }: Props) {
  const isCreate = initial === null;
  const [label, setLabel] = useState(initial?.label ?? '');
  const [userId, setUserId] = useState(initial?.user_id ?? '');
  const [reason, setReason] = useState(initial?.decision_reason ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // `decidedBy` reste utilisé dans le ModerationFieldset pour afficher
  // l'admin qui a tranché. L'auteur de la pill, lui, est maintenant rendu
  // par <UserRichCardLoader>, donc plus besoin du state local `user`.
  const [decidedBy, setDecidedBy] = useState<UserCardData | null>(null);
  // Stats agrégées des pills de l'auteur (parité avec book-form qui montre
  // les compteurs uploader). Charge depuis bingo_pills via la policy admin.
  const [authorStats, setAuthorStats] = useState<{
    total: number;
    proposed: number;
    public_count: number;
  } | null>(null);
  // ID de l'admin connecté, utilisé comme défaut pour `user_id` à la
  // création d'une pill (cf. demande user : « par défaut, id de l'admin »).
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setCurrentAdminId(data.session?.user.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLabel(initial?.label ?? '');
    setUserId(initial?.user_id ?? '');
    setReason(initial?.decision_reason ?? '');
    setError(null);
    setDecidedBy(null);
    setAuthorStats(null);

    if (initial?.user_id) {
      void loadAuthorStats(initial.user_id);
    }
    if (initial?.decided_by) {
      void loadDecidedBy(initial.decided_by);
    }

    async function loadDecidedBy(uid: string) {
      const { data } = await supabase.rpc('admin_user_card', {
        p_user_id: uid,
      });
      const rows = (data ?? []) as UserCardData[];
      setDecidedBy(rows[0] ?? null);
    }

    async function loadAuthorStats(uid: string) {
      const { data, error: e } = await supabase
        .from('bingo_pills')
        .select('status')
        .eq('user_id', uid);
      if (e) return;
      const rows = (data ?? []) as { status: BingoPillStatus }[];
      setAuthorStats({
        total: rows.length,
        proposed: rows.filter((r) => r.status === 'proposed').length,
        public_count: rows.filter((r) => r.status === 'public').length,
      });
    }
  }, [initial?.id]);

  async function onSave() {
    setError(null);
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Label requis.');
      return;
    }
    // Défaut à l'ID de l'admin courant si vide. Le champ reste optionnel
    // côté UI ; il faut juste qu'on ait un id quelque part avant l'insert.
    const effectiveUserId = userId.trim() || currentAdminId || '';
    if (isCreate && !effectiveUserId) {
      setError(
        "Impossible de récupérer l'admin courant. Renseigne un user_id manuellement.",
      );
      return;
    }
    setSaving(true);
    try {
      if (isCreate) {
        const { data, error: e } = await supabase
          .from('bingo_pills')
          .insert({ label: trimmed, user_id: effectiveUserId })
          .select('*')
          .single();
        if (e) throw e;
        onSaved(data as BingoPillRow);
      } else {
        const { data, error: e } = await supabase
          .from('bingo_pills')
          .update({ label: trimmed })
          .eq('id', initial!.id)
          .select('*')
          .single();
        if (e) throw e;
        onSaved(data as BingoPillRow);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onDecide(decision: DecisionKind) {
    if (!initial) return;
    setSaving(true);
    setError(null);
    try {
      const { data, error: e } = await supabase.rpc('decide_bingo_pill', {
        p_pill_id: initial.id,
        p_decision: decision,
        p_reason: reason.trim() || null,
      });
      if (e) throw e;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) onSaved(row as BingoPillRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!initial) return;
    if (!window.confirm(`Supprimer définitivement « ${initial.label} » ?`))
      return;
    setSaving(true);
    setError(null);
    try {
      const { error: e } = await supabase
        .from('bingo_pills')
        .delete()
        .eq('id', initial.id);
      if (e) throw e;
      onDeleted(initial.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
      <h2 style={{ marginTop: 0 }}>
        {isCreate ? 'Nouveau défi bingo' : 'Éditer défi bingo'}
      </h2>

      {!isCreate && initial && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 12,
            }}>
            <span
              style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                color: 'white',
                background: STATUS_COLORS[initial.status],
              }}>
              {BINGO_PILL_STATUS_LABELS[initial.status]}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              ID : <code>{initial.id}</code>
            </span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 16 }}>
            Créé le {new Date(initial.created_at).toLocaleString('fr-FR')}
            {initial.decided_at ? (
              <>
                {' · '}Décision le{' '}
                {new Date(initial.decided_at).toLocaleString('fr-FR')}
              </>
            ) : null}
          </div>
        </>
      )}

      {!isCreate && initial && (
        <div style={{ marginBottom: 16 }}>
          <div
            style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}
            className="muted">
            Auteur
          </div>
          <UserRichCardLoader
            userId={initial.user_id}
            stats={
              authorStats
                ? [
                    { label: 'Défis', value: authorStats.total },
                    { label: 'Proposés', value: authorStats.proposed },
                    { label: 'Publiés', value: authorStats.public_count },
                  ]
                : undefined
            }
          />
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label
          style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4,
          }}>
          Label
        </label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex : Livre avec un chat sur la couverture"
          style={{
            width: '100%',
            maxWidth: 480,
            padding: '8px 10px',
            border: '1px solid var(--line)',
            borderRadius: 6,
            background: 'var(--surface-2)',
            color: 'var(--ink)',
            fontSize: 14,
          }}
        />
      </div>

      {isCreate && (
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 4,
            }}>
            user_id <span className="muted" style={{ fontWeight: 400 }}>(optionnel)</span>
          </label>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder={currentAdminId ?? 'UUID auth.users.id'}
            style={{
              width: '100%',
              maxWidth: 480,
              padding: '8px 10px',
              border: '1px solid var(--line)',
              borderRadius: 6,
              background: 'var(--surface-2)',
              color: 'var(--ink)',
              fontSize: 13,
              fontFamily: 'monospace',
            }}
          />
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            Laisser vide pour assigner le défi à ton compte admin.
          </div>
        </div>
      )}

      {/* L'encart modération n'a de sens que pour une pill qui a été dans
          le cycle (proposée maintenant, déjà tranchée, ou refusée). Une
          pill privée jamais soumise ne déclenche aucune action admin —
          inutile d'afficher la fieldset. */}
      {!isCreate &&
        initial &&
        (initial.status !== 'private' || initial.decision_reason !== null) && (
          <ModerationFieldset
            pill={initial}
            reason={reason}
            onReasonChange={setReason}
            onDecide={onDecide}
            decidedByCard={decidedBy}
            saving={saving}
          />
        )}

      {error && (
        <div className="error" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-primary"
          onClick={onSave}
          disabled={saving}>
          {saving ? '…' : isCreate ? 'Créer' : 'Enregistrer le label'}
        </button>
        {!isCreate && (
          <button
            className="btn"
            onClick={onDelete}
            disabled={saving}
            style={{ marginLeft: 'auto', color: '#dc2626' }}>
            Supprimer
          </button>
        )}
      </div>
    </main>
  );
}

function ModerationFieldset({
  pill,
  reason,
  onReasonChange,
  onDecide,
  decidedByCard,
  saving,
}: {
  pill: BingoPillRow;
  reason: string;
  onReasonChange: (s: string) => void;
  onDecide: (d: DecisionKind) => void;
  decidedByCard: UserCardData | null;
  saving: boolean;
}) {
  const isProposed = pill.status === 'proposed';
  const isPublic = pill.status === 'public';
  const isPrivate = pill.status === 'private';
  const isDisabled = pill.status === 'disabled';

  return (
    <fieldset
      style={{
        border: '1px solid var(--line)',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
      }}>
      <legend
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--ink-muted)',
          textTransform: 'uppercase',
          padding: '0 6px',
        }}>
        Modération
      </legend>

      {isProposed && pill.proposal_message ? (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}
            className="muted">
            Justification de l'auteur
          </div>
          <blockquote
            style={{
              margin: 0,
              padding: '8px 12px',
              borderLeft: '3px solid var(--accent)',
              background: 'var(--surface-2)',
              borderRadius: 4,
              fontSize: 13,
              fontStyle: 'italic',
              whiteSpace: 'pre-wrap',
            }}>
            {pill.proposal_message}
          </blockquote>
        </div>
      ) : null}

      {(isPublic || isPrivate || isDisabled) && pill.decision_reason ? (
        <div style={{ marginBottom: 12 }}>
          <div
            style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}
            className="muted">
            Message admin précédent
          </div>
          <blockquote
            style={{
              margin: 0,
              padding: '8px 12px',
              borderLeft: '3px solid var(--ink-muted)',
              background: 'var(--surface-2)',
              borderRadius: 4,
              fontSize: 13,
              whiteSpace: 'pre-wrap',
            }}>
            {pill.decision_reason}
          </blockquote>
        </div>
      ) : null}

      {decidedByCard ? (
        <div style={{ marginBottom: 12, fontSize: 12 }} className="muted">
          Décidé par{' '}
          <strong style={{ color: 'var(--ink)' }}>
            {decidedByCard.username ??
              decidedByCard.display_name ??
              decidedByCard.email ??
              '—'}
          </strong>
        </div>
      ) : null}

      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 4,
          }}>
          Message à l'auteur (optionnel)
        </label>
        <textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="Sera visible côté user à côté du statut de la pill."
          rows={3}
          style={{
            width: '100%',
            maxWidth: 600,
            padding: '8px 10px',
            border: '1px solid var(--line)',
            borderRadius: 6,
            background: 'var(--surface-2)',
            color: 'var(--ink)',
            fontSize: 13,
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label
          style={{
            display: 'block',
            fontSize: 12,
            fontWeight: 600,
            marginBottom: 6,
          }}>
          Statut
        </label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <StatusOption
            label="Privé"
            color={STATUS_COLORS.private}
            active={isPrivate}
            disabled={saving}
            onClick={() => onDecide('reject')}
          />
          <StatusOption
            label="Public"
            color={STATUS_COLORS.public}
            active={isPublic}
            disabled={saving}
            onClick={() => onDecide('approve')}
          />
          <StatusOption
            label="Désactivé"
            color={STATUS_COLORS.disabled}
            active={isDisabled}
            disabled={saving}
            onClick={() => onDecide('disable')}
          />
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          {isProposed
            ? 'Soumission en attente — choisis un statut pour trancher.'
            : isPrivate && !pill.decision_reason
              ? "Pill privée jamais soumise. Le statut ne change qu'après une décision explicite (avec un message d'accompagnement)."
              : 'Cliquer sur un statut applique la décision et envoie le message à l\'auteur.'}
        </div>
      </div>
    </fieldset>
  );
}

function StatusOption({
  label,
  color,
  active,
  disabled,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      style={{
        padding: '6px 14px',
        borderRadius: 999,
        border: '1px solid',
        borderColor: active ? color : 'var(--line)',
        background: active ? color : 'var(--surface)',
        color: active ? 'white' : 'var(--ink)',
        fontSize: 12,
        fontWeight: 700,
        cursor: active || disabled ? 'default' : 'pointer',
        opacity: disabled && !active ? 0.5 : 1,
      }}>
      {label}
      {active ? ' · actuel' : ''}
    </button>
  );
}
