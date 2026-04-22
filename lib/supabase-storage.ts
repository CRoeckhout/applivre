import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Supabase recommande AsyncStorage / localStorage pour stocker la session :
// les tokens JWT peuvent dépasser les 2 Ko autorisés par SecureStore sur Android.
const webStorage = {
  getItem: (key: string) =>
    Promise.resolve(typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null),
  setItem: (key: string, value: string) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    return Promise.resolve();
  },
  removeItem: (key: string) => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    return Promise.resolve();
  },
};

export default Platform.OS === 'web' ? webStorage : AsyncStorage;
