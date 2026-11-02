import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Height of the on screen keyboard, 0 when it is closed. Web has no on screen keyboard.
// On Android the reported height leaves out the navigation bar, so that bar is added back.
export function useKeyboardHeight() {
  const insets = useSafeAreaInsets();
  const extra = Platform.OS === 'android' ? insets.bottom : 0;
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setH(e.endCoordinates.height + extra));
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [extra]);
  return h;
}
