import { BookCover } from "@/components/book-cover";
import { KeyboardDismissBar } from "@/components/keyboard-dismiss-bar";
import { PremiumPaywallModal } from "@/components/premium-paywall-modal";
import { RatingIcon } from "@/components/rating-row";
import { CategoryDrawer } from "@/components/sheet/category-drawer";
import { SheetActionBar } from "@/components/sheet/sheet-action-bar";
import { SheetSectionEditor } from "@/components/sheet/sheet-section-editor";
import { ShareSheetModal } from "@/components/sheet/share-sheet-modal";
import { SheetCustomizer } from "@/components/sheet-customizer";
import { SheetPinchZoom } from "@/components/sheet/sheet-pinch-zoom";
import { SkiaSheetFondLayer } from "@/components/sheet/skia-sheet-fond-layer";
import { SkiaStaticStickerLayer } from "@/components/sheet/skia-static-sticker-layer";
import { SheetSurface } from "@/components/sheet-surface";
import { StickerLayer } from "@/components/sticker-layer";
import { PERSO_BORDER_ID } from "@/lib/borders/catalog";
import { StickerPickerModal } from "@/components/sticker-picker-modal";
import { useFreemiumGate } from "@/hooks/use-freemium-gate";
import { useKeyboardOffset } from "@/hooks/use-keyboard-offset";
import {
  appearancesEqual,
  sectionsEqual,
  stickersEqual,
  useUndoableSheetDraft,
} from "@/hooks/use-undoable-sheet-draft";
import { newId } from "@/lib/id";
import {
  ficheTextStyle,
  hexWithAlpha,
  isCustomAppearance,
  mergeAppearance,
  resolveSectionIcon,
  SHEET_TEXT_SHADOW,
} from "@/lib/sheet-appearance";
import { MAX_STICKERS_PER_SHEET } from "@/lib/stickers/catalog";
import { getFont } from "@/lib/theme/fonts";
import { useBookshelf } from "@/store/bookshelf";
import { usePreferences } from "@/store/preferences";
import { useReadingSheetTemplates } from "@/store/reading-sheet-templates";
import { useReadingSheets } from "@/store/reading-sheets";
import { useSheetTemplates } from "@/store/sheet-templates";
import { useTemplateDraft } from "@/store/template-draft";
import { useTimer } from "@/store/timer";
import type {
  PlacedSticker,
  SheetAppearance,
  SheetDefaultCategory,
  SheetSection,
} from "@/types/book";
import { MaterialIcons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInDown, FadeInUp, FadeOutUp } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

export default function SheetScreen() {
  const { isbn, template_id: templateIdParam } = useLocalSearchParams<{
    isbn: string;
    template_id?: string;
  }>();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const books = useBookshelf((s) => s.books);
  const userBook = books.find((b) => b.book.isbn === isbn);

  const sheets = useReadingSheets((s) => s.sheets);
  const setSections = useReadingSheets((s) => s.setSections);
  const removeSheet = useReadingSheets((s) => s.removeSheet);
  const setSheetAppearance = useReadingSheets((s) => s.setAppearance);
  const setStickers = useReadingSheets((s) => s.setStickers);
  const setSheetIsPublic = useReadingSheets((s) => s.setIsPublic);

  const myTemplates = useReadingSheetTemplates((s) => s.mine);
  const getPublicTemplate = useReadingSheetTemplates((s) => s.getPublic);

  const globalTemplate = useSheetTemplates((s) => s.global);
  const themeInk = usePreferences((s) => s.colorSecondary);
  const themePrimary = usePreferences((s) => s.colorPrimary);

  const sheet = userBook ? sheets[userBook.id] : undefined;
  const storedSections = sheet?.sections ?? EMPTY_SECTIONS;
  const storedStickers = sheet?.stickers ?? EMPTY_STICKERS;
  // Appearance "stockée" effective (avec fallback template global). Re-mémoisée
  // si l'un des inputs change — sert de baseline pour le dirty check ET de
  // valeur d'init du draftAppearance (snapshot au premier render seulement).
  const storedAppearance = useMemo(
    () => mergeAppearance(globalTemplate, sheet?.appearance),
    [globalTemplate, sheet?.appearance],
  );

  // Draft local + historique undo/redo. Toute édition (titre, body, note,
  // add/remove section, placement/edition/suppression de stickers,
  // changement de propriété visuelle depuis le customizer) n'affecte que
  // ce draft — rien n'est persisté avant tap sur le bouton Enregistrer.
  // Le hook gère l'historique : actions structurelles → snapshot immédiat,
  // saisie texte → snapshot debouncé.
  const {
    draft,
    draftStickers,
    draftAppearance,
    setDraft,
    setDraftStickers,
    setDraftAppearance,
    setDraftSilent,
    setDraftStickersSilent,
    setDraftAppearanceSilent,
    beginTextEdit,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUndoableSheetDraft(storedSections, storedStickers, storedAppearance);

  // Si on arrive ici avec un `template_id` query param et qu'aucune fiche
  // n'existe encore pour ce livre, on hydrate le draft avec le template
  // sélectionné. Cloning des ids pour ne pas collisionner avec les ids
  // d'origine côté template. Le snapshot d'appearance n'est posé sur la fiche
  // qu'au `handleSaveDraft` (avant `setSections`) pour éviter d'écrire
  // dans le store avant que l'user ait validé.
  useEffect(() => {
    if (!templateIdParam || sheet) return;
    let cancelled = false;
    const local = myTemplates.find((t) => t.id === templateIdParam);
    // Reset défensif : un template ne doit jamais ramener une note ≠ 0
    // sur la nouvelle fiche (cas où un template aurait été sauvé avant
    // l'ajout du reset au save, ou modifié manuellement). Le body est
    // également strippé — le template ne capture pas le contenu.
    const sanitize = (xs: SheetSection[]) =>
      xs.map((s) => ({
        ...s,
        id: newId(),
        body: '',
        rating: s.rating ? { ...s.rating, value: 0 } : undefined,
      }));
    const apply = (
      appearance: SheetAppearance,
      sections: SheetSection[],
      stickers: PlacedSticker[] | undefined,
    ) => {
      if (cancelled) return;
      // Silent : pas d'entrée undo pour l'hydratation initiale (le draft
      // était vide / sans intérêt avant le choix du template).
      setDraftAppearanceSilent(appearance);
      setDraftSilent(sanitize(sections));
      setDraftStickersSilent(
        (stickers ?? []).map((s) => ({ ...s, id: newId() })),
      );
    };
    if (local) {
      apply(local.appearance, local.sections, local.stickers);
    } else {
      void getPublicTemplate(templateIdParam).then((t) => {
        if (!t) return;
        apply(t.appearance, t.sections, t.stickers);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [templateIdParam, sheet, myTemplates, getPublicTemplate]);

  const sectionsDirty = useMemo(
    () => !sectionsEqual(draft, storedSections),
    [draft, storedSections],
  );
  const stickersDirty = useMemo(
    () => !stickersEqual(draftStickers, storedStickers),
    [draftStickers, storedStickers],
  );
  const appearanceDirty = useMemo(
    () => !appearancesEqual(draftAppearance, storedAppearance),
    [draftAppearance, storedAppearance],
  );
  const dirty = sectionsDirty || stickersDirty || appearanceDirty;

  // `appearance` rendu sur la fiche = draft local. Toute mutation depuis
  // le customizer y est répliquée via setDraftAppearance (logged undo).
  // Le snapshot est persisté dans le store seulement au save global.
  const appearance = draftAppearance;
  const fontFamily = getFont(appearance.fontId as any).variants.display;

  // Couche Skia fond : actif en mode perso uniquement (catalog garde le
  // rendu JSX interne à CardFrame). Cf. sheet/view/[id].tsx + commentaire
  // sur disableFond dans sheet-surface.tsx.
  const themeFondIdReactive = usePreferences((s) => s.fondId);
  const themeFondOpacityReactive = usePreferences((s) => s.fondOpacity);
  const isPersoFrame =
    !appearance.frame.borderId ||
    appearance.frame.borderId === PERSO_BORDER_ID;
  const explicitFondId = appearance.fond?.fondId;
  const effectiveFondId = explicitFondId ?? themeFondIdReactive;
  const isThemeFondActive =
    !explicitFondId || explicitFondId === themeFondIdReactive;
  const effectiveFondOpacity =
    appearance.fond?.opacity ?? (isThemeFondActive ? themeFondOpacityReactive : 1);
  const useSkiaFond = isPersoFrame;

  const unusedDefaults = useMemo(() => {
    const used = new Set(draft.map((s) => s.title.toLowerCase()));
    return appearance.defaultCategories.filter(
      (s) => !used.has(s.title.toLowerCase()),
    );
  }, [draft, appearance.defaultCategories]);

  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>(
    null,
  );
  // True dès qu'un finger touche un sticker — désactive le scroll de la
  // fiche pour que le ScrollView ne capte pas le 2e doigt avant que pinch
  // ou rotate puisse s'activer.
  const [stickerInteracting, setStickerInteracting] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  // Modale "Partagez votre fiche !" ouverte après que l'user a confirmé le
  // passage en public (post-Alert). Lui propose d'ajouter un post_text au
  // shared_sheet auto-créé par le trigger DB.
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  // Toast de confirmation après un save réussi. `key` change à chaque save
  // pour relancer l'animation entering si l'user save deux fois d'affilée
  // pendant qu'un toast est encore visible.
  const [savedToast, setSavedToast] = useState<{ key: number } | null>(null);
  useEffect(() => {
    if (!savedToast) return;
    const t = setTimeout(() => setSavedToast(null), 1800);
    return () => clearTimeout(t);
  }, [savedToast]);
  const gate = useFreemiumGate();
  // Cache local des sections retirées via le toggle du CategoryDrawer :
  // permet de restorer body + rating si l'user re-coche la pill. Indexé
  // par titre normalisé fr-locale + lowercase. Volatile (scope = écran
  // ouvert ; perdu au navigate away ou save+reload).
  const [removedSectionCache, setRemovedSectionCache] = useState<
    Record<string, SheetSection>
  >({});

  const normTitle = (s: string) => s.trim().toLocaleLowerCase("fr");

  const addSectionDraft = (
    title: string,
    opts?: {
      materialIcon?: string;
      materialIconColor?: string;
      emoji?: string;
    },
  ) => {
    const key = normTitle(title);
    const cached = removedSectionCache[key];
    setDraft((d) => [
      ...d,
      cached
        ? {
            // Restore body + rating depuis le cache. L'icône est override
            // par les opts (qui viennent du template) si fournie — sinon
            // on garde l'icône cachée.
            ...cached,
            id: newId(),
            title: title.trim() || cached.title,
            materialIcon: opts?.materialIcon ?? cached.materialIcon,
            materialIconColor:
              opts?.materialIconColor ?? cached.materialIconColor,
            emoji: opts?.emoji ?? cached.emoji,
          }
        : {
            id: newId(),
            title: title.trim() || "Sans titre",
            body: "",
            materialIcon: opts?.materialIcon,
            materialIconColor: opts?.materialIconColor,
            emoji: opts?.emoji,
          },
    ]);
    if (cached) {
      setRemovedSectionCache((c) => {
        const { [key]: _, ...rest } = c;
        return rest;
      });
    }
  };
  const updateTitleDraft = (sectionId: string, title: string) => {
    setDraft((d) => d.map((s) => (s.id === sectionId ? { ...s, title } : s)));
  };
  const updateMetaDraft = (
    sectionId: string,
    meta: {
      title: string;
      materialIcon?: string;
      materialIconColor?: string;
      emoji?: string;
    },
  ) => {
    setDraft((d) =>
      d.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              title: meta.title,
              materialIcon: meta.materialIcon,
              materialIconColor: meta.materialIconColor,
              emoji: meta.emoji,
            }
          : s,
      ),
    );
  };
  const updateBodyDraft = (sectionId: string, body: string) => {
    // Saisie texte : ouvre une session d'édition (snapshot une fois, puis
    // les frappes suivantes ne snapshot pas tant que 700ms ne se sont pas
    // écoulés sans frappe). On utilise le setter silent pour ne pas
    // empiler un snapshot par caractère.
    beginTextEdit();
    setDraftSilent((d) =>
      d.map((s) => (s.id === sectionId ? { ...s, body } : s)),
    );
  };
  const setRatingValueDraft = (
    sectionId: string,
    value: number | undefined,
  ) => {
    setDraft((d) =>
      d.map((s) => {
        if (s.id !== sectionId) return s;
        if (value == null) {
          // Clear rating entirely.

          const { rating, ...rest } = s;
          return rest as SheetSection;
        }
        // Conserve `icon` legacy si présent ; sinon stub 'star' (non rendu).
        return {
          ...s,
          rating: { value, icon: s.rating?.icon ?? "star" },
        };
      }),
    );
  };
  const removeSectionDraft = (sectionId: string) => {
    setDraft((d) => {
      const removed = d.find((s) => s.id === sectionId);
      if (removed) {
        // Push dans le cache pour permettre la restoration via le
        // CategoryDrawer (toggle off → toggle on). Indexé par titre
        // normalisé ; le dernier remove pour un titre donné gagne.
        setRemovedSectionCache((c) => ({
          ...c,
          [normTitle(removed.title)]: removed,
        }));
      }
      return d.filter((s) => s.id !== sectionId);
    });
  };
  const moveSectionDraft = (sectionId: string, direction: -1 | 1) => {
    setDraft((d) => {
      const idx = d.findIndex((s) => s.id === sectionId);
      if (idx < 0) return d;
      const target = idx + direction;
      if (target < 0 || target >= d.length) return d;
      const next = [...d];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // Retourne true si la persistance a abouti, false si bloquée (paywall,
  // userBook manquant). Les actions chaînées (rendre publique, save as
  // template) utilisent ce booléen pour décider si elles enchaînent ou
  // abandonnent silencieusement après l'ouverture du paywall.
  const handleSaveDraft = (): boolean => {
    if (!userBook) return false;
    // Limite freemium : la création d'une nouvelle fiche (sheet absent du
    // store) est gated. Une mise à jour de fiche existante passe toujours.
    // setSections([], ...) supprime la fiche — on ne gate pas non plus.
    const isNewSheet = !sheet && draft.length > 0;
    if (isNewSheet && !gate.canCreateSheet()) {
      setPaywallOpen(true);
      return false;
    }
    // Appearance : persister AVANT setSections pour que l'ensureSheet
    // côté store ne recrée pas une fiche avec le template global par défaut.
    // On ne touche le store que si le draft diffère du stored — évite les
    // writes inutiles (et les syncs Supabase) quand l'user save sans avoir
    // changé l'apparence.
    if (appearanceDirty) {
      setSheetAppearance(userBook.id, draftAppearance);
    }
    setSections(userBook.id, draft);
    if (stickersDirty) {
      setStickers(userBook.id, draftStickers);
    }
    // Feedback : haptic Success + toast bref. Le toast remplace l'ancien
    // signal "le bouton se grise après save" (le bouton header est plus
    // discret qu'un FAB et l'user pourrait douter qu'un tap a abouti).
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSavedToast({ key: Date.now() });
    return true;
  };

  // ═══════════════ Stickers (draft) ═══════════════
  // Mutations locales du `draftStickers`. Le commit en store se fait via
  // `handleSaveDraft` (bouton Enregistrer) — aligné sur le pattern des
  // sections. Avant ça, l'utilisateur peut placer/déplacer/supprimer
  // librement, et un retour arrière sans save lui propose de discarder.

  const placeStickerDraft = (stickerId: string): string | null => {
    if (draftStickers.length >= MAX_STICKERS_PER_SHEET) return null;
    const id = newId();
    setDraftStickers((prev) => [
      ...prev,
      // x fraction (centre horizontal). y en dp absolu depuis le top —
      // 280dp tombe ~au milieu d'une fiche standard (header + 1 section).
      { id, stickerId, x: 0.5, y: 280, scale: 1, rotation: 0 },
    ]);
    return id;
  };

  const updateStickerDraftTransform = (
    placementId: string,
    next: { x: number; y: number; scale: number; rotation: number },
  ) => {
    setDraftStickers((prev) =>
      prev.map((s) => (s.id === placementId ? { ...s, ...next } : s)),
    );
  };

  const removeStickerDraft = (placementId: string) => {
    setDraftStickers((prev) => prev.filter((s) => s.id !== placementId));
  };

  const reorderStickerDraft = (placementId: string, direction: 1 | -1) => {
    setDraftStickers((prev) => {
      const idx = prev.findIndex((s) => s.id === placementId);
      if (idx < 0) return prev;
      const target = idx + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleBack = () => {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert(
      "Modifications non enregistrées",
      "Tu as des changements non sauvegardés. Les perdre ?",
      [
        { text: "Continuer l’édition", style: "cancel" },
        {
          text: "Quitter sans sauver",
          style: "destructive",
          onPress: () => router.back(),
        },
      ],
    );
  };

  if (!userBook) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-paper px-8">
        <Text className="font-display text-2xl text-ink">
          Livre introuvable
        </Text>
        <Text className="mt-2 text-center text-ink-muted">
          Ajoute d&apos;abord le livre à ta bibliothèque pour créer une fiche.
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-8 rounded-full bg-accent px-6 py-3 active:opacity-80"
        >
          <Text className="font-sans-med text-paper">Retour</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const confirmDelete = () => {
    Alert.alert(
      "Supprimer la fiche ?",
      "Les sections et les notes seront perdues. Le livre reste dans ta biblio.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            removeSheet(userBook.id);
            router.back();
          },
        },
      ],
    );
  };

  const handleShare = async () => {
    const lines: string[] = [`Fiche : ${userBook.book.title}`];
    if (userBook.book.authors[0]) lines.push(`par ${userBook.book.authors[0]}`);
    lines.push("");
    for (const s of draft) {
      if (!s.body.trim() && !s.rating) continue;
      lines.push(`— ${s.title || "Sans titre"}`);
      if (s.rating)
        lines.push(
          `  ${"★".repeat(s.rating.value)}${"☆".repeat(5 - s.rating.value)}`,
        );
      if (s.body.trim()) lines.push(`  ${s.body.trim()}`);
      lines.push("");
    }
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      // user cancelled — no-op
    }
  };

  const handleCustomize = () => {
    setCustomizerOpen(true);
  };

  const handleSaveAppearance = () => {
    // Le bouton "Valider" ferme juste le drawer. Les mutations ont déjà été
    // capturées dans le draftAppearance via onChange (undo-able). La
    // persistance dans le store passe par handleSaveDraft (bouton global
    // Enregistrer) — séparation cohérente avec les sections/stickers.
    setCustomizerOpen(false);
  };

  const handleResetAppearance = () => {
    // "Utiliser le template global" : pousse un snapshot du template global
    // dans le draft (undo-able). Ne persiste pas — l'user devra Enregistrer
    // pour figer. À noter : la sémantique "tomber sur le template global
    // dynamiquement" est perdue dès que la fiche est sauvée (snapshot figé).
    setDraftAppearance(mergeAppearance(globalTemplate, undefined));
    setCustomizerOpen(false);
  };

  // Lance le flow "rendre publique" lui-même (Alert de confirmation +
  // flip is_public + ouverture de ShareSheetModal). Suppose que la fiche
  // est sauvegardée — la gate dirty est faite en amont par handleTogglePublic.
  const runPublishFlow = () => {
    if (!userBook) return;
    Alert.alert(
      "Rendre cette fiche publique ?",
      "Les personnes qui iront sur ton profil pourront la consulter.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Rendre publique",
          onPress: () => {
            setSheetIsPublic(userBook.id, true);
            setShareSheetOpen(true);
          },
        },
      ],
    );
  };

  const handleTogglePublic = () => {
    if (!userBook) return;
    const isCurrentlyPublic = sheet?.isPublic ?? false;
    if (isCurrentlyPublic) {
      // Repassage en privé : Alert simple, sans modale de partage. Pas de
      // gate dirty — privatiser ne dépend pas du contenu sauvegardé.
      setSheetIsPublic(userBook.id, false);
      Alert.alert(
        "Fiche redevenue privée",
        "Plus personne d'autre que toi ne peut la consulter.",
      );
      return;
    }
    // Passage en public : si du contenu non sauvegardé existe, on demande
    // d'enregistrer d'abord. Publier une fiche dont l'éditeur affiche un
    // état divergent du persisté = surprise pour l'user (les viewers verraient
    // l'ancienne version).
    if (dirty) {
      Alert.alert(
        "Enregistrer la fiche ?",
        "Vous devez enregistrer votre fiche avant de la rendre publique.",
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Enregistrer et continuer",
            onPress: () => {
              if (handleSaveDraft()) runPublishFlow();
            },
          },
        ],
      );
      return;
    }
    runPublishFlow();
  };

  const runSaveAsTemplateFlow = () => {
    if (!userBook) return;
    // Pré-populate l'éditeur de template via le store de transition :
    // appearance + structure des sections (body strip, notes resettées) +
    // stickers (positions copiées, l'user pourra les réajuster pour le
    // layout template qui diffère de la fiche).
    // On ne propage PAS le titre du livre comme defaultName : le template
    // est destiné à être réutilisé sur d'autres livres, son nom doit être
    // générique. Le template editor pré-remplit "Nouveau template" pour la
    // création (cf. app/template/[id].tsx).
    useTemplateDraft.getState().set({
      appearance,
      sections: draft.map((s) => ({
        ...s,
        body: '',
        rating: s.rating ? { ...s.rating, value: 0 } : undefined,
      })),
      stickers: draftStickers.length > 0 ? draftStickers : undefined,
    });
    router.push('/template/new' as never);
  };

  const handleSaveAsTemplate = () => {
    if (!userBook) return;
    // Même gate que la publication : on impose un état sauvegardé pour que
    // le template dérivé corresponde à ce que l'user voit dans le store
    // (sinon il template-ise un draft qui n'existerait plus s'il revenait
    // sur la fiche sans avoir tapé Enregistrer).
    if (dirty) {
      Alert.alert(
        "Enregistrer la fiche ?",
        "Vous devez enregistrer votre fiche avant de la sauvegarder comme template.",
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Enregistrer et continuer",
            onPress: () => {
              if (handleSaveDraft()) runSaveAsTemplateFlow();
            },
          },
        ],
      );
      return;
    }
    runSaveAsTemplateFlow();
  };

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={["top", "bottom"]}>
      <KeyboardDismissBar />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <View className="flex-row items-center justify-between px-4 pt-2 pb-2">
          <Pressable
            onPress={handleBack}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
          >
            <MaterialIcons name="arrow-back" size={22} color={themeInk} />
          </Pressable>
          <View className="flex-row items-center gap-1">
            <Pressable
              onPress={
                canUndo
                  ? () => {
                      Haptics.selectionAsync();
                      undo();
                    }
                  : undefined
              }
              disabled={!canUndo}
              hitSlop={8}
              accessibilityLabel="Annuler"
              accessibilityState={{ disabled: !canUndo }}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
              style={{ opacity: canUndo ? 1 : 0.35 }}
            >
              <MaterialIcons name="undo" size={22} color={themeInk} />
            </Pressable>
            <Pressable
              onPress={
                canRedo
                  ? () => {
                      Haptics.selectionAsync();
                      redo();
                    }
                  : undefined
              }
              disabled={!canRedo}
              hitSlop={8}
              accessibilityLabel="Rétablir"
              accessibilityState={{ disabled: !canRedo }}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
              style={{ opacity: canRedo ? 1 : 0.35 }}
            >
              <MaterialIcons name="redo" size={22} color={themeInk} />
            </Pressable>
            <Pressable
              onPress={dirty ? handleSaveDraft : undefined}
              disabled={!dirty}
              hitSlop={8}
              accessibilityLabel="Enregistrer"
              accessibilityState={{ disabled: !dirty }}
              className="h-10 w-10 items-center justify-center rounded-full active:opacity-60"
              style={{ opacity: dirty ? 1 : 0.35 }}
            >
              <MaterialIcons name="check" size={24} color={themeInk} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          contentContainerClassName="px-4 pt-2 pb-32"
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!stickerInteracting}
        >
          {/* La fiche est rendue à largeur fixe (SHEET_MAX_WIDTH) sur
              tous les devices, pour garantir un rendu identique cross-device
              (positions x des stickers, wrapping du texte, layout). Sur les
              écrans plus larges, la fiche est centrée ; sur les écrans plus
              étroits, l'utilisateur peut scroller latéralement. Le scroll
              horizontal est désactivé pendant un geste sticker pour ne pas
              capturer le 2e doigt avant pinch/rotate. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!stickerInteracting}
            contentContainerStyle={{
              minWidth: "100%",
              justifyContent: "center",
            }}
          >
            {/* Pinch-zoom mobile : le wrapper expose visuellement la fiche
                à un scale fit-by-default sur écrans étroits, et laisse
                l'user pincer entre [fit, 2.5]. La fiche conserve sa
                largeur naturelle (SHEET_MAX_WIDTH) côté layout — seul le
                rendu GPU change — donc les positions absolues des stickers
                et le wrapping textuel restent cross-device.
                availableWidth = vw - 32 (px-4 du vertical ScrollView).
                - skiaUnderlay : fond image (perso uniquement) sous JSX,
                  crisp à toute échelle.
                - skiaOverlay : stickers non-sélectionnés rendus en Skia.
                  Sélectionné reste rendu en JSX par StickerLayer pour
                  drag/ring live (cf. ghostVisual sur Sticker). */}
            <SheetPinchZoom
              naturalWidth={SHEET_MAX_WIDTH}
              availableWidth={windowWidth - 32}
              outerStyle={{
                backgroundColor: appearance.bgColor,
                borderRadius: appearance.frame.radius,
              }}
              skiaUnderlay={
                useSkiaFond
                  ? ({
                      scale,
                      translateX,
                      translateY,
                      fitScale,
                      naturalWidth,
                      naturalHeight,
                    }) => (
                      <SkiaSheetFondLayer
                        bgColor={appearance.bgColor}
                        fondId={effectiveFondId}
                        colorOverrides={appearance.fond?.colorOverrides}
                        opacity={effectiveFondOpacity}
                        outerWidth={naturalWidth * fitScale}
                        outerHeight={naturalHeight * fitScale}
                        naturalWidth={naturalWidth}
                        naturalHeight={naturalHeight}
                        scale={scale}
                        translateX={translateX}
                        translateY={translateY}
                        fitScale={fitScale}
                        borderRadius={appearance.frame.radius}
                      />
                    )
                  : undefined
              }
              skiaOverlay={({
                scale,
                translateX,
                translateY,
                fitScale,
                naturalWidth,
                naturalHeight,
              }) => (
                <SkiaStaticStickerLayer
                  stickers={draftStickers}
                  skipIds={selectedStickerId ? [selectedStickerId] : undefined}
                  outerWidth={naturalWidth * fitScale}
                  outerHeight={naturalHeight * fitScale}
                  naturalWidth={naturalWidth}
                  naturalHeight={naturalHeight}
                  scale={scale}
                  translateX={translateX}
                  translateY={translateY}
                  fitScale={fitScale}
                />
              )}
            >
              <Animated.View
                entering={FadeInDown.duration(400)}
                style={{
                  width: SHEET_MAX_WIDTH,
                  position: "relative",
                }}
              >
                <SheetSurface
                appearance={appearance}
                disableFond={useSkiaFond}
              >
                <View className="flex-row items-start gap-3">
                  <BookCover
                    isbn={userBook.book.isbn}
                    coverUrl={userBook.book.coverUrl}
                    style={{ width: 48, height: 72, borderRadius: 6 }}
                  />
                  {/* Header aligné sur celui de la vue read-only
                      (/sheet/view/[id]) : justify-center flex-auto, titre +
                      auteur. Sans ce match, le contenu de la column ne
                      tombait pas au même Y → toutes les sections en dessous
                      étaient décalées de quelques pixels. Le label "FICHE
                      DE LECTURE" et le badge "Personnalisée" ont été
                      retirés du header pour cohérence visuelle. */}
                  <View className="justify-center flex-auto">
                    <Text
                      numberOfLines={2}
                      style={[
                        { color: appearance.textColor, fontFamily },
                        SHEET_TEXT_SHADOW,
                      ]}
                      className="text-xl"
                    >
                      {userBook.book.title}
                    </Text>
                    {userBook.book.authors[0] ? (
                      <Text
                        style={[
                          {
                            color: appearance.mutedColor,
                            ...ficheTextStyle(11),
                          },
                          SHEET_TEXT_SHADOW,
                        ]}
                      >
                        {userBook.book.authors.join(", ")}
                      </Text>
                    ) : null}
                  </View>
                  <ReadCountSheetBadge
                    userBookId={userBook.id}
                    mutedColor={appearance.mutedColor}
                    accentColor={appearance.accentColor}
                  />
                </View>

                {draft.length === 0 ? (
                  <EmptyState
                    appearance={appearance}
                    fontFamily={fontFamily}
                    onAdd={(c) =>
                      addSectionDraft(c.title, {
                        materialIcon: c.materialIcon,
                        materialIconColor: c.materialIconColor,
                        emoji: c.emoji,
                      })
                    }
                    onAddCustom={() => addSectionDraft("")}
                    suggestions={unusedDefaults}
                  />
                ) : (
                  // Map simple — réordering via les chevrons up/down de
                  // SheetSectionEditor (pixel-perfect garanti vs vue).
                  <View className="mt-6">
                    {draft.map((section, i) => (
                      <View
                        key={section.id}
                        style={{
                          paddingVertical: 14,
                          borderTopWidth: i === 0 ? 0 : 1,
                          borderTopColor: hexWithAlpha(
                            appearance.mutedColor,
                            0.22,
                          ),
                        }}
                      >
                        <SheetSectionEditor
                          section={section}
                          appearance={appearance}
                          fontFamily={fontFamily}
                          onUpdateMeta={(meta) =>
                            updateMetaDraft(section.id, meta)
                          }
                          onUpdateTitle={(title) =>
                            updateTitleDraft(section.id, title)
                          }
                          onUpdateBody={(body) =>
                            updateBodyDraft(section.id, body)
                          }
                          onSetRating={(v) =>
                            setRatingValueDraft(section.id, v)
                          }
                          onRemove={() => removeSectionDraft(section.id)}
                          onMoveUp={() => moveSectionDraft(section.id, -1)}
                          onMoveDown={() => moveSectionDraft(section.id, 1)}
                          canMoveUp={i > 0}
                          canMoveDown={i < draft.length - 1}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </SheetSurface>
              {/* Couche stickers : sibling de SheetSurface (l'un des deux a
                overflow:hidden si fond image, l'autre overflow:visible pour
                laisser les stickers déborder visuellement). Bornes alignées
                via le wrapper Animated.View en position:relative. */}
                <StickerLayer
                  stickers={draftStickers}
                  selectedId={selectedStickerId}
                  onSelect={setSelectedStickerId}
                  onUpdateTransform={updateStickerDraftTransform}
                  onDelete={(id) => {
                    removeStickerDraft(id);
                    setSelectedStickerId(null);
                  }}
                  onReorder={reorderStickerDraft}
                  onInteractChange={setStickerInteracting}
                />
              </Animated.View>
            </SheetPinchZoom>
          </ScrollView>

          {/* Les actions sous la fiche (Ajouter catégorie, Section
              personnalisée, Personnaliser, Stickers) ont été déplacées
              dans la SheetActionBar flottante. */}
        </ScrollView>

        <SheetActionBar
          actions={[
            {
              key: 'add-category',
              icon: 'playlist-add',
              label: 'Ajouter une catégorie',
              onPress: () => setCategoryDrawerOpen(true),
            },
            {
              key: 'customize',
              icon: 'palette',
              label: 'Personnaliser',
              onPress: handleCustomize,
            },
            {
              key: 'add-sticker',
              icon: 'emoji-emotions',
              label: 'Ajouter un sticker',
              onPress: () => setStickerPickerOpen(true),
            },
            {
              key: 'save-as-template',
              icon: 'auto-awesome-mosaic',
              label: 'Sauvegarder comme template',
              onPress: handleSaveAsTemplate,
            },
            {
              key: 'toggle-public',
              icon: 'public',
              label: sheet?.isPublic ? 'Rendre privée' : 'Rendre publique',
              onPress: handleTogglePublic,
              active: sheet?.isPublic ?? false,
            },
          ]}
          moreActions={[
            {
              key: 'export-image',
              icon: 'image',
              label: 'Exporter en image',
              disabled: true,
            },
            {
              key: 'print',
              icon: 'print',
              label: 'Imprimer',
              disabled: true,
            },
            {
              key: 'delete',
              icon: 'delete-outline',
              label: 'Supprimer la fiche',
              onPress: confirmDelete,
              destructive: true,
            },
          ]}
        />
      </KeyboardAvoidingView>

      <CategoryDrawer
        open={categoryDrawerOpen}
        onClose={() => setCategoryDrawerOpen(false)}
        categories={appearance.defaultCategories}
        usedTitles={draft.map((s) => s.title)}
        onAdd={(c) =>
          addSectionDraft(c.title, {
            materialIcon: c.materialIcon,
            materialIconColor: c.materialIconColor,
            emoji: c.emoji,
          })
        }
        onRemove={(title) => {
          const lower = title.trim().toLocaleLowerCase('fr');
          const sec = draft.find(
            (s) => s.title.trim().toLocaleLowerCase('fr') === lower,
          );
          if (sec) removeSectionDraft(sec.id);
        }}
        onAddCustom={(r) => {
          addSectionDraft(r.title, {
            materialIcon: r.materialIcon,
            materialIconColor: r.materialIconColor,
            emoji: r.emoji,
          });
        }}
      />

      <SheetCustomizer
        open={customizerOpen}
        appearance={appearance}
        title="Personnaliser la fiche"
        subtitle={userBook.book.title}
        onClose={() => setCustomizerOpen(false)}
        onSave={handleSaveAppearance}
        onReset={
          isCustomAppearance(sheet?.appearance, globalTemplate)
            ? handleResetAppearance
            : undefined
        }
        resetLabel="Utiliser le template global"
        drawer
        // Chaque mutation depuis le customizer → setDraftAppearance, qui
        // pousse une entrée undo. Pas de persistance immédiate dans le
        // store : Cmd+Z (ou geste undo équivalent) ramène l'état précédent,
        // et le bouton global Enregistrer commit le draft final.
        onChange={setDraftAppearance}
      />

      <StickerPickerModal
        open={stickerPickerOpen}
        onClose={() => setStickerPickerOpen(false)}
        placedCount={draftStickers.length}
        maxCount={MAX_STICKERS_PER_SHEET}
        onPick={(stickerId) => {
          // Pose dans le draft local ; persistance via le bouton Enregistrer.
          // Auto-sélection du nouveau placement pour afficher la barre flottante.
          const placedId = placeStickerDraft(stickerId);
          if (placedId) setSelectedStickerId(placedId);
        }}
      />

      <PremiumPaywallModal
        open={paywallOpen}
        reason="feature_limit"
        feature="sheets"
        onClose={() => setPaywallOpen(false)}
      />

      <ShareSheetModal
        open={shareSheetOpen}
        sheetId={sheet?.id ?? null}
        bookTitle={userBook.book.title}
        onClose={() => setShareSheetOpen(false)}
      />

      {/* Toast "Fiche enregistrée" : ancré sous le header (≈ y=64 sur la
          SafeAreaView), centré horizontalement. `pointerEvents=none` pour
          ne pas voler les taps de la barre d'action ou de la fiche. */}
      {savedToast ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 64,
            left: 0,
            right: 0,
            alignItems: 'center',
            zIndex: 1000,
            elevation: 1000,
          }}>
          <Animated.View
            key={savedToast.key}
            entering={FadeInUp.duration(180)}
            exiting={FadeOutUp.duration(160)}
            className="flex-row items-center gap-2 rounded-full bg-ink px-4 py-2 shadow-lg">
            <MaterialIcons name="check-circle" size={18} color="#fbf8f4" />
            <Text className="font-sans-med text-sm text-paper">
              Fiche enregistrée
            </Text>
          </Animated.View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function ReadCountSheetBadge({
  userBookId,
  mutedColor,
  accentColor,
}: {
  userBookId: string;
  mutedColor: string;
  accentColor: string;
}) {
  const max = useTimer((s) => {
    const list = s.cycles.filter((c) => c.userBookId === userBookId);
    return list.reduce((m, c) => (c.index > m ? c.index : m), 0);
  });
  if (max < 2) return null;
  return (
    <View
      style={{ borderColor: mutedColor, borderWidth: 1 }}
      className="items-center justify-center rounded-full px-2 py-0.5"
    >
      <Text
        style={{ color: accentColor }}
        className="text-[10px] font-sans-med"
      >
        {max}× lu
      </Text>
    </View>
  );
}

function EmptyState({
  onAdd,
  onAddCustom,
  suggestions,
  appearance,
  fontFamily,
}: {
  onAdd: (c: SheetDefaultCategory) => void;
  onAddCustom: () => void;
  suggestions: SheetDefaultCategory[];
  appearance: SheetAppearance;
  fontFamily: string;
}) {
  return (
    <Animated.View entering={FadeIn.duration(500).delay(100)} className="mt-6">
      <Text
        style={[{ color: appearance.textColor, fontFamily }, SHEET_TEXT_SHADOW]}
        className="text-2xl"
      >
        Crée ta fiche
      </Text>
      <Text
        style={[{ color: appearance.mutedColor }, SHEET_TEXT_SHADOW]}
        className="mt-2"
      >
        Note tes impressions sur ce livre. Ajoute les catégories qui
        t&apos;inspirent, crée les tiennes.
      </Text>
      <View className="mt-5 flex-row flex-wrap gap-2">
        {suggestions.map((c) => (
          <SuggestionPill
            key={c.title}
            category={c}
            appearance={appearance}
            onPress={() => onAdd(c)}
          />
        ))}
      </View>
      <Pressable
        onPress={onAddCustom}
        style={{ backgroundColor: appearance.accentColor }}
        className="mt-4 rounded-full px-6 py-3 active:opacity-80"
      >
        <Text
          style={SHEET_TEXT_SHADOW}
          className="text-center font-sans-med text-paper"
        >
          + Section personnalisée
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function SuggestionPill({
  category,
  appearance,
  onPress,
}: {
  category: SheetDefaultCategory;
  appearance: SheetAppearance;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{ borderColor: appearance.mutedColor, borderWidth: 1 }}
      className="flex-row items-center gap-1.5 rounded-full px-4 py-2 active:opacity-70"
    >
      <Text
        style={[{ color: appearance.textColor }, SHEET_TEXT_SHADOW]}
        className="text-sm"
      >
        + {category.title}
      </Text>
      {category.emoji ? (
        <Text style={[ficheTextStyle(14), SHEET_TEXT_SHADOW]}>
          {category.emoji}
        </Text>
      ) : category.materialIcon ? (
        <MaterialIcons
          name={category.materialIcon as keyof typeof MaterialIcons.glyphMap}
          size={14}
          color={category.materialIconColor ?? appearance.textColor}
        />
      ) : category.icon ? (
        <RatingIcon kind={category.icon} filled size={14} />
      ) : null}
    </Pressable>
  );
}


function SaveFab({
  onPress,
  accentColor,
  isEmpty,
}: {
  onPress: () => void;
  accentColor: string;
  isEmpty: boolean;
}) {
  const kb = useKeyboardOffset();
  const insets = useSafeAreaInsets();
  const safeBottom =
    Platform.OS === "ios" ? Math.max(insets.bottom - 16, 0) : insets.bottom;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: (kb > 0 ? kb : safeBottom) + 24,
      }}
      className="items-center"
    >
      <Animated.View entering={FadeInDown.duration(220)}>
        <Pressable
          onPress={onPress}
          accessibilityLabel="Enregistrer la fiche"
          style={{
            backgroundColor: accentColor,
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 4 },
            elevation: 8,
          }}
          className="flex-row items-center gap-2 rounded-full px-6 py-3 active:opacity-85"
        >
          <MaterialIcons
            name={isEmpty ? "delete-outline" : "check"}
            size={20}
            color="#fff"
          />
          <Text className="font-sans-med text-paper">
            {isEmpty ? "Supprimer la fiche" : "Enregistrer"}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const EMPTY_SECTIONS: SheetSection[] = [];
// Référence stable pour quand `sheet?.stickers` est undefined — évite que
// `<StickerLayer>` reçoive un nouveau tableau à chaque render et resync ses
// shared values pour rien.
const EMPTY_STICKERS: PlacedSticker[] = [];

// Largeur fixe de la fiche, en dp. Toutes les fiches sont rendues à cette
// largeur sur tous les devices : mobile scrolle latéralement si l'écran est
// plus étroit, desktop/tablette centre la fiche. Garantit un wrapping textuel
// et une position des stickers identiques d'un device à l'autre.
const SHEET_MAX_WIDTH = 380;

