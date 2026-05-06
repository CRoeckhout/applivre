import {
  ActiveTimerPanel,
  StartReadingButton,
} from '@/components/reading-timer';
import { useBookshelf } from '@/store/bookshelf';
import { useTimer } from '@/store/timer';
import type { UserBook } from '@/types/book';
import { useRouter } from 'expo-router';

type Props = {
  readingBooks: UserBook[];
  onStartPress: () => void;
  onLongPress?: () => void;
};

export function CurrentReadingCard({
  readingBooks,
  onStartPress,
  onLongPress,
}: Props) {
  const router = useRouter();
  const activeSession = useTimer((s) => s.active);
  const updateStatus = useBookshelf((s) => s.updateStatus);
  const activeBook = useBookshelf((s) =>
    activeSession ? s.books.find((b) => b.id === activeSession.userBookId) : undefined,
  );

  if (activeSession) {
    return (
      <ActiveTimerPanel
        showBook
        onPressBook={
          activeBook
            ? () => router.push(`/book/${activeBook.book.isbn}`)
            : undefined
        }
        onLongPress={onLongPress}
        onBookFinished={(finalPage) => {
          if (!activeBook) return;
          if (activeBook.status !== 'read') {
            updateStatus(activeBook.id, 'read');
          }
          const total =
            activeBook.book.pages && activeBook.book.pages > 0
              ? activeBook.book.pages
              : undefined;
          useTimer
            .getState()
            .finishCycle(activeBook.id, 'read', total ?? finalPage);
        }}
      />
    );
  }

  const featured = readingBooks.length === 1 ? readingBooks[0] : undefined;
  const subtitle =
    readingBooks.length > 1
      ? `${readingBooks.length} livres en cours`
      : undefined;

  return (
    <StartReadingButton
      label="Commencer à lire"
      icon="▶"
      onPress={onStartPress}
      onLongPress={onLongPress}
      book={
        featured
          ? {
              isbn: featured.book.isbn,
              coverUrl: featured.book.coverUrl,
              title: featured.book.title,
              authors: featured.book.authors,
            }
          : undefined
      }
      subtitle={subtitle}
    />
  );
}
