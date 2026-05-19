import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  style?: StyleProp<ViewStyle>;
  title?: string;
  author?: string;
  // Icône affichée au centre. Default 'menu-book' (livre stylisé).
  icon?: keyof typeof MaterialIcons.glyphMap;
};

// Faux livre stylisé pour la prévisualisation des templates (pas de livre
// réel attaché). Reproduit l'allure d'une couverture : ratio 3:4, fond beige
// dégradé visuellement vers le bord droit (tranche), petit icône book, titre
// et auteur génériques en bas si l'espace est suffisant.
export function BookPlaceholder({
  style,
  title = 'Titre du livre',
  author = 'Auteur',
  icon = 'menu-book',
}: Props) {
  const flat = StyleSheet.flatten(style) as
    | { width?: number; height?: number; borderRadius?: number }
    | undefined;
  const w = typeof flat?.width === 'number' ? flat.width : 48;
  const h = typeof flat?.height === 'number' ? flat.height : 72;
  const minDim = Math.min(w, h);
  const showLabels = minDim >= 56;
  const iconSize = Math.max(16, Math.round(minDim * 0.32));
  const radius = flat?.borderRadius ?? 6;

  return (
    <View
      style={[
        {
          width: w,
          height: h,
          borderRadius: radius,
          backgroundColor: '#e8dccb',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: showLabels ? 'space-between' : 'center',
          paddingVertical: showLabels ? Math.round(minDim * 0.12) : 0,
          paddingHorizontal: showLabels ? Math.round(minDim * 0.1) : 0,
          borderWidth: 1,
          borderColor: 'rgba(58, 50, 43, 0.12)',
        },
        style,
      ]}>
      {/* Tranche droite (effet épaisseur) */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: Math.max(2, Math.round(w * 0.04)),
          backgroundColor: 'rgba(58, 50, 43, 0.12)',
        }}
      />
      <MaterialIcons name={icon} size={iconSize} color="#8a7a66" />
      {showLabels ? (
        <View style={{ alignItems: 'center', width: '100%' }}>
          <Text
            numberOfLines={2}
            style={{
              color: '#3a322b',
              fontSize: Math.max(8, Math.round(minDim * 0.11)),
              textAlign: 'center',
              fontWeight: '600',
              lineHeight: Math.max(10, Math.round(minDim * 0.13)),
            }}>
            {title}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              color: '#6b6259',
              fontSize: Math.max(7, Math.round(minDim * 0.09)),
              marginTop: 2,
              textAlign: 'center',
            }}>
            {author}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
