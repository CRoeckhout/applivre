import { SearchMode } from '@/components/search-mode';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type Mode = 'scan' | 'search';

export default function ScannerScreen() {
  const nativeCapable = Platform.OS !== 'web';
  const [mode, setMode] = useState<Mode>(nativeCapable ? 'scan' : 'search');

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top']}>
      {nativeCapable && <ModeToggle mode={mode} onChange={setMode} />}
      {mode === 'search' ? <SearchMode /> : <NativeScanner />}
    </SafeAreaView>
  );
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <View className="mx-6 mt-2 flex-row rounded-full bg-paper-warm p-1">
      <Pill active={mode === 'scan'} onPress={() => onChange('scan')}>
        Scanner
      </Pill>
      <Pill active={mode === 'search'} onPress={() => onChange('search')}>
        Rechercher
      </Pill>
    </View>
  );
}

function Pill({
  active,
  onPress,
  children,
}: {
  active: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-full py-2 ${active ? 'bg-ink' : ''}`}>
      <Text className={active ? 'font-sans-med text-paper' : 'text-ink-soft'}>{children}</Text>
    </Pressable>
  );
}

function NativeScanner() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanRef = useRef<{ data: string; at: number } | null>(null);

  const onBarcode = useCallback(
    ({ data }: { data: string }) => {
      const now = Date.now();
      if (
        lastScanRef.current &&
        lastScanRef.current.data === data &&
        now - lastScanRef.current.at < 2000
      ) {
        return;
      }
      lastScanRef.current = { data, at: now };
      const isbn = data.replace(/[^0-9X]/gi, '');
      if (__DEV__) {
        console.log('[scanner] barcode raw:', data, '→ isbn:', isbn, 'len:', isbn.length);
      }
      if (isbn.length === 10 || isbn.length === 13) {
        router.push(`/book/${isbn}`);
      }
    },
    [router],
  );

  if (!permission) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-ink-muted">Chargement…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center font-display text-3xl text-ink">Accès à la caméra</Text>
        <Text className="mt-3 text-center text-ink-muted">
          Applivre utilise la caméra pour scanner les codes-barres de tes livres.
        </Text>
        <Pressable
          onPress={requestPermission}
          className="mt-8 rounded-full bg-accent px-6 py-3 active:opacity-80">
          <Text className="font-sans-med text-paper">Autoriser</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="mx-6 mt-4 flex-1 overflow-hidden rounded-3xl bg-ink">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={onBarcode}
      />
      <Animated.View
        entering={FadeIn.duration(400)}
        pointerEvents="none"
        className="absolute inset-0 items-center justify-center">
        <View className="h-48 w-72 rounded-2xl border-2 border-paper/90" />
        <Text className="mt-6 rounded-full bg-ink/60 px-4 py-2 text-paper">
          Vise le code-barres du livre
        </Text>
      </Animated.View>
    </View>
  );
}
