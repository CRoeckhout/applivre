import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// Hauteur du clavier en pixels, 0 si fermé. À utiliser pour décaler des
// éléments en bottom: 0 absolus (FABs) au-dessus du clavier.
export function useKeyboardOffset(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvt, (e) => {
      setHeight(e.endCoordinates?.height ?? 0);
    });
    const hide = Keyboard.addListener(hideEvt, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
