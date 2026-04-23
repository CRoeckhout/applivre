import { useDebug } from '@/store/debug';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

// Bouton flottant dev-only pour basculer les panneaux debug.
// Le menu RN DevSettings n'est pas fiable selon l'environnement (Expo Go,
// dev client…), on fournit ce toggle dans l'app pour garantir l'accès.
export function DebugToggle() {
  const enabled = useDebug((s) => s.panelsEnabled);
  const toggle = useDebug((s) => s.togglePanels);

  if (!__DEV__) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: 80,
        left: 12,
        zIndex: 9999,
      }}>
      <Pressable
        onPress={toggle}
        accessibilityLabel={enabled ? 'Masquer debug' : 'Afficher debug'}
        hitSlop={8}
        style={{
          backgroundColor: enabled ? 'rgba(200,50,42,0.92)' : 'rgba(0,0,0,0.6)',
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 999,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 2 },
          elevation: 4,
        }}>
        <MaterialIcons
          name={enabled ? 'bug-report' : 'pest-control-rodent'}
          size={14}
          color="#fff"
        />
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>
          {enabled ? 'DEBUG ON' : 'DEBUG OFF'}
        </Text>
      </Pressable>
    </View>
  );
}
