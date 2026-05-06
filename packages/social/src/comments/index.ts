export {
  addComment,
  editComment,
  listReplies,
  listRootComments,
  softDeleteComment,
} from './api';
export type { Comment } from './types';
export {
  useAddComment,
  useDeleteComment,
  useEditComment,
  useReplies,
  useRootComments,
} from './hooks';
