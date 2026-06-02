import { useCallback, useEffect, useRef, useState } from 'react';
import type { FullTreeNode, FullTreeStats, GuarantorTreeState, ManualRootGrantResult, SearchResultItem } from '../types/guarantorTree';
import {
  attachToParent,
  buildChainEntries,
  deleteNode,
  deleteUserRecord,
  grantRootAccessByPhones,
  loadChildrenNodes,
  loadFullTree,
  loadInviteRequest,
  loadMultipleUsers,
  loadTrustPath,
  loadUserAccess,
  loadUserProfile,
  loadUsersTotal,
  logAudit,
  makeDeletedUser,
  reparentNode,
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

  // Full tree state
  const [fullTree, setFullTree] = useState<FullTreeNode | null>(null);
  const [orphans, setOrphans] = useState<FullTreeNode[]>([]);
  const [unlinked, setUnlinked] = useState<FullTreeNode[]>([]);
  const [treeStats, setTreeStats] = useState<FullTreeStats | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState('');

  // Filters
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError('');
    try {
      const result = await loadFullTree();
      setFullTree(result.root);
      setOrphans(result.orphans);
      setUnlinked(result.unlinked);
      setTreeStats(result.stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить дерево.';
      setTreeError(message);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

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

  // Tree mutation wrappers
  const handleAttachToParent = useCallback(async (childUid: string, parentUid: string) => {
    await attachToParent(childUid, parentUid, adminUid || 'unknown_admin');
    await loadTree();
  }, [adminUid, loadTree]);

  const handleReparent = useCallback(async (childUid: string, newParentUid: string) => {
    await reparentNode(childUid, newParentUid, adminUid || 'unknown_admin');
    await loadTree();
  }, [adminUid, loadTree]);

  const handleDelete = useCallback(async (uid: string, strategy: 'promote' | 'orphan') => {
    await deleteNode(uid, strategy, adminUid || 'unknown_admin');
    await loadTree();
  }, [adminUid, loadTree]);

  const handleDeleteUser = useCallback(async (uid: string) => {
    await deleteUserRecord(uid, adminUid || 'unknown_admin');
    await loadTree();
  }, [adminUid, loadTree]);

  // CSV export
  const exportCsv = useCallback(() => {
    if (!fullTree) return;
    const rows: string[] = ['uid,name,phone,parentUid,depth,status'];
    const walk = (node: FullTreeNode) => {
      const parentUid = node.node?.parentUid || '';
      const status = node.access?.status || 'unknown';
      const name = node.user.name.replace(/,/g, ' ');
      const phone = node.user.phone.replace(/,/g, '');
      rows.push(`${node.uid},${name},${phone},${parentUid},${node.depth},${status}`);
      node.children.forEach(walk);
    };
    walk(fullTree);
    for (const orphan of orphans) {
      const parentUid = orphan.node?.parentUid || '';
      const status = orphan.access?.status || 'unknown';
      const name = orphan.user.name.replace(/,/g, ' ');
      const phone = orphan.user.phone.replace(/,/g, '');
      rows.push(`${orphan.uid},${name},${phone},${parentUid},-1,${status}`);
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trust_tree_export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    logAudit('export_csv', { adminUid, totalRows: rows.length - 1 });
  }, [fullTree, orphans, adminUid]);

  return {
    ...state,
    searchUsers,
    selectUser,
    clearSelection,
    refresh,
    grantRootAccess,
    // Full tree
    fullTree,
    orphans,
    unlinked,
    treeStats,
    treeLoading,
    treeError,
    loadTree,
    // Filters
    filterLevel,
    setFilterLevel,
    filterStatus,
    setFilterStatus,
    searchQuery,
    setSearchQuery,
    // Mutations
    handleAttachToParent,
    handleReparent,
    handleDelete,
    handleDeleteUser,
    // Export
    exportCsv,
  };
};
