import { useEffect, useState } from 'react';
import { renderInlineMarkdown } from '../lib/inline-markdown';
import { supabase } from '../lib/supabase';
import {
  EDITORIAL_KIND_LABELS,
  type EditorialCta,
  type EditorialPostKind,
} from '../lib/types';

// Aperçu de l'item du fil d'actualité tel qu'il apparaît sur l'app. Dispatch
// par type pour refléter les templates custom de l'app :
//   - announcement / partner → bannière générique (image + dégradé + texte)
//   - book_of_month          → texte à gauche + couverture à droite
//   - featured_review        → note + avis (données réelles via get_review)
//   - featured_sheet         → auteur + encart fiche (approximation : la vraie
//     apparence SheetSurface — cadre SVG, fonds, polices — vit côté app)
//
// Indicatif : la police "display" et la couleur d'accent réelles dépendent du
// thème personnalisé de l'utilisateur. On approxime avec l'accent par défaut.

type Props = {
  kind: EditorialPostKind;
  title: string;
  subtitle: string;
  coverUrl: string;
  cta: EditorialCta | null;
  // Avis mis en avant : id de l'avis → fetch get_review pour un aperçu fidèle.
  reviewId?: string | null;
};

const ACCENT = '#c27b52';
const ACCENT_DEEP = '#a35f3e';
const PAPER = '#fbf8f4';
const PAPER_WARM = '#f3ece2';
const INK = '#1a1410';
const INK_MUTED = '#6b6259';
const STAR_FILLED = '#f4a623';
const STAR_EMPTY = '#d8cfc4';

const clamp = (lines: number): React.CSSProperties => ({
  display: '-webkit-box',
  WebkitLineClamp: lines,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
});

// Card feed de l'app : rounded-2xl + border accent/30 + fond paper-warm.
const feedCardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 360,
  margin: '0 auto',
  borderRadius: 16,
  border: `1px solid ${ACCENT}55`,
  background: PAPER_WARM,
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  boxSizing: 'border-box',
};

export function EditorialPreview({
  kind,
  title,
  subtitle,
  coverUrl,
  cta,
  reviewId = null,
}: Props) {
  const displayTitle = title.trim() || 'Titre de la publication';
  const sub = subtitle.trim();
  const cover = coverUrl.trim();

  let body: React.ReactNode;
  switch (kind) {
    case 'book_of_month':
      body = (
        <BookOfMonthPreview title={displayTitle} hasTitle={!!title.trim()} subtitle={sub} coverUrl={cover} cta={cta} />
      );
      break;
    case 'featured_review':
      body = (
        <FeaturedReviewPreview
          title={displayTitle}
          hasTitle={!!title.trim()}
          subtitle={sub}
          coverUrl={cover}
          reviewId={reviewId}
        />
      );
      break;
    case 'featured_sheet':
      body = (
        <FeaturedSheetPreview title={displayTitle} hasTitle={!!title.trim()} subtitle={sub} coverUrl={cover} />
      );
      break;
    default:
      body = (
        <BannerPreview
          kind={kind}
          title={displayTitle}
          hasTitle={!!title.trim()}
          subtitle={sub}
          coverUrl={cover}
          cta={cta}
        />
      );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {body}
      <div className="muted" style={{ fontSize: 11, textAlign: 'center' }}>
        Aperçu indicatif — police et couleur d'accent réelles selon le thème de
        l'utilisateur.
      </div>
    </div>
  );
}

// ═══════════════ Pièces communes ═══════════════

function Chip({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 5, height: 5, borderRadius: 3, background: ACCENT }} />
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: ACCENT,
        }}>
        {label}
      </span>
    </div>
  );
}

function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1, fontSize: size, lineHeight: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ color: i <= rating ? STAR_FILLED : STAR_EMPTY }}>
          ★
        </span>
      ))}
    </span>
  );
}

function CoverImg({
  url,
  width,
  height,
}: {
  url: string;
  width: number;
  height: number;
}) {
  if (!url) {
    return (
      <div
        style={{
          width,
          height,
          borderRadius: 6,
          background: '#e8dfce',
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <img
      src={url}
      alt=""
      style={{ width, height, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
    />
  );
}

// ═══════════════ Livre du mois : texte à gauche, couverture à droite ═══════════════

function BookOfMonthPreview({
  title,
  hasTitle,
  subtitle,
  coverUrl,
  cta,
}: {
  title: string;
  hasTitle: boolean;
  subtitle: string;
  coverUrl: string;
  cta: EditorialCta | null;
}) {
  return (
    <div style={{ ...feedCardStyle, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Chip label="Livre du mois" />
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2, color: INK, ...clamp(2) }}>
          {hasTitle ? renderInlineMarkdown(title) : title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12.5, color: INK_MUTED, ...clamp(1) }}>
            {renderInlineMarkdown(subtitle)}
          </div>
        )}
        {cta && (
          <div style={{ marginTop: 2, fontSize: 12.5, fontWeight: 600, color: ACCENT_DEEP }}>
            {cta.label} →
          </div>
        )}
      </div>
      <CoverImg url={coverUrl} width={60} height={90} />
    </div>
  );
}

// ═══════════════ Avis à la une : note + avis (données réelles) ═══════════════

type PreviewReview = {
  rating: number;
  comment: string | null;
  authorName: string | null;
  avatarUrl: string | null;
};

function FeaturedReviewPreview({
  title,
  hasTitle,
  subtitle,
  coverUrl,
  reviewId,
}: {
  title: string;
  hasTitle: boolean;
  subtitle: string;
  coverUrl: string;
  reviewId: string | null;
}) {
  const [review, setReview] = useState<PreviewReview | null>(null);

  // Aperçu fidèle : on charge l'avis réel (note + texte + auteur) via le même
  // RPC que l'app. Fallback sur le subtitle (extrait) tant que rien n'est là.
  useEffect(() => {
    setReview(null);
    if (!reviewId) return;
    let cancelled = false;
    void supabase.rpc('get_review', { p_review_id: reviewId }).then(({ data }) => {
      if (cancelled || !data) return;
      const d = data as {
        rating?: number;
        comment?: string | null;
        author?: {
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
        } | null;
      };
      setReview({
        rating: d.rating ?? 0,
        comment: d.comment ?? null,
        authorName: d.author?.display_name || d.author?.username || null,
        avatarUrl: d.author?.avatar_url ?? null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  const comment = review?.comment ?? subtitle;

  return (
    <div style={feedCardStyle}>
      <Chip label="Avis à la une" />
      <div style={{ display: 'flex', gap: 12 }}>
        <CoverImg url={coverUrl} width={46} height={68} />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 4,
          }}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: INK, ...clamp(2) }}>
            {hasTitle ? renderInlineMarkdown(title) : title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {review?.avatarUrl ? (
              <img
                src={review.avatarUrl}
                alt=""
                style={{ width: 18, height: 18, borderRadius: 9, objectFit: 'cover' }}
              />
            ) : null}
            <span style={{ fontSize: 11.5, color: INK_MUTED, ...clamp(1) }}>
              {review?.authorName ?? 'Un lecteur'}
            </span>
            {review ? <Stars rating={review.rating} /> : null}
          </div>
        </div>
      </div>
      {comment && (
        <div
          style={{
            fontSize: 12.5,
            fontStyle: 'italic',
            lineHeight: 1.45,
            color: INK,
            ...clamp(4),
          }}>
          «&#8201;{comment}&#8201;»
        </div>
      )}
    </div>
  );
}

// ═══════════════ Fiche à la une : auteur + encart fiche (approximation) ═══════════════

function FeaturedSheetPreview({
  title,
  hasTitle,
  subtitle,
  coverUrl,
}: {
  title: string;
  hasTitle: boolean;
  subtitle: string;
  coverUrl: string;
}) {
  return (
    <div style={feedCardStyle}>
      <Chip label="Fiche à la une" />
      {/* Auteur de la fiche — le subtitle des candidats fiche = display_name. */}
      {subtitle && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              background: '#d8cfc4',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 11.5, color: INK_MUTED, ...clamp(1) }}>{subtitle}</span>
        </div>
      )}
      {/* Encart fiche : approximation du SheetCard headerOnly — l'apparence
          réelle (cadre SVG, fond, polices) est rendue par l'app. */}
      <div
        style={{
          border: `1px solid ${STAR_EMPTY}`,
          borderRadius: 12,
          background: PAPER,
          padding: 10,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
        }}>
        <CoverImg url={coverUrl} width={40} height={60} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.2, color: INK, ...clamp(2) }}>
            {hasTitle ? renderInlineMarkdown(title) : title}
          </div>
          <div style={{ fontSize: 10.5, color: INK_MUTED }}>
            Aperçu de la fiche — apparence réelle (cadre, fond) rendue dans l'app
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════ Bannière générique (annonce / partenariat) ═══════════════

function BannerPreview({
  kind,
  title,
  hasTitle,
  subtitle,
  coverUrl,
  cta,
}: {
  kind: EditorialPostKind;
  title: string;
  hasTitle: boolean;
  subtitle: string;
  coverUrl: string;
  cta: EditorialCta | null;
}) {
  const hasCover = !!coverUrl;
  const label = EDITORIAL_KIND_LABELS[kind];

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 360,
        height: 132,
        margin: '0 auto',
        borderRadius: 16,
        overflow: 'hidden',
        border: `1px solid ${ACCENT}55`,
        background: hasCover ? '#1a1410' : PAPER_WARM,
      }}>
      {hasCover && (
        <>
          <img
            src={coverUrl}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(to bottom, transparent 45%, rgba(0,0,0,0.82))',
            }}
          />
        </>
      )}

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          ...(hasCover ? null : { top: 0, justifyContent: 'center' }),
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 5,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              background: hasCover ? '#fff' : ACCENT,
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: hasCover ? 'rgba(255,255,255,0.9)' : ACCENT,
            }}>
            {label}
          </span>
        </div>

        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            lineHeight: 1.15,
            color: hasCover ? '#fff' : '#1a1410',
            ...clamp(2),
          }}>
          {hasTitle ? renderInlineMarkdown(title) : title}
        </div>

        {subtitle && (
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.3,
              color: hasCover ? 'rgba(255,255,255,0.8)' : INK_MUTED,
              ...clamp(2),
            }}>
            {renderInlineMarkdown(subtitle)}
          </div>
        )}

        {cta && (
          <div
            style={{
              marginTop: 2,
              fontSize: 12.5,
              fontWeight: 600,
              color: hasCover ? '#fff' : ACCENT_DEEP,
            }}>
            {cta.label} →
          </div>
        )}
      </div>
    </div>
  );
}
