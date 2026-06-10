import { BookCover } from '@/components/book-cover';
import { SearchMode } from '@/components/search-mode';
import { APP_NAME } from '@/constants/app';
import { fetchBook } from '@/lib/books';
import { useScanBatch } from '@/store/scan-batch';
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInRight } from 'react-native-reanimated';
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
  const items = useScanBatch((s) => s.items);
  const add = useScanBatch((s) => s.add);
  const remove = useScanBatch((s) => s.remove);
  const clear = useScanBatch((s) => s.clear);
  const [torch, setTorch] = useState(false);
  // ISBN en cours de résolution → placeholders dans la liste latérale.
  const [resolving, setResolving] = useState<string[]>([]);

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
      if (isbn.length !== 10 && isbn.length !== 13) return;
      // Déjà empilé ou en cours de résolution → on ignore.
      if (useScanBatch.getState().items.some((b) => b.isbn === isbn)) return;
      let already = false;
      setResolving((prev) => {
        if (prev.includes(isbn)) {
          already = true;
          return prev;
        }
        return [...prev, isbn];
      });
      if (already) return;
      void fetchBook(isbn)
        .then((book) => {
          if (book) add(book);
        })
        .finally(() => setResolving((prev) => prev.filter((i) => i !== isbn)));
    },
    [add],
  );

  const onValidate = useCallback(() => {
    if (items.length === 0) return;
    if (items.length === 1) {
      const isbn = items[0].isbn;
      clear();
      router.push(`/book/${isbn}`);
      return;
    }
    router.push('/book/batch-classify');
  }, [items, clear, router]);

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
          {APP_NAME} utilise la caméra pour scanner les codes-barres de tes livres.
        </Text>
        <Pressable
          onPress={requestPermission}
          className="mt-8 rounded-full bg-accent px-6 py-3 active:opacity-80">
          <Text className="font-sans-med text-paper">Autoriser</Text>
        </Pressable>
      </View>
    );
  }

  const count = items.length;

  return (
    <View className="mx-6 mb-4 mt-4 flex-1 overflow-hidden rounded-3xl bg-ink">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={onBarcode}
      />
      <Animated.View
        entering={FadeIn.duration(400)}
        pointerEvents="none"
        className="absolute inset-x-0 top-0 items-center"
        style={{ bottom: 96 }}>
        <View className="flex-1 justify-center">
          <View className="h-48 w-64 rounded-2xl border-2 border-paper/90" />
          <Text className="mt-6 self-center rounded-full bg-ink/60 px-4 py-2 text-paper">
            {count > 0 ? 'Continue à scanner tes livres' : 'Vise le code-barres du livre'}
          </Text>
        </View>
      </Animated.View>

      {/* Pile des livres scannés — colonne scrollable sur le bord droit,
          posée sur un léger backdrop grisé. */}
      {(count > 0 || resolving.length > 0) && (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: 14, right: 10, bottom: 96, width: 92 }}>
          <View
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.28)',
              borderRadius: 18,
              paddingVertical: 10,
            }}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
              {items.map((b) => (
                <Animated.View key={b.isbn} entering={FadeInRight.duration(220)}>
                  <View style={{ width: 68 }}>
                    <BookCover
                      isbn={b.isbn}
                      coverUrl={b.coverUrl}
                      style={{ width: 68, height: 102, borderRadius: 8 }}
                      placeholderText={b.title}
                    />
                    <Pressable
                      onPress={() => remove(b.isbn)}
                      hitSlop={8}
                      style={{
                        position: 'absolute',
                        top: -7,
                        right: -7,
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: '#1f1a16',
                        borderWidth: 1.5,
                        borderColor: '#fbf8f4',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}>
                      <MaterialIcons name="close" size={14} color="#ffffff" />
                    </Pressable>
                  </View>
                </Animated.View>
              ))}
              {resolving.map((isbn) => (
                <View
                  key={`r-${isbn}`}
                  style={{
                    width: 68,
                    height: 102,
                    borderRadius: 8,
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <ActivityIndicator size="small" color="#fbf8f4" />
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Barre du bas : flash · valider · compteur. */}
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
        className="flex-row items-center justify-between px-4 pb-4">
        <Pressable
          onPress={() => setTorch((t) => !t)}
          className="h-12 w-12 items-center justify-center rounded-full active:opacity-80"
          style={{ backgroundColor: torch ? '#fbf8f4' : 'rgba(0,0,0,0.5)' }}>
          <MaterialIcons name={torch ? 'flash-on' : 'flash-off'} size={22} color={torch ? '#1f1a16' : '#ffffff'} />
        </Pressable>

        <Pressable
          onPress={onValidate}
          disabled={count === 0}
          style={{ opacity: count === 0 ? 0.4 : 1 }}
          className="ml-3 flex-1 flex-row items-center justify-center gap-2 rounded-full bg-paper px-6 py-3.5 active:opacity-80">
          <Text className="font-sans-med text-ink">
            {count <= 1 ? 'Valider' : `Valider (${count})`}
          </Text>
          <MaterialIcons name="arrow-forward" size={18} color="#1f1a16" />
        </Pressable>
      </View>
    </View>
  );
}
