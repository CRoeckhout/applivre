import { useColorScheme as useRNColorScheme } from 'react-native';

// RN 0.86 ajoute 'unspecified' à ColorSchemeName : on le ramène à null pour que
// les appelants puissent continuer à faire `?? 'light'`.
export function useColorScheme() {
  const colorScheme = useRNColorScheme();
  return colorScheme === 'unspecified' ? null : colorScheme;
}
