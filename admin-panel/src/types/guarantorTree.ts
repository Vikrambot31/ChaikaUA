import type { User } from 'firebase/auth';
import type { AdminPageKey } from '../components/AppShell';
import type { SecurityRole } from '../services/authService';

export type AccessStatus =
  | 'active'
  | 'approved'
  | 'temporary_access'
  | 'whitelist_access'
  | 'pending'
  | 'pending_sponsor'
  | 'denied'
  | 'needs_review'
  | 'needs_manual_review'
  | 'blocked'
  | 'unknown';

export type UserProfile = {
  uid: string;
  phone: string;
  name: string;
  registeredAt: number;
  address: string;
  apartment: string;
  deleted?: boolean;
  system?: boolean;
};

export type UserAccessRecord = {
  uid: string;
  status: AccessStatus;
  role: string;
  temp_expires_at: number;
  denied_count: number;
  current_request_id: string;
  trusted: boolean;
};

export type TrustChainNode = {
  id: string;
  parentUid: string;
  childUid: string;
  depth: number;
  status: 'active' | 'inactive' | 'blocked';
  approvedAt: number;
  inviteRequestId: string;
};

export type InviteRequestBrief = {
  id: string;
  requesterUid: string;
  status: string;
  createdAt: number;
  moderatedAt: number;
  moderatedBy: string;
  moderationReason: string;
};

export type ChainEntry = {
  uid: string;
  user: UserProfile;
  node: TrustChainNode | null;
  level: number;
  orphaned?: boolean;
};

export type SearchResultItem = UserProfile & {
  matchField: 'phone' | 'uid' | 'name';
};

export type GuarantorTreeState = {
  selectedUser: UserProfile | null;
  chain: ChainEntry[];
  childrenNodes: TrustChainNode[];
  childrenUsers: UserProfile[];
  userAccess: UserAccessRecord | null;
  inviteRequest: InviteRequestBrief | null;
  totalUsers: number;
  loading: boolean;
  error: string;
};

export type ManualRootGrantResult = {
  phone: string;
  uid: string;
  status: 'granted' | 'not_found' | 'error';
  message: string;
};

export type FullTreeNode = {
  uid: string;
  user: UserProfile;
  node: TrustChainNode | null;
  access: UserAccessRecord | null;
  children: FullTreeNode[];
  depth: number;
};

export type FullTreeStats = {
  total: number;
  active: number;
  blocked: number;
  orphaned: number;
  unlinked: number;
  maxDepth: number;
};

export type GuarantorTreePageProps = {
  user?: User;
  role?: SecurityRole;
  onNavigate?: (page: AdminPageKey) => void;
};
