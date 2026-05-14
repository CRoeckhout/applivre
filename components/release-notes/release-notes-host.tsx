import { ReleaseNotesModal } from '@/components/release-notes-modal';
import { useReleaseNotes } from '@/hooks/use-release-notes';
import { useReleaseNotesStore } from '@/store/release-notes';
import { useEffect, useRef, useState } from 'react';

// Orchestrateur du trigger auto au boot. Le composant est rendu en
// permanence dans app/_layout.tsx (à côté de BadgeUnlockToastHost) ; il
// ne fetch les notes que quand `enabled` passe à true (auth ready + sync
// terminée + profil complet), et ouvre la modale dès qu'il y a au moins
// une note non-vue. La fermeture marque la version courante comme vue.

export function ReleaseNotesHost({ enabled }: { enabled: boolean }) {
  const { notes, currentVersion, hasUnseen } = useReleaseNotes(enabled);
  const markSeen = useReleaseNotesStore((s) => s.markSeen);
  const [open, setOpen] = useState(false);
  const openedOnceRef = useRef(false);

  // Ouvre la modale au premier render où il y a des notes non-vues. On
  // garde un ref pour éviter de la rouvrir si l'utilisateur la ferme puis
  // que les notes changent (refetch éventuel).
  useEffect(() => {
    if (!enabled) return;
    if (openedOnceRef.current) return;
    if (!hasUnseen) return;
    openedOnceRef.current = true;
    setOpen(true);
  }, [enabled, hasUnseen]);

  const handleClose = () => {
    setOpen(false);
    markSeen(currentVersion);
  };

  if (!notes || notes.length === 0) return null;
  return <ReleaseNotesModal open={open} onClose={handleClose} notes={notes} />;
}
