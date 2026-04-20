import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  FamilyMembership,
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
  setActiveRoomIdCache,
  addOrUpdateMembership,
} from './storage';
import { setCloudSyncState, cloudGetRoomDetail } from './cloud-sync';

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
    const all = await getAllMemberships();
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
    try {
      if (!isNaN(serverRoomId)) {
        const detail = await cloudGetRoomDetail(serverRoomId);
        if (detail && detail.room) {
          const { FamilyMember } = await import('./storage') as any;
          const serverMembers = (detail.members ?? []).map((m: any) => ({
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
        }
      }
    } catch (e) {
      console.warn('[FamilyContext] switchFamily getRoomDetail failed, using cached room:', e);
    }

    await saveFamilyRoom(updatedRoom);
    const myMember = updatedRoom.members.find(m => m.id === target.myMemberId)
      ?? target.room.members.find(m => m.id === target.myMemberId);
    if (myMember) await setCurrentMember(myMember);

    setActiveMembership({ ...target, room: updatedRoom });
  }, []);

  const leaveFamily = useCallback(async (familyId: string) => {
    // Call server leave API if possible (non-blocking)
    try {
      const { default: trpcClient } = await import('./trpc') as any;
      const serverRoomId = parseInt(familyId);
      if (!isNaN(serverRoomId) && trpcClient) {
        await trpcClient.family.leaveRoom.mutate({ roomId: serverRoomId });
      }
    } catch (e) {
      console.warn('[FamilyContext] leaveFamily server call failed (non-fatal):', e);
    }
    await removeMembership(familyId);
    await refresh();
  }, [refresh]);

  const deleteFamily = useCallback(async (familyId: string) => {
    // Call server delete API if possible (non-blocking)
    try {
      const { default: trpcClient } = await import('./trpc') as any;
      const serverRoomId = parseInt(familyId);
      if (!isNaN(serverRoomId) && trpcClient) {
        await trpcClient.family.deleteRoom.mutate({ roomId: serverRoomId });
      }
    } catch (e) {
      console.warn('[FamilyContext] deleteFamily server call failed (non-fatal):', e);
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
