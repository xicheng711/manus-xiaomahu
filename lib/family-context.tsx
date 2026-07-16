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
  getUserProfile,
  getProfile,
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

    // ── Server reconciliation + 头像同步 ───────────────────────────────────────────────────────────────────────────────────────
    // Pull the authoritative room list from the server and remove any local
    // memberships that no longer exist on the server (e.g. family was deleted
    // by the creator while this device was offline).
    // Also sync member avatars from server to ensure https:// URLs are used.
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
        // 同步每个家庭的成员头像（从服务器拉取 https:// URL）
        // 提前读取当前用户的本地头像，用于 fallback
        const [_up, _lp] = await Promise.all([
          getUserProfile().catch(() => null),
          getProfile().catch(() => null),
        ]);
        const localCaregiverPhoto = _up?.caregiverPhotoUri || _lp?.caregiverPhotoUri || null;
        for (const sr of serverRooms) {
          try {
            const roomId = String(sr.roomId);
            let membership = all.find(m => m.familyId === roomId);

            // ── 关键修复：本地 membership 不存在时（如退出登录后），从服务器数据重新建立 ──
            if (!membership) {
              const detail2 = await cloudGetRoomDetail(sr.roomId);
              if (!detail2?.room) continue;
              const myMemberId = sr.myMemberId ? String(sr.myMemberId) : String(sr.roomId);
              const serverMembers2: FamilyMember[] = (detail2.members ?? []).map((m: any) => ({
                id: String(m.id),
                name: m.name,
                role: m.role ?? 'family',
                roleLabel: m.roleLabel ?? m.role ?? '家人',
                emoji: m.emoji ?? '👤',
                color: m.color ?? '#888',
                photoUri: m.photoUri ?? null,
                birthYear: m.birthYear ?? undefined,
                joinedAt: m.joinedAt ?? new Date().toISOString(),
                isCreator: m.isCreator ?? false,
                isCurrentUser: String(m.id) === myMemberId,
                relationship: m.relationship,
              }));
              const newRoom: import('./storage').FamilyRoom = {
                id: roomId,
                roomCode: detail2.room.roomCode ?? sr.roomCode ?? '',
                elderName: detail2.room.elderName ?? sr.elderName ?? '家人',
                elderEmoji: detail2.room.elderEmoji ?? sr.elderEmoji ?? undefined,
                elderPhotoUri: detail2.room.elderPhotoUri ?? sr.elderPhotoUri ?? undefined,
                members: serverMembers2,
                createdAt: detail2.room.createdAt ?? new Date().toISOString(),
              };
              const newMembership: FamilyMembership = {
                familyId: roomId,
                myMemberId,
                role: sr.isCreator ? 'creator' : 'joiner',
                room: newRoom,
                joinedAt: serverMembers2.find(m => m.id === myMemberId)?.joinedAt ?? new Date().toISOString(),
                memberEmoji: sr.memberEmoji ?? undefined,
                memberPhotoUri: sr.memberPhotoUri ?? undefined,
              };
              await saveFamilyRoom(newRoom);
              await addOrUpdateMembership(newMembership);
              // 恢复 elder profile
              if (detail2.elderProfile) {
                const ep = detail2.elderProfile;
                const { saveFamilyProfile } = await import('./storage');
                await saveFamilyProfile({
                  name: ep.name ?? undefined,
                  nickname: ep.nickname ?? undefined,
                  birthDate: ep.birthDate ?? undefined,
                  zodiacEmoji: ep.zodiacEmoji ?? undefined,
                  zodiacName: ep.zodiacName ?? undefined,
                  elderPhotoUri: ep.elderPhotoUri ?? undefined,
                  elderAvatarType: ep.elderAvatarType ?? undefined,
                  city: ep.city ?? undefined,
                  reminderMorning: ep.reminderMorning ?? undefined,
                  reminderEvening: ep.reminderEvening ?? undefined,
                  setupComplete: true,
                  careNeeds: ep.careNeeds ?? undefined,
                }, roomId);
              }
              // 恢复 CURRENT_MEMBER（如果是 active family）
              const myMember2 = serverMembers2.find(m => m.id === myMemberId) ?? serverMembers2[0];
              if (myMember2) {
                await setCurrentMember(myMember2);
              }
              // 恢复 UserProfile（主照顾者名字和头像）
              if (sr.isCreator && myMember2) {
                try {
                  const { saveUserProfile } = await import('./storage');
                  const existingUp = await getUserProfile();
                  const updatedName = myMember2.name || existingUp?.caregiverName;
                  const updatedPhoto = myMember2.photoUri || existingUp?.caregiverPhotoUri;
                  if (updatedName) {
                    await saveUserProfile({
                      ...existingUp,
                      ...(updatedName ? { caregiverName: updatedName } : {}),
                      ...(updatedPhoto ? { caregiverPhotoUri: updatedPhoto, caregiverAvatarType: 'photo' as const } : {}),
                    });
                  }
                } catch {}
              }
              all.unshift(newMembership);
              console.log('[FamilyContext] refresh: restored missing membership for room', roomId, 'role:', newMembership.role);
              continue; // 已经处理完，跳过下面的头像同步
            }

            const detail = await cloudGetRoomDetail(parseInt(roomId));
            if (!detail?.members) continue;
            const serverMembers: import('./storage').FamilyMember[] = detail.members.map((m: any) => {
              const isCurrentUser = String(m.id) === String(membership!.myMemberId);
              const localMemberPhoto = membership!.room.members.find((lm: any) => String(lm.id) === String(m.id))?.photoUri ?? undefined;
              // 优先用服务器 URL，其次用本地已保存的旧 URL
              // 注意：joiner 成员不从本地 caregiverPhotoUri fallback，避免旧照片覆盖自选 emoji
              const isCreatorMember = m.isCreator === true;
              const photoUri = m.photoUri || localMemberPhoto || (isCurrentUser && isCreatorMember ? localCaregiverPhoto ?? undefined : undefined);
              return {
                id: String(m.id),
                name: m.name,
                role: m.role ?? 'family',
                roleLabel: m.roleLabel ?? m.role ?? '家人',
                emoji: m.emoji ?? '👤',
                color: m.color ?? '#888',
                photoUri,
                birthYear: m.birthYear ?? undefined,
                joinedAt: m.joinedAt ?? new Date().toISOString(),
                isCreator: m.isCreator ?? false,
                isCurrentUser,
                relationship: m.relationship,
              };
            });
            const updatedRoom = {
              ...membership.room,
              elderName: detail.room?.elderName || membership.room.elderName,
              elderEmoji: detail.room?.elderEmoji || membership.room.elderEmoji,
              elderPhotoUri: detail.room?.elderPhotoUri || membership.room.elderPhotoUri,
              members: serverMembers.length > 0 ? serverMembers : membership.room.members,
            };
            const updatedMembership = {
              ...membership,
              room: updatedRoom,
              memberPhotoUri: sr.memberPhotoUri || membership.memberPhotoUri,
            };
            await saveFamilyRoom(updatedRoom);
            await addOrUpdateMembership(updatedMembership);
            // 更新 all 中的数据
            const idx = all.findIndex(m => m.familyId === roomId);
            if (idx >= 0) all[idx] = updatedMembership;
          } catch (e) {
            console.warn('[FamilyContext] refresh: failed to sync room detail for', sr.roomId, e);
          }
        }

        // ── 关键修复：确保 creator 家庭排在最前，避免 joiner 家庭被优先激活 ──
        all.sort((a, b) => {
          if (a.role === 'creator' && b.role !== 'creator') return -1;
          if (a.role !== 'creator' && b.role === 'creator') return 1;
          return 0;
        });
        // 重新写入排序后的 memberships
        const { saveMemberships } = await import('./storage');
        await saveMemberships(all);
      }
    } catch (e) {
      // Network unavailable — skip reconciliation, keep local state as-is
      console.warn('[FamilyContext] reconcile: server unavailable, skipping:', e);
    }
    // ───────────────────────────────────────────────────────────────────────────────────────

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

  // 当家庭数据就绪（ready=true）时，确保 push token 已注册到服务器
  // 覆盖 Joiner 登录后 session token 延迟就绪导致 _layout.tsx 注册失败的情况
  useEffect(() => {
    if (ready) {
      setTimeout(() => {
        import('@/lib/notifications').then(({ registerPushToken }) => {
          registerPushToken().catch(() => {});
        });
      }, 1000); // 延迟 1s 确保 tRPC 客户端初始化完成
    }
  }, [ready]);

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
        // 提前读取当前用户的本地头像，用于 fallback
        const [_swUp, _swLp] = await Promise.all([
          getUserProfile().catch(() => null),
          getProfile().catch(() => null),
        ]);
        const swLocalCaregiverPhoto = _swUp?.caregiverPhotoUri || _swLp?.caregiverPhotoUri || null;
        const serverMembers: FamilyMember[] = (detail.members ?? []).map((m: any) => {
          const isCurrentUser = String(m.id) === String(target.myMemberId);
          const localMemberPhoto = target.room.members.find((lm: any) => String(lm.id) === String(m.id))?.photoUri ?? undefined;
          // 两层 fallback：服务器 URL → 本地已保存的旧 URL
          // 注意：joiner 成员不从本地 caregiverPhotoUri fallback，避免旧照片覆盖自选 emoji
          const isCreatorMember = m.isCreator === true;
          const photoUri = m.photoUri || localMemberPhoto || (isCurrentUser && isCreatorMember ? swLocalCaregiverPhoto ?? undefined : undefined);
          return {
            id: String(m.id),
            name: m.name,
            role: m.role ?? 'family',
            roleLabel: m.roleLabel ?? m.role ?? '家人',
            emoji: m.emoji ?? '👤',
            color: m.color ?? '#888',
            photoUri,
            birthYear: m.birthYear ?? undefined,
            joinedAt: m.joinedAt ?? new Date().toISOString(),
            isCreator: m.isCreator ?? false,
            isCurrentUser,
            relationship: m.relationship,
          };
        });
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
