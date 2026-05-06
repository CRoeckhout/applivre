// Affichage / saisie d'une note 5★ pour les avis publics. Distinct de
// `RatingRow` (qui couvre la note privée user_books avec icônes
// configurables : star/heart/chili). Ici on impose l'étoile, c'est
// l'attendu d'un avis grand public.

import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

const STAR_FILLED = '#f4a623';
const STAR_EMPTY = '#d8cfc4';

type DisplayProps = {
  value: number;
  size?: number;
  // Permet d'afficher des demi-étoiles (note moyenne). En saisie on reste
  // sur des entiers, donc le mode interactif ne l'expose pas.
  allowHalf?: boolean;
};

export function StarRatingDisplay({ value, size = 18, allowHalf = false }: DisplayProps) {
  return (
    <View className="flex-row items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = value >= i;
        const half = allowHalf && !filled && value >= i - 0.5;
        const name = filled ? 'star' : half ? 'star-half' : 'star-border';
        return (
          <MaterialIcons
            key={i}
            name={name as 'star' | 'star-half' | 'star-border'}
            size={size}
            color={filled || half ? STAR_FILLED : STAR_EMPTY}
          />
        );
      })}
    </View>
  );
}

type InputProps = {
  value: number;
  onChange: (v: number) => void;
  size?: number;
};

export function StarRatingInput({ value, onChange, size = 32 }: InputProps) {
  return (
    <View className="flex-row items-center gap-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable
          key={i}
          onPress={() => onChange(value === i ? i - 1 : i)}
          accessibilityLabel={`${i} étoile${i > 1 ? 's' : ''}`}
          hitSlop={6}
        >
          <MaterialIcons
            name={value >= i ? 'star' : 'star-border'}
            size={size}
            color={value >= i ? STAR_FILLED : STAR_EMPTY}
          />
        </Pressable>
      ))}
    </View>
  );
}
