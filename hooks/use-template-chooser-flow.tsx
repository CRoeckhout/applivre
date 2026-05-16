// Hook qui regroupe le state et les modales du picker "choix du point de
// départ" + le paywall premium pour les templates verrouillés. Permet
// d'ouvrir le flow depuis n'importe quel écran (BookPicker, page livre,
// dashboard…) sans détour par une route intermédiaire — la route
// transitoire causait un écran blanc si le user fermait le chooser après
// avoir ouvert un profil utilisateur depuis la UserCard d'un template
// communautaire.
//
// Usage :
//   const { openChooser, modals } = useTemplateChooserFlow({ mode: 'push' });
//   return (
//     <>
//       <Pressable onPress={() => openChooser(myUserBook)} />
//       {modals}
//     </>
//   );

import { PremiumPaywallModal } from '@/components/premium-paywall-modal';
import { TemplateChooserModal } from '@/components/templates/template-chooser-modal';
import { useReadingSheets } from '@/store/reading-sheets';
import type { UserBook } from '@/types/book';
import { useRouter } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';

type Options = {
  // `push` empile l'écran d'édition sur la navigation courante (default,
  // back ramène à l'écran appelant). `replace` retire l'écran appelant
  // de la stack (utile pour /sheet/new qui ne doit pas rester en back).
  mode?: 'push' | 'replace';
};

export function useTemplateChooserFlow({ mode = 'push' }: Options = {}) {
  const router = useRouter();
  const sheets = useReadingSheets((s) => s.sheets);
  const [pending, setPending] = useState<UserBook | null>(null);
  const [paywall, setPaywall] = useState(false);

  const goEditor = useCallback(
    (isbn: string, templateId: string | null) => {
      const qs = templateId ? `?template_id=${templateId}` : '';
      const path = `/sheet/${isbn}${qs}` as never;
      if (mode === 'replace') {
        router.replace(path);
      } else {
        router.push(path);
      }
    },
    [router, mode],
  );

  const openChooser = useCallback(
    (ub: UserBook) => {
      // Fiche existante : on saute le chooser et on attaque l'éditeur direct,
      // pour ne pas écraser une composition en cours.
      if (sheets[ub.id]) {
        goEditor(ub.book.isbn, null);
        return;
      }
      setPending(ub);
    },
    [sheets, goEditor],
  );

  const handlePick = (templateId: string | null) => {
    const ub = pending;
    setPending(null);
    if (!ub) return;
    goEditor(ub.book.isbn, templateId);
  };

  const modals: ReactNode = (
    <>
      <TemplateChooserModal
        open={!!pending}
        onClose={() => setPending(null)}
        onPick={(c) => handlePick(c.kind === 'template' ? c.templateId : null)}
        onPaywallRequired={() => setPaywall(true)}
      />
      <PremiumPaywallModal
        open={paywall}
        reason="template_premium"
        onClose={() => setPaywall(false)}
      />
    </>
  );

  return { openChooser, modals };
}
