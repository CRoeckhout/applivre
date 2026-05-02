import type { ReadingStatus } from '@/types/book';

export const READING_STATUS_META: Record<
  ReadingStatus,
  { label: string; color: string }
> = {
  wishlist: { label: 'Wishlist', color: '#d4a017' },
  to_read: { label: 'À lire', color: '#4a90c2' },
  reading: { label: 'En cours', color: '#8e5dc8' },
  paused: { label: 'En pause', color: '#d4a017' },
  read: { label: 'Lu', color: '#5fa84d' },
  abandoned: { label: 'Abandonné', color: '#1f1a16' },
};
