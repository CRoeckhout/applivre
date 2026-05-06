import { PremiumPaywallModal } from '@/components/premium-paywall-modal';
import { listMusicThemes, type MusicTheme } from '@/lib/reading-music/api';
import { useReadingMusicStore } from '@/store/reading-music';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ThemeSelectorSheet } from './theme-selector-sheet';

// Sub-panel d'ambiance sonore affiché dans ActiveTimerPanel pendant une
// session de lecture. Pure UI : lit le store reading-music, déclenche les
// actions togglePlay/next/prev. La lecture audio elle-même est pilotée par
// <ReadingMusicEngine /> au root de l'app.
export function MusicPlayerPanel() {
  const themeKey = useReadingMusicStore((s) => s.selectedThemeKey);
  const trackIndex = useReadingMusicStore((s) => s.currentTrackIndex);
  const trackCount = useReadingMusicStore((s) => s.trackCount);
  const currentTrackTitle = useReadingMusicStore((s) => s.currentTrackTitle);
  const isPlaying = useReadingMusicStore((s) => s.isPlaying);
  const statusKind = useReadingMusicStore((s) => s.statusKind);
  const statusError = useReadingMusicStore((s) => s.statusError);
  const statusDownloadDone = useReadingMusicStore((s) => s.statusDownloadDone);
  const statusDownloadTotal = useReadingMusicStore(
    (s) => s.statusDownloadTotal,
  );

  const togglePlay = useReadingMusicStore((s) => s.togglePlay);
  const next = useReadingMusicStore((s) => s.next);
  const prev = useReadingMusicStore((s) => s.prev);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);

  const themeDisplayName = useThemeDisplayName(themeKey);

  return (
    <>
      <View className="mt-6 rounded-2xl bg-paper/10 p-4">
        <Pressable
          onPress={() => setSheetOpen(true)}
          className="flex-row items-center gap-2 active:opacity-70"
        >
          <MaterialIcons name="music-note" size={18} color="rgb(245 240 230)" />
          <Text className="flex-1 font-sans-med text-paper">
            {themeKey ? themeDisplayName ?? themeKey : 'Choisir une ambiance'}
          </Text>
          <MaterialIcons
            name="keyboard-arrow-down"
            size={20}
            color="rgb(245 240 230)"
          />
        </Pressable>

        {themeKey && (
          <PlayerBody
            statusKind={statusKind}
            statusError={statusError}
            statusDownloadDone={statusDownloadDone}
            statusDownloadTotal={statusDownloadTotal}
            currentTrackTitle={currentTrackTitle}
            trackIndex={trackIndex}
            trackCount={trackCount}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onNext={next}
            onPrev={prev}
          />
        )}
      </View>

      <ThemeSelectorSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPaywallRequested={() => setPaywallOpen(true)}
      />

      <PremiumPaywallModal
        open={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        reason="premium"
      />
    </>
  );
}

function PlayerBody({
  statusKind,
  statusError,
  statusDownloadDone,
  statusDownloadTotal,
  currentTrackTitle,
  trackIndex,
  trackCount,
  isPlaying,
  onTogglePlay,
  onNext,
  onPrev,
}: {
  statusKind: ReturnType<typeof useReadingMusicStore.getState>['statusKind'];
  statusError: string | null;
  statusDownloadDone: number;
  statusDownloadTotal: number;
  currentTrackTitle: string | null;
  trackIndex: number;
  trackCount: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  if (statusKind === 'loading') {
    return (
      <View className="mt-3 flex-row items-center gap-2">
        <ActivityIndicator size="small" color="rgb(245 240 230)" />
        <Text className="text-sm text-paper-shade">Préparation…</Text>
      </View>
    );
  }

  if (statusKind === 'downloading') {
    return (
      <View className="mt-3 flex-row items-center gap-2">
        <ActivityIndicator size="small" color="rgb(245 240 230)" />
        <Text className="text-sm text-paper-shade">
          Téléchargement {statusDownloadDone}/{statusDownloadTotal}…
        </Text>
      </View>
    );
  }

  if (statusKind === 'unavailable_offline') {
    return (
      <Text className="mt-3 text-sm text-paper-shade">
        Indisponible hors ligne — connecte-toi pour télécharger ce thème.
      </Text>
    );
  }

  if (statusKind === 'error') {
    return (
      <Text className="mt-3 text-sm text-paper-shade">
        Impossible de charger ce thème ({statusError}).
      </Text>
    );
  }

  if (statusKind === 'ready' && trackCount === 0) {
    return (
      <Text className="mt-3 text-sm text-paper-shade">
        Aucune piste dans ce thème pour le moment.
      </Text>
    );
  }

  if (!currentTrackTitle) return null;

  return (
    <>
      <View className="mt-3">
        <Text numberOfLines={1} className="font-sans-med text-paper">
          {currentTrackTitle}
        </Text>
        <Text className="text-xs text-paper-shade">
          Piste {trackIndex + 1} / {trackCount}
        </Text>
      </View>

      <View className="mt-3 flex-row items-center justify-center gap-6">
        <ControlButton icon="skip-previous" onPress={onPrev} />
        <ControlButton
          icon={isPlaying ? 'pause' : 'play-arrow'}
          onPress={onTogglePlay}
          large
        />
        <ControlButton icon="skip-next" onPress={onNext} />
      </View>
    </>
  );
}

function ControlButton({
  icon,
  onPress,
  large,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
  large?: boolean;
}) {
  const size = large ? 56 : 44;
  const iconSize = large ? 32 : 24;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      className={
        large ? 'bg-accent active:opacity-80' : 'bg-paper/15 active:opacity-70'
      }
    >
      <MaterialIcons name={icon} size={iconSize} color="rgb(245 240 230)" />
    </Pressable>
  );
}

// Petit hook pour résoudre key → display_name. Cache la liste des thèmes
// localement (la sélection initiale ne re-fetch pas tant que le component vit).
function useThemeDisplayName(themeKey: string | null): string | null {
  const [themes, setThemes] = useState<MusicTheme[] | null>(null);

  useEffect(() => {
    if (!themeKey || themes !== null) return;
    let cancelled = false;
    listMusicThemes()
      .then((list) => {
        if (!cancelled) setThemes(list);
      })
      .catch(() => {
        if (!cancelled) setThemes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [themeKey, themes]);

  if (!themeKey) return null;
  return themes?.find((t) => t.key === themeKey)?.displayName ?? null;
}
