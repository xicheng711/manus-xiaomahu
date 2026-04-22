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

    await setActiveFamilyId(familyId);
    setActiveRoomIdCache(familyId);

    // Sync cloud activeRoomId
    const serverRoomId = parseInt(familyId);
    if (!isNaN(serverRoomId)) {
      await setCloudSyncState({ activeRoomId: serverRoomId });
    }

    // Try to refresh room detail from server before switching
    let updatedRoom = target.room;
    let roomIsValid = true;
    try {
      if (!isNaN(serverRoomId)) {
        const detail = await cloudGetRoomDetail(serverRoomId);
        if (detail && detail.room) {
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
          updatedRoom = {
            id: String(serverRoomId),
            roomCode: detail.room.roomCode ?? target.room.roomCode,
            elderName: detail.room.elderName ?? target.room.elderName,
            elderEmoji: detail.room.elderEmoji ?? target.room.elderEmoji,
            elderPhotoUri: detail.room.elderPhotoUri ?? target.room.elderPhotoUri,
            members: serverMembers.length > 0 ? serverMembers : target.room.members,
            createdAt: detail.room.createdAt ?? target.room.createdAt,
          };
          // Update cached membership with fresh room data
          const updatedMembership = { ...target, room: updatedRoom };
          await addOrUpdateMembership(updatedMembership);
        } else {
          // Server returned a result but room is null/undefined → room deleted
          roomIsValid = false;
        }
      }
    } catch (e: any) {
      // Distinguish "room gone" errors from transient network errors.
      // tRPC wraps server errors; check for NOT_FOUND / FORBIDDEN / UNAUTHORIZED.
      const code: string = e?.data?.code ?? e?.shape?.data?.code ?? '';
      const isGone = ['NOT_FOUND', 'FORBIDDEN', 'UNAUTHORIZED'].includes(code);
      if (isGone) {
        roomIsValid = false;
        console.warn(`[FamilyContext] switchFamily: room ${familyId} no longer exists on server (${code}), cleaning up`);
      } else {
        // Transient network error — keep cached room, don't remove membership
        console.warn('[FamilyContext] switchFamily getRoomDetail failed (network?), using cached room:', e);
      }
    }

    // ── Room no longer valid on server → clean up and bail out ────────────
    if (!roomIsValid) {
      await clearScopedFamilyData(familyId);
      await removeMembership(familyId);
      // Switch to another family if available, or clear active state
      await refresh();
      return;
    }
    // ──────────────────────────────────────────────────────────────────────

    await saveFamilyRoom(updatedRoom);

    // Find current member — prefer server-refreshed list, fall back to cached
    const myMember =
      updatedRoom.members.find(m => m.id === target.myMemberId) ??
      target.room.members.find(m => m.id === target.myMemberId);

    if (myMember) {
      await setCurrentMember(myMember);
    } else {
      // Member not found in either list — log warning but don't crash
      console.warn(
        `[FamilyContext] switchFamily: myMemberId ${target.myMemberId} not found in room ${familyId}. ` +
        'Member list may be stale; will resolve on next refresh.',
      );
    }

    setActiveMembership({ ...target, room: updatedRoom });
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
