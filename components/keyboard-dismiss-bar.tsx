import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, Text, View } from 'react-native';

// Bouton flottant pour fermer le clavier — utile pour les TextInput multiline
// (pas de touche "Retour" sur le clavier natif). S'affiche dès qu'un clavier
// est visible, masqué sinon.
export function KeyboardDismissBar() {
  const [bottom, setBottom] = useState<number | null>(null);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvt, (e) => {
      setBottom(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvt, () => setBottom(null));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (bottom == null) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        right: 12,
        bottom: bottom + 8,
        zIndex: 50,
      }}>
      <Pressable
        onPress={() => Keyboard.dismiss()}
        accessibilityLabel="Fermer le clavier"
        style={{
          shadowColor: '#000',
          shadowOpacity: 0.18,
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 6,
          elevation: 4,
        }}
        className="flex-row items-center gap-1 rounded-full bg-ink px-3 py-2 active:opacity-80">
        <MaterialIcons name="keyboard-hide" size={18} color="#fbf8f4" />
        <Text className="text-sm font-sans-med text-paper">Fermer</Text>
      </Pressable>
    </View>
  );
}
