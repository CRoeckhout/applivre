import { getAvatarFrame } from '@/lib/avatar-frames/catalog';
import { useAllAvatarFrames } from '@/store/avatar-frame-catalog';
import { Image } from 'expo-image';
import { type ReactNode } from 'react';
import { View } from 'react-native';

type Props = {
  // Diamètre extérieur du cadre en px (= taille du container rond).
  size: number;
  frameId: string;
  // L'avatar lui-même, déjà rendu (Image ou View). Il est positionné au
  // centre du cadre, taille déterminée par image_scale + image_padding du
  // cadre catalog. Le composant ne contraint PAS son rendu interne — c'est
  // au parent de fournir un `<Image style={{ width:'100%', height:'100%' }}>`
  // ou équivalent pour remplir l'espace réservé.
  children: ReactNode;
};

// Affiche `children` (l'avatar) à l'intérieur d'un cadre rond, avec le PNG
// du cadre superposé en overlay non-interactif. Si `frameId === 'none'` (ou
// cadre introuvable), passthrough — `children` est rendu seul, déjà rond,
// taille = size.
export function AvatarFrame({ size, frameId, children }: Props) {
  const allFrames = useAllAvatarFrames();
  const frame = allFrames.find((f) => f.id === frameId) ?? getAvatarFrame(frameId);

  if (frame.id === 'none' || !frame.source) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
        }}>
        {children}
      </View>
    );
  }

  // Rapport effectif (photo visible / cadre extérieur) tel que défini par
  // l'admin : image_scale rétrécit la photo, image_padding (px en espace
  // natif du PNG) ajoute un inset additionnel.
  const nativeWidth = frame.imageSize?.width ?? size;
  const paddingScaled = nativeWidth > 0
    ? (frame.imagePadding * size) / nativeWidth
    : 0;
  const ratio = Math.max(0.05, frame.imageScale - (2 * paddingScaled) / size);

  // Plutôt que de rétrécir la photo (qui ferait paraître l'avatar plus
  // petit dès qu'on applique un cadre), on garde la photo à `size × size`
  // et on étend le cadre vers l'extérieur via un offset négatif. Le
  // footprint de layout reste `size × size` — le cadre déborde visuellement
  // mais ne décale ni siblings ni gap.
  const frameOuterSize = size / ratio;
  const frameOffset = (frameOuterSize - size) / 2;

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
        }}>
        {children}
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -frameOffset,
          left: -frameOffset,
          width: frameOuterSize,
          height: frameOuterSize,
        }}>
        <Image
          source={frame.source}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
        />
      </View>
    </View>
  );
}
