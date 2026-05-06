import type { SocialProfile } from '../profile';
import type { UserId } from '../types';

export type ThreadState = 'pending' | 'accepted' | 'blocked';

export type Thread = {
  id: string;
  state: ThreadState;
  initiator_id: UserId;
  last_message_at: string | null;
  last_message: {
    id: string;
    body: string;
    sender_id: UserId;
  } | null;
  unread_count: number;
  other: SocialProfile;
};

export type Message = {
  id: string;
  thread_id: string;
  sender_id: UserId;
  body: string;
  read_at: string | null;
  created_at: string;
};
