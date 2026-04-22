import { supabase } from '@/lib/supabase';
import { decode } from 'base64-arraybuffer';
import * as ImagePicker from 'expo-image-picker';

const BUCKET = 'avatars';

export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  // Demande implicite de permission par launchImageLibraryAsync
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
    base64: true,
  });

  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.base64) return null;

  return uploadAvatarBase64(userId, asset.base64, asset.mimeType ?? 'image/jpeg');
}

export async function uploadAvatarBase64(
  userId: string,
  base64: string,
  mimeType = 'image/jpeg',
): Promise<string> {
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/avatar.${ext}`;
  const bytes = decode(base64);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, {
      upsert: true,
      contentType: mimeType,
    });
  if (error) throw new Error(`Upload avatar : ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-busting : on ajoute un timestamp pour forcer le rechargement
  // de l'image côté client après un remplacement.
  return `${data.publicUrl}?t=${Date.now()}`;
}
