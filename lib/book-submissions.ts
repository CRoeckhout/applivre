import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { decode } from 'base64-arraybuffer';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

const BUCKET = 'book-submission-covers';

export type CoverPhoto = {
  uri: string;
  base64: string;
  mimeType: string;
};

// Soumission d'un livre introuvable (cf. migration 0077). `bookIsbn` est la
// clé locale (ISBN réel ou `manual-<uuid>`) sous laquelle le livre est aussi
// ajouté à la biblio de l'user — l'approbation admin écrit `books` avec.
export type BookSubmissionInput = {
  userId: string;
  bookIsbn: string;
  isbn?: string;
  title: string;
  pages: number;
  authors: string[];
  categories: string[];
  publishedAt?: string;
  coverUrl?: string;
  coverPhoto?: CoverPhoto | null;
};

const COVER_RATIO = 2 / 3;
const COVER_QUALITY = 0.7;

// Sur iOS, l'éditeur natif d'expo-image-picker ignore `aspect` et force un
// crop carré : on le désactive et on recadre nous-mêmes au centre en 2:3.
const NATIVE_CROP = Platform.OS !== 'ios';

export async function pickCoverPhoto(
  source: 'camera' | 'library',
): Promise<CoverPhoto | null> {
  const options: ImagePicker.ImagePickerOptions = NATIVE_CROP
    ? {
        mediaTypes: ['images'],
        quality: COVER_QUALITY,
        base64: true,
        allowsEditing: true,
        aspect: [2, 3],
      }
    : { mediaTypes: ['images'], quality: 1 };
  let result: ImagePicker.ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset) return null;
  if (!NATIVE_CROP) return cropToCoverRatio(asset);
  if (!asset.base64) return null;
  return {
    uri: asset.uri,
    base64: asset.base64,
    mimeType: asset.mimeType ?? 'image/jpeg',
  };
}

async function cropToCoverRatio(
  asset: ImagePicker.ImagePickerAsset,
): Promise<CoverPhoto> {
  const { width, height } = asset;
  const tooWide = width / height > COVER_RATIO;
  const cropWidth = tooWide ? Math.round(height * COVER_RATIO) : width;
  const cropHeight = tooWide ? height : Math.round(width / COVER_RATIO);
  const context = ImageManipulator.manipulate(asset.uri).crop({
    originX: Math.round((width - cropWidth) / 2),
    originY: Math.round((height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({
    format: SaveFormat.JPEG,
    compress: COVER_QUALITY,
    base64: true,
  });
  if (!saved.base64) throw new Error('Recadrage couverture : base64 manquant');
  return { uri: saved.uri, base64: saved.base64, mimeType: 'image/jpeg' };
}

async function uploadCover(userId: string, photo: CoverPhoto): Promise<string> {
  const ext = photo.mimeType.includes('png') ? 'png' : 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(photo.base64), {
      upsert: false,
      contentType: photo.mimeType,
    });
  if (error) throw new Error(`Upload couverture : ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Retourne l'URL de couverture finale (photo uploadée ou URL saisie).
export async function submitBookSubmission(
  input: BookSubmissionInput,
): Promise<{ coverUrl: string | undefined }> {
  const coverUrl = input.coverPhoto
    ? await uploadCover(input.userId, input.coverPhoto)
    : input.coverUrl;

  const { error } = await supabase.from('book_submissions').insert({
    user_id: input.userId,
    book_isbn: input.bookIsbn,
    isbn: input.isbn ?? null,
    title: input.title,
    pages: input.pages,
    authors: input.authors,
    categories: input.categories,
    published_at: input.publishedAt ?? null,
    cover_url: coverUrl ?? null,
  });
  if (error) throw new Error(error.message);
  return { coverUrl };
}

// ═════════════ Mes soumissions (profil) ═════════════

export type BookSubmissionStatus = 'pending' | 'approved' | 'rejected';

export type MyBookSubmission = {
  id: string;
  bookIsbn: string;
  isbn: string | null;
  title: string;
  pages: number;
  authors: string[];
  categories: string[];
  publishedAt: string | null;
  coverUrl: string | null;
  status: BookSubmissionStatus;
  // `approved` mais row `books` supprimée depuis (onglet Livres admin).
  removedFromCatalog: boolean;
  decisionReason: string | null;
  createdAt: string;
};

type BookSubmissionDbRow = {
  id: string;
  book_isbn: string;
  isbn: string | null;
  title: string;
  pages: number;
  authors: string[];
  categories: string[];
  published_at: string | null;
  cover_url: string | null;
  status: BookSubmissionStatus;
  decision_reason: string | null;
  created_at: string;
};

function toMySubmission(r: BookSubmissionDbRow, removedFromCatalog = false): MyBookSubmission {
  return {
    id: r.id,
    bookIsbn: r.book_isbn,
    isbn: r.isbn,
    title: r.title,
    pages: r.pages,
    authors: r.authors,
    categories: r.categories,
    publishedAt: r.published_at,
    coverUrl: r.cover_url,
    status: r.status,
    removedFromCatalog,
    decisionReason: r.decision_reason,
    createdAt: r.created_at,
  };
}

export const MY_SUBMISSIONS_QUERY_KEY = ['book-submissions', 'mine'] as const;

// RLS « self select » : uniquement les soumissions de l'user connecté
// (archivées côté admin comprises — l'archivage ne concerne que le backoffice).
export async function fetchMySubmissions(): Promise<MyBookSubmission[]> {
  const { data, error } = await supabase
    .from('book_submissions')
    .select(
      'id, book_isbn, isbn, title, pages, authors, categories, published_at, cover_url, status, decision_reason, created_at',
    )
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as BookSubmissionDbRow[];

  const approvedIsbns = [
    ...new Set(rows.filter((r) => r.status === 'approved').map((r) => r.book_isbn)),
  ];
  let present = new Set<string>();
  if (approvedIsbns.length > 0) {
    const { data: books, error: booksErr } = await supabase
      .from('books')
      .select('isbn')
      .in('isbn', approvedIsbns);
    if (booksErr) throw new Error(booksErr.message);
    present = new Set((books ?? []).map((b) => b.isbn as string));
  }
  return rows.map((r) =>
    toMySubmission(r, r.status === 'approved' && !present.has(r.book_isbn)),
  );
}

export function useMySubmissions(enabled = true) {
  return useQuery({
    queryKey: MY_SUBMISSIONS_QUERY_KEY,
    queryFn: fetchMySubmissions,
    enabled,
    staleTime: 1000 * 30,
  });
}

export function isSubmissionCoverUrl(url: string | null | undefined): boolean {
  return !!url && url.includes(`/storage/v1/object/public/${BUCKET}/`);
}

export type BookSubmissionUpdate = {
  userId: string;
  id: string;
  title: string;
  pages: number;
  authors: string[];
  categories: string[];
  publishedAt?: string;
  // URL finale si pas de nouvelle photo (photo existante conservée ou lien).
  coverUrl?: string;
  coverPhoto?: CoverPhoto | null;
};

// Édition tant que `pending` (RPC 0079, refusée une fois décidée).
export async function updateBookSubmission(
  input: BookSubmissionUpdate,
): Promise<MyBookSubmission> {
  const coverUrl = input.coverPhoto
    ? await uploadCover(input.userId, input.coverPhoto)
    : input.coverUrl;
  const { data, error } = await supabase.rpc('update_own_book_submission', {
    p_submission_id: input.id,
    p_title: input.title,
    p_pages: input.pages,
    p_authors: input.authors,
    p_categories: input.categories,
    p_published_at: input.publishedAt ?? null,
    p_cover_url: coverUrl ?? null,
  });
  if (error) {
    if (error.message.includes('already decided')) {
      throw new Error("Cette soumission a déjà été traitée par l'équipe, elle n'est plus modifiable.");
    }
    throw new Error(error.message);
  }
  return toMySubmission(data as BookSubmissionDbRow);
}

export async function searchAuthors(query: string): Promise<string[]> {
  if (query.trim().length < 2) return [];
  const { data, error } = await supabase.rpc('search_book_authors', {
    p_query: query,
  });
  if (error) {
    if (__DEV__) console.warn('[searchAuthors]', error);
    return [];
  }
  return (data as string[] | null) ?? [];
}

// Query vide → genres les plus courts du catalogue (suggestions par défaut).
export async function searchGenres(query: string): Promise<string[]> {
  const { data, error } = await supabase.rpc('search_book_categories', {
    p_query: query,
  });
  if (error) {
    if (__DEV__) console.warn('[searchGenres]', error);
    return [];
  }
  return (data as string[] | null) ?? [];
}
