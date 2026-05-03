import { MaterialIcons } from '@expo/vector-icons';
import { View } from 'react-native';

// Petit pictogramme étoile posé en absolu, bottom-left, sur les tuiles de
// catalog verrouillées (premium / unit). Layer décoratif : le tap reste géré
// par le `<Pressable>` parent, qui décide d'ouvrir la paywall plutôt que
// de sélectionner. `pointerEvents="none"` pour ne pas intercepter le tap.
export function LockOverlay() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 6,
        bottom: 6,
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'rgba(255,255,255,0.92)',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 2,
        elevation: 2,
      }}>
      <MaterialIcons name="star" size={14} color="#f59e0b" />
    </View>
  );
}
