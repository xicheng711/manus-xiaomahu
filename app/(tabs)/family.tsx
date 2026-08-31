import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Animated, Platform, Alert, Share, Modal, Easing,
  Keyboard, TouchableWithoutFeedback, Clipboard, KeyboardAvoidingView, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  getFamilyRoom, getFamilyAnnouncements, saveFamilyRoom, cloudGetRoomDetail, saveFamilyAnnouncement,
  deleteFamilyAnnouncement, getCurrentMember, createFamilyRoom,
  joinFamilyRoom, setCurrentMember, getTodayCheckIn, getYesterdayCheckIn,
  getAllCheckIns, getDiaryEntries, mergeCloudDiariesIntoLocal, mergeCloudCheckInsIntoLocal,
  mergeCloudAnnouncementsIntoLocal, syncPendingAnnouncements, syncPendingBriefings,
  getProfile, getFamilyProfile, getUserProfile,
  FamilyAnnouncement, AnnouncementReaction, FamilyMember, FamilyRoom, DailyCheckIn,
  updateFamilyMemberPhoto, getCurrentUserIsCreator, todayStr,
  getActiveRoomIdCache, getActiveMembership, removeCachedAnnouncementComments,
} from '@/lib/storage';
import { cloudDeleteAnnouncement, cloudToggleReaction, cloudUploadPhoto } from '@/lib/cloud-sync';
import { useFamilyContext } from '@/lib/family-context';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/lib/animations';
import { AppColors, Gradients, Shadows } from '@/lib/design-tokens';
import { PageHeader, PAGE_THEMES } from '@/components/page-header';
import { AnnouncementComments } from '@/components/announcement-comments';
import { ScreenContainer } from '@/components/screen-container';
import { sendFamilyAnnouncementNotification, registerPushToken } from '@/lib/notifications';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { FamilySkeleton } from '@/components/skeleton-loader';
import { cloudGetAnnouncements, cloudGetCheckIns, cloudGetDiaries, cloudGetElderProfile } from '@/lib/cloud-sync';
import { getSessionToken } from '@/lib/_core/auth';
import { getZodiac } from '@/lib/zodiac';
import { useKeyboardAwareScroll } from '@/hooks/use-keyboard-aware-scroll';

// ─── Constants ────────────────────────────────────────────────────────────────

const ANNOUNCEMENT_TYPES = [
  { type: 'daily' as const, emoji: '📢', label: '日常', color: '#60A5FA' },
  { type: 'visit' as const, emoji: '🏠', label: '探望', color: '#4ADE80' },
  { type: 'medical' as const, emoji: '🏥', label: '医疗', color: '#F87171' },
  { type: 'news' as const, emoji: '📰', label: '新闻', color: '#FBBF24' },
  { type: 'reminder' as const, emoji: '⏰', label: '提醒', color: '#A78BFA' },
];

const MEMBER_EMOJIS = ['👩', '👨', '👧', '👦', '👴', '👵', '🧑', '👩‍⚕️', '👨‍⚕️', '🧓'];
const MEMBER_COLORS = [AppColors.coral.primary, '#4ADE80', '#60A5FA', '#FBBF24', '#EDAABB', '#F472B6', '#34D399', '#FB923C'];
const MEMBER_ROLES = [
  { role: 'caregiver' as const, label: '主要照顾者' },
  { role: 'family' as const, label: '家庭成员' },
  { role: 'nurse' as const, label: '护工/护士' },
];

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function FamilySetupScreen({ onSetupComplete, initialCode }: { onSetupComplete: () => void; initialCode?: string }) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>(initialCode ? 'join' : 'choose');
  const [memberName, setMemberName] = useState('');
  const [memberEmoji, setMemberEmoji] = useState('👩');
  const [memberColor, setMemberColor] = useState(AppColors.coral.primary);
  const [memberRole, setMemberRole] = useState<'caregiver' | 'family' | 'nurse'>('caregiver');
  const [memberRoleLabel, setMemberRoleLabel] = useState('主要照顾者');
  const [roomCode, setRoomCode] = useState(initialCode ?? '');
  const [loading, setLoading] = useState(false);
  const [patientNickname, setPatientNickname] = useState('家人');
  const [customPhotoUri, setCustomPhotoUri] = useState<string | null>(null);

  async function handlePickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('需要权限', '请允许访问相册以上传头像');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setCustomPhotoUri(result.assets[0].uri);
    }
  }

  useEffect(() => {
    // Prefer FamilyProfile (family-scoped) for elder nickname, fallback to legacy getProfile
    const loadNickname = async () => {
      const roomId = getActiveRoomIdCache();
      const [fp, legacyP] = await Promise.all([
        roomId ? getFamilyProfile(roomId) : Promise.resolve(null),
        getProfile(),
      ]);
      const nickname = fp?.nickname || fp?.name || legacyP?.nickname || legacyP?.name || '家人';
      setPatientNickname(nickname);
    };
    loadNickname();
  }, []);

  async function handleCreate() {
    if (!memberName.trim()) return;
    // 检查登录状态，家庭共享功能需要登录
    const token = await getSessionToken();
    if (!token) {
      Alert.alert(
        '需要登录',
        '家庭共享功能需要登录账号，登录后才能与家人共享数据。',
        [
          { text: '暂不登录', style: 'cancel' },
          { text: '去登录', onPress: () => router.push('/login' as any) },
        ]
      );
      return;
    }
    setLoading(true);
    try {
      // 先上传照片到 S3，确保其他设备可以访问
      let finalPhotoUri = customPhotoUri ?? undefined;
      if (customPhotoUri && customPhotoUri.startsWith('file://')) {
        try {
          const uploaded = await cloudUploadPhoto(customPhotoUri, 'member');
          if (uploaded) finalPhotoUri = uploaded;
        } catch (e) {
          console.warn('[FamilySetup] Failed to upload photo:', e);
        }
      }
      // Prefer FamilyProfile for elder name, fallback to legacy getProfile
      const roomId = getActiveRoomIdCache();
      const [fp, legacyP] = await Promise.all([
        roomId ? getFamilyProfile(roomId) : Promise.resolve(null),
        getProfile(),
      ]);
      const elderName = fp?.name || fp?.nickname || legacyP?.name || legacyP?.nickname || '家人';
      await createFamilyRoom(elderName, {
        name: memberName.trim(),
        role: memberRole,
        roleLabel: memberRoleLabel,
        emoji: memberEmoji,
        color: memberColor,
        photoUri: finalPhotoUri,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSetupComplete();
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!memberName.trim() || roomCode.length < 6) return;
    // 检查登录状态，加入家庭空间需要登录
    const token = await getSessionToken();
    if (!token) {
      Alert.alert(
        '需要登录',
        '加入家庭空间需要登录账号，登录后才能与家人共享数据。',
        [
          { text: '暂不登录', style: 'cancel' },
          { text: '去登录', onPress: () => router.push('/login' as any) },
        ]
      );
      return;
    }
    setLoading(true);
    try {
      // 先上传照片到 S3，确保其他设备可以访问
      let finalPhotoUri = customPhotoUri ?? undefined;
      if (customPhotoUri && customPhotoUri.startsWith('file://')) {
        try {
          const uploaded = await cloudUploadPhoto(customPhotoUri, 'member');
          if (uploaded) finalPhotoUri = uploaded;
        } catch (e) {
          console.warn('[FamilySetup] Failed to upload photo:', e);
        }
      }
      const result = await joinFamilyRoom(roomCode, {
        name: memberName.trim(),
        role: memberRole,
        roleLabel: memberRoleLabel,
        emoji: memberEmoji,
        color: memberColor,
        photoUri: finalPhotoUri,
      });
      if (!result) {
        Alert.alert('加入失败', '邀请码不正确，请检查后重试');
        return;
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // 加入家庭后立即注册 push token，确保 Joiner 能收到通知
      registerPushToken().catch(() => {});
      onSetupComplete();
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'choose') {
    return (
      <View style={setup.container}>
        <Text style={setup.emoji}>🏡</Text>
        <Text style={setup.title}>家人共享</Text>
        <Text style={setup.subtitle}>
          创建家庭空间，邀请家人一起{'\n'}
          共同关爱{patientNickname}，分享护理日常
        </Text>
        <TouchableOpacity style={setup.primaryBtn} onPress={() => setMode('create')}>
          <Text style={setup.primaryBtnText}>✨ 创建家庭空间</Text>
        </TouchableOpacity>
        <TouchableOpacity style={setup.secondaryBtn} onPress={() => setMode('join')}>
          <Text style={setup.secondaryBtnText}>🔗 加入已有空间</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <ScrollView
          contentContainerStyle={setup.formContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
      <Text style={setup.emoji}>{mode === 'create' ? '✨' : '🔗'}</Text>
      <Text style={setup.title}>{mode === 'create' ? '创建家庭空间' : '加入家庭空间'}</Text>

      {mode === 'join' && (
        <View style={setup.inputGroup}>
          <Text style={setup.label}>邀请码</Text>
          <TextInput
            style={setup.input}
            placeholder="输入6位邀请码"
            value={roomCode}
            onChangeText={t => setRoomCode(t.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            placeholderTextColor={AppColors.text.tertiary}
            returnKeyType="next"
            blurOnSubmit={false}
          />
        </View>
      )}

      <View style={setup.inputGroup}>
        <Text style={setup.label}>您的名字</Text>
        <TextInput
          style={setup.input}
          placeholder="如：小红、大明..."
          value={memberName}
          onChangeText={setMemberName}
          placeholderTextColor={AppColors.text.tertiary}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />
      </View>

      <View style={setup.inputGroup}>
        <Text style={setup.label}>选择头像</Text>
        {/* 自定义照片预览 + 上传按钮 */}
        <TouchableOpacity style={setup.photoUploadRow} onPress={handlePickPhoto} activeOpacity={0.8}>
          <View style={[setup.photoUploadPreview, customPhotoUri ? { borderColor: memberColor } : {}]}>
            {customPhotoUri ? (
              <Image source={{ uri: customPhotoUri }} style={setup.photoUploadImg} />
            ) : (
              <Text style={setup.photoUploadIcon}>📷</Text>
            )}
          </View>
          <View style={setup.photoUploadInfo}>
            <Text style={[setup.photoUploadTitle, customPhotoUri ? { color: memberColor } : {}]}>
              {customPhotoUri ? '已选择自定义头像' : '上传自定义头像'}
            </Text>
            <Text style={setup.photoUploadSub}>
              {customPhotoUri ? '点击重新选择' : '从相册选择照片（可选）'}
            </Text>
          </View>
          {customPhotoUri && (
            <TouchableOpacity
              style={setup.photoUploadClear}
              onPress={(e) => { e.stopPropagation?.(); setCustomPhotoUri(null); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={setup.photoUploadClearText}>×</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        {/* 没有自定义照片时显示 emoji 选择 */}
        {!customPhotoUri && (
          <View style={[setup.emojiRow, { marginTop: 10 }]}>
            {MEMBER_EMOJIS.map(e => (
              <TouchableOpacity
                key={e}
                style={[setup.emojiBtn, memberEmoji === e && { borderColor: memberColor, backgroundColor: memberColor + '20' }]}
                onPress={() => setMemberEmoji(e)}
              >
                <Text style={setup.emojiBtnText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={setup.inputGroup}>
        <Text style={setup.label}>主题色</Text>
        <View style={setup.colorRow}>
          {MEMBER_COLORS.map(c => (
            <TouchableOpacity
              key={c}
              style={[setup.colorBtn, { backgroundColor: c }, memberColor === c && setup.colorBtnSelected]}
              onPress={() => setMemberColor(c)}
            />
          ))}
        </View>
      </View>

      {/* 仅创建模式显示身份选择，加入模式固定为家庭成员 */}
      {mode === 'create' && (
      <View style={setup.inputGroup}>
        <Text style={setup.label}>身份</Text>
        <View style={setup.roleRow}>
          {MEMBER_ROLES.map(r => (
            <TouchableOpacity
              key={r.role}
              style={[setup.roleBtn, memberRole === r.role && { borderColor: memberColor, backgroundColor: memberColor + '15' }]}
              onPress={() => { setMemberRole(r.role); setMemberRoleLabel(r.label); }}
            >
              <Text style={[setup.roleBtnText, memberRole === r.role && { color: memberColor, fontWeight: '700' }]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      )}

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
        <TouchableOpacity style={setup.cancelBtn} onPress={() => setMode('choose')}>
          <Text style={setup.cancelBtnText}>← 返回</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[setup.primaryBtn, { flex: 2 }, (!memberName.trim() || (mode === 'join' && roomCode.length < 6)) && setup.disabledBtn]}
          onPress={mode === 'create' ? handleCreate : handleJoin}
          disabled={loading || !memberName.trim() || (mode === 'join' && roomCode.length < 6)}
        >
          <Text style={setup.primaryBtnText}>
            {loading ? '请稍候...' : mode === 'create' ? '创建 🎉' : '加入 🔗'}
          </Text>
        </TouchableOpacity>
      </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

// ─── Member Avatar Chip (with image error fallback) ─────────────────────────────
// 判断字符串是否为纯 emoji（不含普通文字）
function isPureEmoji(str: string): boolean {
  if (!str) return false;
  // 移除所有 emoji 相关字符后，若剩余为空则为纯 emoji
  const withoutEmoji = str.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FEFF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA9F}\u{200D}\u{FE0F}\u{20E3}]/gu, '');
  return withoutEmoji.trim().length === 0;
}

function MemberAvatarChip({ member: m, isCurrentUser, onPress }: { member: any; isCurrentUser: boolean; onPress: () => void }) {
  const [imgError, setImgError] = useState(false);
  // 生肖：有 birthYear 时显示生肖 emoji，否则用注册时的 emoji
  const zodiacInfo = m.birthYear ? getZodiac(m.birthYear) : null;
  const displayEmoji = zodiacInfo ? zodiacInfo.emoji : (m.emoji || '👤');
  // 名字是纯 emoji 时（如主照顾者名字是 💑），用大字号显示
  const nameIsPureEmoji = isPureEmoji(m.name);
  // 头像显示规则：
  // - 主照顾者（isCreator=true）：有 birthYear 就显生肖 emoji，否则可以显示照片或 emoji
  // - Joiner（isCreator=false/undefined）：只显示自选 emoji，不显示照片（避免旧照片干扰）
  const isCreator = m.isCreator === true;
  const showPhoto = isCreator && !!m.photoUri && !imgError && !zodiacInfo;
  return (
    <TouchableOpacity
      style={styles.memberChip}
      onPress={onPress}
      activeOpacity={isCurrentUser ? 0.7 : 1}
    >
      <View style={[styles.memberAvatar, { backgroundColor: m.color + '22', borderColor: m.color + '99' }]}>
        {showPhoto ? (
          <Image source={{ uri: m.photoUri }} style={styles.memberAvatarImg} onError={() => setImgError(true)} />
        ) : (
          <Text style={styles.memberAvatarText}>{displayEmoji}</Text>
        )}
      </View>
      {nameIsPureEmoji ? (
        // 名字是纯 emoji 时，直接用大字号显示
        <Text style={[styles.memberName, { fontSize: 18, lineHeight: 22 }]}>{m.name}</Text>
      ) : (
        <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
      )}
      <Text style={styles.memberRole}>{m.roleLabel}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Family Screen ────────────────────────────────────────────────────────

type BriefingHistoryItem = {
  date: string;
  label: string;
  checkIn: DailyCheckIn | null;
  diary: any;
  announcements: FamilyAnnouncement[];
};

const FAMILY_CLOUD_REFRESH_TTL_MS = 30_000;

function buildFamilyBriefingHistory(
  allCheckIns: DailyCheckIn[],
  diaryEntries: any[],
  announcements: FamilyAnnouncement[],
): BriefingHistoryItem[] {
  const checkInMap = new Map<string, DailyCheckIn>();
  for (const checkIn of allCheckIns) checkInMap.set(checkIn.date, checkIn);

  const viewerTodayKey = todayStr();
  const viewerTomorrow = new Date();
  viewerTomorrow.setDate(viewerTomorrow.getDate() + 1);
  const viewerTomorrowKey = `${viewerTomorrow.getFullYear()}-${String(viewerTomorrow.getMonth() + 1).padStart(2, '0')}-${String(viewerTomorrow.getDate()).padStart(2, '0')}`;
  const latestRecordedDate = allCheckIns
    .map(checkIn => checkIn.date)
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort((left, right) => right.localeCompare(left))[0];
  const anchorDateKey = latestRecordedDate && latestRecordedDate > viewerTodayKey && latestRecordedDate <= viewerTomorrowKey
    ? latestRecordedDate
    : viewerTodayKey;
  const [anchorYear, anchorMonth, anchorDay] = anchorDateKey.split('-').map(Number);
  const anchorDate = new Date(anchorYear, anchorMonth - 1, anchorDay, 12);

  const viewerYesterday = new Date();
  viewerYesterday.setDate(viewerYesterday.getDate() - 1);
  const viewerYesterdayKey = `${viewerYesterday.getFullYear()}-${String(viewerYesterday.getMonth() + 1).padStart(2, '0')}-${String(viewerYesterday.getDate()).padStart(2, '0')}`;

  const history: BriefingHistoryItem[] = [];
  for (let index = 0; index < 3; index += 1) {
    const date = new Date(anchorDate);
    date.setDate(anchorDate.getDate() - index);
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const label = dateKey === viewerTodayKey
      ? '今日'
      : dateKey === viewerYesterdayKey
        ? '昨日'
        : date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    history.push({
      date: dateKey,
      label,
      checkIn: checkInMap.get(dateKey) ?? null,
      diary: diaryEntries.find(entry => entry.date === dateKey),
      announcements: announcements.filter(announcement => announcement.date === dateKey),
    });
  }
  return history;
}

export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    openCompose?: string;
    joinCode?: string;
    refresh?: string;
    announcementId?: string;
    openComments?: string;
  }>();
  const [room, setRoom] = useState<FamilyRoom | null>(null);
  const [currentMember, setCurrentMemberState] = useState<FamilyMember | null>(null);
  const [announcements, setAnnouncements] = useState<FamilyAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'broadcast' | 'briefing'>('broadcast');

  // Compose state
  const [showCompose, setShowCompose] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [composeType, setComposeType] = useState<FamilyAnnouncement['type']>('daily');
  const [composeEmoji, setComposeEmoji] = useState('');
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);

  // Briefing state
  const [briefingData, setBriefingData] = useState<any>(null);
  const [selectedBriefingDate, setSelectedBriefingDate] = useState<string>(todayStr());
  const [briefingHistory, setBriefingHistory] = useState<BriefingHistoryItem[]>([]);
  const [elderNickname, setElderNickname] = useState('家人');
  const [elderEmoji, setElderEmoji] = useState('🐯');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const fabBreath = useRef(new Animated.Value(1)).current;
  const {
    scrollRef,
    keyboardVisible,
    inputFocused: commentInputFocused,
    revealInput: revealCommentInput,
    blurInput: handleCommentInputBlur,
    onScrollLayout: handleCommentScrollLayout,
  } = useKeyboardAwareScroll(28);
  const handledAnnouncementTargetRef = useRef<string | null>(null);
  const [newAnnouncementId, setNewAnnouncementId] = useState<string | null>(null);
  const briefingCardRef = useRef<View>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isCreator, setIsCreator] = useState(true);
  const [codeCopied, setCodeCopied] = useState(false);

  const { memberships, activeMembership, refresh } = useFamilyContext();
  const familyId = activeMembership?.familyId;
  const activeFamilyRef = useRef<string | undefined>(familyId);
  const lastCloudRefreshAtRef = useRef(new Map<string, number>());
  activeFamilyRef.current = familyId;

  useEffect(() => {
    // 家庭切换后先清空上一家庭的可见数据，随后立即加载新家庭缓存，避免短暂串页。
    setRoom(null);
    setCurrentMemberState(null);
    setAnnouncements([]);
    setBriefingData(null);
    setBriefingHistory([]);
    setElderNickname('家人');
    setLoading(true);
    fadeAnim.setValue(0);
  }, [familyId, fadeAnim]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData(true);
    } catch (error) {
      console.warn('[Family] refresh failed', error);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId]);

  const loadDataCallback = useCallback(() => {
    void loadData(false).catch(error => {
      console.warn('[Family] cached load failed', error);
      setLoading(false);
    });
    if (params.openCompose === '1') {
      setTimeout(() => {
        setShowCompose(true);
        setActiveSection('broadcast');
      }, 300);
    }
    if (params.openComments === '1' && params.announcementId) {
      setActiveSection('broadcast');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.openCompose, params.openComments, params.announcementId, familyId]);

  useFocusEffect(loadDataCallback);

  // 点击通知时强制刷新
  useEffect(() => {
    if (params.refresh) {
      void loadData(true).catch(error => {
        console.warn('[Family] notification refresh failed', error);
        setLoading(false);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.refresh]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fabBreath, { toValue: 1.07, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(fabBreath, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  async function loadData(forceCloudRefresh = false) {
    const requestedMembership = activeMembership;
    const requestedFamilyId = requestedMembership?.familyId;
    if (!requestedMembership || !requestedFamilyId) {
      setRoom(null);
      setCurrentMemberState(null);
      setAnnouncements([]);
      setBriefingData(null);
      setBriefingHistory([]);
      setLoading(false);
      return;
    }
    const isCurrentFamily = () => activeFamilyRef.current === requestedFamilyId;
    const rLocal = requestedMembership.room;
    const m = rLocal.members.find(member => member.id === requestedMembership.myMemberId) ?? null;
    const creatorFlag = requestedMembership.role === 'creator' || m?.isCreator === true;

    // 第一阶段只读取当前家庭的 AsyncStorage：不等待网络，立即显示成员、公告和简报缓存。
    const [localAnns, cachedCheckIns, cachedDiaries, cachedFamilyProfile, cachedLegacyProfile] = await Promise.all([
      getFamilyAnnouncements(30, requestedFamilyId),
      getAllCheckIns(requestedFamilyId),
      getDiaryEntries(requestedFamilyId),
      getFamilyProfile(requestedFamilyId),
      getProfile(),
    ]);
    if (!isCurrentFamily()) return;
    const allowLegacyProfileFallback = memberships.length === 1;
    const cachedProfile = cachedFamilyProfile
      ? {
          ...(allowLegacyProfileFallback ? cachedLegacyProfile : null),
          ...cachedFamilyProfile,
          name: cachedFamilyProfile.name || (allowLegacyProfileFallback ? cachedLegacyProfile?.name : undefined),
          nickname: cachedFamilyProfile.nickname || (allowLegacyProfileFallback ? cachedLegacyProfile?.nickname : undefined),
        }
      : allowLegacyProfileFallback ? cachedLegacyProfile : null;
    const cachedToday = cachedCheckIns.find(checkIn => checkIn.date === todayStr()) ?? null;
    const cachedHistory = buildFamilyBriefingHistory(cachedCheckIns, cachedDiaries, localAnns);
    setRoom(rLocal);
    setCurrentMemberState(m);
    setIsCreator(creatorFlag);
    setAnnouncements(localAnns);
    setBriefingData({
      checkIn: cachedToday,
      profile: cachedProfile,
      todayAnnouncements: localAnns.filter(announcement => announcement.date === todayStr()),
    });
    setBriefingHistory(cachedHistory);
    const cachedLatestWithData = cachedHistory.find(item => item.checkIn) ?? cachedHistory[0];
    if (cachedLatestWithData) setSelectedBriefingDate(cachedLatestWithData.date);
    setElderNickname(cachedProfile?.nickname || cachedProfile?.name || rLocal.elderName || '家人');
    setElderEmoji(cachedProfile?.zodiacEmoji || '🐯');
    fadeAnim.setValue(1);
    setLoading(false);

    // 频繁切换 Tab 时直接复用刚刷新的内容；下拉刷新和通知进入会强制拉取。
    const lastCloudRefreshAt = lastCloudRefreshAtRef.current.get(requestedFamilyId) ?? 0;
    if (!forceCloudRefresh && Date.now() - lastCloudRefreshAt < FAMILY_CLOUD_REFRESH_TTL_MS) return;
    lastCloudRefreshAtRef.current.set(requestedFamilyId, Date.now());

    // 第二阶段在后台重试待同步内容并拉取服务器最新数据，不再用骨架屏阻塞页面。
    await Promise.all([
      syncPendingAnnouncements(requestedFamilyId).catch(() => {}),
      syncPendingBriefings(requestedFamilyId).catch(() => {}),
    ]);
    const cloudAnns = await cloudGetAnnouncements(Number(requestedFamilyId), 50);
    if (!isCurrentFamily()) return;
    // myMemberId is the authoritative member row id for the requested family.
    const myMemberId = requestedMembership.myMemberId;
    let r = rLocal;
    const activeRoomId = requestedFamilyId;
    if (activeRoomId) {
      try {
        const detail = await cloudGetRoomDetail(Number(activeRoomId));
        if (!isCurrentFamily()) return;
        if (detail?.room) {
          // 本地已有成员数据（用于备用本地 photoUri）
          const localMembersMap = new Map((rLocal?.members ?? []).map((lm: any) => [String(lm.id), lm]));
          const serverMembers = (detail.members ?? []).map((x: any) => {
            const localMember = localMembersMap.get(String(x.id));
            // 接受任何非空 photoUri（包括 http://、自定义域名等），不强制要求 https://
            // 本地 file:// URI 不应存在于服务器，所以直接优先用服务器返回的地址
            const serverPhotoUri = x.photoUri || null;
            const localPhotoUri = localMember?.photoUri || undefined;
            const photoUri = serverPhotoUri || localPhotoUri;
            return {
              id: String(x.id),
              name: x.name,
              role: x.role ?? "family",
              roleLabel: x.roleLabel ?? x.role ?? "家人",
              emoji: x.emoji ?? "👤",
              color: x.color ?? "#888",
              photoUri,
              joinedAt: x.joinedAt ?? new Date().toISOString(),
              isCreator: x.isCreator ?? false,
              isCurrentUser: String(x.id) === String(myMemberId),
              relationship: x.relationship,
              birthYear: x.birthYear ?? null,
            };
          });
          r = {
            id: String(detail.room.id ?? activeRoomId),
            roomCode: detail.room.roomCode ?? r?.roomCode ?? "",
            elderName: detail.room.elderName ?? r?.elderName ?? "家人",
            elderEmoji: detail.room.elderEmoji ?? r?.elderEmoji,
            elderPhotoUri: detail.room.elderPhotoUri ?? r?.elderPhotoUri,
            members: serverMembers,
            createdAt: detail.room.createdAt ?? r?.createdAt ?? new Date().toISOString(),
          };
          if (isCurrentFamily()) await saveFamilyRoom(r);
        }
      } catch (e) {
        console.warn("[Family] getRoomDetail failed", e);
      }
    }
    // 对当前用户的头像和出生年份补充 fallback（无论从服务器还是本地加载）
    if (r?.members) {
      const up = await getUserProfile();
      const lp = await getProfile();
      const cgPhoto = up?.caregiverPhotoUri || lp?.caregiverPhotoUri || null;
      // caregiverBirthYear 是字符串 'YYYY'，转为数字
      const cgBirthYearStr = up?.caregiverBirthYear || lp?.caregiverBirthYear || null;
      const cgBirthYear = cgBirthYearStr ? parseInt(cgBirthYearStr, 10) : null;
      let needsServerSync = false;
      let needsBirthYearSync = false;
      r = {
        ...r,
        members: r.members.map((mem: any) => {
          // 匹配当前用户：通过 myMemberId 或 isCurrentUser 标记
          const isMe = String(mem.id) === String(myMemberId) || mem.isCurrentUser;
          if (isMe) {
            let updated = { ...mem };
            // 头像 fallback：服务器没有头像但本地有
            if (cgPhoto && (!mem.photoUri || mem.photoUri === '')) {
              needsServerSync = true;
              updated = { ...updated, photoUri: cgPhoto };
            }
            // birthYear fallback：服务器没有 birthYear 但本地有
            if (cgBirthYear && !isNaN(cgBirthYear) && !mem.birthYear) {
              needsBirthYearSync = true;
              updated = { ...updated, birthYear: cgBirthYear };
            }
            return updated;
          }
          return mem;
        }),
      };
      // 如果服务器端没有头像但本地有，自动同步到服务器
      if ((needsServerSync || needsBirthYearSync) && activeRoomId) {
        const { cloudUpdateMemberProfile } = await import('@/lib/cloud-sync');
        const syncData: any = { roomId: Number(activeRoomId) };
        if (needsServerSync && cgPhoto && !cgPhoto.startsWith('file://')) syncData.photoUri = cgPhoto;
        if (needsBirthYearSync && cgBirthYear) syncData.birthYear = cgBirthYear;
        cloudUpdateMemberProfile(syncData).catch(() => {});
      }
    }
    if (!isCurrentFamily()) return;
    setRoom(r);
    // 优先使用服务器返回的最新成员数据（包含最新名字），避免本地缓存名字过时
    const serverMe = r?.members?.find((mem: any) => mem.isCurrentUser || String(mem.id) === String(myMemberId));
    setCurrentMemberState(serverMe ?? m);
    // 只有服务器明确返回数组时才合并；网络失败为 null，必须保留本地缓存和待同步公告。
    const a: FamilyAnnouncement[] = Array.isArray(cloudAnns)
      ? await mergeCloudAnnouncementsIntoLocal(cloudAnns, requestedFamilyId)
      : localAnns;
    setAnnouncements(a);
    setIsCreator(creatorFlag);

    // Load briefing data — joiner 从云端拉取主照顾者的数据
    let todayCheckIn: any = null;
    let allCheckIns: DailyCheckIn[] = [];
    let diaryEntries: any[] = [];
    let profile: any = null;
    if (!creatorFlag) {
      // Joiner: pull from cloud
      const [cloudCIs, cloudDiaries, cloudProfile] = await Promise.all([
        cloudGetCheckIns(Number(requestedFamilyId)),
        cloudGetDiaries(Number(requestedFamilyId)),
        cloudGetElderProfile(Number(requestedFamilyId)).catch(() => null),
      ]);
      allCheckIns = Array.isArray(cloudCIs)
        ? await mergeCloudCheckInsIntoLocal(cloudCIs, requestedFamilyId)
        : await getAllCheckIns(requestedFamilyId);
      const todayDate = todayStr();
      todayCheckIn = allCheckIns.find((ci: any) => ci.date === todayDate) ?? null;
      diaryEntries = Array.isArray(cloudDiaries)
        ? await mergeCloudDiariesIntoLocal(cloudDiaries, requestedFamilyId)
        : await getDiaryEntries(requestedFamilyId);
      const scopedProfile = await getFamilyProfile(requestedFamilyId);
      profile = cloudProfile ?? scopedProfile ?? { nickname: requestedMembership.room.elderName };
    } else {
      // Creator: read local first, then sync from cloud in background
      const [localToday, localAll, localDiaries, localFp, localProfile] = await Promise.all([
        getTodayCheckIn(requestedFamilyId),
        getAllCheckIns(requestedFamilyId),
        getDiaryEntries(requestedFamilyId),
        getFamilyProfile(requestedFamilyId),
        getProfile(),
      ]);
      todayCheckIn = localToday;
      allCheckIns = localAll;
      diaryEntries = localDiaries;
      // 如果本地缓存为空（如退出登录后），立即从云端拉取数据
      if (allCheckIns.length === 0 && diaryEntries.length === 0) {
        try {
          const [cloudCIs, cloudDiaries] = await Promise.all([
            cloudGetCheckIns(Number(requestedFamilyId), 60),
            cloudGetDiaries(Number(requestedFamilyId), 100),
          ]);
          if (Array.isArray(cloudCIs)) {
            allCheckIns = await mergeCloudCheckInsIntoLocal(cloudCIs, requestedFamilyId);
            const todayDate = todayStr();
            todayCheckIn = allCheckIns.find((c: any) => c.date === todayDate) ?? null;
          }
          if (Array.isArray(cloudDiaries)) {
            diaryEntries = await mergeCloudDiariesIntoLocal(cloudDiaries, requestedFamilyId);
          }
        } catch (e) {
          console.warn('[Family] cloud fallback failed:', e);
        }
      }
      // Prefer FamilyProfile (family-scoped) for elder data; global legacy profile is safe only for a single-family account.
      profile = localFp
        ? {
            ...(allowLegacyProfileFallback ? localProfile : null),
            ...localFp,
            name: localFp.name || (allowLegacyProfileFallback ? localProfile?.name : undefined),
            nickname: localFp.nickname || (allowLegacyProfileFallback ? localProfile?.nickname : undefined),
          } as any
        : allowLegacyProfileFallback ? localProfile : null;
    }
    if (!isCurrentFamily()) return;
    const today = todayStr();
    setBriefingData({ checkIn: todayCheckIn, profile, todayAnnouncements: a.filter(ann => ann.date === today) });
    setElderNickname(profile?.nickname || profile?.name || r?.elderName || '家人');
    setElderEmoji(profile?.zodiacEmoji || '🐯');

    // 用与缓存首屏相同的纯函数重建最近三天，保持跨时区日期规则完全一致。
    const history = buildFamilyBriefingHistory(allCheckIns, diaryEntries, a);
    if (!isCurrentFamily()) return;
    setBriefingHistory(history);

    // Select the newest day that has any check-in data; otherwise show the first day.
    const latestWithData = history.find(item => item.checkIn) || history[0];
    if (latestWithData) setSelectedBriefingDate(latestWithData.date);

    if (!isCurrentFamily()) return;
    setLoading(false);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }

  async function handlePostAnnouncement() {
    const requestedFamilyId = familyId;
    const postingMember = activeMembership?.room.members.find(member => member.id === activeMembership.myMemberId) ?? currentMember;
    if (isPostingAnnouncement || !requestedFamilyId || !composeText.trim() || !postingMember) return;
    setIsPostingAnnouncement(true);
    Keyboard.dismiss();
    try {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newAnn = await saveFamilyAnnouncement({
        authorId: postingMember.id,
        authorName: postingMember.name,
        authorEmoji: postingMember.emoji,
        authorColor: postingMember.color,
        content: composeText.trim(),
        emoji: composeEmoji,
        type: composeType,
      }, requestedFamilyId);
      if (activeFamilyRef.current !== requestedFamilyId) return;
      setComposeText('');
      setComposeEmoji('');
      setComposeType('daily');
      setShowCompose(false);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (newAnn.syncPending) {
        Alert.alert('公告已保存在本机', '网络恢复后会自动同步给家人，公告卡片会暂时显示“待同步”。');
      }
      setNewAnnouncementId(newAnn.id);
      // NOTE: cloudPostAnnouncement is already called inside saveFamilyAnnouncement().
      // Do NOT call it again here — that would cause duplicate announcements and double push notifications.
      await loadData();
      // Scroll to top to show new announcement
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        setTimeout(() => setNewAnnouncementId(null), 2000);
      }, 300);
    } catch (error: any) {
      Alert.alert('公告没有发布成功', error?.message || '请检查网络后重试，输入内容仍为你保留。');
    } finally {
      setIsPostingAnnouncement(false);
    }
  }

  async function handleDeleteAnnouncement(id: string) {
    // Server-first: delete on server before removing locally；始终锁定当前页面所属家庭。
    const roomId = familyId;
    const numericRoomId = roomId ? parseInt(roomId) : null;
    const target = announcements.find(item => item.id === id);
    const numericAnnId = target?.serverAnnouncementId ?? (/^\d+$/.test(id) ? Number(id) : null);
    if (numericRoomId && numericAnnId) {
      const result = await cloudDeleteAnnouncement(numericAnnId, numericRoomId);
      if (!result?.success) {
        Alert.alert('删除失败', '无法连接服务器，公告仍然保留，请稍后重试。');
        return;
      }
    }
    // Server succeeded, or this was a never-synced local announcement.
    await deleteFamilyAnnouncement(id, roomId);
    if (roomId && numericAnnId) {
      await removeCachedAnnouncementComments(roomId, numericAnnId).catch(() => {});
    }
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    await loadData();
  }

  async function handleShareBriefing() {
    // Get the selected date's briefing item
    const selectedItem = briefingHistory.find(item => item.date === selectedBriefingDate);
    if (!selectedItem) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsGeneratingShare(true);
    try {
      // Wait a frame for the hidden card to render
      await new Promise(resolve => setTimeout(resolve, 300));
      if (Platform.OS === 'web') {
        // Web fallback: share text
        const date = new Date(selectedItem.date).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
        let text = `🌸 护理简报 · ${date}\n\n`;
        if (selectedItem.checkIn) {
          const moodLabel = selectedItem.checkIn.eveningDone && selectedItem.checkIn.moodScore != null
            ? (selectedItem.checkIn.moodScore >= 8 ? '良好' : selectedItem.checkIn.moodScore >= 6 ? '一般' : '较差')
            : '未记录';
          text += `💤 睡眠：${selectedItem.checkIn.morningDone && selectedItem.checkIn.sleepHours ? `${selectedItem.checkIn.sleepHours}小时` : '未记录'}\n`;
          text += `${selectedItem.checkIn.moodEmoji || '😊'} 心情：${moodLabel}\n`;
          text += `💊 用药：${selectedItem.checkIn.eveningDone && selectedItem.checkIn.medicationTaken != null ? (selectedItem.checkIn.medicationTaken ? '✅ 按时服药' : '⚠️ 未服药') : '未记录'}\n`;
        }
        if (selectedItem.diary) text += `📔 日记：${selectedItem.diary.content}\n\n`;
        if (selectedItem.announcements.length > 0) {
          text += `📢 家庭公告：\n`;
          selectedItem.announcements.forEach((a: FamilyAnnouncement) => { text += `${a.authorEmoji} ${a.authorName}：${a.content}\n`; });
        }
        text += `\n💕 小马虎`;
        await Share.share({ message: text, title: '护理简报' });
      } else {
        // Native: capture the hidden briefing card as image
        const uri = await captureRef(briefingCardRef, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
        });
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: '分享护理简报',
          });
        } else {
          Alert.alert('分享不可用', '请截图分享');
        }
      }
    } catch (e) {
      console.warn('Share error:', e);
      Alert.alert('分享失败', '请重试');
    } finally {
      setIsGeneratingShare(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <FamilySkeleton />
      </View>
    );
  }

  if (!room || !currentMember) {
    return (
      <ScreenContainer containerClassName="bg-background">
        <View style={{ paddingTop: insets.top + 20, flex: 1 }}>
          <FamilySetupScreen onSetupComplete={loadData} initialCode={params.joinCode} />
        </View>
      </ScreenContainer>
    );
  }

  const typeInfo = (type: FamilyAnnouncement['type']) =>
    ANNOUNCEMENT_TYPES.find(t => t.type === type) ?? ANNOUNCEMENT_TYPES[0];

  const todayAnnouncements = announcements.filter(a => a.date === todayStr());
  const olderAnnouncements = announcements.filter(a => a.date !== todayStr());
  const targetAnnouncementId = params.openComments === '1' && params.announcementId
    ? Number(params.announcementId)
    : null;
  const visibleOlderAnnouncements = (() => {
    const visible = olderAnnouncements.slice(0, 10);
    if (!targetAnnouncementId) return visible;
    const target = olderAnnouncements.find(announcement =>
      Number(announcement.serverAnnouncementId ?? announcement.id) === targetAnnouncementId
    );
    return target && !visible.some(announcement => announcement.id === target.id)
      ? [...visible, target]
      : visible;
  })();
  const handleAnnouncementLayout = (announcement: FamilyAnnouncement, y: number) => {
    const serverId = Number(announcement.serverAnnouncementId ?? announcement.id);
    if (!Number.isFinite(serverId)) return;
    const targetKey = `${familyId ?? ''}:${serverId}:${params.refresh ?? ''}`;
    if (
      params.openComments === '1'
      && serverId === targetAnnouncementId
      && handledAnnouncementTargetRef.current !== targetKey
    ) {
      handledAnnouncementTargetRef.current = targetKey;
      setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }), 380);
    }
  };
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>

      {/* ── Header (与用药记录/日记保持一致风格) ── */}
      <View style={[styles.pageHeaderWrap, { paddingTop: insets.top + 8 }]}>
        <PageHeader
          theme={PAGE_THEMES.family}
          subtitle={`${room.elderName} 的家庭空间`}
          right={
            <TouchableOpacity onPress={() => setShowInviteModal(true)} activeOpacity={0.8} style={styles.heroCodeWrap}>
              <Text style={styles.heroCodeLabel}>邀请码</Text>
              <View style={styles.heroCodePill}>
                <Text style={styles.heroCodeIcon}>🔗</Text>
                <Text style={styles.heroCodeText}>{room.roomCode}</Text>
              </View>
            </TouchableOpacity>
          }
        />
      </View>

      {/* ── Members row ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.membersScroll} contentContainerStyle={styles.membersContent}>
        {room.members.map(m => (
          <MemberAvatarChip
            key={m.id}
            member={m}
            isCurrentUser={currentMember?.id === m.id}
            onPress={() => {
              if (currentMember && currentMember.id === m.id) {
                router.push('/profile' as any);
              }
            }}
          />
        ))}
        <TouchableOpacity style={styles.addMemberChip} onPress={() => setShowInviteModal(true)}>
          <View style={styles.addMemberBtn}>
            <Text style={styles.addMemberBtnText}>＋</Text>
          </View>
          <Text style={styles.memberName}>邀请</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Section tabs */}
      <View style={styles.sectionTabs}>
        <TouchableOpacity
          style={[styles.sectionTab, activeSection === 'broadcast' && styles.sectionTabActive]}
          onPress={() => setActiveSection('broadcast')}
          activeOpacity={0.85}
        >
          {activeSection === 'broadcast' ? (
            <LinearGradient colors={[Gradients.navActive[0], Gradients.navActive[1], '#B8426A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sectionTabGradient}>
              <Text style={styles.sectionTabTextActive}>📢 公告</Text>
            </LinearGradient>
          ) : (
            <Text style={styles.sectionTabText}>📢 公告</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sectionTab, activeSection === 'briefing' && styles.sectionTabActive]}
          onPress={() => setActiveSection('briefing')}
          activeOpacity={0.85}
        >
          {activeSection === 'briefing' ? (
            <LinearGradient colors={[Gradients.navActive[0], Gradients.navActive[1], '#B8426A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sectionTabGradient}>
              <Text style={styles.sectionTabTextActive}>📋 简报</Text>
            </LinearGradient>
          ) : (
            <Text style={styles.sectionTabText}>📋 简报</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        ref={scrollRef}
        onLayout={handleCommentScrollLayout}
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Math.max(120, insets.bottom + 110) }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#B07858" colors={['#B07858']} />}
      >

        {/* ── BROADCAST SECTION ── */}
        {activeSection === 'broadcast' && (
          <View style={styles.section}>
            {/* Today's announcements */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>今日公告</Text>
              <Text style={styles.sectionCount}>{todayAnnouncements.length} 条</Text>
            </View>

            {todayAnnouncements.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>📭</Text>
                <Text style={styles.emptyText}>今天还没有公告</Text>
                <Text style={styles.emptySubText}>点击下方按钮发布第一条公告吧！</Text>
              </View>
            ) : (
              todayAnnouncements.map(ann => (
                <AnnouncementCard
                  key={ann.id}
                  ann={ann}
                  typeInfo={typeInfo(ann.type)}
                  isOwn={ann.authorId === currentMember.id}
                  onDelete={() => handleDeleteAnnouncement(ann.id)}
                  isNew={ann.id === newAnnouncementId}
                  currentMember={currentMember}
                  roomId={familyId ? Number(familyId) : null}
                  forceOpenComments={targetAnnouncementId === Number(ann.serverAnnouncementId ?? ann.id)}
                  onLayoutY={(y) => handleAnnouncementLayout(ann, y)}
                  onCommentInputFocus={revealCommentInput}
                  onCommentInputBlur={handleCommentInputBlur}
                  onReactionToggle={async (emoji) => {
                    if (!currentMember) return;
                    // Server-first: toggle reaction on server, then refresh from cloud
                    const numericAnnId = ann.serverAnnouncementId ?? (/^\d+$/.test(String(ann.id)) ? Number(ann.id) : null);
                    const numericRoomId = familyId ? parseInt(familyId) : undefined;
                    if (!numericAnnId) {
                      Alert.alert('公告正在同步', '请稍后再添加表情回应。');
                      return;
                    }
                    const result = await cloudToggleReaction(numericAnnId, emoji, numericRoomId);
                    if (result === null) {
                      Alert.alert('操作失败', '无法同步表情，请稍后重试');
                      return;
                    }
                    // User-triggered mutation must bypass the short tab-focus refresh throttle.
                    await loadData(true);
                  }}
                />
              ))
            )}

            {/* Older announcements */}
            {olderAnnouncements.length > 0 && (
              <>
                <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                  <Text style={styles.sectionTitle}>历史公告</Text>
                </View>
                {visibleOlderAnnouncements.map(ann => (
                  <AnnouncementCard
                    key={ann.id}
                    ann={ann}
                    typeInfo={typeInfo(ann.type)}
                    isOwn={ann.authorId === currentMember.id}
                    onDelete={() => handleDeleteAnnouncement(ann.id)}
                    currentMember={currentMember}
                    roomId={familyId ? Number(familyId) : null}
                    forceOpenComments={targetAnnouncementId === Number(ann.serverAnnouncementId ?? ann.id)}
                    onLayoutY={(y) => handleAnnouncementLayout(ann, y)}
                    onCommentInputFocus={revealCommentInput}
                    onCommentInputBlur={handleCommentInputBlur}
                    onReactionToggle={async (emoji) => {
                      if (!currentMember) return;
                      // Server-first: toggle reaction on server, then refresh from cloud
                      const numericAnnId = ann.serverAnnouncementId ?? parseInt(String(ann.id));
                      const numericRoomId = familyId ? parseInt(familyId) : undefined;
                      if (!isNaN(numericAnnId)) {
                        const result = await cloudToggleReaction(numericAnnId, emoji, numericRoomId);
                        if (result === null) {
                          Alert.alert('操作失败', '无法同步表情，请稍后重试');
                          return;
                        }
                      }
                      // Reload from cloud so both creator and joiner see updated reactions
                      await loadData();
                    }}
                  />
                ))}
              </>
            )}
          </View>
        )}

        {/* ── BRIEFING SECTION ── */}
        {activeSection === 'briefing' && (
          <View style={styles.section}>
            {/* Date tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.briefingDateScroll}
              contentContainerStyle={styles.briefingDateScrollContent}
            >
              {briefingHistory.map(item => (
                <TouchableOpacity
                  key={item.date}
                  style={[
                    styles.briefingDateTab,
                    selectedBriefingDate === item.date && styles.briefingDateTabActive,
                  ]}
                  onPress={() => setSelectedBriefingDate(item.date)}
                >
                  <Text style={[
                    styles.briefingDateTabText,
                    selectedBriefingDate === item.date && styles.briefingDateTabTextActive,
                  ]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Selected date briefing card */}
            {briefingHistory.filter(item => item.date === selectedBriefingDate).map(item => {
              const isToday = item.date === todayStr();
              return (
              <View key={item.date} style={styles.briefingCard}>
                {/* ── Card Header ── */}
                <View style={styles.briefingCardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <Image
                      source={require('../../assets/images/icon.png')}
                      style={{ width: 28, height: 28, borderRadius: 6, overflow: 'hidden' }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.briefingAppName}>小马虎 · 护理简报</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Text style={styles.briefingCardDate}>
                          {isToday
                            ? new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
                            : (() => {
                                const [year, month, day] = item.date.split('-').map(Number);
                                return new Date(year, month - 1, day, 12).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
                              })()}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                {item.checkIn ? (
                  <>
                    {/* ── Elder + Score ── */}
                    <View style={styles.briefingElderRow}>
                      <View>
                        <Text style={styles.briefingElderName}>{elderNickname}</Text>
                        <Text style={styles.briefingElderSub}>{item.label}护理记录</Text>
                      </View>
                    </View>

                    {/* ── Data Grid ── */}
                    <View style={styles.briefingDataGrid}>
                      <View style={styles.briefingDataBadge}>
                        <Text style={styles.briefingDataEmoji}>😴</Text>
                        <Text style={styles.briefingDataValue}>
                          {item.checkIn.morningDone && item.checkIn.sleepHours != null
                            ? `${item.checkIn.sleepHours}h`
                            : '未记录'}
                        </Text>
                        <Text style={styles.briefingDataLabel}>睡眠</Text>
                      </View>
                      <View style={styles.briefingDataBadge}>
                        <Text style={styles.briefingDataEmoji}>
                          {item.checkIn.eveningDone ? (item.checkIn.moodEmoji || '😊') : '—'}
                        </Text>
                        <Text style={styles.briefingDataValue}>{item.checkIn.eveningDone ? '已记录' : '未记录'}</Text>
                        <Text style={styles.briefingDataLabel}>心情</Text>
                      </View>
                      <View style={styles.briefingDataBadge}>
                        <Text style={styles.briefingDataEmoji}>💊</Text>
                        <Text style={styles.briefingDataValue}>{item.checkIn.eveningDone && item.checkIn.medicationTaken != null ? (item.checkIn.medicationTaken ? '✅' : '❌') : '未记录'}</Text>
                        <Text style={styles.briefingDataLabel}>用药</Text>
                      </View>
                      <View style={styles.briefingDataBadge}>
                        <Text style={styles.briefingDataEmoji}>🍽️</Text>
                        <Text style={styles.briefingDataValue} numberOfLines={1}>{item.checkIn.eveningDone ? (item.checkIn.mealNotes ? item.checkIn.mealNotes.slice(0,4) : '已记') : '未记录'}</Text>
                        <Text style={styles.briefingDataLabel}>饮食</Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.briefingEmpty}>
                    <Text style={styles.emptyEmoji}>🌙</Text>
                    <Text style={styles.emptyText}>{item.label}尚无打卡记录</Text>
                    <Text style={styles.emptySubText}>
                      {isCreator
                        ? (isToday ? '完成打卡后，这里会自动显示护理简报' : '这一天没有保存早间或晚间打卡')
                        : '主照顾者完成打卡后，这里会自动更新'}
                    </Text>
                    {isToday && isCreator && (
                      <TouchableOpacity style={styles.goCheckinBtn} onPress={() => router.push('/(tabs)/checkin')}>
                        <Text style={styles.goCheckinBtnText}>去打卡 →</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* ── Diary & Announcements ── */}
                {item.diary && (
                  <View style={styles.briefingExtraRow}>
                    <Text style={styles.briefingExtraIcon}>📔</Text>
                    <Text style={styles.briefingExtraText} numberOfLines={2}>
                      {item.diary.moodEmoji} {item.diary.content || '无详细内容'}
                    </Text>
                  </View>
                )}
                {item.announcements.length > 0 && (
                  <View style={styles.briefingExtraRow}>
                    <Text style={styles.briefingExtraIcon}>📢</Text>
                    <Text style={styles.briefingExtraText} numberOfLines={2}>
                      {item.announcements.map((ann: any) => `${ann.authorEmoji} ${ann.content}`).join('  ')}
                    </Text>
                  </View>
                )}

                {/* ── Footer ── */}
                <View style={styles.briefingCardFooter}>
                  <Text style={styles.briefingFooterLeft}>记录人：{briefingData?.profile?.caregiverName || '照顾者'}</Text>
                  <Text style={styles.briefingFooterRight}>小马虎</Text>
                </View>

                {/* ── Actions ── */}
                {item.checkIn && (
                  <View style={styles.briefingActions}>
                    <TouchableOpacity style={styles.exportBtn} onPress={() => router.push(({ pathname: '/share', params: { date: item.date } }) as any)}>
                      <Text style={styles.exportBtnText}>📋 查看简报</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.shareBtn, isGeneratingShare && { opacity: 0.6 }]} onPress={handleShareBriefing} disabled={isGeneratingShare}>
                      <Text style={styles.shareBtnText}>{isGeneratingShare ? '⏳ 生成中...' : '📤 一键分享'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Compose FAB — round circle, bottom-right, anyone can post */}
      {activeSection === 'broadcast' && !keyboardVisible && !commentInputFocused && (
        <Animated.View style={[styles.fabWrap, { bottom: insets.bottom + 16, transform: [{ scale: fabBreath }] }]}>
          <TouchableOpacity
            style={styles.fabBtn}
            onPress={() => setShowCompose(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.fabIcon}>📢</Text>
            <Text style={styles.fabLabel}>发布公告</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Compose Modal */}
      <Modal visible={showCompose} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !isPostingAnnouncement && setShowCompose(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.modal}>
          {/* Cancel button top-left */}
          <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowCompose(false)} disabled={isPostingAnnouncement}>
            <Text style={styles.modalCancel}>取消</Text>
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={styles.composeScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          >
          {/* Author info — centered */}
          <View style={styles.composeAuthorCenter}>
            <View style={[styles.composeAvatarLarge, { backgroundColor: currentMember.color + '20', borderColor: currentMember.color }]}>
              <Text style={styles.composeAvatarLargeText}>{currentMember.emoji}</Text>
            </View>
            <Text style={styles.composeAuthorName}>{currentMember.name}</Text>
            <Text style={styles.composeAuthorRole}>{currentMember.roleLabel}</Text>
          </View>

          {/* Type selector — centered */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll} contentContainerStyle={styles.typeScrollContentCenter}>
            {ANNOUNCEMENT_TYPES.map(t => (
              <TouchableOpacity
                key={t.type}
                style={[styles.typeChip, composeType === t.type && { backgroundColor: t.color + '20', borderColor: t.color }]}
                onPress={() => setComposeType(t.type)}
              >
                <Text style={styles.typeChipEmoji}>{t.emoji}</Text>
                <Text style={[styles.typeChipLabel, composeType === t.type && { color: t.color, fontWeight: '700' }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Text input — full width with blue border */}
          <TextInput
            style={styles.composeInput}
            placeholder="分享今天的家庭动态、探望消息、医疗信息..."
            value={composeText}
            onChangeText={setComposeText}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            placeholderTextColor={AppColors.text.tertiary}
            returnKeyType="default"
            submitBehavior="newline"
            blurOnSubmit={false}
            autoFocus
          />

          {/* Emoji decoration */}
          <View style={styles.emojiDecRow}>
            {['🌸', '❤️', '🎉', '🙏', '💪', '🌟', '🍀', '🌈'].map(e => (
              <TouchableOpacity
                key={e}
                style={[styles.emojiDecBtn, composeEmoji === e && styles.emojiDecBtnSelected]}
                onPress={() => setComposeEmoji(composeEmoji === e ? '' : e)}
              >
                <Text style={styles.emojiDecText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Publish button -- bottom of modal */}
          <TouchableOpacity
            style={[styles.modalPublishBtn, (!composeText.trim() || isPostingAnnouncement) && { opacity: 0.4 }]}
            onPress={handlePostAnnouncement}
            disabled={!composeText.trim() || isPostingAnnouncement}
            activeOpacity={0.85}
          >
            <Text style={styles.modalPublishBtnText}>{isPostingAnnouncement ? '正在发布…' : '📢 发布公告'}</Text>
          </TouchableOpacity>
          </ScrollView>
        </View>
        </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* Hidden briefing card for screenshot capture */}
      {(() => {
        const selectedItem = briefingHistory.find(item => item.date === selectedBriefingDate);
        if (!selectedItem) return null;
        const profile = briefingData?.profile;
        const dateLabel = new Date(selectedItem.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        return (
          <View
            ref={briefingCardRef}
            collapsable={false}
            style={{
              position: 'absolute',
              left: -9999,
              top: 0,
              width: 375,
              backgroundColor: AppColors.bg.warmCream,
              padding: 24,
            }}
          >
            {/* Header */}
            <View style={{ backgroundColor: AppColors.coral.primary, borderRadius: 20, padding: 20, marginBottom: 16, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Image source={require('../../assets/images/icon.png')} style={{ width: 24, height: 24, borderRadius: 5 }} />
                <Text style={{ fontSize: 16, fontWeight: '800', color: AppColors.surface.whiteStrong }}>小马虎 · 护理简报</Text>
              </View>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{dateLabel}</Text>
              {profile && (
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
                  {profile.nickname || profile.name || '家人'} 的护理记录
                </Text>
              )}
            </View>

            {/* Check-in data */}
            {selectedItem.checkIn ? (
              <View style={{ backgroundColor: AppColors.surface.whiteStrong, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: AppColors.coral.soft }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: AppColors.text.primary, marginBottom: 12 }}>📋 今日打卡</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 140, backgroundColor: AppColors.coral.soft, borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontSize: 12, color: AppColors.text.tertiary, marginBottom: 2 }}>💤 睡眠</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: AppColors.text.primary }}>{selectedItem.checkIn.sleepHours} 小时</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 140, backgroundColor: AppColors.coral.soft, borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontSize: 12, color: AppColors.text.tertiary, marginBottom: 2 }}>{selectedItem.checkIn.moodEmoji} 心情</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: AppColors.text.primary }}>{selectedItem.checkIn.moodScore} / 10</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 140, backgroundColor: AppColors.coral.soft, borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontSize: 12, color: AppColors.text.tertiary, marginBottom: 2 }}>💊 用药</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: selectedItem.checkIn.medicationTaken ? '#16A34A' : '#DC2626' }}>
                      {selectedItem.checkIn.medicationTaken ? '✅ 按时' : '⚠️ 未服'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={{ backgroundColor: AppColors.surface.whiteStrong, borderRadius: 16, padding: 16, marginBottom: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: AppColors.text.tertiary }}>📝 当日暂无打卡记录</Text>
              </View>
            )}

            {/* Diary */}
            {selectedItem.diary && (
              <View style={{ backgroundColor: AppColors.surface.whiteStrong, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#FEF0F4' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: AppColors.text.primary, marginBottom: 8 }}>📔 护理日记</Text>
                <Text style={{ fontSize: 13, color: AppColors.text.secondary, lineHeight: 20 }}>
                  {selectedItem.diary.moodEmoji ? selectedItem.diary.moodEmoji + ' ' : ''}{selectedItem.diary.content || '无内容'}
                </Text>
              </View>
            )}

            {/* Announcements */}
            {selectedItem.announcements.length > 0 && (
              <View style={{ backgroundColor: AppColors.surface.whiteStrong, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: AppColors.green.soft }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: AppColors.text.primary, marginBottom: 8 }}>📢 家庭公告</Text>
                {selectedItem.announcements.map((ann: any, idx: number) => (
                  <View key={idx} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 14 }}>{ann.authorEmoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: AppColors.text.tertiary, marginBottom: 2 }}>{ann.authorName}</Text>
                      <Text style={{ fontSize: 13, color: AppColors.text.primary }}>{ann.content}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Footer */}
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <Text style={{ fontSize: 12, color: AppColors.text.tertiary }}>💕 由小马虎护理助手生成</Text>
            </View>
          </View>
        );
      })()}

      {/* ── 邀请家人 Modal ── */}
      <Modal
        visible={showInviteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <TouchableOpacity
          style={styles.inviteOverlay}
          activeOpacity={1}
          onPress={() => setShowInviteModal(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}} style={styles.inviteCard}>
            <Text style={styles.inviteTitle}>👨‍👩‍👧 邀请家人加入</Text>
            <Text style={styles.inviteDesc}>点击邀请码复制，或发送链接让家人直接加入</Text>

            {/* 邀请码—点击复制 */}
            <TouchableOpacity
              style={styles.inviteCodeBox}
              activeOpacity={0.7}
              onPress={() => {
                Clipboard.setString(room.roomCode);
                if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setCodeCopied(true);
                setTimeout(() => setCodeCopied(false), 2000);
              }}
            >
              <Text style={styles.inviteCode} numberOfLines={1} adjustsFontSizeToFit>{room.roomCode}</Text>
              <Text style={styles.inviteCopyHint}>{codeCopied ? '✅ 已复制' : '点击复制'}</Text>
            </TouchableOpacity>

            {/* 分享链接按鈕 */}
            <TouchableOpacity
              style={styles.inviteShareBtn}
              activeOpacity={0.85}
              onPress={() => {
                const text = `🐾 我在用「小马虎」记录${room.elderName}的护理日常，邀请你加入！\n\n邀请码：${room.roomCode}\n链接：https://xtdtinthemorning.cn/join?code=${room.roomCode}`;
                Clipboard.setString(text );
                if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                alert('已复制！去微信粘贴发给家人即可 🎉');
              }}
            >
              <Text style={styles.inviteShareBtnText}>📋 复制邀请链接</Text>
            </TouchableOpacity>

            <Text style={styles.inviteHint}>家人点链接后打开小马虎，输入名字即可自动加入</Text>
            <TouchableOpacity style={styles.inviteCloseBtn} onPress={() => setShowInviteModal(false)}>
              <Text style={styles.inviteCloseBtnText}>关闭</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </Animated.View>
    </KeyboardAvoidingView>
  );
}

// ─── Announcement Card ────────────────────────────────────────────────────────

const REACTION_EMOJIS = ['👍', '❤️', '👏', '🙏', '😢', '✨'];

function AnnouncementCard({
  ann, typeInfo, isOwn, onDelete, isNew, currentMember, roomId,
  forceOpenComments, onLayoutY, onCommentInputFocus, onCommentInputBlur, onReactionToggle,
}: {
  ann: FamilyAnnouncement;
  typeInfo: typeof ANNOUNCEMENT_TYPES[0];
  isOwn: boolean;
  onDelete: () => void;
  isNew?: boolean;
  currentMember?: FamilyMember;
  roomId: number | null;
  forceOpenComments?: boolean;
  onLayoutY?: (y: number) => void;
  onCommentInputFocus?: (nativeHandle: number | null) => void;
  onCommentInputBlur?: () => void;
  onReactionToggle?: (emoji: string) => Promise<void>;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [showReactorsFor, setShowReactorsFor] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const deleteTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcementId = ann.serverAnnouncementId
    ?? (/^\d+$/.test(String(ann.id)) ? Number(ann.id) : null);

  useEffect(() => {
    if (forceOpenComments && roomId && announcementId) {
      setCommentsOpen(true);
      setShowPicker(false);
      setShowReactorsFor(null);
    }
  }, [announcementId, forceOpenComments, roomId]);

  useEffect(() => () => {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
  }, []);

  function handleDeletePress() {
    if (deleteConfirm) {
      // 第二次点击 → 真正删除
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
      setDeleteConfirm(false);
      onDelete();
    } else {
      // 第一次点击 → 进入确认态，3秒后自动取消
      setDeleteConfirm(true);
      deleteTimerRef.current = setTimeout(() => setDeleteConfirm(false), 3000);
    }
  }

  // 优先使用 localTimeStr（发布者本地时间），避免服务端时区导致的时间偏差
  // fallback 到 createdAt（兼容旧公告）
  let time: string;
  if ((ann as any).localTimeStr) {
    time = (ann as any).localTimeStr;
  } else {
    const _annDate = new Date(String(ann.createdAt));
    time = isNaN(_annDate.getTime())
      ? '--:--'
      : `${String(_annDate.getHours()).padStart(2, '0')}:${String(_annDate.getMinutes()).padStart(2, '0')}`;
  }
  // ann.date 是发布者设备保存的日历日期，不能用 new Date('YYYY-MM-DD') 按 UTC 解析。
  const dateMatch = ann.date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const currentYear = String(new Date().getFullYear());
  const date = dateMatch
    ? `${dateMatch[1] === currentYear ? '' : `${dateMatch[1]}/`}${Number(dateMatch[2])}/${Number(dateMatch[3])} `
    : `${ann.date || ''}${ann.date ? ' ' : ''}`;

  const reactions = ann.reactions ?? [];
  const myId = currentMember?.id ?? '';

  async function handleReact(emoji: string) {
    if (!onReactionToggle) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPicker(false);
    setShowReactorsFor(null);
    await onReactionToggle(emoji);
  }

  return (
    <View
      style={[card.container, isNew && card.containerNew]}
      onLayout={event => onLayoutY?.(event.nativeEvent.layout.y)}
    >
      <View style={[card.colorStrip, { backgroundColor: typeInfo.color }]} />
      <View style={card.cardInner}>
        <View style={[card.typeBadge, { backgroundColor: typeInfo.color + '22' }]}>
          <Text style={card.typeEmoji}>{typeInfo.emoji}</Text>
        </View>
        <View style={card.body}>
          <View style={card.authorRow}>
            <Text style={card.authorEmoji}>{ann.authorEmoji}</Text>
            <Text style={[card.authorName, { color: ann.authorColor }]}>{ann.authorName}</Text>
            <Text style={card.roleLabel}>{typeInfo.label}</Text>
            <Text style={card.time}>{date}{time}{ann.syncPending ? ' · 待同步' : ''}</Text>
          </View>
          <Text style={card.content}>
            {ann.emoji ? ann.emoji + ' ' : ''}{ann.content}
          </Text>

          {/* ── Reactions row ── */}
          <View style={card.reactionsRow}>
            {reactions.map(r => {
              const iMine = r.members.some(m => m.memberId === myId);
              return (
                <TouchableOpacity
                  key={r.emoji}
                  style={[card.reactionPill, iMine && card.reactionPillMine]}
                  onPress={() => setShowReactorsFor(showReactorsFor === r.emoji ? null : r.emoji)}
                  activeOpacity={0.75}
                >
                  <Text style={card.reactionEmoji}>{r.emoji}</Text>
                  <Text style={[card.reactionCount, iMine && card.reactionCountMine]}>{r.members.length}</Text>
                </TouchableOpacity>
              );
            })}
            {/* "+ 反应" button */}
            <TouchableOpacity
              style={card.addReactionBtn}
              onPress={() => { setShowPicker(p => !p); setShowReactorsFor(null); }}
              activeOpacity={0.75}
            >
              <Text style={card.addReactionText}>{showPicker ? '✕' : '＋'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[card.commentToggleBtn, commentsOpen && card.commentToggleBtnActive]}
              onPress={() => {
                if (!roomId || !announcementId) {
                  Alert.alert('公告正在同步', '公告同步完成后就可以写评论了。');
                  return;
                }
                if (commentsOpen) Keyboard.dismiss();
                setCommentsOpen(open => !open);
                setShowPicker(false);
                setShowReactorsFor(null);
              }}
              activeOpacity={0.75}
            >
              <Text style={[card.commentToggleText, commentsOpen && card.commentToggleTextActive]}>
                💬 {commentsOpen ? '收起' : '评论'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Emoji picker ── */}
          {showPicker && (
            <View style={card.pickerRow}>
              {REACTION_EMOJIS.map(e => {
                const alreadyMine = reactions.find(r => r.emoji === e)?.members.some(m => m.memberId === myId);
                return (
                  <TouchableOpacity
                    key={e}
                    style={[card.pickerBtn, alreadyMine && card.pickerBtnActive]}
                    onPress={() => handleReact(e)}
                    activeOpacity={0.7}
                  >
                    <Text style={card.pickerEmoji}>{e}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ── Reactors list (who reacted) ── */}
          {showReactorsFor && (() => {
            const group = reactions.find(r => r.emoji === showReactorsFor);
            if (!group) return null;
            return (
              <View style={card.reactorsList}>
                <Text style={card.reactorsTitle}>{group.emoji} 的成员</Text>
                {group.members.map(m => (
                  <View key={m.memberId} style={card.reactorRow}>
                    <Text style={card.reactorEmoji}>{m.memberEmoji}</Text>
                    <Text style={card.reactorName}>{m.memberName}</Text>
                    {m.memberId === myId && <Text style={card.reactorMe}>（我）</Text>}
                  </View>
                ))}
              </View>
            );
          })()}

          {commentsOpen && roomId && announcementId ? (
            <AnnouncementComments
              announcementId={announcementId}
              roomId={roomId}
              announcementAuthorName={ann.authorName}
              onInputFocus={onCommentInputFocus}
              onInputBlur={onCommentInputBlur}
            />
          ) : null}
        </View>
        {isOwn && (
          <TouchableOpacity
            onPress={handleDeletePress}
            style={[card.deleteBtn, deleteConfirm && card.deleteBtnConfirm]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[card.deleteText, deleteConfirm && card.deleteTextConfirm]}>
              {deleteConfirm ? '确认删除?' : '🗑'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F1F3' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 18, color: AppColors.text.secondary },

  // ── Header (与用药记录/日记保持一致) ──
  pageHeaderWrap: { paddingHorizontal: 20, paddingBottom: 4, backgroundColor: '#F7F1F3' },

  // ── 邀请码徽章 ──
  heroCodeWrap: { alignItems: 'flex-end', gap: 3 },
  heroCodeLabel: { fontSize: 10, fontWeight: '600', color: '#B8426A', opacity: 0.6, letterSpacing: 0.3 },
  heroCodePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FEF0F4', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1.5, borderColor: '#EDAABB' + '60',
  },
  heroCodeIcon: { fontSize: 13 },
  heroCodeText: { fontSize: 14, fontWeight: '900', color: '#B8426A', letterSpacing: 1.5 },

  // ── Members ──
  membersScroll: { maxHeight: 116 },
  membersContent: { paddingHorizontal: 20, gap: 14, paddingVertical: 8 },
  memberChip: { alignItems: 'center', gap: 5, width: 62 },
  memberAvatar: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, overflow: 'hidden', position: 'relative' },
  memberAvatarText: { fontSize: 28 },
  memberAvatarImg: { width: 56, height: 56, borderRadius: 20 },
  memberAvatarEdit: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.42)', paddingVertical: 2, alignItems: 'center',
  },
  memberName: { fontSize: 11, fontWeight: '700', color: AppColors.text.primary, textAlign: 'center' },
  memberRole: { fontSize: 10, color: '#EDAABB', textAlign: 'center', fontWeight: '600', opacity: 0.8 },
  addMemberChip: { alignItems: 'center', gap: 5, width: 62 },
  addMemberBtn: {
    width: 56, height: 56, borderRadius: 20,
    backgroundColor: '#FEF0F4',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#EDAABB', borderStyle: 'dashed',
  },
  addMemberBtnText: { fontSize: 22, color: '#B8426A' },

  sectionTabs: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 10, backgroundColor: '#FEF0F4', borderRadius: 18, padding: 5, gap: 4 },
  sectionTab: { flex: 1, alignItems: 'center', borderRadius: 14, overflow: 'hidden' },
  sectionTabActive: {},
  sectionTabGradient: { width: '100%', paddingVertical: 11, alignItems: 'center', borderRadius: 14 },
  sectionTabText: { fontSize: 14, fontWeight: '600', color: '#B8426A', paddingVertical: 11 },
  sectionTabTextActive: { fontSize: 14, fontWeight: '700', color: AppColors.surface.whiteStrong },
  content: { flex: 1 },
  section: { paddingHorizontal: 20, paddingTop: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: AppColors.text.primary },
  sectionCount: { fontSize: 13, color: AppColors.text.secondary, backgroundColor: AppColors.bg.secondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  emptyCard: { alignItems: 'center', padding: 36, backgroundColor: '#FEF0F4', borderRadius: 24, gap: 8, borderWidth: 1.5, borderColor: '#EDAABB' },
  emptyEmoji: { fontSize: 44 },
  emptyText: { fontSize: 16, fontWeight: '800', color: '#B8426A' },
  emptySubText: { fontSize: 13, color: '#C8607A', textAlign: 'center', lineHeight: 20 },
  briefingCard: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 24, padding: 20, marginBottom: 16,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 5,
    borderWidth: 1, borderColor: AppColors.border.soft,
  },
  briefingCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  briefingAppName: { fontSize: 13, fontWeight: '800', color: AppColors.green.muted, letterSpacing: -0.2 },
  briefingCardDate: { fontSize: 12, color: AppColors.text.tertiary, marginTop: 2 },
  latestBadge: { backgroundColor: AppColors.peach.soft, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  latestBadgeText: { fontSize: 10, fontWeight: '700', color: AppColors.peach.primary },
  briefingElderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  briefingElderName: { fontSize: 18, fontWeight: '800', color: AppColors.text.primary },
  briefingElderSub: { fontSize: 12, color: AppColors.text.tertiary, marginTop: 2 },
  scoreCircle: {
    width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 3,
  },
  scoreNum: { fontSize: 22, fontWeight: '900' },
  scoreUnit: { fontSize: 10, fontWeight: '700', marginTop: -2 },
  scoreLabel: { fontSize: 9, fontWeight: '600', marginTop: 1 },
  briefingDataGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  briefingDataBadge: { flex: 1, backgroundColor: AppColors.bg.secondary, borderRadius: 14, padding: 10, alignItems: 'center', gap: 3 },
  briefingDataEmoji: { fontSize: 18 },
  briefingDataValue: { fontSize: 12, fontWeight: '800', color: AppColors.text.primary },
  briefingDataLabel: { fontSize: 10, color: AppColors.text.tertiary, fontWeight: '500' },
  briefingExtraRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: 1, borderTopColor: AppColors.border.light },
  briefingExtraIcon: { fontSize: 14, marginTop: 1 },
  briefingExtraText: { flex: 1, fontSize: 13, color: AppColors.text.secondary, lineHeight: 20 },
  briefingCardFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: AppColors.bg.secondary, paddingTop: 12, marginTop: 12, marginBottom: 14 },
  briefingFooterLeft: { fontSize: 11, color: AppColors.text.tertiary },
  briefingFooterRight: { fontSize: 11, color: AppColors.green.muted, fontWeight: '600' },
  briefingTitle: { fontSize: 18, fontWeight: '800', color: AppColors.text.primary, marginBottom: 4 },
  briefingSubtitle: { fontSize: 13, color: AppColors.text.secondary, lineHeight: 20, marginBottom: 16 },
  briefingPreview: { backgroundColor: AppColors.bg.warmCream, borderRadius: 16, padding: 16, gap: 10, marginBottom: 16 },
  briefingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  briefingLabel: { fontSize: 14, color: AppColors.text.secondary },
  briefingValue: { fontSize: 14, fontWeight: '600', color: AppColors.text.primary },
  briefingDiaryRow: { gap: 4 },
  briefingDiaryText: { fontSize: 13, color: AppColors.text.secondary, lineHeight: 20 },
  briefingEmpty: { alignItems: 'center', padding: 24, gap: 8 },
  briefingActions: { flexDirection: 'row', gap: 12 },
  shareBtn: { flex: 1, backgroundColor: '#B8426A', borderRadius: 16, padding: 14, alignItems: 'center', shadowColor: '#B8426A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  shareBtnText: { fontSize: 14, fontWeight: '700', color: AppColors.surface.whiteStrong },
  exportBtn: { flex: 1, backgroundColor: '#FEF0F4', borderRadius: 16, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#EDAABB' },
  exportBtnText: { fontSize: 14, fontWeight: '700', color: '#B8426A' },
  goCheckinBtn: { backgroundColor: '#B8426A', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  goCheckinBtnText: { fontSize: 14, fontWeight: '700', color: AppColors.surface.whiteStrong },
  fabWrap: { position: 'absolute', right: 20 },
  fabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 30,
    backgroundColor: '#B8426A',
    shadowColor: '#B8426A', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  fabIcon: { fontSize: 22 },
  fabLabel: { fontSize: 15, fontWeight: '700', color: '#fff', letterSpacing: 0.2 },
  modal: { flex: 1, backgroundColor: AppColors.bg.warmCream, paddingHorizontal: 20, paddingTop: 16 },
  modalCancelBtn: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 12, marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalCancel: { fontSize: 16, color: AppColors.text.secondary },
  modalTitle: { fontSize: 17, fontWeight: '700', color: AppColors.text.primary },
  modalPost: { fontSize: 16, fontWeight: '700', color: AppColors.coral.primary },
  composeAuthorCenter: { alignItems: 'center', gap: 4, marginBottom: 20 },
  composeAvatarLarge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, marginBottom: 4 },
  composeScrollContent: { flexGrow: 1, paddingBottom: 24 },
  composeAvatarLargeText: { fontSize: 32 },
  composeAuthor: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  composeAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  composeAvatarText: { fontSize: 22 },
  composeAuthorName: { fontSize: 16, fontWeight: '700', color: AppColors.text.primary },
  composeAuthorRole: { fontSize: 13, color: AppColors.text.secondary },
  typeScroll: { maxHeight: 52, marginBottom: 16 },
  typeScrollContent: { gap: 8, paddingRight: 8 },
  typeScrollContentCenter: { gap: 8, paddingHorizontal: 4 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: AppColors.bg.secondary, borderWidth: 1.5, borderColor: AppColors.border.soft },
  typeChipEmoji: { fontSize: 16 },
  typeChipLabel: { fontSize: 13, fontWeight: '600', color: AppColors.text.secondary },
  composeInput: { backgroundColor: AppColors.surface.whiteStrong, borderRadius: 16, padding: 16, fontSize: 16, color: AppColors.text.primary, minHeight: 120, borderWidth: 2, borderColor: '#EDAABB', marginBottom: 16 },
  emojiDecRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  emojiDecBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: AppColors.bg.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: AppColors.border.soft },
  emojiDecBtnSelected: { borderColor: AppColors.coral.primary, backgroundColor: AppColors.coral.soft },
  emojiDecText: { fontSize: 22 },
  modalPublishBtn: {
    backgroundColor: AppColors.coral.primary, borderRadius: 20, padding: 16,
    alignItems: 'center', marginTop: 20,
    shadowColor: AppColors.coral.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  modalPublishBtnText: { fontSize: 16, fontWeight: '700', color: AppColors.surface.whiteStrong },
  briefingDateScroll: { marginBottom: 12 },
  briefingDateScrollContent: { gap: 8, paddingHorizontal: 0 },
  briefingDateTab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: AppColors.bg.secondary, borderWidth: 1.5, borderColor: AppColors.border.soft,
  },
  briefingDateTabActive: { backgroundColor: '#B8426A', borderColor: '#B8426A' },
  briefingDateTabText: { fontSize: 13, fontWeight: '600', color: AppColors.text.secondary },
  briefingDateTabTextActive: { color: AppColors.surface.whiteStrong },
  inviteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  inviteCard: { width: '100%', backgroundColor: AppColors.surface.whiteStrong, borderRadius: 24, padding: 24, alignItems: 'center', shadowColor: AppColors.shadow.dark, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 16 },
  inviteTitle: { fontSize: 18, fontWeight: '800', color: AppColors.text.primary, marginBottom: 8, textAlign: 'center' },
  inviteDesc: { fontSize: 13, color: AppColors.text.secondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  inviteCodeBox: { backgroundColor: '#FEF0F4', borderRadius: 16, borderWidth: 2, borderColor: '#EDAABB', borderStyle: 'dashed', paddingHorizontal: 24, paddingVertical: 14, marginBottom: 6, alignItems: 'center', width: '100%' },
  inviteCode: { fontSize: 34, fontWeight: '900', color: '#B8426A', letterSpacing: 10, textAlign: 'center' },
  inviteCopyHint: { fontSize: 12, color: '#B8426A', marginTop: 6, fontWeight: '600', opacity: 0.7 },
  inviteShareBtn: { backgroundColor: '#07C160', borderRadius: 18, paddingHorizontal: 24, paddingVertical: 13, alignItems: 'center', width: '100%', marginBottom: 12, marginTop: 12 },
  inviteShareBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  inviteHint: { fontSize: 12, color: AppColors.text.tertiary, textAlign: 'center', marginBottom: 16, lineHeight: 18 },
  inviteCloseBtn: { backgroundColor: '#B8426A', borderRadius: 20, paddingHorizontal: 40, paddingVertical: 12, alignItems: 'center' },
  inviteCloseBtnText: { fontSize: 15, fontWeight: '700', color: AppColors.surface.whiteStrong },
});

const card = StyleSheet.create({
  container: { flexDirection: 'row', backgroundColor: AppColors.surface.whiteStrong, borderRadius: 20, marginBottom: 10, gap: 0, shadowColor: '#B8426A', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3, overflow: 'hidden' },
  containerNew: { borderWidth: 2, borderColor: '#EDAABB', backgroundColor: '#FEF0F4' },
  colorStrip: { width: 5, flexShrink: 0, borderTopLeftRadius: 20, borderBottomLeftRadius: 20 },
  cardInner: { flex: 1, flexDirection: 'row', padding: 14, gap: 12 },
  typeBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  typeEmoji: { fontSize: 20 },
  body: { flex: 1 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' },
  authorEmoji: { fontSize: 15 },
  authorName: { fontSize: 13, fontWeight: '700' },
  roleLabel: { fontSize: 10, color: '#B8426A', backgroundColor: '#FEF0F4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, fontWeight: '600' },
  time: { fontSize: 10, color: AppColors.text.tertiary, marginLeft: 'auto' },
  content: { fontSize: 15, color: AppColors.text.primary, lineHeight: 22, marginBottom: 8 },
  deleteBtn: { minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 8, backgroundColor: AppColors.coral.soft, alignItems: 'center', justifyContent: 'center', flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 },
  deleteBtnConfirm: { backgroundColor: AppColors.coral.primary, borderRadius: 12 },
  deleteText: { fontSize: 13, color: AppColors.coral.primary, fontWeight: '700' },
  deleteTextConfirm: { fontSize: 11, color: '#fff', fontWeight: '800' },

  // ── Reactions ──
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: AppColors.bg.secondary, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: AppColors.border.soft,
  },
  reactionPillMine: {
    backgroundColor: '#FEF0F4',
    borderColor: '#EDAABB',
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 12, fontWeight: '700', color: AppColors.text.secondary },
  reactionCountMine: { color: '#B8426A' },
  addReactionBtn: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
    backgroundColor: AppColors.bg.secondary,
    borderWidth: 1, borderColor: AppColors.border.soft,
    alignItems: 'center', justifyContent: 'center',
  },
  addReactionText: { fontSize: 14, color: AppColors.text.tertiary, fontWeight: '600' },
  commentToggleBtn: {
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
    backgroundColor: AppColors.bg.secondary,
    borderWidth: 1, borderColor: AppColors.border.soft,
    alignItems: 'center', justifyContent: 'center',
  },
  commentToggleBtnActive: { backgroundColor: '#FEF0F4', borderColor: '#EDAABB' },
  commentToggleText: { fontSize: 11, color: AppColors.text.secondary, fontWeight: '700' },
  commentToggleTextActive: { color: '#B8426A' },
  pickerRow: {
    flexDirection: 'row', gap: 6, marginTop: 8,
    backgroundColor: AppColors.surface.whiteStrong,
    borderRadius: 16, padding: 8,
    borderWidth: 1, borderColor: AppColors.border.soft,
    flexWrap: 'wrap',
  },
  pickerBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: AppColors.bg.secondary,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  pickerBtnActive: { borderColor: '#EDAABB', backgroundColor: '#FEF0F4' },
  pickerEmoji: { fontSize: 20 },
  reactorsList: {
    marginTop: 8, backgroundColor: AppColors.bg.secondary,
    borderRadius: 12, padding: 10, gap: 6,
  },
  reactorsTitle: { fontSize: 11, fontWeight: '700', color: AppColors.text.tertiary, marginBottom: 2 },
  reactorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reactorEmoji: { fontSize: 14 },
  reactorName: { fontSize: 13, fontWeight: '600', color: AppColors.text.primary },
  reactorMe: { fontSize: 11, color: '#EDAABB', fontWeight: '500' },
});

const setup = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  formContainer: { padding: 24, paddingBottom: 80, flexGrow: 1 },
  emoji: { fontSize: 64, marginBottom: 16, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: AppColors.text.primary, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: AppColors.text.secondary, textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  primaryBtn: { width: '100%', backgroundColor: AppColors.coral.primary, borderRadius: 20, padding: 16, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: AppColors.surface.whiteStrong },
  secondaryBtn: { width: '100%', backgroundColor: AppColors.bg.secondary, borderRadius: 20, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: AppColors.border.soft },
  secondaryBtnText: { fontSize: 16, fontWeight: '600', color: AppColors.text.secondary },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: AppColors.text.secondary, marginBottom: 8 },
  input: { backgroundColor: AppColors.bg.secondary, borderRadius: 16, padding: 16, fontSize: 16, color: AppColors.text.primary, borderWidth: 1.5, borderColor: AppColors.border.soft },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: AppColors.bg.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: AppColors.border.soft },
  emojiBtnText: { fontSize: 24 },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorBtn: { width: 36, height: 36, borderRadius: 18 },
  colorBtnSelected: { borderWidth: 3, borderColor: AppColors.surface.whiteStrong, shadowColor: AppColors.shadow.dark, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleBtn: { flex: 1, paddingVertical: 10, borderRadius: 14, backgroundColor: AppColors.bg.secondary, alignItems: 'center', borderWidth: 1.5, borderColor: AppColors.border.soft },
  roleBtnText: { fontSize: 13, color: AppColors.text.secondary },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 20, backgroundColor: AppColors.bg.secondary, alignItems: 'center' },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: AppColors.text.secondary },
  disabledBtn: { opacity: 0.5 },
  // 自定义头像上传
  photoUploadRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: AppColors.bg.secondary, borderRadius: 16,
    padding: 12, borderWidth: 1.5, borderColor: AppColors.border.soft,
  },
  photoUploadPreview: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: AppColors.surface.whiteStrong,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: AppColors.border.soft,
    overflow: 'hidden',
  },
  photoUploadImg: { width: 56, height: 56, borderRadius: 28 },
  photoUploadIcon: { fontSize: 26 },
  photoUploadInfo: { flex: 1 },
  photoUploadTitle: { fontSize: 14, fontWeight: '700', color: AppColors.text.primary, marginBottom: 2 },
  photoUploadSub: { fontSize: 12, color: AppColors.text.tertiary },
  photoUploadClear: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
  },
  photoUploadClearText: { fontSize: 18, color: '#9CA3AF', lineHeight: 22, fontWeight: '600' },
});
