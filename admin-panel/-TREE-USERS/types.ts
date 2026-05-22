import type { AdminPageKey } from '../src/components/AppShell';

export type AccessStatus = 'active' | 'pending' | 'denied' | 'needs_review' | 'blocked';
export type AdminRole = 'admin' | 'moderator' | 'tester';

export type UserProfile = {
  uid: string;
  phone: string;
  name: string;
  registeredAt: number;
  address: string;
  apartment: string;
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

export type ChainVisualizationNode = {
  uid: string;
  name: string;
  depth: number;
  isLast: boolean;
  isCurrentUser: boolean;
};

export type SearchResultItem = {
  uid: string;
  phone: string;
  name: string;
  matchField: 'phone' | 'uid' | 'name';
};

export type GuarantorTreeState = {
  selectedUser: UserProfile | null;
  chain: TrustChainNode[];
  chainUsers: UserProfile[];
  childrenNodes: TrustChainNode[];
  childrenUsers: UserProfile[];
  userAccess: UserAccessRecord | null;
  inviteRequest: InviteRequestBrief | null;
  loading: boolean;
  error: string;
};

export type GuarantorTreePageProps = {
  user?: import('firebase/auth').User;
  role?: AdminRole;
  onNavigate?: (page: AdminPageKey) => void;
};
