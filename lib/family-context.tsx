import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import {
  FamilyMembership,
  FamilyMember,
  getAllMemberships,
  getActiveFamilyId,
  setActiveFamilyId,
  getFamilyRoom,
  saveFamilyRoom,
  getCurrentMember,
  setCurrentMember,
  migrateToMultiFamily,
  removeMembership,
  deleteFamilyAndData,
  clearScopedFamilyData,
  setActiveRoomIdCache,
  addOrUpdateMembership,
} from './storage';
import {
  setCloudSyncState,
  cloudGetRoomDetail,
  cloudGetMyRooms,
  cloudLeaveRoom,
  cloudDeleteRoom,
} from './cloud-sync';

export interface FamilyContextValue {
  memberships: FamilyMembership[];
  activeMembership: FamilyMembership | null;
  isCreator: boolean;
  hasFamilies: boolean;
  ready: boolean;
  switchFamily: (familyId: string) => Promise<void>;
  leaveFamily: (familyId: string) => Promise<void>;
  deleteFamily: (familyId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const FamilyContext = createContext<FamilyContextValue>({
  memberships: [],
  activeMembership: null,
  isCreator: false,
  hasFamilies: false,
  ready: false,
  switchFamily: async () => {},
  leaveFamily: async () => {},
  deleteFamily: async () => {},
  refresh: async () => {},
});

export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const [memberships, setMemberships] = useState<FamilyMembership[]>([]);
  const [activeMembership, setActiveMembership] = useState<FamilyMembership | null>(null);
  const [ready, setReady] = useState(false);
  const initialized = useRef(false);

  const refresh = useCallback(async () => {
    await migrateToMultiFamily();
    let all = await getAllMemberships();

    // ── Server reconciliation ──────────────────────────────────────────────
    // Pull the authoritative room list from the server and remove any local
    // memberships that no longer exist on the server (e.g. family was deleted
    // by the creator while this device was offline).
    try {
      const serverRooms = await cloudGetMyRooms();
      if (Array.isArray(serverRooms) && serverRooms.length >= 0) {
        const serverIds = new Set(serverRooms.map((r: any) => String(r.roomId)));
        const stale = all.filter(m => !serverIds.has(m.familyId));
        if (stale.length > 0) {
          console.log(
            `[FamilyContext] reconcile: removing ${stale.length} stale membership(s):`,
            stale.map(m => m.familyId),
          );
          const staleNames = stale.map(m => m.room?.elderName || m.familyId);
          for (const m of stale) {
            await clearScopedFamilyData(m.familyId);
            await removeMembership(m.familyId);
          }
          // Re-read after cleanup
          all = await getAllMemberships();
          // Notify user that stale families were removed
          if (staleNames.length > 0) {
            const names = staleNames.join('、');
            Alert.alert(
              '家庭已解散',
              staleNames.length === 1
                ? `「${names}」已被主照顾者解散，已从你的列表中移除。`
                : `以下家庭已被解散，已从你的列表中移除：${names}`,
              [{ text: '知道了' }],
            );
          }
        }
      }
    } catch (e) {
      // Network unavailable — skip reconciliation, keep local state as-is
      console.warn('[FamilyContext] reconcile: server unavailable, skipping:', e);
    }
    // ──────────────────────────────────────────────────────────────────────

    const activeId = await getActiveFamilyId();
    const active = all.find(m => m.familyId === activeId) ?? all[0] ?? null;
    setMemberships(all);
    setActiveMembership(active);
    // Keep room-scoped cache in sync with active family
    if (active) {
      setActiveRoomIdCache(active.familyId);
      const serverRoomId = parseInt(active.familyId);
      if (!isNaN(serverRoomId)) {
        await setCloudSyncState({ activeRoomId: serverRoomId });
      }
    } else {
      setActiveRoomIdCache(null);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      refresh();
    }
  }, [refresh]);

  const switchFamily = useCallback(async (familyId: string) => {
    const all = await getAllMemberships();
    const target = all.find(m => m.familyId === familyId);
    if (!target) return;

    // ── Optimistic switch: 立即切换本地 UI，再后台刷新云端 ─────────────────────
    // Step 1: 立即更新本地持久化状态
    await setActiveFamilyId(familyId);
    setActiveRoomIdCache(familyId);

    // Step 2: 立即切换 UI（用缓存的 room 数据，不等待网络）
    const cachedMember =
      target.room.members.find(m => m.id === target.myMemberId) ?? null;
    if (cachedMember) {
      await setCurrentMember(cachedMember);
    }
    setActiveMembership({ ...target, room: target.room });

    // Step 3: 后台异步刷新云端数据（不阻塞 UI）
    const serverRoomId = parseInt(familyId);
    ;(async () => {
      // 同步 cloud activeRoomId
      if (!isNaN(serverRoomId)) {
        try { await setCloudSyncState({ activeRoomId: serverRoomId }); } catch {}
      }

      // 拉取最新 room detail
      if (isNaN(serverRoomId)) return;
      try {
        const detail = await cloudGetRoomDetail(serverRoomId);
        if (!detail || !detail.room) {
          // 服务端返回空，说明 room 已删除
          await clearScopedFamilyData(familyId);
          await removeMembership(familyId);
          await refresh();
          return;
        }
        const serverMembers: FamilyMember[] = (detail.members ?? []).map((m: any) => ({
          id: String(m.id),
          name: m.name,
          role: m.role ?? 'family',
          roleLabel: m.roleLabel ?? m.role ?? '家人',
          emoji: m.emoji ?? '👤',
          color: m.color ?? '#888',
          photoUri: m.photoUri,
          joinedAt: m.joinedAt ?? new Date().toISOString(),
          isCreator: m.isCreator ?? false,
          isCurrentUser: false,
          relationship: m.relationship,
        }));
        const updatedRoom = {
          id: String(serverRoomId),
          roomCode: detail.room.roomCode ?? target.room.roomCode,
          elderName: detail.room.elderName ?? target.room.elderName,
          elderEmoji: detail.room.elderEmoji ?? target.room.elderEmoji,
          elderPhotoUri: detail.room.elderPhotoUri ?? target.room.elderPhotoUri,
          members: serverMembers.length > 0 ? serverMembers : target.room.members,
          createdAt: detail.room.createdAt ?? target.room.createdAt,
        };
        await saveFamilyRoom(updatedRoom);
        const updatedMembership = { ...target, room: updatedRoom };
        await addOrUpdateMembership(updatedMembership);
        // 更新 currentMember（用服务端最新数据）
        const freshMember =
          updatedRoom.members.find(m => m.id === target.myMemberId) ??
          target.room.members.find(m => m.id === target.myMemberId);
        if (freshMember) await setCurrentMember(freshMember);
        // 静默更新 activeMembership（UI 已经切过去了，这里只是补充最新数据）
        setActiveMembership(updatedMembership);
        setMemberships(prev => prev.map(m => m.familyId === familyId ? updatedMembership : m));
      } catch (e: any) {
        const code: string = e?.data?.code ?? e?.shape?.data?.code ?? '';
        const isGone = ['NOT_FOUND', 'FORBIDDEN', 'UNAUTHORIZED'].includes(code);
        if (isGone) {
          console.warn(`[FamilyContext] switchFamily bg-refresh: room ${familyId} gone (${code}), cleaning up`);
          await clearScopedFamilyData(familyId);
          await removeMembership(familyId);
          await refresh();
        } else {
          // 网络暂时不可用，保持缓存数据，不影响 UI
          console.warn('[FamilyContext] switchFamily bg-refresh failed (network?), using cached room:', e);
        }
      }
    })();
    // ──────────────────────────────────────────────────────────────────────────
  }, [refresh]);

  const leaveFamily = useCallback(async (familyId: string) => {
    // Server call MUST succeed before local cleanup.
    // If it fails, throw so the caller can show an error to the user.
    const serverRoomId = parseInt(familyId);
    if (!isNaN(serverRoomId)) {
      await cloudLeaveRoom(serverRoomId); // throws on failure
    }
    await removeMembership(familyId);
    await refresh();
  }, [refresh]);

  const deleteFamily = useCallback(async (familyId: string) => {
    // Server call MUST succeed before local cleanup.
    // If it fails, throw so the caller can show an error to the user.
    const serverRoomId = parseInt(familyId);
    if (!isNaN(serverRoomId)) {
      await cloudDeleteRoom(serverRoomId); // throws on failure
    }
    await deleteFamilyAndData(familyId);
    await refresh();
  }, [refresh]);

  const isCreator = activeMembership?.role === 'creator';
  const hasFamilies = memberships.length > 0;

  return (
    <FamilyContext.Provider value={{ memberships, activeMembership, isCreator, hasFamilies, ready, switchFamily, leaveFamily, deleteFamily, refresh }}>
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamilyContext() {
  return useContext(FamilyContext);
}
