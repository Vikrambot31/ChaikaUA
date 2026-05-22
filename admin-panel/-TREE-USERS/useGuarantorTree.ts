import { useState, useCallback, useRef } from 'react';
import type { UserProfile, UserAccessRecord, TrustChainNode, InviteRequestBrief, GuarantorTreeState } from './types';
import {
  searchUsers as searchUsersService,
  loadUserProfile,
  loadUserAccess,
  loadTrustChain,
  loadChildrenNodes,
  loadInviteRequest,
  loadMultipleUsers,
  logAudit,
} from './guarantorTreeService';

const initialState: GuarantorTreeState = {
  selectedUser: null,
  chain: [],
  chainUsers: [],
  childrenNodes: [],
  childrenUsers: [],
  userAccess: null,
  inviteRequest: null,
  loading: false,
  error: '',
};

export const useGuarantorTree = (adminUid?: string) => {
  const [state, setState] = useState<GuarantorTreeState>(initialState);
  const abortRef = useRef(false);

  const searchUsers = useCallback(async (query: string): Promise<UserProfile[]> => {
    return searchUsersService(query);
  }, []);

  const selectUser = useCallback(async (uid: string) => {
    abortRef.current = false;
    setState((prev) => ({ ...prev, loading: true, error: '' }));

    try {
      const [profile, access, trustNodes, children, inviteReq] = await Promise.all([
        loadUserProfile(uid),
        loadUserAccess(uid),
        loadTrustChain(uid),
        loadChildrenNodes(uid),
        loadInviteRequest(uid),
      ]);

      if (abortRef.current) return;

      const allUids = new Set<string>();
      allUids.add(uid);
      trustNodes.forEach((n) => { allUids.add(n.parentUid); allUids.add(n.childUid); });
      children.forEach((n) => { allUids.add(n.childUid); });

      const userMap = await loadMultipleUsers([...allUids]);
      if (abortRef.current) return;

      const chainUsers: UserProfile[] = [];
      const chainMap = new Map<string, TrustChainNode>();
      let currentUid: string | undefined = uid;

      const depthOrder: TrustChainNode[] = [];
      let maxDepth = 0;
      for (const node of trustNodes) {
        depthOrder.push(node);
        if (node.depth > maxDepth) maxDepth = node.depth;
      }

      for (let d = 0; d <= maxDepth; d++) {
        const node = depthOrder.find((n) => n.depth === d);
        if (!node) continue;
        const u = userMap.get(node.childUid) || userMap.get(node.parentUid);
        if (u && !chainUsers.find((c) => c.uid === u.uid)) {
          chainUsers.push(u);
        }
      }

      const childrenUsers = [...new Map(
        children.map((n) => {
          const u = userMap.get(n.childUid);
          return u ? [u.uid, u] as const : null;
        }).filter((x): x is [string, UserProfile] => x !== null)
      ).values()];

      setState({
        selectedUser: profile,
        chain: depthOrder,
        chainUsers,
        childrenNodes: children,
        childrenUsers,
        userAccess: access,
        inviteRequest: inviteReq,
        loading: false,
        error: '',
      });

      logAudit('user_selected', { adminUid, targetUid: uid });
    } catch (err) {
      if (!abortRef.current) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Неизвестная ошибка',
        }));
      }
    }
  }, [adminUid]);

  const clearSelection = useCallback(() => {
    abortRef.current = true;
    setState(initialState);
  }, []);

  const refresh = useCallback(async () => {
    if (state.selectedUser) {
      await selectUser(state.selectedUser.uid);
    }
  }, [state.selectedUser, selectUser]);

  return {
    ...state,
    searchUsers,
    selectUser,
    clearSelection,
    refresh,
  };
};
