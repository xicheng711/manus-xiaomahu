/**
 * diary-edit.tsx — Unified diary session page (v4.0 Figma redesign)
 */

import { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Platform, Animated, ActivityIndicator,
  Easing, KeyboardAvoidingView, Dimensions, Modal, Keyboard, Image, Alert,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { DiaryInteractions } from '@/components/diary-interactions';
import {
  saveDiaryEntry, updateDiaryEntry, getDiaryEntryById, getDiaryEntries,
  deleteDiaryEntry, todayStr, getProfile, getUserProfile, getFamilyProfile, generateId, DiaryEntry, ConversationMessage,
  getTodayCheckIn, DailyCheckIn, getDiaryDraft, saveDiaryDraft, clearDiaryDraft,
  waitForServerDiaryId, syncDiaryEntryNow, getLastDiaryPublishFailure, getNapMinutes, hasRecordedNap,
} from '@/lib/storage';
import { useFamilyContext } from '@/lib/family-context';
import { cloudGetDiaries, getCloudSyncState, setCloudSyncState } from '@/lib/cloud-sync';
import { getSessionToken, getUserInfo } from '@/lib/_core/auth';
import { COLORS, RADIUS, fadeInUp, pressAnimation } from '@/lib/animations';
import { trpc } from '@/lib/trpc';
import * as Haptics from 'expo-haptics';
import { AppColors, Gradients } from '@/lib/design-tokens';
import { getCompleteDiaryBody, getConversationAfterDiaryBody } from '@/lib/diary-conversation-display';

// ─── Constants ────────────────────────────────────────────────────────────────

const SW = Dimensions.get('window').width;

function formatDiaryPublishedLabel(entry?: DiaryEntry | null): string {
  const dateStr = entry?.date || todayStr();
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Date(year, month - 1, day)
    : new Date();
  const dateLabel = date.toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
  const fallbackTime = entry?.createdAt
    ? new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';
  const timeLabel = entry?.localTimeStr || fallbackTime;
  return entry && timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;
}

const MOOD_OPTIONS = [
  { emoji: '😄', label: '很开心', color: '#22C55E' },
  { emoji: '😊', label: '还不错', color: '#84CC16' },
  { emoji: '😌', label: '平静', color: COLORS.textSecondary },
  { emoji: '😕', label: '有点累', color: '#F59E0B' },
  { emoji: '😢', label: '不太好', color: '#EF4444' },
  { emoji: '😤', label: '烦躁', color: '#DC2626' },
];

const CAREGIVER_MOODS = [
  { emoji: '😊', label: '挺好的' },
  { emoji: '😌', label: '还行' },
  { emoji: '😕', label: '有点累' },
  { emoji: '😢', label: '不太好' },
  { emoji: '😤', label: '快撑不住了' },
];

const TAGS = [
  '散步', '吃饭好', '睡眠好', '认出家人', '情绪稳定',
  '有点混乱', '拒绝服药', '跌倒', '特别开心', '需要安慰',
];

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  const dot0 = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dots = [dot0, dot1, dot2];
  useEffect(() => {
    dots.forEach((dot, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dot, { toValue: -6, duration: 300, delay: i * 150, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);
  return (
    <View style={styles.typingRow}>
      {dots.map((dot, i) => (
        <Animated.View key={i} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
      ))}
    </View>
  );
}

// ─── Chat Bubble Components ───────────────────────────────────────────────────

function UserBubble({ text }: { text: string }) {
  return (
    <View style={styles.bubbleRowRight}>
      <LinearGradient
        colors={['#5DBD7A', '#3DA862']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={styles.bubbleGreen}
      >
        <Text style={styles.bubbleGreenText}>{text}</Text>
      </LinearGradient>
      <View style={styles.userAvatarCircle}>
        <Text style={styles.userAvatarEmoji}>😊</Text>
      </View>
    </View>
  );
}

function SmartBubble({ text, animate = false, isFirst = false }: { text: string; animate?: boolean; isFirst?: boolean }) {
  const fadeAnim = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(animate ? 16 : 0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animate) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 16, stiffness: 120 }),
      ]).start();
    }
    Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: -1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const rotate = rotateAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-5deg', '5deg'] });

  return (
    <Animated.View style={[styles.smartBubbleWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

      <View style={[styles.bubbleBlue, isFirst ? styles.bubbleBlueFirst : styles.bubbleBluePink]}>
        <View style={styles.bubbleDots}>
          <View style={[styles.bubbleDot, { backgroundColor: '#D4C4B4' }]} />
          <View style={[styles.bubbleDot, { backgroundColor: '#C4B4A4' }]} />
          <View style={[styles.bubbleDot, { backgroundColor: '#B4A494' }]} />
        </View>
        <Text style={styles.bubbleBlueText}>{text}</Text>
      </View>
    </Animated.View>
  );
}

// ─── Smart Name Row ───────────────────────────────────────────────────────────

function SmartNameRow() {
  return (
    <View style={styles.smartNameRow}>
      <View style={styles.smartAvatarWrap}>
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.smartAvatarCircle}
        />
        <View style={styles.smartOnlineDot} />
      </View>
      <View>
        <Text style={styles.smartName}>小马虎</Text>
        <View style={styles.smartBadgeRow}>
            <LinearGradient colors={['#3B82F6', '#8B5CF6']} style={styles.smartBadge}>
              <Text style={styles.smartBadgeText}>✨ 小马虎回复</Text>
            </LinearGradient>
        </View>
      </View>
    </View>
  );
}

// ─── Mood Option ──────────────────────────────────────────────────────────────

function MoodOption({ mood, selected, onPress }: { mood: typeof MOOD_OPTIONS[0]; selected: boolean; onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const emojiScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(emojiScale, { toValue: selected ? 1.15 : 1, useNativeDriver: true, damping: 12, stiffness: 200 }).start();
  }, [selected]);
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.moodOption, selected && { borderColor: mood.color, backgroundColor: mood.color + '18' }]}
        onPress={() => pressAnimation(scaleAnim, onPress)}
        activeOpacity={0.85}
      >
        <Animated.Text style={[styles.moodOptionEmoji, { transform: [{ scale: emojiScale }] }]}>{mood.emoji}</Animated.Text>
        <Text style={[styles.moodOptionLabel, selected && { color: mood.color, fontWeight: '700' }]}>{mood.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Tag Option ───────────────────────────────────────────────────────────────

function TagOption({ tag, selected, onPress }: { tag: string; selected: boolean; onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.tagOption, selected && styles.tagOptionSelected]}
        onPress={() => pressAnimation(scaleAnim, onPress)}
        activeOpacity={0.85}
      >
        <Text style={[styles.tagOptionText, selected && styles.tagOptionTextSelected]}>
          {selected ? '✓ ' : ''}{tag}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DiaryEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; readOnly?: string; fromDiary?: string; roomId?: string }>();
  const existingId = params.id;
  const fromDiaryList = params.fromDiary === '1';
  const notificationRoomId = params.roomId ? String(params.roomId) : null;
  const { memberships, activeMembership, ready: familyReady, switchFamily } = useFamilyContext();
  const familyId = activeMembership?.familyId;
  const activeFamilyRef = useRef<string | undefined>(familyId);
  activeFamilyRef.current = familyId;
  const targetFamilyReady = !notificationRoomId || familyId === notificationRoomId;
  const [roleReadOnly, setRoleReadOnly] = useState(params.readOnly === '1');
  const isReadOnly = roleReadOnly;
  const scrollRef = useRef<ScrollView>(null);

  const [selectedMood, setSelectedMood] = useState(0);
  const [caregiverMoodIdx, setCaregiverMoodIdx] = useState(-1);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [entryId, setEntryId] = useState<string | null>(existingId ?? null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [conversation, setConversationRaw] = useState<ConversationMessage[]>([]);
  const [smartLoading, setAiLoading] = useState(false);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [elderNickname, setElderNickname] = useState('家人');
  const [caregiverName, setCaregiverName] = useState('照顾者');
  const [loadingEntry, setLoadingEntry] = useState(!!existingId);
  const [diaryCount, setDiaryCount] = useState(0);
  const [todayCheckIn, setTodayCheckIn] = useState<DailyCheckIn | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [saving, setSaving] = useState(false); // 防止「结束并保存」重复点击
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);
  const [serverDiaryId, setServerDiaryId] = useState<number | null>(null);

  const entryRef = useRef<DiaryEntry | null>(null);
  // conversationRef 必须在 setConversation 包装函数之前声明，避免 TDZ 问题
  const conversationRef = useRef<ConversationMessage[]>([]);
  // 包装 setConversation，同时更新 ref，确保 handleEndAndSave 始终拿到最新值
  const setConversation = (conv: ConversationMessage[]) => {
    conversationRef.current = conv;
    setConversationRaw(conv);
  };
  const formFade = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(30)).current;
  const shimmerAnim = useRef(new Animated.Value(-1)).current;

  const replyMutation = trpc.ai.replyToDiary.useMutation();
  const followUpMutation = trpc.ai.followUpDiary.useMutation();

  // 初始加载动画（只运行一次）
  const entryLoadedRef = useRef(false);
  const draftLoadedFamilyRef = useRef<string | null>(null);
  useEffect(() => {
    fadeInUp(formFade, formSlide, { duration: 400 });
    Animated.loop(
      Animated.timing(shimmerAnim, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  // 通知可能来自另一个家庭：先切换到通知对应家庭，避免从错误的缓存和房间读取日记。
  useEffect(() => {
    if (!familyReady || !notificationRoomId || familyId === notificationRoomId) return;
    const stillBelongsToTargetFamily = memberships.some(item => item.familyId === notificationRoomId);
    if (!stillBelongsToTargetFamily) {
      Alert.alert('无法打开这篇日记', '你已不在这篇日记所属的家庭中。');
      router.replace('/(tabs)/diary' as any);
      return;
    }
    switchFamily(notificationRoomId).catch(() => {
      Alert.alert('暂时无法切换家庭', '请稍后从家庭列表中重试。');
      router.replace('/(tabs)/diary' as any);
    });
  }, [familyReady, familyId, memberships, notificationRoomId, router, switchFamily]);

  // 等待目标 familyId 就绪后再加载日记（避免读取错误家庭的 storage key）。
  useEffect(() => {
    if (existingId && familyReady && targetFamilyReady && !entryLoadedRef.current) {
      entryLoadedRef.current = true;
      loadExistingEntry(existingId);
    }
  }, [familyReady, targetFamilyReady, existingId]);

  // 新建日记时，按当前家庭读取本机草稿；已发布日记绝不读取草稿覆盖内容。
  useEffect(() => {
    if (existingId || !familyReady || draftLoadedFamilyRef.current === (familyId ?? null)) return;
    const requestedFamilyId = familyId;
    draftLoadedFamilyRef.current = requestedFamilyId ?? null;
    // 切换家庭后先清空编辑状态，再只恢复该家庭自己的草稿。
    setContent('');
    setSelectedMood(0);
    setCaregiverMoodIdx(-1);
    setSelectedTags([]);
    setDraftRestoredAt(null);
    getDiaryDraft(requestedFamilyId).then(draft => {
      if (activeFamilyRef.current !== requestedFamilyId || !draft) return;
      const draftAgeMs = Date.now() - new Date(draft.savedAt).getTime();
      const draftAgeDays = Number.isFinite(draftAgeMs) ? Math.floor(draftAgeMs / (1000 * 60 * 60 * 24)) : 0;
      const restoreDraft = () => {
        if (activeFamilyRef.current !== requestedFamilyId) return;
        setContent(draft.content ?? '');
        setSelectedMood(typeof draft.selectedMood === 'number' ? draft.selectedMood : 0);
        setCaregiverMoodIdx(typeof draft.caregiverMoodIdx === 'number' ? draft.caregiverMoodIdx : -1);
        setSelectedTags(Array.isArray(draft.selectedTags) ? draft.selectedTags : []);
        setDraftRestoredAt(draft.savedAt);
      };
      if (draftAgeDays >= 7) {
        Alert.alert(
          `\u53d1\u73b0 ${draftAgeDays} \u5929\u524d\u7684\u8349\u7a3f`,
          '\u8981\u6062\u590d\u8fd9\u7bc7\u8349\u7a3f\u5417\uff1f\u4e0d\u6062\u590d\u5c06\u6c38\u4e45\u5220\u9664\u3002',
          [
            { text: '\u4e0d\u6062\u590d\uff0c\u5220\u9664\u8349\u7a3f', style: 'destructive', onPress: () => clearDiaryDraft(requestedFamilyId).catch(() => {}) },
            { text: '\u6062\u590d\u8349\u7a3f', onPress: restoreDraft },
          ],
        );
      } else {
        restoreDraft();
      }
    }).catch(() => {});
  }, [existingId, familyReady, familyId]);

  // 输入后短暂防抖自动保存。草稿只写入本机且带 familyId，不推送、不影响其他家庭成员。
  useEffect(() => {
    if (existingId || submitted || !familyReady || draftLoadedFamilyRef.current !== (familyId ?? null)) return;
    const hasDraftContent = Boolean(content.trim() || selectedTags.length || caregiverMoodIdx >= 0 || selectedMood !== 0);
    const timer = setTimeout(() => {
      if (hasDraftContent) {
        saveDiaryDraft({ content, selectedMood, caregiverMoodIdx, selectedTags }, familyId).catch(() => {});
      } else {
        clearDiaryDraft(familyId).catch(() => {});
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [content, selectedMood, caregiverMoodIdx, selectedTags, existingId, submitted, familyReady, familyId]);

  // 当 familyId 变化时重新加载称谓和头像（包括初始进入页面）
  useEffect(() => {
    loadProfile();
  }, [familyId]);

  async function loadProfile() {
    const requestedMembership = activeMembership;
    const requestedFamilyId = requestedMembership?.familyId;
    const currentMember = requestedMembership?.room.members.find(member => member.id === requestedMembership.myMemberId) ?? null;
    const [userProfile, familyProfile, legacyProfile, entries, checkIn] = await Promise.all([
      getUserProfile(), getFamilyProfile(requestedFamilyId), getProfile(), getDiaryEntries(requestedFamilyId), getTodayCheckIn(requestedFamilyId),
    ]);
    if (activeFamilyRef.current !== requestedFamilyId) return;
    // Joiner 和主照顾者都可以写日记和 AI 对话；查看他人日记时再按作者身份锁为只读。
    setElderNickname(familyProfile?.nickname || familyProfile?.name || requestedMembership?.room.elderName || (memberships.length === 1 ? legacyProfile?.nickname || legacyProfile?.name : undefined) || '家人');
    // 多家庭时只信任当前 membership，避免 Joiner profile 继承另一个主照顾者 profile 的头像或生肖。
    const allowLegacyFallback = memberships.length === 1;
    setCaregiverName(currentMember?.name || (allowLegacyFallback ? userProfile?.caregiverName || legacyProfile?.caregiverName : undefined) || '照顾者');
    setDiaryCount(entries.length);
    setTodayCheckIn(checkIn ?? null);
  }

  async function loadExistingEntry(id: string) {
    setLoadingEntry(true);
    // 获取当前登录用户 ID，用于判断日记是否是自己写的；同步状态缺失时从认证账号恢复。
    const cloudState = await getCloudSyncState();
    let currentUserId = cloudState.userId;
    if (!currentUserId) {
      try {
        const authenticatedUser = await getUserInfo();
        if (authenticatedUser?.id) {
          currentUserId = authenticatedUser.id;
          await setCloudSyncState({ userId: authenticatedUser.id });
        }
      } catch { /* 离线时继续使用服务端权限作为最终保护 */ }
    }
    let entry: DiaryEntry | null = await getDiaryEntryById(id, familyId ?? undefined);
    // 只要有 serverDiaryId，就去云端校验最新的 conversationFinished
    // 对于他人写的日记（authorUserId 不等于当前用户），强制以云端状态为准
    // 这样即使本地缓存了 false，也能正确反映他人日记的对话是否已结束
    if (entry && entry.serverDiaryId) {
      const isOthersPerson = !!(entry.authorUserId && (!currentUserId || entry.authorUserId !== currentUserId));
      try {
        const cloudEntries = await cloudGetDiaries(familyId ? Number(familyId) : undefined);
        const cloudEntry = cloudEntries?.find((e: any) => e.id === entry!.serverDiaryId);
        if (cloudEntry) {
          if (isOthersPerson) {
            // 他人写的日记只更新当前页面快照，绝不能调用 updateDiaryEntry 触发云端写回。
            entry = { ...entry, conversationFinished: cloudEntry.conversationFinished };
          } else if (cloudEntry.conversationFinished && !entry.conversationFinished) {
            // 自己写的日记以云端正式发布状态为准；当前页面直接采用最新值。
            entry = { ...entry, conversationFinished: true };
          }
        }
      } catch (e) { /* 网络不可用时降级，使用本地状态 */ }
    }
    // 本地找不到时（无论是 joiner 还是主照顾者）尝试从云端拉取
    // 注意：不能依赖 isReadOnly 状态（因为 loadProfile 是异步的，可能还没执行完）
    if (!entry) {
      try {
        const cloudEntries = await cloudGetDiaries(familyId ? Number(familyId) : undefined);
        // 云端 id 是数字，本地传入的 id 可能是 "cloud_123" 或纯数字字符串
        // 剥离 cloud_ 前缀后再比较
        const numericId = String(id).replace(/^cloud_/, '');
        const matched = cloudEntries?.find(
          (e: any) => String(e.id) === numericId
        );
        if (matched) {
          // 将云端日记规范化为本地格式，并写入本地存储，确保后续操作能正常进行
          const localId = `cloud_${matched.id}`;
          // 将 createdAt 统一转为 ISO 字符串，防止 Date 对象和字符串混合导致排序错误
          const normalizedCreatedAt = matched.createdAt instanceof Date
            ? matched.createdAt.toISOString()
            : (typeof matched.createdAt === 'string' ? matched.createdAt : matched.date);
          const normalized: any = {
            id: localId,
            roomId: familyId ? String(familyId) : undefined,
            serverDiaryId: matched.id,
            clientId: matched.clientId ?? undefined,
            date: matched.date,
            content: matched.content || '',
            moodEmoji: matched.moodEmoji || '😊',
            moodLabel: matched.moodLabel,
            moodScore: matched.moodScore,
            tags: matched.tags,
            createdAt: normalizedCreatedAt,
            caregiverMoodEmoji: matched.caregiverMoodEmoji,
            caregiverMoodLabel: matched.caregiverMoodLabel,
            authorName: matched.authorName || (matched as any).author?.name,
            authorUserId: matched.authorUserId,
            aiReply: matched.aiReply,
            aiEmoji: matched.aiEmoji,
            aiTip: matched.aiTip,
            conversation: matched.conversation,
            conversationFinished: matched.conversationFinished ?? true,
            localTimeStr: matched.localTimeStr,
          };
          // 写入本地缓存（如果本地还没有这条）并按 createdAt 降序排序
          try {
            const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
            const existingLocal = await getDiaryEntries(familyId);
            const alreadyExists = existingLocal.some(d => d.id === localId || d.serverDiaryId === matched.id);
            if (!alreadyExists) {
              const merged = [normalized, ...existingLocal];
              merged.sort((a: any, b: any) => {
                const ta = new Date(a.createdAt || a.date).getTime();
                const tb = new Date(b.createdAt || b.date).getTime();
                if (isNaN(ta) && isNaN(tb)) return 0;
                if (isNaN(ta)) return 1;
                if (isNaN(tb)) return -1;
                if (tb !== ta) return tb - ta;
                return (b.localTimeStr || '00:00').localeCompare(a.localTimeStr || '00:00');
              });
              const storageKey = familyId ? `diary_entries:${familyId}` : 'diary_entries';
              await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
            }
          } catch (saveErr) {
            console.warn('[DiaryEdit] failed to cache cloud entry locally:', saveErr);
          }
          // 更新 entryId 为本地格式
          setEntryId(localId);
          entry = normalized as DiaryEntry;
        }
      } catch (e) {
        console.warn('[DiaryEdit] cloudGetDiaries fallback failed:', e);
      }
    }
    if (entry) {
      // 路由 id 可能是 cloud_123、server_123 或旧缓存别名；后续发布/删除必须使用实际本地记录 id。
      entryRef.current = entry;
      setEntryId(entry.id);
      setServerDiaryId(entry.serverDiaryId ?? (/^(?:cloud|server)_\d+$/.test(entry.id) ? Number(entry.id.replace(/^(?:cloud|server)_/, '')) : null));
      const moodIdx = MOOD_OPTIONS.findIndex(m => m.emoji === entry!.moodEmoji);
      setSelectedMood(moodIdx >= 0 ? moodIdx : 0);
      if (entry.caregiverMoodEmoji) {
        const cgIdx = CAREGIVER_MOODS.findIndex(m => m.emoji === entry!.caregiverMoodEmoji);
        if (cgIdx >= 0) setCaregiverMoodIdx(cgIdx);
      }
      setSelectedTags(entry.tags ?? []);
      setContent(entry.content ?? '');
      setSubmitted(true);
      // 判断是否是他人写的日记
      // 他人写的日记：无论 conversationFinished 是什么，一律锁定对话框（不能继续对话）
      // 自己写的日记：以 conversationFinished 为准
      const isOthersDiary = !!(entry.authorUserId && (!currentUserId || entry.authorUserId !== currentUserId));
      setRoleReadOnly(params.readOnly === '1' || isOthersDiary);
      setFinished(isOthersDiary ? true : (entry.conversationFinished ?? false));
      if (entry.conversation && entry.conversation.length > 0) {
        setConversation(entry.conversation);
      } else if (entry.aiReply) {
        const legacyConv: ConversationMessage[] = [
          { id: generateId(), role: 'user', text: entry.content || '已记录今日护理情况', createdAt: entry.createdAt ?? new Date().toISOString() },
          { id: generateId(), role: 'ai', text: entry.aiReply, createdAt: entry.createdAt ?? new Date().toISOString() },
        ];
        setConversation(legacyConv);
      }
    }
    setLoadingEntry(false);
  }

  const hasUnsavedDraft = !existingId && !submitted && Boolean(
    content.trim() || selectedTags.length || caregiverMoodIdx >= 0 || selectedMood !== 0
  );

  function returnToDiaryList() {
    // 查看已有日记时优先返回来源页面：
    // - 从日记列表进入，可保留列表展开状态和滚动位置；
    // - 从首页活动进入，可回到原来的首页位置。
    // 新建日记只有明确来自日记列表时才 back，其他入口仍回日记本。
    if (router.canGoBack() && (fromDiaryList || !!existingId)) router.back();
    else router.replace('/(tabs)/diary' as any);
  }

  async function saveDraftAndLeave() {
    await saveDiaryDraft({ content, selectedMood, caregiverMoodIdx, selectedTags }, familyId);
    returnToDiaryList();
  }

  function requestLeaveEditor() {
    if (!hasUnsavedDraft) {
      returnToDiaryList();
      return;
    }
    Alert.alert(
      '要先保存草稿吗？',
      '草稿只保存在这台设备和当前家庭中，稍后可继续编辑；未发布前不会通知其他家人。',
      [
        { text: '继续写', style: 'cancel' },
        {
          text: '不保存并离开',
          style: 'destructive',
          onPress: () => {
            clearDiaryDraft(familyId).catch(() => {});
            returnToDiaryList();
          },
        },
        { text: '保存草稿', onPress: () => { saveDraftAndLeave().catch(() => {}); } },
      ],
    );
  }

  async function handleDeleteEntry() {
    const localEntryId = entryRef.current?.id ?? entryId;
    if (!localEntryId) return;
    try {
      await deleteDiaryEntry(localEntryId, familyId ?? undefined);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowDeleteModal(false);
      returnToDiaryList();
    } catch (error: any) {
      Alert.alert('删除失败', error?.message || '无法同步删除，请检查网络后重试');
    }
  }

  function toggleTag(tag: string) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  async function persistConversation(conv: ConversationMessage[]) {
    // 使用 entryRef.current?.id 作为主要来源，避免 React state 闭包问题导致 entryId 为 null
    const eid = entryRef.current?.id ?? entryId;
    if (!eid) return;
    // 传入 familyId 作为 roomId，确保写入正确的 storage key；同时更新内存快照供下一轮 AI 使用。
    await updateDiaryEntry(eid, { conversation: conv }, familyId ?? undefined);
    if (entryRef.current) entryRef.current = { ...entryRef.current, conversation: conv };
  }

  async function handleSubmit() {
    if (submitting) return;
    if (!content.trim()) {
      Alert.alert('还没有日记内容', '请先写下一些内容，再让小马虎回复。');
      return;
    }
    // 游客模式检查：日记需要登录才能同步到云端
    const token = await getSessionToken();
    if (!token) {
      Alert.alert(
        '需要登录',
        '日记需要登录账号才能保存并与家人共享，登录后数据会自动同步。',
        [
          { text: '暂不登录', style: 'cancel' },
          { text: '去登录', onPress: () => router.push('/login' as any) },
        ]
      );
      return;
    }
    setSubmitting(true);
    const mood = MOOD_OPTIONS[selectedMood];
    const cgMood = caregiverMoodIdx >= 0 ? CAREGIVER_MOODS[caregiverMoodIdx] : undefined;
    const savedEntry = await saveDiaryEntry({
      date: todayStr(),
      moodEmoji: mood.emoji,
      moodLabel: mood.label,
      caregiverMoodEmoji: cgMood?.emoji,
      caregiverMoodLabel: cgMood?.label,
      tags: selectedTags,
      content: content.trim(),
      conversation: [],
      authorName: caregiverName || undefined,
    }, familyId ?? undefined); // 传入 familyId 确保写入正确的 storage key
    await clearDiaryDraft(familyId);
    setDraftRestoredAt(null);
    setEntryId(savedEntry.id);
    entryRef.current = savedEntry;
    setServerDiaryId(savedEntry.serverDiaryId ?? null);
    // 云端创建完成后立即显示家人互动区，无需离开页面再重新打开。
    waitForServerDiaryId(savedEntry.id).then(id => {
      if (id) {
        setServerDiaryId(id);
        entryRef.current = entryRef.current ? { ...entryRef.current, serverDiaryId: id } : entryRef.current;
      }
    }).catch(() => {});
    setSubmitted(true);
    setSubmitting(false);
    // 云端同步已在 saveDiaryEntry 内部完成，此处不再重复调用以避免服务端重复创建日记条目
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const userText = content.trim() ? content.trim() : '已记录今日护理情况';
    const userMsg: ConversationMessage = { id: generateId(), role: 'user', text: userText, createdAt: new Date().toISOString() };
    const conv1 = [userMsg];
    setConversation(conv1);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);

    setAiLoading(true);
    const napMinutesForContext = getNapMinutes(todayCheckIn);
    let aiText = `${caregiverName}，辛苦了！您的每一份记录都是对${elderNickname}最好的关爱。照顾好自己，才能更好地照顾家人 💕`;
    try {
      const result = await replyMutation.mutateAsync({
        elderNickname, caregiverName,
        moodEmoji: mood.emoji, moodLabel: mood.label,
        tags: selectedTags, content: content.trim(),
        checkIn: todayCheckIn ? {
          morningDone: todayCheckIn.morningDone,
          eveningDone: todayCheckIn.eveningDone,
          sleepHours: todayCheckIn.sleepHours,
          sleepRange: todayCheckIn.sleepRange,
          sleepQuality: todayCheckIn.sleepQuality,
          nightAwakenings: todayCheckIn.nightAwakenings,
          napDuration: hasRecordedNap(todayCheckIn)
            ? (napMinutesForContext > 0
              ? (napMinutesForContext >= 60 ? `${(napMinutesForContext / 60).toFixed(1).replace('.0', '')}小时` : `${Math.round(napMinutesForContext)}分钟`)
              : '没有')
            : undefined,
          moodScore: todayCheckIn.moodScore,
          medicationTaken: todayCheckIn.medicationTaken,
          mealNotes: todayCheckIn.mealNotes,
          morningNotes: todayCheckIn.morningNotes,
          eveningNotes: todayCheckIn.eveningNotes,
        } : undefined,
      });
      aiText = result.reply ?? aiText;
    } catch { }

    const aiMsg: ConversationMessage = { id: generateId(), role: 'ai', text: aiText, createdAt: new Date().toISOString() };
    const conv2 = [...conv1, aiMsg];
    setConversation(conv2);
    setAiLoading(false);
    // Save locally and trigger cloud sync via updateDiaryEntry (which handles waiting for serverDiaryId
    // internally and syncs using a snapshot — no extra explicit cloudSyncDiary call needed here).
    await updateDiaryEntry(savedEntry.id, { aiReply: aiText, conversation: conv2 }, familyId ?? undefined);
    // 第一轮 AI 回复必须同步写入 entryRef；否则用户立即追问时 originalAiReply 仍为空，模型会丢失上一句。
    entryRef.current = { ...savedEntry, aiReply: aiText, conversation: conv2 };
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
  }

  async function handleFollowUp() {
    const q = followUpInput.trim();
    if (!q || followUpLoading || !entryRef.current) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFollowUpInput('');
    setFollowUpLoading(true);
    const userMsg: ConversationMessage = { id: generateId(), role: 'user', text: q, createdAt: new Date().toISOString() };
    // 使用 conversationRef.current 而不是 conversation state，避免 React 闭包问题导致对话丢失
    const conv1 = [...conversationRef.current, userMsg];
    setConversation(conv1);
    await persistConversation(conv1);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    // 将 conv1 中除第一条用户消息和第一条 AI 回复之外的历史传给服务端
    // 使用 conv1（已含本次用户消息），跳过最初的两条（初始日记 + 第一条回复）
    // 再跳过最后一条（本次用户消息，由 question 字段单独传递）
    // 保留最近 24 条历史消息，既能连续承接上下文，也避免极长对话拖慢请求。
    const historySlice = conv1.slice(2, -1).slice(-24);
    const historyForApi = historySlice.map(m => ({
      role: (m.role === 'ai' ? 'ai' : 'user') as 'user' | 'ai',
      text: m.text,
    }));
    // Build a compact check-in summary string for context
    const checkInSummaryParts: string[] = [];
    if (todayCheckIn?.morningDone) {
      const sleep = todayCheckIn.sleepRange ?? (todayCheckIn.sleepHours ? `${todayCheckIn.sleepHours}小时` : null);
      if (sleep) checkInSummaryParts.push(`睡眠${sleep}`);
      if (todayCheckIn.medicationTaken !== undefined) checkInSummaryParts.push(todayCheckIn.medicationTaken ? '已服药' : '未服药');
    }
    if (todayCheckIn?.eveningDone && todayCheckIn.moodScore !== undefined) {
      checkInSummaryParts.push(`心情${todayCheckIn.moodScore}/10`);
    }
    const checkInSummary = checkInSummaryParts.length > 0 ? checkInSummaryParts.join('，') : undefined;
    try {
      const result = await followUpMutation.mutateAsync({
        elderNickname,
        caregiverName,
        originalContent: entryRef.current.content?.trim() || conversationRef.current[0]?.text || '已记录今日护理情况',
        originalMood: entryRef.current.moodEmoji ?? '',
        originalAiReply: entryRef.current.aiReply || conversationRef.current[1]?.text || '',
        checkInSummary,
        history: historyForApi,
        question: q,
      });
      const aiMsg: ConversationMessage = { id: generateId(), role: 'ai', text: result.reply, createdAt: new Date().toISOString() };
      const conv2 = [...conv1, aiMsg];
      setConversation(conv2);
      await persistConversation(conv2);
    } catch (err) {
      console.error('followUp error:', err);
      const errMsg: ConversationMessage = { id: generateId(), role: 'ai', text: '我这边出了点状况，请稍后再试试。您的记录我已经保存好了 📝', createdAt: new Date().toISOString() };
      const conv2 = [...conv1, errMsg];
      setConversation(conv2);
      await persistConversation(conv2);
    } finally {
      setFollowUpLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
    }
  }

  async function handleEndAndSave() {
    // AI 正在回复时不能提前发布，否则最终云端快照可能缺少最后一条回复。
    if (smartLoading || followUpLoading) {
      Alert.alert('小马虎正在回复', '请等这条回复完成后再结束并保存，这样完整对话都会一起发布。');
      return;
    }
    // 防止重复点击（双击会触发两次云同步，导致主照顾者收到两条相同通知）
    if (saving) return;
    setSaving(true);
    try {
      // 使用 ref 获取最新对话内容（避免 React state 闭包问题）
      const latestConv = conversationRef.current;
      // 恢复草稿时不要再依赖路由别名；直接使用页面已经完整加载的实际条目快照。
      const routeOrLocalId = entryRef.current?.id ?? entryId ?? null;
      if (!routeOrLocalId || !familyId) {
        Alert.alert('保存失败', '当前家庭信息尚未准备好，请稍后重试');
        return;
      }
      const loadedEntry = entryRef.current ?? await getDiaryEntryById(routeOrLocalId, familyId);
      if (!loadedEntry) {
        Alert.alert('保存失败', '没有找到这篇本地草稿，请返回日记列表后重新打开。');
        return;
      }
      const localEntryId = loadedEntry.id;
      // 先写本机，再把完全相同的最终快照直接交给已验证可达的 syncDiary；不再二次查找草稿。
      const finalSnapshot: DiaryEntry = {
        ...loadedEntry,
        id: localEntryId,
        roomId: familyId,
        conversation: latestConv,
        conversationFinished: true,
        syncPending: true,
        updatedAt: new Date().toISOString(),
      };
      const updatedEntry = await updateDiaryEntry(
        localEntryId,
        finalSnapshot,
        familyId,
        { skipCloud: true },
      );
      const publishSnapshot = updatedEntry ?? finalSnapshot;
      entryRef.current = publishSnapshot;
      const published = await syncDiaryEntryNow(localEntryId, familyId, publishSnapshot);
      if (!published) {
        const failure = getLastDiaryPublishFailure(localEntryId, familyId);
        const failureTitle = failure?.code === 'AUTH_REQUIRED'
          ? '需要重新登录'
          : failure?.code === 'FORBIDDEN'
            ? '无法在当前家庭发布'
            : '尚未发布到家庭';
        Alert.alert(
          failureTitle,
          `${failure?.message ?? '未能连接家庭云端，请检查网络后重试。'}\n\n完整日记和全部对话仍安全保存在本机，不会丢失。`,
        );
        return;
      }
      const syncedEntry = await getDiaryEntryById(localEntryId, familyId);
      if (syncedEntry) {
        entryRef.current = syncedEntry;
        setServerDiaryId(syncedEntry.serverDiaryId ?? null);
      }
      setFinished(true);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      returnToDiaryList();
    } finally {
      setSaving(false);
    }
  }

  const shimmerTranslate = shimmerAnim.interpolate({ inputRange: [-1, 1], outputRange: [-300, 300] });
  const interactionDiaryId = serverDiaryId
    ?? (existingId && /^cloud_\d+$/.test(existingId) ? Number(existingId.replace('cloud_', '')) : null);
  const interactionRoomId = familyId ? Number(familyId) : null;
  const canShowInteractions = submitted && finished && entryRef.current?.conversationFinished !== false;
  // 正文与旧 conversation 副本长度不一致时显示更完整的一份；对话区不再重复同一条正文。
  const displayedDiaryBody = getCompleteDiaryBody(content, conversation);
  const displayedConversation = getConversationAfterDiaryBody(conversation, displayedDiaryBody);
  const firstDisplayedAiIndex = displayedConversation.findIndex(message => message.role === 'ai');

  if (loadingEntry) {
    return (
      <ScreenContainer containerClassName="bg-[#FFF1F2]">
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#F472B6" />
          <Text style={styles.loadingText}>加载日记...</Text>
        </View>
      </ScreenContainer>
    );
  }

  // 已有日记显示该日记的真实发布时间；只有新建日记才显示当前日期。
  const publishedLabel = formatDiaryPublishedLabel(entryRef.current);

  return (
    <ScreenContainer containerClassName="bg-[#FAF8F5]">
      <LinearGradient colors={['#FAF8F5', '#F7F4F0', '#F5F2EC']} style={{ flex: 1 }}>

        {/* Subtle decorative accent */}
        <View style={[styles.decor, { top: 80, right: 20, opacity: 0.06 }]} pointerEvents="none">
          <Text style={{ fontSize: 120 }}>📔</Text>
        </View>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBack} onPress={requestLeaveEditor} activeOpacity={0.7}>
            <Text style={styles.headerBackText}>‹ 日记本</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerDot} />
            <Text style={styles.headerTitle}>{isReadOnly ? '护理日记 📔' : submitted ? '护理日记 📔' : '写日记 ✏️'}</Text>
          </View>
          {isReadOnly ? (
            <View style={{ width: 60 }} />
          ) : submitted && !finished ? (
            <View style={{ width: 60 }} />
          ) : existingId && finished ? (
            <TouchableOpacity style={styles.headerDeleteBtn} onPress={() => setShowDeleteModal(true)} activeOpacity={0.8}>
              <Text style={styles.headerDeleteBtnText}>🗑️ 删除</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.headerHomeBtn} onPress={requestLeaveEditor} activeOpacity={0.7}>
              <Text style={styles.headerHomeBtnText}>✕ 取消</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Main content ── */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={0}
        >
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={styles.container}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={Keyboard.dismiss}
          >
            <Animated.View style={{ opacity: formFade, transform: [{ translateY: formSlide }] }}>

              {/* Date pill */}
              <View style={styles.datePillRow}>
                <View style={styles.datePill}>
                  <Text style={styles.datePillText}>📅 {publishedLabel} ☀️</Text>
                </View>
              </View>
              {!submitted && draftRestoredAt ? (
                <View style={styles.draftRestoredBanner}>
                  <Text style={styles.draftRestoredText}>📝 已恢复本机草稿，可继续编辑</Text>
                </View>
              ) : null}

              {/* ── FORM (only before submission) ── */}
              {!submitted && (
                <>
                  {/* Motivational banner */}
                  <View style={styles.motiveBanner}>
                    <LinearGradient
                      colors={[...Gradients.appBg]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={styles.motiveBannerInner}
                    >
                      <Text style={styles.motiveEmoji}>📔</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.motiveTitle}>每一天都值得被记住</Text>
                        <Text style={styles.motiveSubtitle}>
                          {diaryCount > 0
                            ? `已记录 ${diaryCount} 篇日记`
                            : `今天写下第一篇护理日记，从现在开始 💛`}
                        </Text>
                      </View>
                      {diaryCount > 0 && (
                        <View style={styles.motiveCountBadge}>
                          <Text style={styles.motiveCountNum}>{diaryCount}</Text>
                          <Text style={styles.motiveCountLabel}>篇</Text>
                        </View>
                      )}
                    </LinearGradient>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.label}>
                      <Text style={{ color: '#A07858' }}>🌡 </Text>
                      {elderNickname}今天的状态如何？
                    </Text>
                    <View style={styles.moodRow}>
                      {MOOD_OPTIONS.map((m, i) => (
                        <MoodOption key={i} mood={m} selected={selectedMood === i} onPress={() => setSelectedMood(i)} />
                      ))}
                    </View>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.label}>
                      <Text style={{ color: '#A07858' }}>✨ </Text>
                      今天有哪些值得记录的事？
                    </Text>
                    <View style={styles.tagsGrid}>
                      {TAGS.map((tag, i) => (
                        <TagOption key={i} tag={tag} selected={selectedTags.includes(tag)} onPress={() => toggleTag(tag)} />
                      ))}
                    </View>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.label}>
                      <Text style={{ color: '#A07858' }}>💜 </Text>
                      {caregiverName}，您今天感觉怎么样？
                    </Text>
                    <Text style={styles.caregiverMoodHint}>照顾好自己也很重要</Text>
                    <View style={styles.caregiverMoodRow}>
                      {CAREGIVER_MOODS.map((m, i) => (
                        <TouchableOpacity
                          key={i}
                          style={[styles.caregiverMoodChip, caregiverMoodIdx === i && styles.caregiverMoodChipSelected]}
                          onPress={() => {
                            setCaregiverMoodIdx(caregiverMoodIdx === i ? -1 : i);
                            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.caregiverMoodEmoji}>{m.emoji}</Text>
                          <Text style={[styles.caregiverMoodLabel, caregiverMoodIdx === i && styles.caregiverMoodLabelSelected]}>{m.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.section}>
                    <View style={styles.noteLabelRow}>
                      <Text style={styles.label}>
                        <Text style={{ color: '#A07858' }}>💬 </Text>
                        用文字记下今天（可选）
                      </Text>
                    </View>
                    <TextInput
                      style={styles.noteInput}
                      placeholder={`${elderNickname}今天有什么特别的时刻？\n您有什么感受或担心想记下来？\n哪怕只有一两句话，都很有意义 💗`}
                      value={content}
                      onChangeText={setContent}
                      multiline
                      placeholderTextColor="#C4A0B8"
                      textAlignVertical="top"
                      onFocus={() => {
                        setTimeout(() => {
                          scrollRef.current?.scrollToEnd({ animated: true });
                        }, 300);
                      }}
                    />
                  </View>
                </>
              )}

              {/* ── SUBMITTED: diary summary card ── */}
              {submitted && (
                <View style={styles.summaryCard}>
                  <View style={styles.summaryHeader}>
                    <View style={[styles.moodBadge, { backgroundColor: (MOOD_OPTIONS[selectedMood]?.color ?? '#888') + '18' }]}>
                      <Text style={styles.moodBadgeEmoji}>{MOOD_OPTIONS[selectedMood]?.emoji}</Text>
                      <Text style={[styles.moodBadgeLabel, { color: MOOD_OPTIONS[selectedMood]?.color }]}>
                        {MOOD_OPTIONS[selectedMood]?.label}
                      </Text>
                    </View>
                    {selectedTags.length > 0 && (
                      <View style={styles.tagRow}>
                        {selectedTags.slice(0, 3).map((t, i) => (
                          <View key={i} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
                        ))}
                        {selectedTags.length > 3 && <View style={styles.tag}><Text style={styles.tagText}>+{selectedTags.length - 3}</Text></View>}
                      </View>
                    )}
                  </View>
                  {displayedDiaryBody ? (
                    <Text style={styles.summaryContent}>{displayedDiaryBody}</Text>
                  ) : (
                    <Text style={styles.summaryNoContent}>（未写详细内容）</Text>
                  )}
                </View>
              )}

              {/* ── CONVERSATION ── */}
              {(displayedConversation.length > 0 || smartLoading) && (
                <View style={styles.chatContainer}>
                  <Text style={styles.chatTitle}>💬 小马虎对话</Text>

                  {displayedConversation.map((msg, i) =>
                    msg.role === 'user' ? (
                      <UserBubble key={msg.id} text={msg.text} />
                    ) : (
                      <View key={msg.id}>
                        <SmartNameRow />
                        <SmartBubble
                          text={msg.text}
                          animate={i === displayedConversation.length - 1 && !finished}
                          isFirst={i === firstDisplayedAiIndex}
                        />
                      </View>
                    )
                  )}

                  {smartLoading && (
                    <View>
                      <SmartNameRow />
                      <View style={styles.smartBubbleWrap}>
                        <View style={[styles.bubbleBlue, styles.bubbleBluePink, { paddingVertical: 14 }]}>
                          <TypingIndicator />
                        </View>
                      </View>
                    </View>
                  )}

                  {finished && (
                    <View style={styles.finishedBanner}>
                      <Text style={styles.finishedText}>✅ 对话已结束并保存</Text>
                    </View>
                  )}
                </View>
              )}

              {/* 正式发布后显示阅读回执和家庭留言；作者本人不会被计入阅读者。 */}
              {canShowInteractions && (
                <DiaryInteractions
                  diaryId={interactionDiaryId}
                  roomId={interactionRoomId}
                  onInputFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                />
              )}

            </Animated.View>
          </ScrollView>

          {/* ── Bottom Bar ── */}
          <View style={styles.bottomBar}>
            {isReadOnly ? (
              <View style={styles.finishedBottomBanner}>
                <Text style={styles.finishedBottomText}>👀 只读模式</Text>
                <TouchableOpacity onPress={returnToDiaryList}>
                  <Text style={styles.goBackText}>返回日记本 →</Text>
                </TouchableOpacity>
              </View>
            ) : !submitted ? (
              <View style={styles.draftActionGroup}>
                <TouchableOpacity
                  style={[styles.submitBtnWrap, (submitting || !content.trim()) && { opacity: 0.55 }]}
                  onPress={handleSubmit}
                  disabled={submitting || !content.trim()}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={['#B07858', '#8B5E3C', '#A07050']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitBtn}>
                    {submitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.submitBtnText}>记录好了，听小马虎说说 💕</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveDraftBtn}
                  onPress={() => { saveDraftAndLeave().catch(() => {}); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.saveDraftBtnText}>📝 保存草稿，稍后继续</Text>
                </TouchableOpacity>
              </View>
            ) : !finished ? (
              <>
                <View style={styles.inputRow}>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.chatInput}
                      placeholder="继续和小马虎说说...💗"
                      value={followUpInput}
                      onChangeText={setFollowUpInput}
                      placeholderTextColor="#C4A0B8"
                      returnKeyType="send"
                      blurOnSubmit={false}
                      onSubmitEditing={handleFollowUp}
                      editable={!followUpLoading}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.sendBtnWrap, (!followUpInput.trim() || followUpLoading) && { opacity: 0.4 }]}
                    onPress={handleFollowUp}
                    disabled={!followUpInput.trim() || followUpLoading}
                    activeOpacity={0.85}
                  >
                    <LinearGradient colors={['#B07858', '#8B5E3C']} style={styles.sendBtn}>
                      {followUpLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ fontSize: 18, color: AppColors.surface.whiteStrong }}>➤</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
                {/* 结束并保存按钮：与右上角「保存」功能完全一致，方便用户随时结束对话 */}
                <TouchableOpacity
                  style={[styles.endAndSaveBtn, (saving || smartLoading || followUpLoading) && { opacity: 0.6 }]}
                  onPress={handleEndAndSave}
                  disabled={saving || smartLoading || followUpLoading}
                  activeOpacity={0.85}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#4CAF50" />
                  ) : (
                    <Text style={styles.endAndSaveBtnText}>✅ 结束并保存</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.finishedBottomBanner}>
                <Text style={styles.finishedBottomText}>✅ 日记已保存</Text>
                <TouchableOpacity onPress={returnToDiaryList}>
                  <Text style={styles.goBackText}>返回日记本 →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>

      {/* ── 删除确认弹窗 ── */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.deleteModalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setShowDeleteModal(false)} activeOpacity={1} />
          <View style={styles.deleteModalBox}>
            <Text style={styles.deleteModalIcon}>🗑️</Text>
            <Text style={styles.deleteModalTitle}>删除这篇日记？</Text>
            <Text style={styles.deleteModalMsg}>删除后无法恢复，确定要删除这篇日记吗？</Text>
            <View style={styles.deleteModalBtns}>
              <TouchableOpacity style={styles.deleteModalCancelBtn} onPress={() => setShowDeleteModal(false)} activeOpacity={0.8}>
                <Text style={styles.deleteModalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteModalConfirmBtn} onPress={handleDeleteEntry} activeOpacity={0.8}>
                <Text style={styles.deleteModalConfirmText}>确定删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  decor: { position: 'absolute', zIndex: 0 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(253,249,247,0.95)',
    borderBottomWidth: 1, borderBottomColor: AppColors.border.soft,
    zIndex: 10,
  },
  headerBack: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  headerBackText: { fontSize: 15, color: AppColors.text.secondary, fontWeight: '600' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#A07858',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: AppColors.text.primary },
  headerSaveBtn: {
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3,
  },
  headerSaveBtnText: { fontSize: 13, fontWeight: '700', color: AppColors.surface.whiteStrong },
  draftRestoredBanner: { alignSelf: 'center', marginBottom: 10, backgroundColor: '#EAF7EE', borderWidth: 1, borderColor: '#B7E2C2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  draftRestoredText: { color: '#287A43', fontSize: 12, fontWeight: '600' },
  headerHomeBtn: {
    backgroundColor: AppColors.bg.secondary, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  headerHomeBtnText: { fontSize: 13, color: AppColors.text.secondary, fontWeight: '600' },
  headerDeleteBtn: {
    backgroundColor: '#FEF2F2', borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1.5, borderColor: '#FECACA',
  },
  headerDeleteBtnText: { fontSize: 13, color: '#DC2626', fontWeight: '600' },

  // Delete modal
  deleteModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  deleteModalBox: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 20,
    padding: 24, width: '100%', maxWidth: 320, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 12,
  },
  deleteModalIcon: { fontSize: 36, marginBottom: 10 },
  deleteModalTitle: { fontSize: 18, fontWeight: '800', color: AppColors.text.primary, marginBottom: 8 },
  deleteModalMsg: { fontSize: 14, color: AppColors.text.secondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  deleteModalBtns: { flexDirection: 'row', gap: 10, width: '100%' },
  deleteModalCancelBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 12,
    backgroundColor: AppColors.bg.secondary, borderWidth: 1.5, borderColor: AppColors.border.soft,
    alignItems: 'center',
  },
  deleteModalCancelText: { fontSize: 15, fontWeight: '600', color: AppColors.text.secondary },
  deleteModalConfirmBtn: {
    flex: 1, borderRadius: 12, paddingVertical: 12,
    backgroundColor: '#DC2626', alignItems: 'center',
  },
  deleteModalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Loading
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: AppColors.text.secondary },

  container: { padding: 16, paddingBottom: 20, zIndex: 1 },

  // Date pill
  datePillRow: { alignItems: 'center', marginBottom: 20 },
  datePill: {
    backgroundColor: 'rgba(253,249,247,0.90)',
    borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7,
    borderWidth: 1, borderColor: AppColors.border.soft,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  datePillText: { fontSize: 12, color: AppColors.text.secondary },

  // Motivational banner
  motiveBanner: { marginBottom: 24 },
  motiveBannerInner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 18, padding: 16,
    borderWidth: 1.5, borderColor: '#FDE68A',
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 2,
  },
  motiveEmoji: { fontSize: 32 },
  motiveTitle: { fontSize: 14, fontWeight: '800', color: '#92400E', marginBottom: 2 },
  motiveSubtitle: { fontSize: 12, color: '#B45309', lineHeight: 18 },
  motiveCountBadge: {
    alignItems: 'center', backgroundColor: '#FDE68A',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6,
    minWidth: 44,
  },
  motiveCountNum: { fontSize: 20, fontWeight: '900', color: '#92400E', lineHeight: 24 },
  motiveCountLabel: { fontSize: 10, color: '#B45309', fontWeight: '600' },

  // Form sections
  section: { marginBottom: 24 },
  label: { fontSize: 15, fontWeight: '700', color: AppColors.text.primary, marginBottom: 12 },
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  caregiverMoodHint: { fontSize: 12, color: AppColors.text.tertiary, marginTop: -6, marginBottom: 10 },
  caregiverMoodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  caregiverMoodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1.5, borderColor: AppColors.purple.primary,
    backgroundColor: 'rgba(253,249,247,0.95)',
  },
  caregiverMoodChipSelected: { borderColor: AppColors.purple.strong, backgroundColor: AppColors.purple.soft },
  caregiverMoodEmoji: { fontSize: 18 },
  caregiverMoodLabel: { fontSize: 13, color: AppColors.text.secondary, fontWeight: '500' },
  caregiverMoodLabelSelected: { color: AppColors.purple.strong, fontWeight: '700' },
  moodOption: {
    alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: AppColors.border.soft,
    backgroundColor: 'rgba(253,249,247,0.95)', minWidth: 56,
  },
  moodOptionEmoji: { fontSize: 22, marginBottom: 2 },
  moodOptionLabel: { fontSize: 11, color: AppColors.text.secondary, fontWeight: '500' },
  tagsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagOption: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1.5, borderColor: AppColors.border.soft,
    backgroundColor: 'rgba(253,249,247,0.95)',
  },
  tagOptionSelected: { borderColor: '#A07858', backgroundColor: '#F0EBE3' },
  tagOptionText: { fontSize: 13, color: AppColors.text.secondary, fontWeight: '500' },
  tagOptionTextSelected: { color: '#7A5C3E', fontWeight: '700' },
  noteLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  noteInput: {
    backgroundColor: 'rgba(253,249,247,0.95)', borderRadius: 16,
    borderWidth: 1.5, borderColor: AppColors.border.soft,
    padding: 14, fontSize: 15, color: AppColors.text.primary,
    minHeight: 130, lineHeight: 22,
  },
  noteHint: {
    fontSize: 11, color: AppColors.text.tertiary, marginTop: 6,
    textAlign: 'right', fontStyle: 'italic',
  },

  // Summary card
  summaryCard: {
    backgroundColor: 'rgba(253,249,247,0.98)', borderRadius: 20,
    padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: AppColors.border.soft,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  moodBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  moodBadgeEmoji: { fontSize: 14 },
  moodBadgeLabel: { fontSize: 12, fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: { backgroundColor: AppColors.bg.secondary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, color: AppColors.text.secondary, fontWeight: '500' },
  summaryContent: { fontSize: 14, color: AppColors.text.primary, lineHeight: 20 },
  summaryNoContent: { fontSize: 13, color: AppColors.text.secondary, fontStyle: 'italic' },

  // Chat
  chatContainer: { marginTop: 4, marginBottom: 8, gap: 4 },
  chatTitle: {
    fontSize: 12, fontWeight: '700', color: AppColors.text.tertiary,
    textAlign: 'center', marginBottom: 12, letterSpacing: 0.5,
  },

  // User bubble
  bubbleRowRight: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', marginBottom: 12, paddingLeft: 50, gap: 8 },
  userAvatarCircle: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', backgroundColor: AppColors.peach.soft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  userAvatarImg: { width: 34, height: 34, borderRadius: 17 },
  userAvatarEmoji: { fontSize: 18 },
  bubbleGreen: {
    borderRadius: 24, borderTopRightRadius: 6,
    paddingHorizontal: 18, paddingVertical: 12, maxWidth: SW * 0.72,
    shadowColor: '#34D399', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3,
  },
  bubbleGreenText: { fontSize: 15, color: AppColors.surface.whiteStrong, lineHeight: 22, fontWeight: '500', flexWrap: 'wrap' },

  // 智能助手气泡
  smartBubbleWrap: { position: 'relative', marginBottom: 4 },
  stickerDecor: {
    position: 'absolute', top: -12, right: -8, zIndex: 10,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FDE047',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: AppColors.shadow.dark, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  stickerText: { fontSize: 18 },
  bubbleBlue: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 24, borderTopLeftRadius: 6,
    paddingHorizontal: 18, paddingVertical: 16,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  bubbleBlueFirst: { borderWidth: 1.5, borderColor: AppColors.border.soft },
  bubbleBluePink: { borderWidth: 1.5, borderColor: AppColors.border.soft },
  bubbleDots: { flexDirection: 'row', gap: 3, position: 'absolute', top: 10, right: 12 },
  bubbleDot: { width: 5, height: 5, borderRadius: 2.5 },
  bubbleBlueText: { fontSize: 15, color: AppColors.text.primary, lineHeight: 24 },

  // 智能助手名称行
  smartNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, marginLeft: 2 },
  smartAvatarWrap: { position: 'relative' },
  smartAvatarCircle: {
    width: 38, height: 38, borderRadius: 19, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 3,
  },
  smartAvatarEmoji: { fontSize: 18 },
  smartOnlineDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#4ADE80', borderWidth: 2, borderColor: AppColors.surface.whiteStrong,
  },
  smartName: { fontSize: 13, fontWeight: '800', color: AppColors.text.primary },
  smartBadgeRow: { flexDirection: 'row', marginTop: 2 },
  smartBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  smartBadgeText: { fontSize: 10, fontWeight: '700', color: AppColors.surface.whiteStrong },

  // Typing
  typingRow: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 4 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#C4A882' },

  // Finished banner inside chat
  finishedBanner: {
    backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12, marginTop: 8,
    alignItems: 'center', borderWidth: 1, borderColor: '#BBF7D0',
  },
  finishedText: { fontSize: 13, color: '#16A34A', fontWeight: '600' },

  // Bottom bar
  draftActionGroup: { gap: 8 },
  saveDraftBtn: { alignItems: 'center', paddingVertical: 9 },
  saveDraftBtnText: { color: '#8B5E3C', fontSize: 13, fontWeight: '700' },
  bottomBar: {
    backgroundColor: 'rgba(253,249,247,0.97)',
    borderTopWidth: 1, borderTopColor: AppColors.border.soft,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    gap: 10,
  },

  // Submit button (pre-submit)
  submitBtnWrap: { borderRadius: 999 },
  submitBtn: {
    borderRadius: 999, paddingVertical: 16,
    alignItems: 'center',
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 4,
  },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: AppColors.surface.whiteStrong },

  // Input row
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  endAndSaveBtn: {
    marginTop: 10,
    alignSelf: 'center',
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(176,120,88,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(176,120,88,0.35)',
  },
  endAndSaveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8B5E3C',
    letterSpacing: 0.3,
  },
  inputWrap: { flex: 1 },
  chatInput: {
    backgroundColor: 'rgba(250,248,245,0.95)',
    borderWidth: 1.5, borderColor: AppColors.border.soft,
    borderRadius: 999,
    paddingHorizontal: 20, paddingVertical: 12,
    fontSize: 15, color: AppColors.text.primary,
  },
  sendBtnWrap: {},
  sendBtn: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },

  // End & Save button
  endBtnWrap: { borderRadius: 999, overflow: 'hidden' },
  endBtn: {
    borderRadius: 999, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', overflow: 'hidden',
  },
  endBtnShimmer: {
    position: 'absolute',
    width: 80, height: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    transform: [{ skewX: '-20deg' }],
  },
  endBtnText: { fontSize: 15, fontWeight: '700', color: AppColors.surface.whiteStrong, zIndex: 1 },

  // Finished bottom state
  finishedBottomBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8,
  },
  finishedBottomText: { fontSize: 14, color: '#16A34A', fontWeight: '600' },
  goBackText: { fontSize: 14, color: AppColors.coral.primary, fontWeight: '700' },
});
