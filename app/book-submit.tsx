import { usePaperScreenClass } from '@/components/app-fond-background';
import { ChipsAutocompleteInput } from '@/components/chips-autocomplete-input';
import { useAuth } from '@/hooks/use-auth';
import {
  isSubmissionCoverUrl,
  MY_SUBMISSIONS_QUERY_KEY,
  pickCoverPhoto,
  searchAuthors,
  searchGenres,
  submitBookSubmission,
  updateBookSubmission,
  useMySubmissions,
  type CoverPhoto,
  type MyBookSubmission,
} from '@/lib/book-submissions';
import { newId } from '@/lib/id';
import { resolveStorageUrl } from '@/lib/storage-url';
import { useBookshelf } from '@/store/bookshelf';
import type { Book, UserBook } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

type CoverMode = 'photo' | 'url';

const ISBN_RE = /^(\d{9}[\dX]|\d{13})$/;
const YEAR_RE = /^\d{4}$/;

// Soumission d'un livre introuvable aux admins (ouvert depuis le dialog du
// scanner). Le livre est ajouté immédiatement à la biblio de l'user ; la
// soumission part en `book_submissions` (pending) pour validation catalogue.
// Avec `?id=` (depuis le profil) : édition d'une soumission encore `pending`.
export default function BookSubmitScreen() {
  const { isbn: prefilledIsbn, id } = useLocalSearchParams<{ isbn?: string; id?: string }>();
  const paperScreen = usePaperScreenClass();
  const router = useRouter();
  const submissions = useMySubmissions(!!id);

  if (!id) return <SubmissionForm prefilledIsbn={prefilledIsbn} />;

  const editing = submissions.data?.find((s) => s.id === id);
  if (editing?.status === 'pending') return <SubmissionForm key={editing.id} editing={editing} />;

  return (
    <SafeAreaView className={`flex-1 items-center justify-center gap-4 px-8 ${paperScreen}`}>
      {submissions.isPending ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text className="text-center text-base text-ink-muted">
            {editing
              ? "Cette soumission a déjà été traitée par l'équipe, elle n'est plus modifiable."
              : 'Soumission introuvable.'}
          </Text>
          <Pressable onPress={() => router.back()} className="py-3 active:opacity-70">
            <Text className="text-sm text-accent-deep">Retour</Text>
          </Pressable>
        </>
      )}
    </SafeAreaView>
  );
}

function SubmissionForm({
  prefilledIsbn,
  editing,
}: {
  prefilledIsbn?: string;
  editing?: MyBookSubmission;
}) {
  const router = useRouter();
  const paperScreen = usePaperScreenClass();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const addBook = useBookshelf((s) => s.addBook);
  const updateBookInfo = useBookshelf((s) => s.updateBookInfo);

  const initialCover = editing?.coverUrl ?? null;
  const initialIsPhoto = !initialCover || isSubmissionCoverUrl(initialCover);
  const [title, setTitle] = useState(editing?.title ?? '');
  const [pages, setPages] = useState(editing ? String(editing.pages) : '');
  const [authors, setAuthors] = useState<string[]>(editing?.authors ?? []);
  const [genres, setGenres] = useState<string[]>(editing?.categories ?? []);
  const [year, setYear] = useState(editing?.publishedAt ?? '');
  const [isbn, setIsbn] = useState(editing ? (editing.isbn ?? '') : (prefilledIsbn ?? ''));
  const [coverMode, setCoverMode] = useState<CoverMode>(initialIsPhoto ? 'photo' : 'url');
  const [coverPhoto, setCoverPhoto] = useState<CoverPhoto | null>(null);
  // Photo déjà uploadée lors de la soumission, conservée tant qu'on ne la
  // remplace / retire pas (édition uniquement).
  const [keptPhotoUrl, setKeptPhotoUrl] = useState<string | null>(
    initialIsPhoto ? initialCover : null,
  );
  const [coverUrl, setCoverUrl] = useState(initialIsPhoto ? '' : (initialCover ?? ''));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pagesNum = parseInt(pages.trim(), 10);
  const cleanIsbn = isbn.replace(/[^0-9X]/gi, '').toUpperCase();
  const cleanYear = year.trim();
  const cleanUrl = coverUrl.trim();

  const pagesValid = Number.isFinite(pagesNum) && pagesNum > 0;
  const isbnValid = cleanIsbn.length === 0 || ISBN_RE.test(cleanIsbn);
  const yearValid = cleanYear.length === 0 || YEAR_RE.test(cleanYear);
  const urlValid = cleanUrl.length === 0 || /^https?:\/\/\S+$/i.test(cleanUrl);
  const canSubmit =
    !!session &&
    !submitting &&
    title.trim().length > 0 &&
    pagesValid &&
    isbnValid &&
    yearValid &&
    (coverMode === 'photo' || urlValid);

  const onPickPhoto = async (source: 'camera' | 'library') => {
    try {
      const photo = await pickCoverPhoto(source);
      if (photo) setCoverPhoto(photo);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de récupérer la photo.');
    }
  };

  const onSave = async (submission: MyBookSubmission, userId: string) => {
    const saved = await updateBookSubmission({
      userId,
      id: submission.id,
      title: title.trim(),
      pages: pagesNum,
      authors,
      categories: genres,
      publishedAt: cleanYear || undefined,
      coverUrl: coverMode === 'url' ? cleanUrl || undefined : (keptPhotoUrl ?? undefined),
      coverPhoto: coverMode === 'photo' ? coverPhoto : null,
    });
    updateBookInfo(submission.bookIsbn, {
      title: saved.title,
      authors: saved.authors,
      pages: saved.pages,
      publishedAt: saved.publishedAt ?? undefined,
      coverUrl: saved.coverUrl ?? undefined,
      categories: saved.categories.length > 0 ? saved.categories : undefined,
    });
    void queryClient.invalidateQueries({ queryKey: MY_SUBMISSIONS_QUERY_KEY });
    router.back();
  };

  const onSubmit = async () => {
    if (!canSubmit || !session) return;
    setSubmitting(true);
    setError(null);
    if (editing) {
      try {
        await onSave(editing, session.user.id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Échec de l'enregistrement. Réessaie dans un moment.");
        setSubmitting(false);
      }
      return;
    }
    const bookIsbn = cleanIsbn || `manual-${newId()}`;
    try {
      const { coverUrl: finalCoverUrl } = await submitBookSubmission({
        userId: session.user.id,
        bookIsbn,
        isbn: cleanIsbn || undefined,
        title: title.trim(),
        pages: pagesNum,
        authors,
        categories: genres,
        publishedAt: cleanYear || undefined,
        coverUrl: coverMode === 'url' ? cleanUrl || undefined : undefined,
        coverPhoto: coverMode === 'photo' ? coverPhoto : null,
      });

      const book: Book = {
        isbn: bookIsbn,
        title: title.trim(),
        authors,
        pages: pagesNum,
        publishedAt: cleanYear || undefined,
        coverUrl: finalCoverUrl,
        source: 'manual',
        categories: genres.length > 0 ? genres : undefined,
      };
      const userBook: UserBook = {
        id: newId(),
        userId: session.user.id,
        book,
        status: 'to_read',
        favorite: false,
      };
      addBook(userBook);
      void queryClient.invalidateQueries({ queryKey: MY_SUBMISSIONS_QUERY_KEY });

      Alert.alert(
        'Merci !',
        "Le livre est dans ta bibliothèque. L'équipe va vérifier les infos avant de l'ajouter au catalogue.",
      );
      router.replace(`/book/${bookIsbn}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'envoi. Réessaie dans un moment.");
      setSubmitting(false);
    }
  };

  const previewUri =
    coverMode === 'photo'
      ? (coverPhoto?.uri ?? (keptPhotoUrl ? resolveStorageUrl(keptPhotoUrl) : undefined))
      : urlValid
        ? cleanUrl
        : undefined;

  return (
    <SafeAreaView className={`flex-1 ${paperScreen}`} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}>
        <ScrollView contentContainerClassName="px-6 pt-4 pb-32" keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.duration(400)}>
            <Text className="font-display text-3xl text-ink">
              {editing ? 'Modifier ma soumission' : 'Soumettre un livre'}
            </Text>
            <Text className="mt-1 text-sm text-ink-muted">
              {editing
                ? 'Tu peux corriger les infos tant que l’équipe ne l’a pas encore traitée.'
                : 'Introuvable sur les plateformes ? Renseigne-le, l’équipe l’ajoutera au catalogue.'}
            </Text>
          </Animated.View>

          {!session ? (
            <View className="mt-6 flex-row items-center gap-2 rounded-2xl bg-paper-warm px-4 py-3">
              <MaterialIcons name="lock-outline" size={16} color="#6b6259" />
              <Text className="flex-1 text-sm text-ink-muted">
                Connecte-toi pour soumettre un livre.
              </Text>
            </View>
          ) : null}

          <View className="mt-8 gap-5">
            <Field label="Titre" required value={title} onChangeText={setTitle} placeholder="Le titre du livre" />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field
                  label="Nombre de pages"
                  required
                  value={pages}
                  onChangeText={setPages}
                  placeholder="ex: 250"
                  keyboardType="number-pad"
                  invalid={pages.trim().length > 0 && !pagesValid}
                />
              </View>
              <View className="flex-1">
                <Field
                  label="Année"
                  value={year}
                  onChangeText={setYear}
                  placeholder="ex: 2023"
                  keyboardType="number-pad"
                  invalid={!yearValid}
                />
              </View>
            </View>

            <ChipsAutocompleteInput
              label="Auteur·e·s"
              values={authors}
              onChange={setAuthors}
              fetchSuggestions={searchAuthors}
              queryKey="author-suggestions"
              placeholder="Rechercher ou ajouter un auteur…"
            />
            <ChipsAutocompleteInput
              label="Genres"
              values={genres}
              onChange={setGenres}
              fetchSuggestions={searchGenres}
              queryKey="genre-suggestions"
              placeholder="Rechercher ou ajouter un genre…"
              minChars={0}
            />

            <Field
              label="ISBN"
              value={isbn}
              onChangeText={setIsbn}
              placeholder="978…"
              autoCapitalize="characters"
              invalid={!isbnValid}
              // Figé en édition : la clé biblio (`book_isbn`) en dépend.
              editable={!editing}
            />

            <View>
              <Text className="mb-1 text-xs uppercase tracking-wider text-ink-muted">Couverture</Text>
              <View className="mb-3 flex-row rounded-full bg-paper-warm p-1">
                {(['photo', 'url'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => setCoverMode(m)}
                    className={`flex-1 items-center rounded-full py-2 ${coverMode === m ? 'bg-ink' : ''}`}>
                    <Text className={coverMode === m ? 'font-sans-med text-paper' : 'text-ink-soft'}>
                      {m === 'photo' ? 'Photo' : 'Lien image'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View className="flex-row gap-4">
                <View
                  className="items-center justify-center overflow-hidden rounded-xl bg-paper-warm"
                  style={{ width: 80, height: 120 }}>
                  {previewUri ? (
                    <Image source={{ uri: previewUri }} style={{ width: 80, height: 120 }} resizeMode="cover" />
                  ) : (
                    <MaterialIcons name="image" size={28} color="#6b6259" />
                  )}
                </View>
                <View className="flex-1 justify-center gap-2">
                  {coverMode === 'photo' ? (
                    <>
                      <CoverButton icon="photo-camera" label="Prendre une photo" onPress={() => onPickPhoto('camera')} />
                      <CoverButton icon="photo-library" label="Choisir dans la galerie" onPress={() => onPickPhoto('library')} />
                      {coverPhoto || keptPhotoUrl ? (
                        <Pressable
                          onPress={() => {
                            setCoverPhoto(null);
                            setKeptPhotoUrl(null);
                          }}
                          hitSlop={6}
                          className="active:opacity-70">
                          <Text className="text-sm text-ink-muted">Retirer la photo</Text>
                        </Pressable>
                      ) : null}
                    </>
                  ) : (
                    <Field
                      label="URL"
                      value={coverUrl}
                      onChangeText={setCoverUrl}
                      placeholder="https://…"
                      autoCapitalize="none"
                      keyboardType="url"
                      invalid={!urlValid}
                    />
                  )}
                </View>
              </View>
            </View>
          </View>

          {error ? <Text className="mt-6 text-sm text-red-600">{error}</Text> : null}

          <Pressable
            disabled={!canSubmit}
            onPress={onSubmit}
            className={`mt-10 flex-row items-center justify-center gap-2 rounded-full py-3 ${
              canSubmit ? 'bg-accent active:opacity-80' : 'bg-paper-shade'
            }`}>
            {submitting ? <ActivityIndicator size="small" color="#fbf8f4" /> : null}
            <Text className={`text-center font-sans-med ${canSubmit ? 'text-paper' : 'text-ink-muted'}`}>
              {editing ? 'Enregistrer' : 'Soumettre'}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.back()} disabled={submitting} className="mt-3 py-3 active:opacity-70">
            <Text className="text-center text-sm text-ink-muted">Annuler</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function CoverButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-2 rounded-full bg-paper-warm px-4 py-2.5 active:bg-paper-shade">
      <MaterialIcons name={icon} size={18} color="#6b6259" />
      <Text className="text-sm text-ink">{label}</Text>
    </Pressable>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  invalid?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  editable?: boolean;
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  required,
  invalid,
  keyboardType,
  autoCapitalize,
  editable = true,
}: FieldProps) {
  return (
    <View>
      <Text className="mb-1 text-xs uppercase tracking-wider text-ink-muted">
        {label}
        {required ? ' *' : ''}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6b6259"
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        editable={editable}
        className={`rounded-2xl bg-paper-warm px-4 py-3 text-base ${editable ? 'text-ink' : 'text-ink-muted'} ${
          invalid ? 'border border-red-500/60' : ''
        }`}
      />
    </View>
  );
}
