import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet,
  Platform, TextInput, Image, Modal, Alert, ActivityIndicator,
  Keyboard,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { ScreenContainer } from '@/components/screen-container';
import { AppColors, Gradients } from '@/lib/design-tokens';
import { getProfile, saveProfile, ElderProfile, generateId, generateRoomCode, createFamilyRoom, joinFamilyRoom, lookupFamilyByCode } from '@/lib/storage';
import { getZodiac } from '@/lib/zodiac';
import {
  areRemindersScheduled,
  scheduleAllReminders,
  cancelAllReminders,
  requestNotificationPermissions,
} from '@/lib/notifications';
import { useFamilyContext } from '@/lib/family-context';

export default function ProfileScreen() {
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

  // Family management modal state
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [familyModalTab, setFamilyModalTab] = useState<'list' | 'join' | 'create'>('list');
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinRole, setJoinRole] = useState<'caregiver' | 'family' | 'nurse'>('caregiver');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteConfirmType, setDeleteConfirmType] = useState<'leave' | 'delete'>('leave');

  const { memberships, activeMembership, switchFamily, leaveFamily, deleteFamily, refresh } = useFamilyContext();

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
    setProfile(prev => {
      if (!prev) return prev;
      const updated = target === 'caregiver'
        ? { ...prev, caregiverPhotoUri: uri, caregiverAvatarType: 'photo' as const }
        : { ...prev, photoUri: uri, elderAvatarType: 'photo' as const };
      saveProfile(updated);
      return updated;
    });
  }, []);

  useFocusEffect(useCallback(() => {
    getProfile().then(p => {
      setProfile(p);
      setCaregiverNameDraft(p?.caregiverName || '');
      setElderNicknameDraft(p?.nickname || p?.name || '');
      setLoading(false);
    });
    if (Platform.OS !== 'web') {
      areRemindersScheduled().then(setNotifEnabled);
    }
  }, []));

  const saveCaregiverName = async () => {
    if (!profile || !caregiverNameDraft.trim()) return;
    const updated = await saveProfile({ ...profile, caregiverName: caregiverNameDraft.trim() });
    setProfile(updated);
    setEditingCaregiverName(false);
  };

  const saveElderNickname = async () => {
    if (!profile || !elderNicknameDraft.trim()) return;
    const updated = await saveProfile({ ...profile, nickname: elderNicknameDraft.trim() });
    setProfile(updated);
    setEditingElderNickname(false);
  };

  const toggleNotifications = async (value: boolean) => {
    setNotifLoading(true);
    try {
      if (value) {
        const granted = await requestNotificationPermissions();
        if (granted) {
          await scheduleAllReminders(profile?.nickname || profile?.name || undefined);
          setNotifEnabled(true);
        } else {
          setNotifEnabled(false);
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
      await joinFamilyRoom(joinCode.trim().toUpperCase(), {
        name: joinName.trim(),
        role: joinRole,
        emoji: joinRole === 'nurse' ? '👩‍⚕️' : joinRole === 'family' ? '👨' : '🧑',
      });
      await refresh();
      setJoinCode('');
      setJoinName('');
      setFamilyModalTab('list');
    } catch (e: any) {
      setJoinError(e?.message || '加入失败，请稍后重试');
    }
    setJoinLoading(false);
  };

  // 创建新家庭
  const handleCreateFamily = async () => {
    if (!profile) return;
    setJoinLoading(true);
    setJoinError('');
    try {
      await createFamilyRoom(
        profile.name || profile.nickname || '家人',
        {
          name: profile.caregiverName || '照顾者',
          role: 'caregiver',
          emoji: '🧑',
        },
        undefined,
        { emoji: undefined, photoUri: profile.photoUri },
      );
      await refresh();
      setFamilyModalTab('list');
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
    if (deleteConfirmType === 'delete') {
      await deleteFamily(deleteConfirmId);
    } else {
      await leaveFamily(deleteConfirmId);
    }
    setDeleteConfirmId(null);
    await refresh();
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

  if (!profile) {
    return (
      <ScreenContainer className="items-center justify-center p-6">
        <Text style={styles.noProfile}>还没有设置个人信息</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/onboarding' as any)}>
          <Text style={styles.btnText}>前往设置</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  const elderZodiac = getZodiac(new Date(profile.birthDate).getFullYear());
  const caregiverZodiac = getZodiac(parseInt(profile.caregiverBirthYear));

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" onScrollBeginDrag={Keyboard.dismiss}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>‹ 返回</Text>
          </TouchableOpacity>
          <Text style={styles.title}>个人信息</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* ── 照顾者信息 ── */}
        <Text style={styles.sectionLabel}>👤 照顾者</Text>
        <View style={[styles.card, { backgroundColor: caregiverZodiac.bgColor }]}>
          <TouchableOpacity style={styles.avatarWrap} onPress={() => pickPhoto('caregiver')} activeOpacity={0.8}>
            {profile.caregiverAvatarType === 'photo' && profile.caregiverPhotoUri ? (
              <Image source={{ uri: profile.caregiverPhotoUri }} style={styles.avatarPhoto} />
            ) : (
              <Text style={styles.cardEmoji}>{caregiverZodiac.emoji}</Text>
            )}
            <View style={styles.cameraChip}>
              <Text style={styles.cameraChipText}>📷</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.cardInfo}>
            {editingCaregiverName ? (
              <View style={styles.inlineEditRow}>
                <TextInput
                  style={styles.inlineInput}
                  value={caregiverNameDraft}
                  onChangeText={setCaregiverNameDraft}
                  autoFocus
                  placeholder="输入您的名字"
                  placeholderTextColor={AppColors.text.tertiary}
                  returnKeyType="done"
                  onSubmitEditing={saveCaregiverName}
                />
                <TouchableOpacity style={styles.saveBtn} onPress={saveCaregiverName}>
                  <Text style={styles.saveBtnText}>保存</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => {
                  setCaregiverNameDraft(profile.caregiverName);
                  setEditingCaregiverName(false);
                }}>
                  <Text style={{ fontSize: 16, color: AppColors.text.tertiary }}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.nameRow}>
                <Text style={styles.cardName}>{profile.caregiverName}</Text>
                <TouchableOpacity
                  style={styles.editIconBtn}
                  onPress={() => {
                    setCaregiverNameDraft(profile.caregiverName);
                    setEditingCaregiverName(true);
                  }}
                >
                  <Text style={{ fontSize: 13, color: AppColors.text.tertiary }}>✏️</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.cardSub}>属{caregiverZodiac.name} · {profile.caregiverBirthYear}年</Text>
            <Text style={styles.cardSub2}>照顾者</Text>
          </View>
        </View>

        {/* ── 老人信息 ── */}
        <Text style={styles.sectionLabel}>🧡 被照顾者</Text>
        <View style={[styles.card, { backgroundColor: elderZodiac.bgColor }]}>
          <TouchableOpacity style={styles.avatarWrap} onPress={() => pickPhoto('elder')} activeOpacity={0.8}>
            {profile.elderAvatarType === 'photo' && profile.photoUri ? (
              <Image source={{ uri: profile.photoUri }} style={styles.avatarPhoto} />
            ) : (
              <Text style={styles.cardEmoji}>{elderZodiac.emoji}</Text>
            )}
            <View style={styles.cameraChip}>
              <Text style={styles.cameraChipText}>📷</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.cardInfo}>
            {editingElderNickname ? (
              <View style={styles.inlineEditRow}>
                <TextInput
                  style={styles.inlineInput}
                  value={elderNicknameDraft}
                  onChangeText={setElderNicknameDraft}
                  autoFocus
                  placeholder="输入昵称（如：姥姥）"
                  placeholderTextColor={AppColors.text.tertiary}
                  returnKeyType="done"
                  onSubmitEditing={saveElderNickname}
                />
                <TouchableOpacity style={styles.saveBtn} onPress={saveElderNickname}>
                  <Text style={styles.saveBtnText}>保存</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => {
                  setElderNicknameDraft(profile.nickname || profile.name);
                  setEditingElderNickname(false);
                }}>
                  <Text style={{ fontSize: 16, color: AppColors.text.tertiary }}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.nameRow}>
                <Text style={styles.cardName}>{profile.nickname || profile.name}</Text>
                <TouchableOpacity
                  style={styles.editIconBtn}
                  onPress={() => {
                    setElderNicknameDraft(profile.nickname || profile.name);
                    setEditingElderNickname(true);
                  }}
                >
                  <Text style={{ fontSize: 13, color: AppColors.text.tertiary }}>✏️</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.cardSub}>属{elderZodiac.name} · {new Date(profile.birthDate).getFullYear()}年</Text>
            <Text style={styles.cardSub2}>{profile.name}</Text>
          </View>
        </View>

        {/* 权限被拒绝提示 Modal */}
        <Modal visible={permDenied} transparent animationType="fade" onRequestClose={() => setPermDenied(false)}>
          <View style={styles.permOverlay}>
            <View style={styles.permBox}>
              <Text style={{ fontSize: 32, marginBottom: 10 }}>📷</Text>
              <Text style={styles.permTitle}>需要相册权限</Text>
              <Text style={styles.permMsg}>请前往手机「设置」→「隐私」→「照片」，允许此 App 访问相册。</Text>
              <TouchableOpacity style={styles.permBtn} onPress={() => setPermDenied(false)}>
                <Text style={styles.permBtnText}>知道了</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* City */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>📍 所在城市</Text>
          <Text style={styles.infoValue}>{profile.city}</Text>
        </View>

        {/* ── 家庭管理 ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>👨‍👩‍👧 家庭管理</Text>
        </View>

        {/* 当前家庭列表 */}
        {memberships.length === 0 ? (
          <View style={styles.emptyFamilyCard}>
            <Text style={styles.emptyFamilyEmoji}>🏠</Text>
            <Text style={styles.emptyFamilyText}>还没有加入任何家庭</Text>
          </View>
        ) : (
          memberships.map(m => {
            const isActive = activeMembership?.familyId === m.familyId;
            const isCreatorRole = m.role === 'creator';
            return (
              <View key={m.familyId} style={[styles.familyCard, isActive && styles.familyCardActive]}>
                <TouchableOpacity
                  style={styles.familyCardMain}
                  onPress={() => switchFamily(m.familyId)}
                  activeOpacity={0.75}
                >
                  <View style={styles.familyCardLeft}>
                    <Text style={styles.familyCardEmoji}>{m.room.elderEmoji || '🧓'}</Text>
                    <View>
                      <Text style={styles.familyCardName}>{m.room.elderName} 的家庭</Text>
                      <Text style={styles.familyCardRole}>
                        {isCreatorRole ? '👑 主照顾者' : '👥 家庭成员'} · 邀请码 {m.room.roomCode}
                      </Text>
                    </View>
                  </View>
                  {isActive && (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>当前</Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.familyDeleteBtn, isCreatorRole && styles.familyDeleteBtnRed]}
                  onPress={() => confirmDeleteOrLeave(m.familyId, isCreatorRole ? 'delete' : 'leave')}
                >
                  <Text style={[styles.familyDeleteBtnText, isCreatorRole && styles.familyDeleteBtnTextRed]}>
                    {isCreatorRole ? '解散' : '退出'}
                  </Text>
                </TouchableOpacity>
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

        {/* Notification settings section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🔔 提醒设置</Text>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>每日打卡提醒</Text>
            <Text style={styles.settingDesc}>
              {Platform.OS === 'web' ? '仅在手机端可用' : '早上 8:00 · 晚上 21:00'}
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
            <Text style={styles.notifInfoText}>☀️ 早上 {profile.reminderMorning || '08:00'} — 记录昨晚睡眠情况</Text>
            <Text style={styles.notifInfoText}>🌙 晚上 {profile.reminderEvening || '21:00'} — 记录今日饮食和心情</Text>
          </View>
        )}

        {/* Reminder time customization */}
        <View style={styles.reminderEditCard}>
          <Text style={styles.reminderEditTitle}>⏰ 自定义提醒时间</Text>
          <View style={styles.reminderEditRow}>
            <Text style={styles.reminderEditLabel}>🌅 早上打卡</Text>
            <View style={styles.timeChipRow}>
              {['06:00', '07:00', '08:00', '09:00', '10:00'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.timeChipSmall, (profile.reminderMorning || '08:00') === t && styles.timeChipSmallActive]}
                  onPress={async () => {
                    const updated = await saveProfile({ ...profile, reminderMorning: t });
                    setProfile(updated);
                  }}
                >
                  <Text style={[styles.timeChipSmallText, (profile.reminderMorning || '08:00') === t && styles.timeChipSmallTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={[styles.reminderEditRow, { marginTop: 12 }]}>
            <Text style={styles.reminderEditLabel}>🌙 晚上打卡</Text>
            <View style={styles.timeChipRow}>
              {['19:00', '20:00', '21:00', '22:00', '23:00'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.timeChipSmall, (profile.reminderEvening || '21:00') === t && styles.timeChipSmallActive]}
                  onPress={async () => {
                    const updated = await saveProfile({ ...profile, reminderEvening: t });
                    setProfile(updated);
                  }}
                >
                  <Text style={[styles.timeChipSmallText, (profile.reminderEvening || '21:00') === t && styles.timeChipSmallTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Edit button */}
        <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/onboarding' as any)}>
          <Text style={styles.editBtnText}>✏️ 重新设置所有信息</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── 家庭管理 Modal ── */}
      <Modal visible={showFamilyModal} transparent animationType="slide" onRequestClose={() => setShowFamilyModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {familyModalTab === 'join' ? '🔗 加入家庭' : '🏠 创建新家庭'}
              </Text>
              <TouchableOpacity onPress={() => setShowFamilyModal(false)} style={styles.modalCloseBtn}>
                <Text style={styles.modalCloseBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Tab 切换 */}
            <View style={styles.modalTabRow}>
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
              <View style={styles.modalForm}>
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
                <Text style={styles.modalLabel}>您的身份</Text>
                <View style={styles.roleRow}>
                  {([
                    { key: 'caregiver', label: '照顾者', emoji: '🧑' },
                    { key: 'family', label: '家庭成员', emoji: '👨' },
                    { key: 'nurse', label: '护理人员', emoji: '👩‍⚕️' },
                  ] as const).map(r => (
                    <TouchableOpacity
                      key={r.key}
                      style={[styles.roleChip, joinRole === r.key && styles.roleChipActive]}
                      onPress={() => setJoinRole(r.key)}
                    >
                      <Text style={styles.roleChipEmoji}>{r.emoji}</Text>
                      <Text style={[styles.roleChipText, joinRole === r.key && styles.roleChipTextActive]}>{r.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
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
              </View>
            )}

            {/* 创建家庭表单 */}
            {familyModalTab === 'create' && (
              <View style={styles.modalForm}>
                <View style={styles.createInfoCard}>
                  <Text style={styles.createInfoEmoji}>🏠</Text>
                  <Text style={styles.createInfoText}>
                    将以 <Text style={{ fontWeight: '700' }}>{profile?.caregiverName || '您'}</Text> 的身份，
                    为 <Text style={{ fontWeight: '700' }}>{profile?.nickname || profile?.name || '家人'}</Text> 创建一个新的护理家庭。
                  </Text>
                  <Text style={styles.createInfoSub}>系统会自动生成邀请码，您可以邀请其他家人加入。</Text>
                </View>
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
              </View>
            )}
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
  cardSub2: { fontSize: 13, color: AppColors.text.tertiary },

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
  emptyFamilyEmoji: { fontSize: 32 },
  emptyFamilyText: { fontSize: 14, color: AppColors.text.tertiary },

  familyCard: {
    backgroundColor: AppColors.bg.secondary, borderRadius: 16,
    marginBottom: 10, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  familyCardActive: {
    borderColor: AppColors.coral.primary,
    backgroundColor: AppColors.coral.soft,
  },
  familyCardMain: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, paddingRight: 12,
  },
  familyCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  familyCardEmoji: { fontSize: 28 },
  familyCardName: { fontSize: 15, fontWeight: '700', color: AppColors.text.primary },
  familyCardRole: { fontSize: 12, color: AppColors.text.tertiary, marginTop: 2 },
  activeBadge: {
    backgroundColor: AppColors.coral.primary, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  activeBadgeText: { fontSize: 11, fontWeight: '700', color: AppColors.surface.whiteStrong },
  familyDeleteBtn: {
    borderTopWidth: 1, borderTopColor: AppColors.border.soft,
    paddingVertical: 10, alignItems: 'center',
  },
  familyDeleteBtnRed: { borderTopColor: '#FEE2E2' },
  familyDeleteBtnText: { fontSize: 13, fontWeight: '600', color: AppColors.text.tertiary },
  familyDeleteBtnTextRed: { color: '#EF4444' },

  familyActionRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  familyActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: AppColors.bg.secondary, borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: AppColors.border.soft,
  },
  familyActionBtnPrimary: {
    backgroundColor: AppColors.coral.primary, borderColor: AppColors.coral.primary,
  },
  familyActionIcon: { fontSize: 18 },
  familyActionText: { fontSize: 14, fontWeight: '700', color: AppColors.text.primary },

  settingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: AppColors.bg.secondary, borderRadius: 16, padding: 16, marginBottom: 8,
  },
  settingInfo: { flex: 1, marginRight: 12 },
  settingLabel: { fontSize: 15, fontWeight: '600', color: AppColors.text.primary, marginBottom: 2 },
  settingDesc: { fontSize: 13, color: AppColors.text.tertiary },
  notifInfo: {
    backgroundColor: AppColors.coral.soft, borderRadius: 12, padding: 14, marginBottom: 16, gap: 6,
  },
  notifInfoText: { fontSize: 14, color: AppColors.text.secondary, lineHeight: 20 },

  editBtn: {
    backgroundColor: AppColors.coral.primary, borderRadius: 20, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  editBtnText: { fontSize: 16, fontWeight: '700', color: AppColors.surface.whiteStrong },
  btn: { backgroundColor: AppColors.coral.primary, borderRadius: 20, paddingHorizontal: 32, paddingVertical: 14 },
  btnText: { fontSize: 16, fontWeight: '700', color: AppColors.surface.whiteStrong },

  permOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  permBox: { backgroundColor: AppColors.surface.whiteStrong, borderRadius: 20, padding: 28, width: 300, alignItems: 'center' },
  permTitle: { fontSize: 17, fontWeight: '800', color: AppColors.text.primary, marginBottom: 8 },
  permMsg: { fontSize: 14, color: AppColors.text.secondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  permBtn: { backgroundColor: AppColors.coral.primary, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 12 },
  permBtnText: { fontSize: 15, fontWeight: '700', color: AppColors.surface.whiteStrong },

  reminderEditCard: {
    backgroundColor: AppColors.purple.soft,
    borderRadius: 20, padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: AppColors.purple.primary,
  },
  reminderEditTitle: { fontSize: 15, fontWeight: '800', color: AppColors.purple.strong, marginBottom: 14 },
  reminderEditRow: { gap: 8 },
  reminderEditLabel: { fontSize: 14, fontWeight: '700', color: AppColors.text.primary, marginBottom: 6 },
  timeChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChipSmall: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: AppColors.purple.soft, borderWidth: 1.5, borderColor: 'transparent',
  },
  timeChipSmallActive: { backgroundColor: AppColors.purple.strong, borderColor: AppColors.purple.strong },
  timeChipSmallText: { fontSize: 13, fontWeight: '600', color: AppColors.purple.strong },
  timeChipSmallTextActive: { color: AppColors.surface.whiteStrong },

  // 家庭管理 Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: AppColors.surface.whiteStrong,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: AppColors.text.primary },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: AppColors.bg.secondary, alignItems: 'center', justifyContent: 'center',
  },
  modalCloseBtnText: { fontSize: 16, color: AppColors.text.tertiary },
  modalTabRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  modalTab: {
    flex: 1, paddingVertical: 10, borderRadius: 14,
    backgroundColor: AppColors.bg.secondary, alignItems: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  modalTabActive: {
    backgroundColor: AppColors.coral.soft, borderColor: AppColors.coral.primary,
  },
  modalTabText: { fontSize: 14, fontWeight: '600', color: AppColors.text.tertiary },
  modalTabTextActive: { color: AppColors.coral.primary },
  modalForm: { gap: 4 },
  modalLabel: { fontSize: 13, fontWeight: '700', color: AppColors.text.secondary, marginBottom: 6, marginTop: 8 },
  modalInput: {
    backgroundColor: AppColors.bg.secondary, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 15, color: AppColors.text.primary,
    borderWidth: 1.5, borderColor: AppColors.border.soft,
    marginBottom: 4,
  },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  roleChip: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14,
    backgroundColor: AppColors.bg.secondary, borderWidth: 1.5, borderColor: 'transparent', gap: 4,
  },
  roleChipActive: { backgroundColor: AppColors.coral.soft, borderColor: AppColors.coral.primary },
  roleChipEmoji: { fontSize: 20 },
  roleChipText: { fontSize: 12, fontWeight: '600', color: AppColors.text.tertiary },
  roleChipTextActive: { color: AppColors.coral.primary },
  joinError: { fontSize: 13, color: '#EF4444', marginTop: 4, marginBottom: 4 },
  modalSubmitBtn: {
    backgroundColor: AppColors.coral.primary, borderRadius: 16,
    paddingVertical: 14, alignItems: 'center', marginTop: 16,
  },
  modalSubmitBtnText: { fontSize: 16, fontWeight: '700', color: AppColors.surface.whiteStrong },

  createInfoCard: {
    backgroundColor: AppColors.bg.secondary, borderRadius: 16, padding: 18,
    alignItems: 'center', gap: 8, marginBottom: 4,
  },
  createInfoEmoji: { fontSize: 36 },
  createInfoText: { fontSize: 14, color: AppColors.text.primary, textAlign: 'center', lineHeight: 22 },
  createInfoSub: { fontSize: 12, color: AppColors.text.tertiary, textAlign: 'center', lineHeight: 18 },

  // 删除确认 Modal
  confirmBox: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 24, padding: 28,
    width: 320, alignItems: 'center',
  },
  confirmEmoji: { fontSize: 40, marginBottom: 12 },
  confirmTitle: { fontSize: 18, fontWeight: '800', color: AppColors.text.primary, marginBottom: 10 },
  confirmMsg: { fontSize: 14, color: AppColors.text.secondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  confirmBtnRow: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmCancelBtn: {
    flex: 1, backgroundColor: AppColors.bg.secondary, borderRadius: 16,
    paddingVertical: 14, alignItems: 'center',
  },
  confirmCancelBtnText: { fontSize: 15, fontWeight: '600', color: AppColors.text.secondary },
  confirmDeleteBtn: {
    flex: 1, backgroundColor: '#EF4444', borderRadius: 16,
    paddingVertical: 14, alignItems: 'center',
  },
  confirmLeaveBtn: { backgroundColor: AppColors.coral.primary },
  confirmDeleteBtnText: { fontSize: 15, fontWeight: '700', color: AppColors.surface.whiteStrong },
});
