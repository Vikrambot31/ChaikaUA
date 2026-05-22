import type { User } from 'firebase/auth';
import { ModerationPage } from './ModerationPage';

type ArchivePageProps = {
  user: User;
};

export const ArchivePage = ({ user }: ArchivePageProps) => (
  <ModerationPage user={user} initialStatusFilter="expired" archiveMode />
);
