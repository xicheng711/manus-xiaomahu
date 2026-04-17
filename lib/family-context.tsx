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
} from './storage';
import { setCloudSyncState } from './cloud-sync';

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
    await saveFamilyRoom(target.room);
    const myMember = target.room.members.find(m => m.id === target.myMemberId);
    if (myMember) await setCurrentMember(myMember);
    // 同步更新云端 activeRoomId，确保云端同步指向正确的家庭
    const serverRoomId = parseInt(target.room.id);
    if (!isNaN(serverRoomId)) {
      await setCloudSyncState({ activeRoomId: serverRoomId });
    }
    setActiveMembership(target);
  }, []);

  const leaveFamily = useCallback(async (familyId: string) => {
    await removeMembership(familyId);
    await refresh();
  }, [refresh]);

  const deleteFamily = useCallback(async (familyId: string) => {
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
