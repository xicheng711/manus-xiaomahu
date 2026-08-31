import React, { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, Easing, Modal, TextInput, Platform,
  Keyboard, KeyboardAvoidingView, TouchableWithoutFeedback, Image, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useWeather } from '@/lib/weather-context';
import {
  getProfile, getAllCheckIns, getDiaryEntries, getFamilyAnnouncements,
  saveFamilyAnnouncement,
  DailyCheckIn, DiaryEntry, FamilyAnnouncement, FamilyMember, mergeCloudDiariesIntoLocal,
  mergeCloudCheckInsIntoLocal, getNapMinutes, hasRecordedNap,
} from '@/lib/storage';
import { cloudGetCheckIns, cloudGetDiaries, cloudGetElderProfile, cloudGetAnnouncements, cloudGetRoomDetail, shouldRefreshCloudCache, markCloudCacheFresh } from '@/lib/cloud-sync';
import { TrendChart } from '@/components/trend-chart';
import { getLunarDate, getFormattedDate } from '@/lib/lunar';
import { SHADOWS } from '@/lib/animations';
import { AppColors, Gradients } from '@/lib/design-tokens';
import { useFamilyContext } from '@/lib/family-context';

type FeedItem = {
  id: string;
  type: 'checkin' | 'diary' | 'announce' | 'med';
  time: string;
  icon: string;
  color: string;
  bg: string;
  tag: string;
  title: string;
  detail: string;
  author: string | null;
  sortKey: number;
};

function timeStr(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function getNapDisplay(checkIn?: Partial<DailyCheckIn> | null): string {
  const minutes = getNapMinutes(checkIn);
  if (minutes <= 0) return '没有小睡';
  return minutes >= 60
    ? `${(minutes / 60).toFixed(1).replace('.0', '')}小时`
    : `${Math.round(minutes)}分钟`;
}

// Prefer localTimeStr (writer's local time) over createdAt (UTC timestamp)
function getTimeDisplay(entry: DiaryEntry): string {
  return entry.localTimeStr || (entry.createdAt ? timeStr(entry.createdAt) : entry.date);
}

/** 首页公告始终显示发布者记录的日期和时间，避免跨天、跨时区混淆。 */
function getAnnouncementDateTime(announcement: FamilyAnnouncement): string {
  const time = announcement.localTimeStr || timeStr(announcement.createdAt);
  const rawDate = announcement.date || '';
  const match = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    const thisYear = String(new Date().getFullYear());
    return `${year === thisYear ? '' : `${year}/`}${Number(month)}/${Number(day)} ${time}`;
  }
  const created = new Date(announcement.createdAt);
  if (!Number.isNaN(created.getTime())) {
    return `${created.getMonth() + 1}/${created.getDate()} ${time}`;
  }
  return time;
}

function buildFeed(
  checkIns: DailyCheckIn[],
  diaries: DiaryEntry[],
  announcements: FamilyAnnouncement[],
  caregiverName: string,
): FeedItem[] {
  const items: FeedItem[] = [];

  const latest = checkIns[0];
  if (latest) {
    const dayStart = new Date(`${latest.date}T00:00:00`).getTime();
    const completedAtMs = latest.completedAt ? new Date(latest.completedAt).getTime() : NaN;
    const validCompletedAtMs = Number.isFinite(completedAtMs) ? completedAtMs : null;
    if (latest.morningDone) {
      // 同一条打卡记录的 completedAt 会在晚间保存时更新，不能再把它当作早间完成时间。
      const morningHasExactTime = !latest.eveningDone && !!latest.completedAt;
      items.push({
        id: `ci-m-${latest.id}`, type: 'checkin',
        time: morningHasExactTime ? timeStr(latest.completedAt) : '早间',
        icon: '✅', color: AppColors.green.strong, bg: AppColors.green.soft, tag: '早间打卡',
        title: '今日早间打卡完成',
        detail: `心情 ${latest.caregiverMoodEmoji || '😊'} · 睡眠 ${latest.sleepHours}h · ${latest.medicationTaken ? '用药已服' : '用药待记录'}`,
        author: null,
        sortKey: morningHasExactTime && validCompletedAtMs ? validCompletedAtMs : dayStart + 8 * 3600000,
      });
    }
    if (latest.eveningDone) {
      items.push({
        id: `ci-e-${latest.id}`, type: 'checkin',
        time: latest.completedAt ? timeStr(latest.completedAt) : '晚间',
        icon: '🌙', color: AppColors.purple.strong, bg: AppColors.purple.soft, tag: '晚间打卡',
        title: '今日护理完成',
        detail: `心情 ${latest.moodEmoji || '😴'} · ${latest.medicationTaken ? '用药已按时服用' : '用药记录未完成'} · 饮食：${latest.mealOption || latest.mealNotes || '未记录'}`,
        author: null,
        sortKey: validCompletedAtMs ?? dayStart + 20 * 3600000,
      });
    }
  }

  // 对日记去重：先按 id 去重，再按「日期+内容前20字」去重（应对服务端历史重复写入的数据）
  // 同时过滤未完成的日记对话（conversationFinished === false 的不显示）
  const seenDiaryIds = new Set<string>();
  const seenDiaryContent = new Set<string>();
  const uniqueDiaries = diaries.filter(d => {
    // 过滤未完成的日记对话（conversationFinished 明确为 false 时跳过）
    if (d.conversationFinished === false) return false;
    if (!d.id || seenDiaryIds.has(String(d.id))) return false;
    seenDiaryIds.add(String(d.id));
    // 内容去重：相同日期+相同内容开头的日记只显示一条
    const contentKey = `${d.date}::${(d.content || '').slice(0, 20)}`;
    if (seenDiaryContent.has(contentKey)) return false;
    seenDiaryContent.add(contentKey);
    return true;
  });
  uniqueDiaries.slice(0, 3).forEach(d => {
    items.push({
      id: `diary-${d.id}`, type: 'diary',
      time: getTimeDisplay(d),
      icon: '📔', color: AppColors.peach.primary, bg: AppColors.peach.soft, tag: '护理日记',
      title: d.content.length > 20 ? d.content.slice(0, 20) + '…' : d.content,
      detail: d.tags && d.tags.length ? d.tags.slice(0, 3).join(' · ') : `${d.moodEmoji || '😊'} ${d.moodLabel || ''}`,
      author: d.authorName || caregiverName || '照顾者',  // 优先用日记自带的 authorName
      // createdAt 用于同一天不同活动的真实先后顺序；date 仍只负责“是否属于今天”的筛选。
      sortKey: d.createdAt ? new Date(d.createdAt).getTime() : new Date(`${d.date}T12:00:00`).getTime(),
    });
  });

  announcements.slice(0, 3).forEach(a => {
    // 优先用 localTimeStr（发布者本地时间），避免服务端 UTC 时间导致的时间偏差
    const annTime = (a as any).localTimeStr || timeStr(a.createdAt);
    items.push({
      id: `ann-${a.id}`, type: 'announce',
      time: annTime,
      icon: '📢', color: AppColors.purple.strong, bg: AppColors.purple.soft, tag: '家庭公告',
      title: a.content.length > 24 ? a.content.slice(0, 24) + '…' : a.content,
      detail: a.emoji ? `${a.emoji} ${a.content}` : a.content,
      author: a.authorName,
      sortKey: new Date(a.createdAt).getTime(),
    });
  });

  // 活动流按最新在前展示，符合通知和家庭动态的阅读习惯。
  return items.sort((a, b) => b.sortKey - a.sortKey);
}

function AnnouncementCard({ latest, onViewAll, onCompose }: {
  latest: FamilyAnnouncement | null;
  onViewAll: () => void;
  onCompose: () => void;
}) {
  return (
    <View style={styles.announceCard}>
      <TouchableOpacity onPress={onViewAll} activeOpacity={0.85}>
        <View style={styles.announceHeader}>
          <View style={styles.announceHeaderLeft}>
            <Text style={styles.announceHeaderIcon}>📢</Text>
            <Text style={styles.announceHeaderTitle}>家庭公告栏</Text>
          </View>
          <Text style={styles.announceArrow}>›</Text>
        </View>
        {latest ? (
          <View style={styles.announceContent}>
            <Text style={styles.announceText} numberOfLines={2}>{latest.content}</Text>
            <View style={styles.announceFooter}>
              <Text style={styles.announceAuthorEmoji}>{latest.authorEmoji}</Text>
              <Text style={styles.announceAuthorName}>{latest.authorName}</Text>
              <Text style={styles.announceTime}> · {getAnnouncementDateTime(latest)}</Text>
            </View>
          </View>
        ) : null}
      </TouchableOpacity>
      <TouchableOpacity style={styles.composeHint} onPress={onCompose} activeOpacity={0.8}>
        <Text style={styles.composeHintIcon}>✏️</Text>
        <Text style={styles.composeHintText}>发布一条家庭公告</Text>
        <Text style={styles.composeHintArrow}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

function FeedRow({ item, isLast, onPress }: { item: FeedItem; isLast: boolean; onPress?: () => void }) {
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={[styles.feedRow, { opacity: fade, transform: [{ translateY: slide }] }]}>
      <View style={styles.feedTimeline}>
        <View style={[styles.feedDot, { backgroundColor: item.bg, borderColor: item.color + '40' }]}>
          <Text style={{ fontSize: 13, lineHeight: 16 }}>{item.icon}</Text>
        </View>
        {!isLast && <View style={styles.feedLine} />}
      </View>
      <TouchableOpacity style={styles.feedContent} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
        <View style={styles.feedTagRow}>
          <View style={[styles.feedTag, { backgroundColor: item.bg }]}>
            <Text style={[styles.feedTagText, { color: item.color }]}>{item.tag}</Text>
          </View>
          {item.author && (
            <View style={styles.feedAuthorRow}>
              <Text style={styles.feedAuthorIcon}>👤</Text>
              <Text style={styles.feedAuthorName}>{item.author}</Text>
            </View>
          )}
          <Text style={styles.feedTime}>{item.time}</Text>
        </View>
        <Text style={styles.feedTitle}>{item.title}</Text>
        <Text style={styles.feedDetail}>{item.detail}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function UpgradeCard({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.upgradeCard}>
      <Text style={styles.upgradeSectionLabel}>🔒 更多记录功能</Text>
      <View style={styles.upgradeIconRow}>
        {[{ e: '✨', l: '打卡' }, { e: '💊', l: '用药' }].map(t => (
          <View key={t.l} style={styles.upgradeIconItem}>
            <View style={styles.upgradeIconBox}>
              <Text style={{ fontSize: 22, opacity: 0.35 }}>{t.e}</Text>
            </View>
            <Text style={styles.upgradeIconLabel}>{t.l}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.upgradeDesc}>打卡和用药记录是主要照顾者的专属功能。{'\n'}创建自己的家庭档案，即可解锁完整记录能力。</Text>
      <TouchableOpacity style={styles.upgradeBtn} onPress={onPress} activeOpacity={0.85}>
        <LinearGradient
          colors={[Gradients.purple[0], AppColors.purple.strong, Gradients.purple[1]]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.upgradeBtnGradient}
        >
          <Text style={styles.upgradeBtnText}>＋ 创建我的家庭档案</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const ANNOUNCE_TYPES = [
  { key: 'news',     label: '📢 通知', emoji: '📢' },
  { key: 'medical',  label: '🏥 就医', emoji: '🏥' },
  { key: 'reminder', label: '⏰ 提醒', emoji: '⏰' },
  { key: 'daily',    label: '🌿 日常', emoji: '🌿' },
] as const;

function PostAnnouncementModal({ visible, onClose, onPosted, member }: {
  visible: boolean;
  onClose: () => void;
  onPosted: () => void;
  member: FamilyMember | null;
}) {
  const [content, setContent] = useState('');
  const [type, setType] = useState<typeof ANNOUNCE_TYPES[number]['key']>('news');
  const [posting, setPosting] = useState(false);
  const [done, setDone] = useState(false);

  async function handlePost() {
    if (!content.trim() || posting) return;
    setPosting(true);
    try {
      await saveFamilyAnnouncement({
        authorId: member?.id ?? 'unknown',
        authorName: member?.name ?? '家庭成员',
        authorEmoji: member?.emoji ?? '👤',
        authorColor: member?.color ?? AppColors.text.secondary,
        content: content.trim(),
        emoji: ANNOUNCE_TYPES.find(t => t.key === type)?.emoji,
        type,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDone(true);
    } catch (error: any) {
      Alert.alert('公告没有发布成功', error?.message || '请检查网络后重试，输入内容仍为你保留。');
    } finally {
      setPosting(false);
    }
  }

  function handleClose() {
    setContent('');
    setType('news');
    setDone(false);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => {}} accessible={false}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                {done ? (
                  <View style={styles.modalDone}>
                    <Text style={{ fontSize: 44, marginBottom: 12 }}>✅</Text>
                    <Text style={styles.modalDoneTitle}>公告已发布</Text>
                    <Text style={styles.modalDoneSubtitle}>所有家庭成员都能看到</Text>
                    <TouchableOpacity style={styles.modalDoneBtn} onPress={() => { handleClose(); onPosted(); }}>
                      <Text style={styles.modalDoneBtnText}>好的</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <Text style={styles.modalTitle}>发布家庭公告</Text>
                    <Text style={styles.modalSubtitle}>所有家庭成员都能看到</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={content}
                      onChangeText={setContent}
                      placeholder="输入公告内容，如：下周三复查，提醒大家早点出发…"
                      placeholderTextColor={AppColors.text.tertiary}
                      multiline
                      numberOfLines={4}
                      returnKeyType="default"
                      submitBehavior="newline"
                      blurOnSubmit={false}
                    />
                    <View style={styles.typeRow}>
                      {ANNOUNCE_TYPES.map(t => (
                        <TouchableOpacity
                          key={t.key}
                          style={[styles.typeChip, type === t.key && styles.typeChipActive]}
                          onPress={() => setType(t.key)}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.typeChipText, type === t.key && styles.typeChipTextActive]}>{t.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity
                      style={[styles.postSubmitBtn, (!content.trim() || posting) && styles.postSubmitBtnDisabled]}
                      onPress={handlePost}
                      activeOpacity={0.85}
                      disabled={!content.trim() || posting}
                    >
                      <Text style={[styles.postSubmitText, (!content.trim() || posting) && styles.postSubmitTextDisabled]}>
                        {posting ? '发布中…' : '发布公告'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={posting}>
                      <Text style={styles.cancelBtnText}>取消</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function JoinerHomeScreen({ refreshToken }: { refreshToken?: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { memberships, activeMembership, switchFamily } = useFamilyContext();
  const [elderNickname, setElderNickname] = useState('家人');
  const [elderEmoji, setElderEmoji] = useState('🌸');
  const [elderPhotoUri, setElderPhotoUri] = useState<string | null>(null);
  const [caregiverName, setCaregiverName] = useState('');
  const [latestCheckIn, setLatestCheckIn] = useState<DailyCheckIn | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [latestAnnounce, setLatestAnnounce] = useState<FamilyAnnouncement | null>(null);
  const [currentMember, setCurrentMember] = useState<FamilyMember | null>(null);
  const [memberPhotoUri, setMemberPhotoUri] = useState<string | null>(null);
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const [zodiacEmoji, setZodiacEmoji] = useState<string>('');
  const [briefingSummary, setBriefingSummary] = useState<string | null>(null);
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [allCheckIns, setAllCheckIns] = useState<DailyCheckIn[]>([]);
  const [allDiaries, setAllDiaries] = useState<DiaryEntry[]>([]);
  const { weatherData, buildGreeting } = useWeather();

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-12)).current;

  const todayLabel = getFormattedDate();
  const lunarDate = getLunarDate();

  const activeFamilyId = activeMembership?.familyId ?? null;
  const activeFamilyIdRef = useRef<string | null>(activeFamilyId);
  activeFamilyIdRef.current = activeFamilyId;

  const loadData = useCallback(async (forceCloud = false) => {
    const requestedMembership = activeMembership;
    const requestedFamilyId = requestedMembership?.familyId ?? null;
    if (!requestedFamilyId || !requestedMembership) return;
    const isCurrentFamily = () => activeFamilyIdRef.current === requestedFamilyId;
    const scopedMember = requestedMembership.room.members.find(item => item.id === requestedMembership.myMemberId) ?? null;
    setCurrentMember(scopedMember);
    setElderNickname(requestedMembership.room.elderName || '家人');
    // 被照顾者头像：优先使用当前家庭缓存的照片；emoji 由云端 elder profile 更新。
    setElderPhotoUri(requestedMembership.room.elderPhotoUri || null);
    const profile = await getProfile();
    if (!isCurrentFamily()) return;
    const allowLegacyFallback = memberships.length === 1;
    if (profile && allowLegacyFallback) {
      setCaregiverName(profile.caregiverName || '');
    }
    // 头像优先级：主动从云端拉取最新 room detail，确保头像是最新的
    // 而不是依赖可能过期的 activeMembership 缓存
    let resolvedMemberPhotoUri: string | null = null;
    try {
      const roomId = parseInt(requestedFamilyId);
      if (roomId && !isNaN(roomId)) {
        const detail = await cloudGetRoomDetail(roomId);
        if (!isCurrentFamily()) return;
        if (detail?.members) {
          const freshMember = detail.members.find(
            (m: any) => String(m.id) === String(scopedMember?.id) || String(m.id) === String(requestedMembership.myMemberId)
          );
          if (freshMember?.photoUri) {
            resolvedMemberPhotoUri = freshMember.photoUri;
          }
          // 同时更新被照者头像（主照顾者上传后 Joiner 能看到）
          if (detail.room?.elderPhotoUri) {
            setElderPhotoUri(detail.room.elderPhotoUri);
          }
          // 从 room members 找到 isCreator 成员，用其名字作为记录人（主照顾者名字）
          const creatorMemberFromRoom = (detail.members as any[]).find((m: any) => m.isCreator);
          if (creatorMemberFromRoom?.name) {
            setCaregiverName(creatorMemberFromRoom.name);
          }
        }
      }
    } catch (e) {
      console.warn('[JoinerHome] cloudGetRoomDetail for avatar failed:', e);
    }
    // 降级顺序：云端最新 > activeMembership 缓存 > 本地 member.photoUri
    if (!resolvedMemberPhotoUri) {
      const cachedMember = requestedMembership.room.members.find(
        (m: any) => m.isCurrentUser || String(m.id) === String(scopedMember?.id)
      );
      resolvedMemberPhotoUri = cachedMember?.photoUri || scopedMember?.photoUri || null;
    }
    if (resolvedMemberPhotoUri) {
      setMemberPhotoUri(resolvedMemberPhotoUri);
      setPhotoLoadError(false);
      setZodiacEmoji('');
    } else {
      setMemberPhotoUri(null);
      setZodiacEmoji((allowLegacyFallback ? profile?.caregiverZodiacEmoji : undefined) || scopedMember?.emoji || '👤');
    }

    // Joiner 也先读取当前家庭的本地缓存；正常切换页面不会每次都等待云端。
    let checkIns: DailyCheckIn[] = await getAllCheckIns(requestedFamilyId);
    let diaries: DiaryEntry[] = await getDiaryEntries(requestedFamilyId);
    if (!isCurrentFamily()) return;
    let creatorName = requestedMembership.room.members.find(item => item.isCreator)?.name || (allowLegacyFallback ? profile?.caregiverName : undefined) || '照顾者';
    const roomIdNum = parseInt(requestedFamilyId);
    if (roomIdNum && !isNaN(roomIdNum) && await shouldRefreshCloudCache(roomIdNum, 'joiner-home', undefined, forceCloud)) {
      try {
        const [cloudCheckIns, cloudDiaries, cloudProfile] = await Promise.all([
          cloudGetCheckIns(roomIdNum, 50),
          cloudGetDiaries(roomIdNum, 50),
          cloudGetElderProfile(roomIdNum),
        ]);
        if (!isCurrentFamily()) return;
        if (Array.isArray(cloudCheckIns)) {
          checkIns = await mergeCloudCheckInsIntoLocal(cloudCheckIns, requestedFamilyId);
        }
        if (Array.isArray(cloudDiaries)) {
          diaries = await mergeCloudDiariesIntoLocal(cloudDiaries, requestedFamilyId);
        }
        if (cloudProfile?.nickname) setElderNickname(cloudProfile.nickname);
        if (cloudProfile?.elderPhotoUri) setElderPhotoUri(cloudProfile.elderPhotoUri);
        // 被照顾者没有照片时，用 zodiacEmoji 显示生肖 emoji
        if (cloudProfile?.zodiacEmoji && !cloudProfile?.elderPhotoUri) setElderEmoji(cloudProfile.zodiacEmoji);
        if (cloudProfile?.caregiverName) {
          creatorName = cloudProfile.caregiverName;
          setCaregiverName(cloudProfile.caregiverName);
        }
        await markCloudCacheFresh(roomIdNum, 'joiner-home');
      } catch {
        // 网络不可用时保持已展示的当前家庭本地缓存。
      }
    }
    // 跨时区设计：latestCheckIn 始终用最新的一条打卡（checkIns[0]）
    // 服务端按 date 降序返回，checkIns[0] 就是最新打卡，不受 Joiner 本地日期影响
    // 状态文字会显示打卡的实际日期，让 Joiner 知道是哪天的记录
    const _todayNow = new Date();
    const _todayKey = `${_todayNow.getFullYear()}-${String(_todayNow.getMonth() + 1).padStart(2, '0')}-${String(_todayNow.getDate()).padStart(2, '0')}`;
    // 始终显示最新打卡（checkIns[0]），不按 Joiner 本地日期过滤
    if (!isCurrentFamily()) return;
    const latest = checkIns[0] ?? null;
    setLatestCheckIn(latest); // 始终用最新打卡，状态文字会显示实际日期
    setAllCheckIns(checkIns);
    // 日记去重：服务端和本地缓存都已过滤他人的未发布内容；这里只按 ID 去重。
    const seenSrvIds = new Set<number>();
    const seenLocIds = new Set<string>();
    const cleanDiaries = diaries.filter(d => {
      if (d.serverDiaryId) {
        if (seenSrvIds.has(d.serverDiaryId)) return false;
        seenSrvIds.add(d.serverDiaryId);
      } else {
        if (seenLocIds.has(String(d.id))) return false;
        seenLocIds.add(String(d.id));
      }
      return true;
    });
    setAllDiaries(cleanDiaries);
    // 公告也从云端拉取，确保看到所有家庭成员发的公告
    // 关键修复：云端 localTimeStr 为空时，从本地缓存补充（防止数据库迁移未完成或竞态导致时间显示错误）
    let announcements: FamilyAnnouncement[] = [];
    try {
      const roomIdNum2 = parseInt(requestedFamilyId);
      const cloudAnns = await cloudGetAnnouncements(roomIdNum2, 30);
      if (Array.isArray(cloudAnns)) {
        // 拉取本地缓存，用于补充云端缺失的 localTimeStr
        const localAnns = await getFamilyAnnouncements(30, requestedFamilyId);
        // 本地 id 是 generateId() 随机字符串，云端 id 是数据库自增整数，两者永远不匹配
        // 必须用 content+date+authorName 三元组匹配
        const localAnnsMap = new Map(localAnns.map((la: FamilyAnnouncement) => [
          `${la.content}|${la.date}|${la.authorName}`, la
        ]));
        announcements = (cloudAnns as any[]).map((c: any) => {
          const cloudId = String(c.id);
          const contentKey = `${c.content ?? ''}|${c.date ?? ''}|${c.authorName ?? ''}`;
          const localMatch = localAnnsMap.get(contentKey);
          return {
            ...c,
            id: cloudId,
            localTimeStr: c.localTimeStr ?? localMatch?.localTimeStr ?? undefined,
            createdAt: c.createdAt instanceof Date
              ? c.createdAt.toISOString()
              : (typeof c.createdAt === 'string' ? c.createdAt : new Date().toISOString()),
          } as FamilyAnnouncement;
        });
        await AsyncStorage.setItem(`family_announcements_v1:${requestedFamilyId}`, JSON.stringify(announcements));
      } else {
        announcements = await getFamilyAnnouncements(30, requestedFamilyId);
      }
    } catch {
      announcements = await getFamilyAnnouncements(30, requestedFamilyId);
    }
    if (!isCurrentFamily()) return;
    setLatestAnnounce(announcements[0] ?? null);
    // 「今日活动记录」必须只显示今天，不再混入昨天或明天的记录。
    // 所有共享记录都已经保存发布者写入的 YYYY-MM-DD date，因此统一按 date 精确匹配。
    const todayCheckIns = checkIns.filter(c => c.date === _todayKey).slice(0, 2);
    const todayDiaries = cleanDiaries.filter(d => d.date === _todayKey).slice(0, 3);
    const todayAnnouncements = announcements.filter(a => a.date === _todayKey).slice(0, 2);
    setFeed(buildFeed(todayCheckIns, todayDiaries, todayAnnouncements, creatorName));
    // 读取今日简报缓存
    try {
      const cacheKey = `share_briefing_cache_v1:${requestedFamilyId}`;
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.date === _todayKey && parsed.briefing?.summary) {
          setBriefingSummary(parsed.briefing.summary);
        } else {
          setBriefingSummary(null);
        }
      } else {
        setBriefingSummary(null);
      }
    } catch { setBriefingSummary(null); }
  }, [activeFamilyId, activeMembership, memberships.length]);

  // 切换 Tab 时使用当前家庭缓存；缓存过期后才后台校验云端。
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // 点击推送通知时跳过缓存，确保即使已停留在首页也能立刻看到最新数据。
  useEffect(() => {
    if (refreshToken) loadData(true);
  }, [refreshToken, loadData]);
  // 任何家庭切换都先清空上一 profile 的可见状态，随后由当前家庭本地缓存快速填充。
  useEffect(() => {
    setElderNickname(activeMembership?.room.elderName || '家人');
    setElderEmoji('🌸');
    setElderPhotoUri(activeMembership?.room.elderPhotoUri || null);
    setCaregiverName('');
    setLatestCheckIn(null);
    setLatestAnnounce(null);
    setFeed([]);
    setCurrentMember(null);
    setMemberPhotoUri(null);
    setAllCheckIns([]);
    setAllDiaries([]);
    setBriefingSummary(null);
  }, [activeFamilyId, activeMembership?.room.elderName, activeMembership?.room.elderPhotoUri]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  function goSetup() {
    // 跳转到 onboarding 完整流程创建家庭，避免旧 modal 直接创建导致 setupComplete=false、首页卡死等问题
    router.push({ pathname: '/onboarding', params: { fromProfile: '1', mode: 'create' } } as any);
  }

  const greeting = (() => {
    const h = new Date().getHours();
    const membershipMember = activeMembership?.room.members.find(member => member.id === activeMembership.myMemberId);
    const userName = currentMember?.name?.trim() || membershipMember?.name?.trim() || '家人';
    if (h < 5) return { title: `夜深了，${userName}`, subtitle: '你的牵挂，让每一天都被温柔守护 🌙' };
    if (h < 11) return { title: `早上好，${userName}`, subtitle: '因为有你，新的一天也充满爱 ☀️' };
    if (h < 14) return { title: `中午好，${userName}`, subtitle: '因为有你，平凡的日子也满是温暖 🌿' };
    if (h < 18) return { title: `下午好，${userName}`, subtitle: '因为有你，每一天都充满爱 🧡' };
    return { title: `晚上好，${userName}`, subtitle: '因为有你，每一天都充满爱 🌙' };
  })();

  const statusSummary = (() => {
    if (!latestCheckIn) return '暂无打卡记录，等照顾者完成后这里会显示详情';
    // 显示打卡的实际日期（跨时区友好：Joiner 能看到是哪天的记录）
    const ciDateObj = latestCheckIn.date ? new Date(latestCheckIn.date + 'T00:00:00') : new Date();
    const ciDateLabel = ciDateObj.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
    const parts: string[] = [`${ciDateLabel}打卡`];
    // 睡眠数据来自早间打卡，始终显示
    if (latestCheckIn.morningDone && latestCheckIn.sleepHours != null) {
      const h = latestCheckIn.sleepHours;
      parts.push(`睡了 ${h} 小时`);
    }
    // 心情和用药只有晚间打卡完成后才显示真实数据
    if (latestCheckIn.eveningDone) {
      if (latestCheckIn.medicationTaken === false) {
        parts.push('药还没吃');
      } else if (latestCheckIn.medicationTaken) {
        parts.push('药已吃');
      }
      if (latestCheckIn.moodScore != null) {
        parts.push(`心情 ${latestCheckIn.moodScore}/10`);
      }
      if (latestCheckIn.eveningNotes) {
        const note = latestCheckIn.eveningNotes.slice(0, 20);
        parts.push(`备注：${note}`);
      }
    } else if (latestCheckIn.morningDone) {
      // 仅早间打卡完成，提示晚间待记录
      parts.push('晚间待记录');
      if (latestCheckIn.morningNotes) {
        const note = latestCheckIn.morningNotes.slice(0, 20);
        parts.push(`备注：${note}`);
      }
    }
    return parts.join('，');
  })();

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={[...Gradients.appBg, AppColors.bg.secondary]}
        locations={[0, 0.3, 0.6, 1]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        style={{ flex: 1, paddingTop: insets.top }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
          <View style={styles.greetingBlock}>
            <View style={styles.dateRow}>
              <Text style={styles.dateText}>{todayLabel}</Text>
              <Text style={styles.lunarDot}>·</Text>
              <Text style={styles.lunarText}>{lunarDate.full}</Text>
            </View>
            <Text style={styles.pageTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>{greeting.title}</Text>
            <Text style={styles.greetingSubtitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{greeting.subtitle}</Text>
            {/* 家庭切换胶囊 — 与主照顾者首页保持一致 */}
            <TouchableOpacity
              onPress={() => memberships.length > 1 && setShowSwitcher(true)}
              activeOpacity={memberships.length > 1 ? 0.75 : 1}
              style={styles.familyPill}
            >
              <Text style={styles.familyPillText}>
                🏠 {activeMembership?.room.elderName || elderNickname}的家庭
              </Text>
              {memberships.length > 1 && (
                <Text style={styles.familyPillArrow}>⌄</Text>
              )}
            </TouchableOpacity>
          </View>
          {/* 头像按钮 — 与主照顾者首页保持一致（56×56 圆角方形） */}
          <TouchableOpacity
            style={styles.headerAvatar}
            onPress={() => router.push('/profile' as any)}
            activeOpacity={0.8}
          >
            {memberPhotoUri && !photoLoadError ? (
              <Image
                source={{ uri: memberPhotoUri }}
                style={styles.avatarPhoto}
                onError={() => setPhotoLoadError(true)}
              />
            ) : (
              <LinearGradient
                colors={Gradients.coral}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.avatarGradient}
              >
                <Text style={{ fontSize: 24 }}>{zodiacEmoji || currentMember?.emoji || '👤'}</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.tipBanner}>
          <LinearGradient
            colors={[AppColors.green.soft, AppColors.bg.warmCream]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.tipBannerInner}
          >
            <Text style={styles.tipIcon}>📋</Text>
            <Text style={styles.tipText}>{statusSummary}</Text>
          </LinearGradient>
        </View>

        {/* ── 今日护理记录卡片（与家人共享页保持一致） ── */}
        <View style={styles.elderCardNew}>
          <LinearGradient
            colors={Gradients.warmCard}
            style={styles.elderCardBody}
          >
            {/* Header */}
            <View style={styles.elderHeaderRow}>
              <View style={styles.elderAvatarNew}>
                {elderPhotoUri ? (
                  <Image
                    source={{ uri: elderPhotoUri }}
                    style={[styles.elderAvatarGrad, { borderRadius: 28 }]}
                    onError={() => setElderPhotoUri(null)}
                  />
                ) : (
                  <LinearGradient
                    colors={Gradients.peach}
                    style={styles.elderAvatarGrad}
                  >
                    <Text style={{ fontSize: 28 }}>{elderEmoji}</Text>
                  </LinearGradient>
                )}
                <View style={[styles.statusIndicator, { backgroundColor: latestCheckIn ? AppColors.green.primary : AppColors.border.soft }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.elderNameNew}>{elderNickname}</Text>
                <Text style={styles.elderStatusNew}>
                  {latestCheckIn
                    ? (() => {
                        const time = latestCheckIn.eveningDone ? '晚间' : '早间';
                        const dateObj = latestCheckIn.date ? new Date(latestCheckIn.date + 'T00:00:00') : new Date();
                        const dateLabel = dateObj.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
                        return `${dateLabel} ${time}打卡已记录`;
                      })()
                    : '暂无打卡记录'}
                </Text>
              </View>
            </View>

            {/* 四格数据：睡眠/心情/用药/饮食 */}
            <View style={styles.metricsRowNew}>
              {[
                {
                  emoji: '😴',
                  label: '睡眠',
                  val: latestCheckIn?.morningDone && latestCheckIn.sleepHours != null ? `${latestCheckIn.sleepHours}h` : '未记录',
                  color: latestCheckIn?.morningDone ? AppColors.purple.strong : AppColors.text.secondary,
                  bg: AppColors.purple.soft
                },
                {
                  emoji: latestCheckIn?.eveningDone ? (latestCheckIn.moodEmoji || '😊') : '😊',
                  label: '心情',
                  val: latestCheckIn?.eveningDone ? '已记录' : '未记录',
                  color: latestCheckIn?.eveningDone ? AppColors.peach.primary : AppColors.text.secondary,
                  bg: AppColors.peach.soft
                },
                {
                  emoji: '💊',
                  label: '用药',
                  val: latestCheckIn?.eveningDone && latestCheckIn.medicationTaken != null
                    ? (latestCheckIn.medicationTaken ? '✅' : '❌')
                    : '未记录',
                  color: latestCheckIn?.eveningDone
                    ? (latestCheckIn?.medicationTaken ? AppColors.green.strong : AppColors.status.error)
                    : AppColors.text.tertiary,
                  bg: latestCheckIn?.eveningDone
                    ? (latestCheckIn?.medicationTaken ? AppColors.green.soft : AppColors.coral.soft)
                    : AppColors.bg.secondary
                },
                {
                  emoji: '🍽️',
                  label: '饮食',
                  val: latestCheckIn?.eveningDone
                    ? (latestCheckIn.mealNotes ? latestCheckIn.mealNotes.slice(0, 4) : '已记')
                    : '未记录',
                  color: AppColors.text.secondary, bg: AppColors.bg.secondary
                },
              ].map((m) => (
                <View key={m.label} style={[styles.metricItemNew, { backgroundColor: m.bg }]}>
                  <Text style={{ fontSize: 20 }}>{m.emoji}</Text>
                  <Text style={styles.metricLabelNew}>{m.label}</Text>
                  <Text style={[styles.metricValNew, { color: m.color }]} numberOfLines={1}>{m.val}</Text>
                </View>
              ))}
            </View>

            {/* 白天小睡 */}
            {hasRecordedNap(latestCheckIn) && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingHorizontal: 4 }}>
                <Text style={{ fontSize: 14, marginRight: 6 }}>☀️</Text>
                <Text style={{ fontSize: 13, color: '#B8860B', fontWeight: '500' }}>白天小睡：{getNapDisplay(latestCheckIn)}</Text>
              </View>
            )}
            {/* 最新日记摘要 */}
            {allDiaries.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: AppColors.border.soft }}>
                <Text style={{ fontSize: 16, marginRight: 6 }}>📔</Text>
                <Text style={{ fontSize: 13, color: AppColors.text.secondary, flex: 1, lineHeight: 20 }} numberOfLines={2}>
                  {allDiaries[0].moodEmoji} {allDiaries[0].content || '无详细内容'}
                </Text>
              </View>
            )}

            {/* Footer：记录人 + 小马虎 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: AppColors.border.soft }}>
              <Text style={{ fontSize: 12, color: AppColors.text.tertiary }}>记录人：{caregiverName || '照顾者'}</Text>
              <Text style={{ fontSize: 12, color: AppColors.text.tertiary }}>小马虎</Text>
            </View>

            {/* 操作按钮：根据最新打卡状态显示不同内容
                 跨时区设计：latestCheckIn 是最新打卡，不限制必须是今天
                 只要有晚间打卡完成，就可以查看简报（传入打卡日期让 share.tsx 加载对应日期的简报） */}
            {latestCheckIn?.eveningDone ? (() => {
              // 显示打卡的实际日期（跨时区友好）
              const ciDateObj = latestCheckIn.date ? new Date(latestCheckIn.date + 'T00:00:00') : new Date();
              const ciDateLabel = ciDateObj.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
              const btnLabel = `📋 查看 ${ciDateLabel} 简报`;
              return (
                <TouchableOpacity
                  style={styles.briefingBtn}
                  onPress={() => router.push(
                    { pathname: '/share', params: { date: latestCheckIn.date } } as any
                  )}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#4CAF82', '#3A9E6E', '#2E8B5A']}
                    start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                    style={styles.briefingBtnGradient}
                  >
                    <Text style={styles.briefingBtnText}>{btnLabel}</Text>
                    <Text style={styles.briefingBtnArrow}>›</Text>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })() : (
              <View style={styles.briefingBtnDisabled}>
                <Text style={styles.briefingBtnDisabledText}>
                  {latestCheckIn?.morningDone
                    ? '☕️ 等待晚间打卡完成后可查看简报'
                    : '🌙 暂无打卡记录'}
                </Text>
              </View>
            )}
          </LinearGradient>
        </View>

        <AnnouncementCard
          latest={latestAnnounce}
          onViewAll={() => router.push('/family' as any)}
          onCompose={() => router.push({ pathname: '/(tabs)/family', params: { openCompose: '1' } } as any)}
        />

        <View style={styles.feedSection}>
          <View style={styles.feedLabelRow}>
            <Text style={styles.feedLabelIcon}>📋</Text>
            <Text style={styles.feedSectionLabel}>今日活动记录 · {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</Text>
          </View>
          {feed.length > 0 ? feed.map((item, i) => (
            <FeedRow
              key={item.id}
              item={item}
              isLast={i === feed.length - 1}
              onPress={item.type === 'diary' ? () => {
                const diaryId = item.id.replace('diary-', '');
                // joiner 和主照顾者都用同一页面查看日记
                router.push({ pathname: '/diary-edit', params: { id: diaryId } } as any);
              } : undefined}
            />
          )) : (
            <View style={styles.emptyFeed}>
              <View style={styles.emptyFeedIconWrap}>
                <Text style={styles.emptyFeedEmoji}>🐴</Text>
                <Text style={styles.emptyFeedSleep}>💤</Text>
              </View>
              <Text style={styles.emptyFeedTitle}>今天暂无活动记录</Text>
              <Text style={styles.emptyFeedSub}>当天的打卡、日记和公告会显示在这里</Text>
            </View>
          )}
        </View>

        {/* 趋势图表 — 与主照顾者首页完全一致，显示被照顾者的睡眠/心情等趋势 */}
        {allCheckIns.length > 0 && (
          <TrendChart
            checkIns={allCheckIns}
            diaryEntries={allDiaries}
            patientNickname={elderNickname}
            caregiverName={caregiverName}
          />
        )}


        {/* 只有当用户完全没有任何 membership（既未创建也未加入任何家庭）时，才显示创建家庭档案卡片。已加入家庭的 joiner 不应再看到此提示 */}
        {memberships.length === 0 && (
          <UpgradeCard onPress={goSetup} />
        )}
        {/* 如果 joiner 自己也有 creator 身份，显示切换提示 */}
        {memberships.some(m => m.role === 'creator') && activeMembership?.role === 'joiner' && (
          <TouchableOpacity
            style={styles.switchToCreatorBanner}
            onPress={() => {
              const creatorM = memberships.find(m => m.role === 'creator');
              if (creatorM) switchFamily(creatorM.familyId);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.switchToCreatorIcon}>👑</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchToCreatorTitle}>切换到我的家庭档案</Text>
              <Text style={styles.switchToCreatorSub}>点此切换为主照顾者身份，进行打卡、用药等操作</Text>
            </View>
            <Text style={{ fontSize: 18, color: '#B8426A' }}>›</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      <Modal visible={showSwitcher} transparent animationType="fade" onRequestClose={() => setShowSwitcher(false)}>
        <TouchableOpacity style={styles.switcherOverlay} activeOpacity={1} onPress={() => setShowSwitcher(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.switcherSheet}>
              <Text style={styles.switcherTitle}>切换家庭</Text>
              {memberships.map(m => (
                <TouchableOpacity
                  key={m.familyId}
                  style={[styles.switcherRow, activeMembership?.familyId === m.familyId && styles.switcherRowActive]}
                  onPress={async () => {
                    await switchFamily(m.familyId);
                    setShowSwitcher(false);
                  }}
                >
                  <Text style={{ fontSize: 22, marginRight: 12 }}>{m.room.members[0]?.emoji || '🏠'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switcherName}>{m.room.elderName}</Text>
                    <Text style={styles.switcherRole}>{m.role === 'creator' ? '📋 主要照顾者' : '👁️ 家庭成员'}</Text>
                  </View>
                  {activeMembership?.familyId === m.familyId && <Text style={{ fontSize: 16 }}>✓</Text>}
                </TouchableOpacity>
            ))}
            {/* 创建新家庭入口已移至头像→设置页面，胶囊只用于切换已有家庭 */}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 20, paddingBottom: 124 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 20, paddingBottom: 18 },
  greetingBlock: { flex: 1, minWidth: 0, paddingRight: 12 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dateText: { fontSize: 12, fontWeight: '600', color: AppColors.text.tertiary, letterSpacing: 0.3 },
  lunarDot: { fontSize: 12, color: AppColors.border.soft },
  lunarText: { fontSize: 11, color: AppColors.peach.primary, fontWeight: '500' },
  pageTitle: { fontSize: 20, fontWeight: '800', color: AppColors.purple.strong, letterSpacing: -0.25, lineHeight: 27 },
  greetingSubtitle: { marginTop: 3, fontSize: 13, fontWeight: '500', color: AppColors.text.secondary, lineHeight: 19 },
  familyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10,
    backgroundColor: AppColors.green.soft,
    borderWidth: 1, borderColor: AppColors.green.primary + '70',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  familyPillText: { fontSize: 13, color: AppColors.green.strong, fontWeight: '700' },
  familyPillArrow: { fontSize: 12, color: AppColors.green.strong, fontWeight: '800' },
  headerAvatar: { ...SHADOWS.md, borderRadius: 22, overflow: 'hidden' },
  avatarGradient: { width: 56, height: 56, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarPhoto: { width: 56, height: 56, borderRadius: 22 },

  briefingEntryCard: { marginBottom: 16, borderRadius: 16, overflow: 'hidden', ...SHADOWS.sm },
  briefingEntryInner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16 },
  briefingEntryIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFE4EC', alignItems: 'center', justifyContent: 'center' },
  briefingEntryTitle: { fontSize: 13, fontWeight: '700', color: '#B8426A', marginBottom: 3 },
  briefingEntrySummary: { fontSize: 12, color: AppColors.text.secondary, lineHeight: 17 },

  tipBanner: { marginBottom: 16 },
  tipBannerInner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.48)',
    shadowColor: AppColors.shadow.soft, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1, shadowRadius: 12, elevation: 1,
  },
  tipIcon: { fontSize: 20 },
  tipText: { fontSize: 13, color: AppColors.green.strong, fontWeight: '600', flex: 1, lineHeight: 19 },

  briefingBtn: { marginTop: 14, borderRadius: 14, overflow: 'hidden', ...SHADOWS.sm },
  briefingBtnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, paddingHorizontal: 20, gap: 6,
  },
  briefingBtnText: { fontSize: 14, color: '#fff', fontWeight: '700', letterSpacing: 0.2 },
  briefingBtnArrow: { fontSize: 18, color: 'rgba(255,255,255,0.85)', fontWeight: '300', marginLeft: 2 },
  briefingBtnDisabled: {
    marginTop: 14, paddingVertical: 12, borderRadius: 14,
    backgroundColor: AppColors.bg.secondary, alignItems: 'center',
    borderWidth: 1, borderColor: AppColors.border.soft,
  },
  briefingBtnDisabledText: { fontSize: 13, color: AppColors.text.tertiary, fontWeight: '500' },

  elderCardNew: {
    borderRadius: 22, marginBottom: 20,
    ...SHADOWS.md,
    shadowOpacity: 0.08, shadowRadius: 18, elevation: 3,
  },
  elderCardBody: { borderRadius: 22, padding: 20 },
  elderHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  elderAvatarNew: { position: 'relative' },
  elderAvatarGrad: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    ...SHADOWS.sm,
  },
  statusIndicator: {
    position: 'absolute', bottom: 0, right: 0,
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2.5, borderColor: AppColors.surface.whiteStrong,
  },
  elderLabelNew: { fontSize: 11, fontWeight: '700', color: AppColors.coral.primary, letterSpacing: 0.5, marginBottom: 2 },
  elderNameNew: { fontSize: 20, fontWeight: '900', color: AppColors.text.primary, letterSpacing: -0.3, marginBottom: 3 },
  elderStatusNew: { fontSize: 13, color: AppColors.text.secondary, fontWeight: '500' },
  scoreBadgeNew: {
    backgroundColor: AppColors.peach.soft, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
    alignItems: 'center', borderWidth: 1.5, borderColor: AppColors.peach.primary,
  },
  scoreNumberNew: { fontSize: 26, fontWeight: '900', color: AppColors.coral.primary, lineHeight: 28 },
  scoreLabelNew: { fontSize: 10, color: AppColors.text.tertiary, fontWeight: '600', marginTop: 1 },
  metricsRowNew: { flexDirection: 'row', gap: 12 },
  metricItemNew: {
    flex: 1, alignItems: 'center', gap: 5,
    paddingVertical: 12, paddingHorizontal: 2, borderRadius: 15,
  },
  metricLabelNew: { fontSize: 11, color: AppColors.text.secondary, fontWeight: '600' },
  metricValNew: { fontSize: 14, fontWeight: '800' },

  announceCard: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 20, marginBottom: 20,
    ...SHADOWS.md, shadowOpacity: 0.07, shadowRadius: 16, elevation: 3,
  },
  announceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  announceHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  announceHeaderIcon: { fontSize: 14 },
  announceHeaderTitle: { fontSize: 12, fontWeight: '700', color: AppColors.purple.strong, letterSpacing: 0.3 },
  announceArrow: { fontSize: 22, color: AppColors.purple.primary, fontWeight: '300', opacity: 0.7 },
  announceContent: { backgroundColor: AppColors.purple.soft, marginHorizontal: 14, borderRadius: 14, padding: 14, marginBottom: 14 },
  announceText: { fontSize: 14, fontWeight: '600', color: AppColors.text.primary, lineHeight: 22 },
  announceFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  announceAuthorEmoji: { fontSize: 13, marginRight: 4 },
  announceAuthorName: { fontSize: 12, color: AppColors.purple.strong, fontWeight: '600' },
  announceTime: { fontSize: 12, color: AppColors.text.tertiary },
  composeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: AppColors.peach.soft,
    borderRadius: 16,
  },
  composeHintIcon: { fontSize: 16, marginRight: 8 },
  composeHintText: { flex: 1, fontSize: 13, color: AppColors.text.secondary, fontWeight: '500' },
  composeHintArrow: { fontSize: 18, color: AppColors.peach.primary, fontWeight: '300', opacity: 0.7 },

  feedSection: { marginBottom: 22 },
  feedLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  feedLabelIcon: { fontSize: 14 },
  feedSectionLabel: { fontSize: 13, fontWeight: '700', color: AppColors.text.primary, letterSpacing: 0.3 },
  feedRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  feedTimeline: { alignItems: 'center', width: 30 },
  feedDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  feedLine: { width: 1, flex: 1, backgroundColor: AppColors.border.soft, marginTop: 3, marginBottom: 3, minHeight: 16 },
  feedContent: { flex: 1, paddingBottom: 12 },
  feedTagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' },
  feedTag: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  feedTagText: { fontSize: 11, fontWeight: '600' },
  feedAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  feedAuthorIcon: { fontSize: 10, opacity: 0.5 },
  feedAuthorName: { fontSize: 11, color: AppColors.text.tertiary, fontWeight: '500' },
  feedTime: { fontSize: 11, color: AppColors.text.tertiary, marginLeft: 'auto' },
  feedTitle: { fontSize: 13, fontWeight: '700', color: AppColors.text.primary, marginBottom: 2 },
  feedDetail: { fontSize: 12, color: AppColors.text.secondary, lineHeight: 17 },

  emptyFeed: {
    alignItems: 'center', paddingVertical: 28, marginBottom: 18,
    backgroundColor: 'rgba(255,255,255,0.42)', borderRadius: 20,
  },
  emptyFeedIconWrap: {
    width: 64, height: 64, borderRadius: 22, marginBottom: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.peach.soft,
  },
  emptyFeedEmoji: { fontSize: 34 },
  emptyFeedSleep: { position: 'absolute', top: 6, right: 6, fontSize: 13 },
  emptyFeedTitle: { fontSize: 15, fontWeight: '700', color: AppColors.text.secondary, marginBottom: 4 },
  emptyFeedSub: { fontSize: 13, color: AppColors.text.tertiary, textAlign: 'center', lineHeight: 20 },

  upgradeCard: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 22, padding: 20, marginBottom: 14,
    ...SHADOWS.md, shadowOpacity: 0.07, shadowRadius: 16, elevation: 3,
  },
  upgradeSectionLabel: { fontSize: 12, fontWeight: '700', color: AppColors.purple.strong, letterSpacing: 0.5, marginBottom: 16 },
  upgradeIconRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  upgradeIconItem: { alignItems: 'center', gap: 6 },
  upgradeIconBox: { width: 56, height: 56, borderRadius: 18, backgroundColor: AppColors.purple.soft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: AppColors.purple.primary },
  upgradeIconLabel: { fontSize: 12, color: AppColors.purple.strong, fontWeight: '600' },
  upgradeDesc: { fontSize: 13, color: AppColors.text.secondary, lineHeight: 20, textAlign: 'center', marginBottom: 16 },
  upgradeBtn: { borderRadius: 16, overflow: 'hidden' },
  upgradeBtnGradient: { paddingVertical: 15, alignItems: 'center' },
  upgradeBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },

  switcherOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  switcherSheet: {
    backgroundColor: AppColors.surface.whiteStrong, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36, ...SHADOWS.lg,
  },
  switcherTitle: { fontSize: 17, fontWeight: '800', color: AppColors.text.primary, textAlign: 'center', marginBottom: 16 },
  switcherRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14,
    marginBottom: 8, backgroundColor: AppColors.bg.secondary,
  },
  switcherRowActive: { backgroundColor: AppColors.green.soft, borderWidth: 1.5, borderColor: AppColors.green.muted },
  switcherName: { fontSize: 15, fontWeight: '700', color: AppColors.text.primary, marginBottom: 2 },
  switcherRole: { fontSize: 12, color: AppColors.text.secondary },
  switcherAddBtn: { marginTop: 8, paddingVertical: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1.5, borderColor: AppColors.border.soft, borderStyle: 'dashed' },
  switcherAddText: { fontSize: 14, fontWeight: '700', color: AppColors.text.tertiary },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: AppColors.surface.whiteStrong, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
  modalHandle: { width: 40, height: 4, backgroundColor: AppColors.border.soft, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: AppColors.text.primary, marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: AppColors.text.tertiary, marginBottom: 16 },
  modalInput: {
    borderWidth: 1.5, borderColor: AppColors.border.soft, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, color: AppColors.text.primary, lineHeight: 22,
    minHeight: 110, textAlignVertical: 'top', marginBottom: 14,
  },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  typeChip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: AppColors.bg.secondary, borderWidth: 1, borderColor: AppColors.border.soft },
  typeChipActive: { backgroundColor: AppColors.purple.soft, borderColor: AppColors.purple.primary },
  typeChipText: { fontSize: 12, fontWeight: '600', color: AppColors.text.secondary },
  typeChipTextActive: { color: AppColors.purple.strong },
  postSubmitBtn: { backgroundColor: AppColors.purple.strong, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  postSubmitBtnDisabled: { backgroundColor: AppColors.bg.secondary },
  postSubmitText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  postSubmitTextDisabled: { color: AppColors.text.tertiary },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { fontSize: 14, color: AppColors.text.tertiary, fontWeight: '600' },
  modalDone: { alignItems: 'center', paddingVertical: 16 },
  modalDoneTitle: { fontSize: 20, fontWeight: '800', color: AppColors.text.primary, marginBottom: 6 },
  modalDoneSubtitle: { fontSize: 14, color: AppColors.text.secondary, marginBottom: 24 },
  modalDoneBtn: { backgroundColor: AppColors.purple.strong, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 40 },
  modalDoneBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },

  switchToCreatorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FEF0F4', borderRadius: 18, padding: 16,
    marginBottom: 18,
    shadowColor: AppColors.shadow.soft, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1, shadowRadius: 12, elevation: 1,
  },
  switchToCreatorIcon: { fontSize: 24 },
  switchToCreatorTitle: { fontSize: 14, fontWeight: '700', color: '#B8426A', marginBottom: 2 },
  switchToCreatorSub: { fontSize: 12, color: '#B8426A', opacity: 0.7, lineHeight: 16 },
});
