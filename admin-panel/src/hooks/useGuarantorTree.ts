import { useCallback, useRef, useState } from 'react';
import type { GuarantorTreeState, ManualRootGrantResult, SearchResultItem } from '../types/guarantorTree';
import {
  buildChainEntries,
  grantRootAccessByPhones,
  loadChildrenNodes,
  loadInviteRequest,
  loadMultipleUsers,
  loadTrustPath,
  loadUserAccess,
  loadUserProfile,
  loadUsersTotal,
  logAudit,
  makeDeletedUser,
  searchUsers as searchUsersService,
} from '../services/guarantorTreeService';

const initialState: GuarantorTreeState = {
  selectedUser: null,
  chain: [],
  childrenNodes: [],
  childrenUsers: [],
  userAccess: null,
  inviteRequest: null,
  totalUsers: 0,
  loading: false,
  error: '',
};

export const useGuarantorTree = (adminUid?: string, canLoadInviteRequests = false) => {
  const [state, setState] = useState<GuarantorTreeState>(initialState);
  const requestIdRef = useRef(0);

  const searchUsers = useCallback(async (query: string): Promise<SearchResultItem[]> => {
    const results = await searchUsersService(query);
    if (query.trim().length >= 2) logAudit('search', { adminUid, queryLength: query.trim().length, results: results.length });
    return results;
  }, [adminUid]);

  const selectUser = useCallback(async (uid: string) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setState((prev) => ({ ...prev, loading: true, error: '' }));

    try {
      const [profile, access, path, inviteRequest, totalUsers] = await Promise.all([
        loadUserProfile(uid),
        loadUserAccess(uid),
        loadTrustPath(uid),
        canLoadInviteRequests ? loadInviteRequest(uid) : Promise.resolve(null),
        loadUsersTotal().catch(() => 0),
      ]);

      const selectedUser = profile ?? makeDeletedUser(uid);
      const allUids = new Set<string>([uid]);
      path.forEach((node) => {
        allUids.add(node.parentUid);
        allUids.add(node.childUid);
      });
      const chainParentUids = path.length ? [path[0].parentUid, ...path.map((node) => node.childUid)].filter(Boolean) : [uid];
      const children = (await Promise.all([...new Set(chainParentUids)].map((chainUid) => loadChildrenNodes(chainUid)))).flat();
      children.forEach((node) => allUids.add(node.childUid));

      const userMap = await loadMultipleUsers([...allUids]);
      userMap.set(uid, selectedUser);
      const chain = buildChainEntries(uid, path, userMap);
      const childrenUsers = children.map((node) => userMap.get(node.childUid) ?? makeDeletedUser(node.childUid));

      if (requestIdRef.current !== requestId) return;
      setState({
        selectedUser,
        chain,
        childrenNodes: children,
        childrenUsers,
        userAccess: access,
        inviteRequest,
        totalUsers,
        loading: false,
        error: '',
      });
      logAudit('user_selected', { adminUid, targetUid: uid });
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      const message = error instanceof Error ? error.message : 'Не удалось загрузить цепочку.';
      const normalized = message.toLowerCase().includes('permission') ? 'Доступ запрещён' : message;
      setState((prev) => ({ ...prev, loading: false, error: normalized }));
    }
  }, [adminUid, canLoadInviteRequests]);

  const clearSelection = useCallback(() => {
    requestIdRef.current += 1;
    setState(initialState);
  }, []);

  const refresh = useCallback(async () => {
    if (state.selectedUser) await selectUser(state.selectedUser.uid);
  }, [selectUser, state.selectedUser]);

  const grantRootAccess = useCallback(async (phones: string[]): Promise<ManualRootGrantResult[]> => {
    const results = await grantRootAccessByPhones(phones, adminUid || 'unknown_admin');
    const granted = results.find((result) => result.status === 'granted');
    if (granted?.uid) await selectUser(granted.uid);
    return results;
  }, [adminUid, selectUser]);

  return { ...state, searchUsers, selectUser, clearSelection, refresh, grantRootAccess };
};
