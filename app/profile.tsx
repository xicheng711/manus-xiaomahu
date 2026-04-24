import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet,
  Platform, TextInput, Image, Modal, Alert, ActivityIndicator,
  Keyboard, KeyboardAvoidingView, TouchableWithoutFeedback, Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { ScreenContainer } from '@/components/screen-container';
import { AppColors, Gradients } from '@/lib/design-tokens';
import {
  getProfile, saveProfile, ElderProfile,
  getFamilyProfile, saveFamilyProfile, FamilyProfile,
  getUserProfile, saveUserProfile,
  generateId, generateRoomCode, createFamilyRoom, joinFamilyRoom, lookupFamilyByCode,
} from '@/lib/storage';
import { getZodiac } from '@/lib/zodiac';
import {
  areRemindersScheduled,
  scheduleAllReminders,
  cancelAllReminders,
  requestNotificationPermissions,
} from '@/lib/notifications';
import { useFamilyContext } from '@/lib/family-context';
import { trpc } from '@/lib/trpc';
import { clearAllLocalData } from '@/lib/storage';

export default function ProfileScreen() {
  // Split into two independent states — caregiver data vs elder/family data
  const [userProfile, setUserProfile] = useState<import('@/lib/storage').UserProfile | null>(null);
  const [familyProfile, setFamilyProfile] = useState<FamilyProfile | null>(null);
  // Keep legacy profile as a thin compatibility shim for handlers that still need it
  const [profile, setProfile] = useState<ElderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [permDenied, setPermDenied] = useState(false);

  // Inline edit state
  const [editingCaregiverName, setEditingCaregiverName] = useState(false);
  const [caregiverNameDraft, setCaregiverNameDraft] = useState('');
  const [editingElderNickname, setEditingElderNickname] = useState(false);
  const [elderNicknameDraft, setElderNicknameDraft] = useState('');

  // 详情编辑 Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState<'caregiver' | 'elder'>('caregiver');
  const [draftCaregiverName, setDraftCaregiverName] = useState('');
  const [draftCaregiverBirthYear, setDraftCaregiverBirthYear] = useState('');
  const [draftCity, setDraftCity] = useState('');
  const [draftElderNickname, setDraftElderNickname] = useState('');
  const [draftElderName, setDraftElderName] = useState('');
  const [draftElderBirthDate, setDraftElderBirthDate] = useState('');
  const [draftElderCity, setDraftElderCity] = useState('');

  // Family management modal state
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [familyModalTab, setFamilyModalTab] = useState<'list' | 'join' | 'create'>('list');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  // New-family creation draft (independent from current active family)
  const [newElderName, setNewElderName] = useState('');
  const [newElderCity, setNewElderCity] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmType, setDeleteConfirmType] = useState<'leave' | 'delete'>('leave');

  // Account deletion state
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const deleteAccountMutation = trpc.auth.deleteAccount.useMutation();

  const { memberships, activeMembership, switchFamily, leaveFamily, deleteFamily, refresh } = useFamilyContext();

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    try {
      // Server-first: attempt to delete account on server
      await deleteAccountMutation.mutateAsync();
      
      // Only clear local data if server deletion succeeded
      await clearAllLocalData();
      
      setDeletingAccount(false);
      setShowDeleteAccountModal(false);
      // Navigate to onboarding / welcome screen
      router.replace('/onboarding' as any);
    } catch (e: any) {
      setDeletingAccount(false);
      // If server fails, show error and do NOT clear local data
      Alert.alert(
        '注销失败',
        e?.message || '服务器连接失败，请稍后再试。如果持续失败，请联系客服。',
        [{ text: '确定' }]
      );
    }
  };

  const pickPhoto = useCallback(async (target: 'caregiver' | 'elder') => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setPermDenied(true);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const uri = result.assets[0].uri;

    if (target === 'caregiver') {
      // Write to authoritative UserProfile first
      const updatedUp = await saveUserProfile({
        ...(userProfile ?? {}),
        caregiverPhotoUri: uri,
        caregiverAvatarType: 'photo',
      });
      setUserProfile(updatedUp);
      // Also sync to legacy profile for backward compat
      setProfile(prev => {
        if (!prev) return prev;
        const updated = { ...prev, caregiverPhotoUri: uri, caregiverAvatarType: 'photo' as const };
        saveProfile(updated);
        return updated;
      });
    } else {
      // Write to authoritative FamilyProfile first (family-scoped)
      if (activeMembership?.familyId) {
        const updatedFp = await saveFamilyProfile({
          ...(familyProfile ?? {}),
          elderPhotoUri: uri,
          elderAvatarType: 'photo',
        }, activeMembership.familyId);
        setFamilyProfile(updatedFp);
      }
      // Also sync to legacy profile for backward compat
      setProfile(prev => {
        if (!prev) return prev;
        const updated = { ...prev, photoUri: uri, elderAvatarType: 'photo' as const };
        saveProfile(updated);
        return updated;
      });
    }
  }, [userProfile, familyProfile, activeMembership]);

  useFocusEffect(useCallback(() => {
    const loadProfiles = async () => {
      setLoading(true);
      try {
        // Load all three in parallel: legacy (compat shim), user-scoped, family-scoped
        const [legacyP, up, fp] = await Promise.all([
          getProfile(),
          getUserProfile(),
          activeMembership?.familyId ? getFamilyProfile(activeMembership.familyId) : Promise.resolve(null),
        ]);
        setProfile(legacyP);
        setUserProfile(up);
        setFamilyProfile(fp);
        // Seed draft fields from authoritative scoped sources
        setCaregiverNameDraft(up?.caregiverName || legacyP?.caregiverName || '');
        setElderNicknameDraft(fp?.nickname || legacyP?.nickname || legacyP?.name || '');
      } finally {
        setLoading(false);
      }
    };
    loadProfiles();
    if (Platform.OS !== 'web') {
      areRemindersScheduled().then(setNotifEnabled);
    }
  }, [activeMembership?.familyId]));

  const saveCaregiverName = async () => {
    if (!caregiverNameDraft.trim()) return;
    // Write to UserProfile (authoritative) + legacy shim
    const updatedUp = await saveUserProfile({ ...(userProfile ?? {}), caregiverName: caregiverNameDraft.trim() });
    setUserProfile(updatedUp);
    if (profile) {
      const updated = await saveProfile({ ...profile, caregiverName: caregiverNameDraft.trim() });
      setProfile(updated);
    }
    setEditingCaregiverName(false);
  };

  const saveElderNickname = async () => {
    if (!elderNicknameDraft.trim()) return;
    // Write to FamilyProfile (authoritative) + legacy shim
    if (activeMembership?.familyId) {
      const updatedFp = await saveFamilyProfile({ ...(familyProfile ?? {}), nickname: elderNicknameDraft.trim() }, activeMembership.familyId);
      setFamilyProfile(updatedFp);
    }
    if (profile) {
      const updated = await saveProfile({ ...profile, nickname: elderNicknameDraft.trim() });
      setProfile(updated);
    }
    setEditingElderNickname(false);
  };

  const openEditModal = (target: 'caregiver' | 'elder') => {
    setEditTarget(target);
    if (target === 'caregiver') {
      // Source from UserProfile (authoritative), fallback to legacy
      // Note: city is family-scoped and belongs to the elder/family edit modal, not here.
      setDraftCaregiverName(userProfile?.caregiverName || profile?.caregiverName || '');
      setDraftCaregiverBirthYear(userProfile?.caregiverBirthYear || profile?.caregiverBirthYear || '');
    } else {
      // Source from FamilyProfile (authoritative), fallback to legacy
      setDraftElderNickname(familyProfile?.nickname || profile?.nickname || profile?.name || '');
      setDraftElderName(familyProfile?.name || profile?.name || '');
      setDraftElderBirthDate(familyProfile?.birthDate || profile?.birthDate || '');
      setDraftElderCity(familyProfile?.city || profile?.city || '');
    }
    setShowEditModal(true);
  };

  const saveEditModal = async () => {
    if (editTarget === 'caregiver') {
      const year = parseInt(draftCaregiverBirthYear);
      const zodiac = !isNaN(year) ? getZodiac(year) : null;
      // UserProfile is the authoritative source for caregiver data
      const updatedUp = await saveUserProfile({
        ...(userProfile ?? {}),
        caregiverName: draftCaregiverName.trim() || userProfile?.caregiverName || '',
        caregiverBirthYear: draftCaregiverBirthYear.trim() || userProfile?.caregiverBirthYear,
        caregiverZodiacEmoji: zodiac?.emoji || userProfile?.caregiverZodiacEmoji,
        caregiverZodiacName: zodiac?.name || userProfile?.caregiverZodiacName,
      });
      setUserProfile(updatedUp);
      // Also sync to legacy profile for compat (city is NOT written here — it is family-scoped)
      if (profile) {
        const updated = await saveProfile({
          ...profile,
          caregiverName: updatedUp.caregiverName ?? profile.caregiverName,
          caregiverBirthYear: updatedUp.caregiverBirthYear ?? profile.caregiverBirthYear,
          caregiverZodiacEmoji: updatedUp.caregiverZodiacEmoji ?? profile.caregiverZodiacEmoji,
          caregiverZodiacName: updatedUp.caregiverZodiacName ?? profile.caregiverZodiacName,
        });
        setProfile(updated);
      }
    } else {
      const rawDate = draftElderBirthDate.trim() || familyProfile?.birthDate || profile?.birthDate || '';
      const birthYear = rawDate ? new Date(rawDate + 'T00:00:00').getFullYear() : new Date().getFullYear();
      const zodiac = getZodiac(birthYear);
      // FamilyProfile is the authoritative source for elder/family data
      if (activeMembership?.familyId) {
        const updatedFp = await saveFamilyProfile({
          ...(familyProfile ?? {}),
          name: draftElderName.trim() || familyProfile?.name || '',
          nickname: draftElderNickname.trim() || familyProfile?.nickname || '',
          birthDate: rawDate,
          zodiacEmoji: zodiac.emoji,
          zodiacName: zodiac.name,
          city: draftElderCity.trim() || familyProfile?.city,
        }, activeMembership.familyId);
        setFamilyProfile(updatedFp);
      }
      // Also sync to legacy profile for compat
      if (profile) {
        const updated = await saveProfile({
          ...profile,
          nickname: draftElderNickname.trim() || profile.nickname,
          name: draftElderName.trim() || profile.name,
          birthDate: rawDate,
          zodiacEmoji: zodiac.emoji,
          zodiacName: zodiac.name,
          city: draftElderCity.trim() || profile.city,
        });
        setProfile(updated);
      }
    }
    setShowEditModal(false);
  };

  const toggleNotifications = async (value: boolean) => {
    setNotifLoading(true);
    try {
      if (value) {
        const granted = await requestNotificationPermissions();
        if (granted) {
          await scheduleAllReminders(familyProfile?.nickname || familyProfile?.name || profile?.nickname || profile?.name || undefined, activeMembership?.familyId);
          setNotifEnabled(true);
        } else {
          setNotifEnabled(false);
          // 明确提示用户权限被拒绝，引导去系统设置
          Alert.alert(
            '需要通知权限',
            '请在系统设置中允许小马虎发送通知，才能开启每日打卡提醒。',
            [
              { text: '取消', style: 'cancel' },
              {
                text: '去设置',
                onPress: () => {
                  if (Platform.OS === 'ios') {
                    Linking.openURL('app-settings:');
                  } else {
                    Linking.openSettings();
                  }
                },
              },
            ]
          );
        }
      } else {
        await cancelAllReminders();
        setNotifEnabled(false);
      }
    } catch {
      // silently fail
    }
    setNotifLoading(false);
  };

  // 加入家庭
  const handleJoinFamily = async () => {
    if (!joinCode.trim() || !joinName.trim()) {
      setJoinError('请填写邀请码和您的名字');
      return;
    }
    setJoinLoading(true);
    setJoinError('');
    try {
      const room = await lookupFamilyByCode(joinCode.trim().toUpperCase());
      if (!room) {
        setJoinError('邀请码不存在，请确认后重试');
        setJoinLoading(false);
        return;
      }
      // 拦截：不能加入自己已是主照顾者的家庭
      const upperCode = joinCode.trim().toUpperCase();
      const isAlreadyCreator = memberships.some(
        m => m.role === 'creator' && m.room.roomCode === upperCode
      );
      if (isAlreadyCreator) {
        setJoinError('您是这个家庭的主照顾者，无法以家庭成员身份加入');
        setJoinLoading(false);
        return;
      }
      await joinFamilyRoom(joinCode.trim().toUpperCase(), {
        name: joinName.trim(),
        role: 'family',
        roleLabel: '家庭成员',
        emoji: '👨',
        color: '#A855F7',
      });
      await refresh();
      setJoinCode('');
      setJoinName('');
      setFamilyModalTab('list');
      setShowFamilyModal(false);
    } catch (e: any) {
      setJoinError(e?.message || '加入失败，请稍后重试');
    }
    setJoinLoading(false);
  };

  // 创建新家庭
  const handleCreateFamily = async () => {
    const trimmedName = newElderName.trim();
    if (!trimmedName) {
      setJoinError('请输入被照顾者的名字');
      return;
    }
    setJoinLoading(true);
    setJoinError('');
    try {
      const caregiverName = userProfile?.caregiverName || profile?.caregiverName || '照顾者';
      // Pass new-family draft as familyProfileDraft so cloud gets complete elder info from the start
      await createFamilyRoom(
        trimmedName,
        {
          name: caregiverName,
          role: 'caregiver',
          roleLabel: '主照顾者',
          emoji: '🧑',
          color: '#FF6B6B',
        },
        undefined,
        { emoji: undefined, photoUri: undefined },
        {
          name: trimmedName,
          nickname: trimmedName,
          city: newElderCity.trim() || undefined,
        },
      );
      // Clear draft and return to list
      setNewElderName('');
      setNewElderCity('');
      await refresh();
      setFamilyModalTab('list');
      setShowFamilyModal(false);
    } catch (e: any) {
      setJoinError(e?.message || '创建失败，请稍后重试');
    }
    setJoinLoading(false);
  };

  // 确认删除/离开
  const confirmDeleteOrLeave = (familyId: string, type: 'leave' | 'delete') => {
    setDeleteConfirmId(familyId);
    setDeleteConfirmType(type);
  };

  const executeDeleteOrLeave = async () => {
    if (!deleteConfirmId) return;
    try {
      if (deleteConfirmType === 'delete') {
        await deleteFamily(deleteConfirmId);
      } else {
        await leaveFamily(deleteConfirmId);
      }
      setDeleteConfirmId(null);
    } catch (e: any) {
      const msg = e?.message || '请检查网络后重试';
      const title = deleteConfirmType === 'delete' ? '解散失败' : '退出失败';
      Alert.alert(title, msg, [{ text: '知道了' }]);
    }
  };

  const ROLE_LABELS: Record<string, string> = {
    creator: '主照顾者',
    joiner: '家庭成员',
    caregiver: '照顾者',
    family: '家庭成员',
    nurse: '护理人员',
  };

  if (loading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={styles.loading}>加载中...</Text>
      </ScreenContainer>
    );
  }

  // Show setup prompt only if both scoped profiles are empty AND legacy profile is also empty
  if (!profile && !userProfile && !familyProfile) {
    return (
      <ScreenContainer className="items-center justify-center p-6">
        <Text style={styles.noProfile}>还没有设置个人信息</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/onboarding' as any)}>
          <Text style={styles.btnText}>去设置</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  const currentMorning = familyProfile?.reminderMorning || profile?.reminderMorning || '08:00';
  const currentEvening = familyProfile?.reminderEvening || profile?.reminderEvening || '21:00';

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>‹ 返回</Text>
          </TouchableOpacity>
          <Text style={styles.title}>个人信息</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Caregiver Card — sourced from UserProfile (authoritative) */}
        <Text style={styles.sectionLabel}>👤 照顾者</Text>
        <View style={[styles.card, { backgroundColor: AppColors.bg.secondary }]}>
          <View style={styles.avatarWrap}>
            {(userProfile?.caregiverPhotoUri || profile?.caregiverPhotoUri) ? (
              <Image source={{ uri: userProfile?.caregiverPhotoUri || profile?.caregiverPhotoUri }} style={styles.avatarPhoto} />
            ) : (
              <Text style={styles.cardEmoji}>🧑</Text>
            )}
            <TouchableOpacity style={styles.cameraChip} onPress={() => pickPhoto('caregiver')}>
              <Text style={styles.cameraChipText}>📷</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cardInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.cardName}>{userProfile?.caregiverName || profile?.caregiverName || '照顾者'}</Text>
              <TouchableOpacity style={styles.editIconBtn} onPress={() => openEditModal('caregiver')}>
                <Text style={{ fontSize: 14 }}>✏️</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.cardSub}>
              {(userProfile?.caregiverZodiacName || profile?.caregiverZodiacName) ? `属${userProfile?.caregiverZodiacName || profile?.caregiverZodiacName} · ` : ''}
              {(userProfile?.caregiverBirthYear || profile?.caregiverBirthYear) ? `${userProfile?.caregiverBirthYear || profile?.caregiverBirthYear}年` : '未设置年份'}
            </Text>
            <Text style={styles.cardSub2}>照顾者</Text>
            <TouchableOpacity style={styles.editDetailBtn} onPress={() => openEditModal('caregiver')}>
              <Text style={styles.editDetailBtnText}>编辑详情</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Elder Card — sourced from FamilyProfile (authoritative, family-scoped) */}
        <Text style={styles.sectionLabel}>🧡 被照顾者</Text>
        <View style={[styles.card, { backgroundColor: AppColors.bg.secondary }]}>
          <View style={styles.avatarWrap}>
            {(familyProfile?.elderPhotoUri || profile?.photoUri) ? (
              <Image source={{ uri: familyProfile?.elderPhotoUri || profile?.photoUri }} style={styles.avatarPhoto} />
            ) : (
              <Text style={styles.cardEmoji}>👵</Text>
            )}
            <TouchableOpacity style={styles.cameraChip} onPress={() => pickPhoto('elder')}>
              <Text style={styles.cameraChipText}>📷</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.cardInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.cardName}>{familyProfile?.nickname || familyProfile?.name || profile?.nickname || profile?.name || '家人'}</Text>
              <TouchableOpacity style={styles.editIconBtn} onPress={() => openEditModal('elder')}>
                <Text style={{ fontSize: 14 }}>✏️</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.cardSub}>
              {(familyProfile?.zodiacName || profile?.zodiacName) ? `属${familyProfile?.zodiacName || profile?.zodiacName} · ` : ''}
              {(familyProfile?.birthDate || profile?.birthDate) ? `${new Date((familyProfile?.birthDate || profile?.birthDate) + 'T00:00:00').getFullYear()}年` : '未设置年份'}
            </Text>
            <Text style={styles.cardSub2}>{familyProfile?.name || profile?.name || '家人'}</Text>
            <TouchableOpacity style={styles.editDetailBtn} onPress={() => openEditModal('elder')}>
              <Text style={styles.editDetailBtnText}>编辑详情</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Family Management Section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>👨‍👩‍👧‍👦 家庭管理</Text>
        </View>

        {memberships.length === 0 ? (
          <View style={styles.emptyFamilyCard}>
            <Text style={styles.emptyFamilyEmoji}>🏠</Text>
            <Text style={styles.emptyFamilyText}>尚未加入任何家庭</Text>
            <Text style={styles.emptyFamilySub}>您可以创建新家庭或通过邀请码加入</Text>
          </View>
        ) : (
          memberships.map(m => {
            const isActive = activeMembership?.familyId === m.familyId;
            return (
              <View key={m.familyId} style={[styles.familyCard, isActive && styles.familyCardActive]}>
                <View style={styles.familyCardHeader}>
                  <View style={styles.familyCardTitleRow}>
                    <Text style={styles.familyCardName}>{m.room?.elderName ?? '家庭'}</Text>
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{ROLE_LABELS[m.role] || m.role}</Text>
                    </View>
                  </View>
                  <Text style={styles.roomCode}>邀请码: {m.room?.roomCode ?? '-'}</Text>
                </View>
                {isActive && (
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>✅ 当前家庭</Text>
                  </View>
                )}
                {!isActive && (
                  <TouchableOpacity
                    style={styles.familyCardAction}
                    onPress={() => switchFamily(m.familyId)}
                  >
                    <Text style={styles.familyCardActionText}>🔄 切换到此家庭</Text>
                  </TouchableOpacity>
                )}
                {m.role !== 'creator' && (
                  <TouchableOpacity
                    style={[styles.familyCardAction, { marginTop: 4 }]}
                    onPress={() => confirmDeleteOrLeave(m.familyId, 'leave')}
                  >
                    <Text style={styles.familyCardActionText}>🚪 退出家庭</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        {/* 加入/创建家庭按钮 */}
        <View style={styles.familyActionRow}>
          <TouchableOpacity
            style={styles.familyActionBtn}
            onPress={() => { setFamilyModalTab('join'); setShowFamilyModal(true); setJoinError(''); }}
          >
            <Text style={styles.familyActionIcon}>🔗</Text>
            <Text style={styles.familyActionText}>加入家庭</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.familyActionBtn, styles.familyActionBtnPrimary]}
            onPress={() => { setFamilyModalTab('create'); setShowFamilyModal(true); setJoinError(''); }}
          >
            <Text style={styles.familyActionIcon}>🏠</Text>
            <Text style={[styles.familyActionText, { color: AppColors.surface.whiteStrong }]}>创建家庭</Text>
          </TouchableOpacity>
        </View>

        {/* Notification settings section — only shown for creator role */}
        {activeMembership?.role === 'creator' && (<>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🔔 提醒设置</Text>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>每日打卡提醒</Text>
            <Text style={styles.settingDesc}>
              {Platform.OS === 'web'
                ? '仅在手机端可用'
                : notifEnabled
                  ? `早上 ${currentMorning === 'off' ? '不提醒' : currentMorning} · 晚上 ${currentEvening === 'off' ? '不提醒' : currentEvening}`
                  : '关闭后将不发送每日打卡提醒'}
            </Text>
          </View>
          <Switch
            value={notifEnabled}
            onValueChange={toggleNotifications}
            disabled={notifLoading || Platform.OS === 'web'}
            trackColor={{ false: AppColors.border.soft, true: AppColors.coral.primary }}
            thumbColor={notifEnabled ? AppColors.surface.whiteStrong : '#f4f3f4'}
          />
        </View>

        {notifEnabled && Platform.OS !== 'web' && (
          <View style={styles.notifInfo}>
            <Text style={styles.notifInfoText}>☀️ 早上 {currentMorning === 'off' ? '不提醒' : currentMorning} — 记录昨晚睡眠情况</Text>
            <Text style={styles.notifInfoText}>🌙 晚上 {currentEvening === 'off' ? '不提醒' : currentEvening} — 记录今日饮食和心情</Text>
          </View>
        )}

        {/* Reminder time customization — only shown when notifications are enabled */}
        {notifEnabled && Platform.OS !== 'web' && (
          <View style={styles.reminderEditCard}>
            <Text style={styles.reminderEditTitle}>⏰ 自定义提醒时间</Text>
            <View style={styles.reminderEditRow}>
              <Text style={styles.reminderEditLabel}>🌅 早上打卡</Text>
              <View style={styles.timeChipRow}>
                {['off', '06:00', '07:00', '08:00', '09:00', '10:00'].map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.timeChipSmall, currentMorning === t && styles.timeChipSmallActive]}
                    disabled={notifLoading}
                    onPress={async () => {
                      if (activeMembership?.familyId) {
                        const updatedFp = await saveFamilyProfile({ ...(familyProfile ?? {}), reminderMorning: t }, activeMembership.familyId);
                        setFamilyProfile(updatedFp);
                      }
                      if (profile) {
                        const updated = await saveProfile({ ...profile, reminderMorning: t });
                        setProfile(updated);
                      }
                      if (notifEnabled) {
                        await scheduleAllReminders(familyProfile?.nickname || familyProfile?.name || profile?.nickname || profile?.name || undefined, activeMembership?.familyId);
                      }
                    }}
                  >
                    <Text style={[styles.timeChipSmallText, currentMorning === t && styles.timeChipSmallTextActive]}>{t === 'off' ? '不提醒' : t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={[styles.reminderEditRow, { marginTop: 12 }]}>
              <Text style={styles.reminderEditLabel}>🌙 晚上打卡</Text>
              <View style={styles.timeChipRow}>
                {['off', '19:00', '20:00', '21:00', '22:00', '23:00'].map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.timeChipSmall, currentEvening === t && styles.timeChipSmallActive]}
                    disabled={notifLoading}
                    onPress={async () => {
                      if (activeMembership?.familyId) {
                        const updatedFp = await saveFamilyProfile({ ...(familyProfile ?? {}), reminderEvening: t }, activeMembership.familyId);
                        setFamilyProfile(updatedFp);
                      }
                      if (profile) {
                        const updated = await saveProfile({ ...profile, reminderEvening: t });
                        setProfile(updated);
                      }
                      if (notifEnabled) {
                        await scheduleAllReminders(familyProfile?.nickname || familyProfile?.name || profile?.nickname || profile?.name || undefined, activeMembership?.familyId);
                      }
                    }}
                  >
                    <Text style={[styles.timeChipSmallText, currentEvening === t && styles.timeChipSmallTextActive]}>{t === 'off' ? '不提醒' : t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        </>)}

        {/* Edit button */}
        <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/onboarding' as any)}>
          <Text style={styles.editBtnText}>✏️ 重新设置所有信息</Text>
        </TouchableOpacity>

        {/* Delete Account button */}
        <TouchableOpacity
          style={styles.deleteAccountBtn}
          onPress={() => setShowDeleteAccountModal(true)}
        >
          <Text style={styles.deleteAccountBtnText}>注销账号</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── 详情编辑 Modal ── */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={() => setShowEditModal(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
              style={{ width: '100%', justifyContent: 'flex-end' }}
            >
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalBox}>
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {editTarget === 'caregiver' ? '📝 编辑照顾者信息' : '📝 编辑被照顾者信息'}
                    </Text>
                    <TouchableOpacity onPress={() => setShowEditModal(false)} style={styles.modalCloseBtn}>
                      <Text style={styles.modalCloseBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {editTarget === 'caregiver' ? (
                      <>
                        <Text style={styles.modalLabel}>您的姓名</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={draftCaregiverName}
                          onChangeText={setDraftCaregiverName}
                          placeholder="输入您的姓名"
                        />
                        <Text style={styles.modalLabel}>出生年份</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={draftCaregiverBirthYear}
                          onChangeText={setDraftCaregiverBirthYear}
                          placeholder="例如：1985"
                          keyboardType="number-pad"
                        />
                      </>
                    ) : (
                      <>
                        <Text style={styles.modalLabel}>昵称（如：姥姥）</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={draftElderNickname}
                          onChangeText={setDraftElderNickname}
                          placeholder="输入昵称"
                        />
                        <Text style={styles.modalLabel}>真实姓名</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={draftElderName}
                          onChangeText={setDraftElderName}
                          placeholder="输入真实姓名"
                        />
                        <Text style={styles.modalLabel}>出生日期</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={draftElderBirthDate}
                          onChangeText={setDraftElderBirthDate}
                          placeholder="格式：YYYY-MM-DD"
                        />
                        <Text style={styles.modalLabel}>所在城市</Text>
                        <TextInput
                          style={styles.modalInput}
                          value={draftElderCity}
                          onChangeText={setDraftElderCity}
                          placeholder="例如：北京"
                        />
                      </>
                    )}
                    
                    <TouchableOpacity style={styles.modalSubmitBtn} onPress={saveEditModal}>
                      <Text style={styles.modalSubmitBtnText}>保存修改</Text>
                    </TouchableOpacity>
                    <View style={{ height: 20 }} />
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── 家庭管理 Modal ── */}
      <Modal visible={showFamilyModal} transparent animationType="slide" onRequestClose={() => { Keyboard.dismiss(); setShowFamilyModal(false); }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ width: '100%', justifyContent: 'flex-end' }}
            >
              <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
                <View style={styles.modalBox}>
                  {/* Modal Header */}
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>
                      {familyModalTab === 'join' ? '🔗 加入家庭' : '🏠 创建新家庭'}
                    </Text>
                    <TouchableOpacity onPress={() => { Keyboard.dismiss(); setShowFamilyModal(false); }} style={styles.modalCloseBtn}>
                      <Text style={styles.modalCloseBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Tab 切换 */}
                  <View style={styles.modalTabs}>
                    <TouchableOpacity
                      style={[styles.modalTab, familyModalTab === 'join' && styles.modalTabActive]}
                      onPress={() => { setFamilyModalTab('join'); setJoinError(''); }}
                    >
                      <Text style={[styles.modalTabText, familyModalTab === 'join' && styles.modalTabTextActive]}>加入已有家庭</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalTab, familyModalTab === 'create' && styles.modalTabActive]}
                      onPress={() => { setFamilyModalTab('create'); setJoinError(''); }}
                    >
                      <Text style={[styles.modalTabText, familyModalTab === 'create' && styles.modalTabTextActive]}>创建新家庭</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 加入家庭表单 */}
                  {familyModalTab === 'join' && (
                    <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                      <Text style={styles.modalLabel}>邀请码（6位）</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={joinCode}
                        onChangeText={v => setJoinCode(v.toUpperCase())}
                        placeholder="请输入邀请码，如 ABC123"
                        placeholderTextColor={AppColors.text.tertiary}
                        autoCapitalize="characters"
                        maxLength={6}
                      />
                      <Text style={styles.modalLabel}>您的名字</Text>
                      <TextInput
                        style={styles.modalInput}
                        value={joinName}
                        onChangeText={setJoinName}
                        placeholder="请输入您的名字"
                        placeholderTextColor={AppColors.text.tertiary}
                      />
                      {joinError ? <Text style={styles.joinError}>{joinError}</Text> : null}
                      <TouchableOpacity
                        style={[styles.modalSubmitBtn, joinLoading && { opacity: 0.6 }]}
                        onPress={handleJoinFamily}
                        disabled={joinLoading}
                      >
                        {joinLoading ? (
                          <ActivityIndicator color={AppColors.surface.whiteStrong} />
                        ) : (
                          <Text style={styles.modalSubmitBtnText}>加入家庭</Text>
                        )}
                      </TouchableOpacity>
                      <View style={{ height: 16 }} />
                    </ScrollView>
                  )}

                  {/* 创建家庭表单 */}
                  {familyModalTab === 'create' && (
                    <View style={styles.modalForm}>
                      {memberships.some(m => m.role === 'creator') ? (
                        <View style={[styles.createInfoCard, { backgroundColor: '#FFF5F5', borderColor: '#FFE0E0' }]}>
                          <Text style={styles.createInfoEmoji}>⚠️</Text>
                          <Text style={[styles.createInfoText, { color: '#E53E3E' }]}>
                            您当前已经是一个家庭的主照顾者。
                          </Text>
                          <Text style={styles.createInfoSub}>
                            为了避免数据混乱，每个账号只能创建一个家庭。如需创建新家庭，请先解散当前家庭。
                          </Text>
                        </View>
                      ) : (
                        <>
                          <Text style={styles.modalLabel}>👤 被照顾者的名字</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={newElderName}
                            onChangeText={setNewElderName}
                            placeholder="例如：姥姥、妈妈、小明"
                          />
                          <Text style={styles.modalLabel}>🏙️ 所在城市（可选）</Text>
                          <TextInput
                            style={styles.modalInput}
                            value={newElderCity}
                            onChangeText={setNewElderCity}
                            placeholder="例如：北京"
                          />
                          <Text style={[styles.createInfoSub, { marginBottom: 12 }]}>系统会自动生成邀请码，您可以邀请其他家人加入。</Text>
                          {joinError ? <Text style={styles.joinError}>{joinError}</Text> : null}
                          <TouchableOpacity
                            style={[styles.modalSubmitBtn, joinLoading && { opacity: 0.6 }]}
                            onPress={handleCreateFamily}
                            disabled={joinLoading}
                          >
                            {joinLoading ? (
                              <ActivityIndicator color={AppColors.surface.whiteStrong} />
                            ) : (
                              <Text style={styles.modalSubmitBtnText}>创建家庭</Text>
                            )}
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ── 注销账号确认 Modal ── */}
      <Modal visible={showDeleteAccountModal} transparent animationType="fade" onRequestClose={() => setShowDeleteAccountModal(false)}>
        <View style={styles.permOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmEmoji}>⚠️</Text>
            <Text style={styles.confirmTitle}>确认注销账号？</Text>
            <Text style={styles.confirmMsg}>
              注销后，您的所有本地数据（打卡记录、日记、用药记录等）将被清除，且无法恢复。{`\n\n`}此操作不可撤销，请谨慎操作。
            </Text>
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setShowDeleteAccountModal(false)}
                disabled={deletingAccount}
              >
                <Text style={styles.confirmCancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDeleteBtn}
                onPress={handleDeleteAccount}
                disabled={deletingAccount}
              >
                {deletingAccount ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmDeleteBtnText}>确认注销</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 删除/离开确认 Modal ── */}
      <Modal visible={!!deleteConfirmId} transparent animationType="fade" onRequestClose={() => setDeleteConfirmId(null)}>
        <View style={styles.permOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmEmoji}>{deleteConfirmType === 'delete' ? '⚠️' : '🚪'}</Text>
            <Text style={styles.confirmTitle}>
              {deleteConfirmType === 'delete' ? '确认解散家庭？' : '确认退出家庭？'}
            </Text>
            <Text style={styles.confirmMsg}>
              {deleteConfirmType === 'delete'
                ? '解散后，所有家庭成员将失去访问权限，相关数据也会被清除。此操作不可撤销。'
                : '退出后，您将无法再查看该家庭的数据。如需重新加入，需要新的邀请码。'}
            </Text>
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setDeleteConfirmId(null)}>
                <Text style={styles.confirmCancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, deleteConfirmType === 'leave' && styles.confirmLeaveBtn]}
                onPress={executeDeleteOrLeave}
              >
                <Text style={styles.confirmDeleteBtnText}>
                  {deleteConfirmType === 'delete' ? '确认解散' : '确认退出'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 40 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  backBtnText: { fontSize: 16, color: AppColors.coral.primary, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: AppColors.text.primary },
  loading: { fontSize: 16, color: AppColors.text.secondary },
  noProfile: { fontSize: 18, color: AppColors.text.secondary, marginBottom: 24, textAlign: 'center' },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: AppColors.text.tertiary, marginBottom: 8, letterSpacing: 0.5 },

  card: {
    borderRadius: 20, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 16,
    marginBottom: 16,
  },
  avatarWrap: { position: 'relative', width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  avatarPhoto: { width: 72, height: 72, borderRadius: 36, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.7)' },
  cameraChip: {
    position: 'absolute', bottom: -2, right: -4,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: AppColors.surface.whiteStrong, alignItems: 'center', justifyContent: 'center',
    shadowColor: AppColors.shadow.dark, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  cameraChipText: { fontSize: 13 },

  cardEmoji: { fontSize: 48 },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardName: { fontSize: 20, fontWeight: '700', color: AppColors.text.primary },
  editIconBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  inlineEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  inlineInput: {
    flex: 1, fontSize: 17, fontWeight: '700', color: AppColors.text.primary,
    borderBottomWidth: 2, borderBottomColor: AppColors.coral.primary,
    paddingVertical: 2, paddingHorizontal: 0,
  },
  saveBtn: {
    backgroundColor: AppColors.coral.primary, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: AppColors.surface.whiteStrong },
  cancelBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardSub: { fontSize: 14, color: AppColors.text.secondary, marginBottom: 2 },
  cardSub2: { fontSize: 13, color: AppColors.text.tertiary, marginBottom: 8 },
  editDetailBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  editDetailBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: AppColors.text.primary,
  },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: AppColors.bg.secondary, borderRadius: 16, padding: 16, marginBottom: 16,
  },
  infoLabel: { fontSize: 15, color: AppColors.text.secondary },
  infoValue: { fontSize: 15, fontWeight: '600', color: AppColors.text.primary },

  sectionHeader: { marginTop: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: AppColors.text.primary },

  // 家庭管理
  emptyFamilyCard: {
    backgroundColor: AppColors.bg.secondary, borderRadius: 16, padding: 24,
    alignItems: 'center', marginBottom: 12, gap: 8,
  },
  emptyFamilyEmoji: { fontSize: 32, marginBottom: 4 },
  emptyFamilyText: { fontSize: 16, fontWeight: '700', color: AppColors.text.primary },
  emptyFamilySub: { fontSize: 13, color: AppColors.text.tertiary, textAlign: 'center' },

  familyCard: {
    backgroundColor: AppColors.bg.secondary, borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: AppColors.border.soft,
  },
  familyCardActive: { borderColor: AppColors.coral.primary, backgroundColor: '#FFF9F9' },
  familyCardHeader: { marginBottom: 12 },
  familyCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  familyCardName: { fontSize: 16, fontWeight: '700', color: AppColors.text.primary },
  roleBadge: { backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  roleBadgeText: { fontSize: 11, color: AppColors.text.secondary, fontWeight: '600' },
  activeBadge: { marginTop: 6, backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
  activeBadgeText: { fontSize: 12, color: '#2E7D32', fontWeight: '600' },
  roomCode: { fontSize: 13, color: AppColors.text.tertiary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  familyCardAction: { alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 8 },
  familyCardActionText: { fontSize: 13, color: AppColors.text.secondary, fontWeight: '500' },

  familyActionRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  familyActionBtn: {
    flex: 1, height: 48, borderRadius: 14,
    backgroundColor: AppColors.bg.secondary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: AppColors.border.soft,
  },
  familyActionBtnPrimary: { backgroundColor: AppColors.coral.primary, borderColor: AppColors.coral.primary },
  familyActionIcon: { fontSize: 18 },
  familyActionText: { fontSize: 15, fontWeight: '600', color: AppColors.text.primary },

  settingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: AppColors.bg.secondary, borderRadius: 16, padding: 16,
  },
  settingInfo: { flex: 1 },
  settingLabel: { fontSize: 16, fontWeight: '600', color: AppColors.text.primary, marginBottom: 2 },
  settingDesc: { fontSize: 13, color: AppColors.text.tertiary },

  notifInfo: { marginTop: 12, paddingHorizontal: 16, gap: 4 },
  notifInfoText: { fontSize: 13, color: AppColors.text.secondary },

  reminderEditCard: {
    marginTop: 16, backgroundColor: AppColors.bg.secondary, borderRadius: 16, padding: 16,
  },
  reminderEditTitle: { fontSize: 15, fontWeight: '700', color: AppColors.text.primary, marginBottom: 12 },
  reminderEditRow: { gap: 8 },
  reminderEditLabel: { fontSize: 13, fontWeight: '600', color: AppColors.text.secondary },
  timeChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChipSmall: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: AppColors.surface.whiteStrong, borderWidth: 1, borderColor: AppColors.border.soft,
  },
  timeChipSmallActive: { backgroundColor: AppColors.coral.primary, borderColor: AppColors.coral.primary },
  timeChipSmallText: { fontSize: 13, color: AppColors.text.secondary, fontWeight: '600' },
  timeChipSmallTextActive: { color: AppColors.surface.whiteStrong },

  editBtn: {
    marginTop: 32, height: 56, borderRadius: 16,
    backgroundColor: AppColors.bg.secondary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: AppColors.border.soft,
  },
  editBtnText: { fontSize: 16, fontWeight: '600', color: AppColors.text.secondary },

  deleteAccountBtn: { marginTop: 16, paddingVertical: 12, alignItems: 'center' },
  deleteAccountBtnText: { fontSize: 14, color: AppColors.text.tertiary, textDecorationLine: 'underline' },

  btn: {
    backgroundColor: AppColors.coral.primary,
    paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12,
  },
  btnText: { color: AppColors.surface.whiteStrong, fontSize: 16, fontWeight: '600' },

  // Modal Styles
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: AppColors.surface.whiteStrong,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, marginBottom: 20,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: AppColors.text.primary },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: AppColors.bg.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCloseBtnText: { fontSize: 16, color: AppColors.text.secondary },
  modalForm: { paddingHorizontal: 24 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: AppColors.text.secondary, marginBottom: 8, marginTop: 16 },
  modalInput: {
    height: 52, backgroundColor: AppColors.bg.secondary,
    borderRadius: 12, paddingHorizontal: 16, fontSize: 16, color: AppColors.text.primary,
  },
  modalSubmitBtn: {
    marginTop: 32, height: 56, borderRadius: 16,
    backgroundColor: AppColors.coral.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: AppColors.coral.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  modalSubmitBtnText: { fontSize: 17, fontWeight: '700', color: AppColors.surface.whiteStrong },

  modalTabs: { flexDirection: 'row', paddingHorizontal: 24, gap: 12, marginBottom: 20 },
  modalTab: {
    flex: 1, height: 44, borderRadius: 12,
    backgroundColor: AppColors.bg.secondary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: AppColors.border.soft,
  },
  modalTabActive: { backgroundColor: '#FFF5F5', borderColor: AppColors.coral.primary },
  modalTabText: { fontSize: 14, fontWeight: '600', color: AppColors.text.secondary },
  modalTabTextActive: { color: AppColors.coral.primary },

  joinError: { color: AppColors.coral.primary, fontSize: 13, marginTop: 12, textAlign: 'center' },

  createInfoCard: {
    backgroundColor: AppColors.bg.secondary, borderRadius: 16, padding: 20,
    alignItems: 'center', gap: 8, borderWidth: 1, borderColor: AppColors.border.soft,
  },
  createInfoEmoji: { fontSize: 32, marginBottom: 4 },
  createInfoText: { fontSize: 15, color: AppColors.text.primary, textAlign: 'center', lineHeight: 22 },
  createInfoSub: { fontSize: 13, color: AppColors.text.tertiary, textAlign: 'center' },

  permOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  confirmBox: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 24,
    padding: 24, width: '100%', alignItems: 'center',
  },
  confirmEmoji: { fontSize: 40, marginBottom: 16 },
  confirmTitle: { fontSize: 20, fontWeight: '700', color: AppColors.text.primary, marginBottom: 12 },
  confirmMsg: { fontSize: 15, color: AppColors.text.secondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  confirmBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmCancelBtn: {
    flex: 1, height: 52, borderRadius: 14,
    backgroundColor: AppColors.bg.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmCancelBtnText: { fontSize: 16, fontWeight: '600', color: AppColors.text.secondary },
  confirmDeleteBtn: {
    flex: 1, height: 52, borderRadius: 14,
    backgroundColor: AppColors.coral.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmLeaveBtn: { backgroundColor: AppColors.text.primary },
  confirmDeleteBtnText: { fontSize: 16, fontWeight: '600', color: AppColors.surface.whiteStrong },
});
