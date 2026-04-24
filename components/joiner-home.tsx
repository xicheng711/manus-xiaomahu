import React, { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, Easing, Modal, TextInput, Platform,
  Keyboard, KeyboardAvoidingView, TouchableWithoutFeedback, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useWeather } from '@/lib/weather-context';
import {
  getProfile, getAllCheckIns, getDiaryEntries, getFamilyAnnouncements,
  getCurrentMember,
  saveFamilyAnnouncement,
  upsertCheckIn,
  DailyCheckIn, DiaryEntry, FamilyAnnouncement, FamilyMember,
} from '@/lib/storage';
import { cloudGetCheckIns, cloudGetDiaries, cloudGetElderProfile, cloudGetAnnouncements } from '@/lib/cloud-sync';
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

function buildFeed(
  checkIns: DailyCheckIn[],
  diaries: DiaryEntry[],
  announcements: FamilyAnnouncement[],
  caregiverName: string,
): FeedItem[] {
  const items: FeedItem[] = [];

  const latest = checkIns[0];
  if (latest) {
    if (latest.morningDone) {
      items.push({
        id: `ci-m-${latest.id}`, type: 'checkin',
        time: latest.completedAt ? timeStr(latest.completedAt) : '早间',
        icon: '✅', color: AppColors.green.strong, bg: AppColors.green.soft, tag: '早间打卡',
        title: '今日早间打卡完成',
        detail: `心情 ${latest.caregiverMoodEmoji || '😊'} · 睡眠 ${latest.sleepHours}h · ${latest.medicationTaken ? '用药已服' : '用药待记录'}`,
        author: null,
        sortKey: latest.completedAt ? new Date(latest.completedAt).getTime() : Date.now() - 3600000,
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
        sortKey: latest.completedAt ? new Date(latest.completedAt).getTime() : Date.now() - 1800000,
      });
    }
  }

  // 对日记去重：先按 id 去重，再按「日期+内容前20字」去重（应对服务端历史重复写入的数据）
  const seenDiaryIds = new Set<string>();
  const seenDiaryContent = new Set<string>();
  const uniqueDiaries = diaries.filter(d => {
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
      time: d.createdAt ? timeStr(d.createdAt) : d.date,
      icon: '📔', color: AppColors.peach.primary, bg: AppColors.peach.soft, tag: '护理日记',
      title: d.content.length > 20 ? d.content.slice(0, 20) + '…' : d.content,
      detail: d.tags && d.tags.length ? d.tags.slice(0, 3).join(' · ') : `${d.moodEmoji || '😊'} ${d.moodLabel || ''}`,
      author: caregiverName || '照顾者',
      sortKey: d.createdAt ? new Date(d.createdAt).getTime() : new Date(d.date).getTime(),
    });
  });

  announcements.slice(0, 3).forEach(a => {
    items.push({
      id: `ann-${a.id}`, type: 'announce',
      time: timeStr(a.createdAt),
      icon: '📢', color: AppColors.purple.strong, bg: AppColors.purple.soft, tag: '家庭公告',
      title: a.content.length > 24 ? a.content.slice(0, 24) + '…' : a.content,
      detail: a.emoji ? `${a.emoji} ${a.content}` : a.content,
      author: a.authorName,
      sortKey: new Date(a.createdAt).getTime(),
    });
  });

  return items.sort((a, b) => a.sortKey - b.sortKey);
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
              <Text style={styles.announceTime}> · {timeStr(latest.createdAt)}</Text>
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

function FeedRow({ item, isLast }: { item: FeedItem; isLast: boolean }) {
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
      <View style={styles.feedContent}>
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
      </View>
    </Animated.View>
  );
}

function UpgradeCard({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.upgradeCard}>
      <Text style={styles.upgradeSectionLabel}>🔒 更多记录功能</Text>
      <View style={styles.upgradeIconRow}>
        {[{ e: '✨', l: '打卡' }, { e: '💊', l: '用药' }, { e: '📔', l: '日记' }].map(t => (
          <View key={t.l} style={styles.upgradeIconItem}>
            <View style={styles.upgradeIconBox}>
              <Text style={{ fontSize: 22, opacity: 0.35 }}>{t.e}</Text>
            </View>
            <Text style={styles.upgradeIconLabel}>{t.l}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.upgradeDesc}>打卡、用药、日记是主要照顾者的专属功能。{'\n'}创建自己的家庭档案，即可解锁完整记录能力。</Text>
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
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await saveFamilyAnnouncement({
      authorId: member?.id ?? 'unknown',
      authorName: member?.name ?? '家庭成员',
      authorEmoji: member?.emoji ?? '👤',
      authorColor: member?.color ?? AppColors.text.secondary,
      content: content.trim(),
      emoji: ANNOUNCE_TYPES.find(t => t.key === type)?.emoji,
      type,
    });
    setPosting(false);
    setDone(true);
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
                      returnKeyType="done"
                      blurOnSubmit
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
                      style={[styles.postSubmitBtn, !content.trim() && styles.postSubmitBtnDisabled]}
                      onPress={handlePost}
                      activeOpacity={0.85}
                      disabled={!content.trim()}
                    >
                      <Text style={[styles.postSubmitText, !content.trim() && styles.postSubmitTextDisabled]}>
                        {posting ? '发布中…' : '发布公告'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
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

export function JoinerHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { memberships, activeMembership, switchFamily } = useFamilyContext();
  const [elderNickname, setElderNickname] = useState('家人');
  const [elderEmoji, setElderEmoji] = useState('🌸');
  const [caregiverName, setCaregiverName] = useState('');
  const [latestCheckIn, setLatestCheckIn] = useState<DailyCheckIn | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [latestAnnounce, setLatestAnnounce] = useState<FamilyAnnouncement | null>(null);
  const [currentMember, setCurrentMember] = useState<FamilyMember | null>(null);
  const [memberPhotoUri, setMemberPhotoUri] = useState<string | null>(null);
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

  const loadData = useCallback(async () => {
    if (activeMembership) {
      setElderNickname(activeMembership.room.elderName || '家人');
      // FamilyMember.role 只有 caregiver/family/nurse，没有 elder；用 isCreator 找主照顾者
      const elderMember = activeMembership.room.members.find(m => m.isCreator);
      if (elderMember?.emoji) setElderEmoji(elderMember.emoji);
    }
    const profile = await getProfile();
    if (profile) {
      if (!activeMembership) setElderNickname(profile.nickname || profile.name || '家人');
      setCaregiverName(profile.caregiverName || '');
      if (profile.zodiacEmoji && !activeMembership) setElderEmoji(profile.zodiacEmoji);
    }
    const member = await getCurrentMember();
    setCurrentMember(member);
    // 头像统一：优先用 profile 的照片/生肖，与主照顾者首页保持一致
    if (profile?.caregiverAvatarType === 'photo' && profile?.caregiverPhotoUri) {
      setMemberPhotoUri(profile.caregiverPhotoUri);
      setZodiacEmoji('');
    } else if (member?.photoUri) {
      setMemberPhotoUri(member.photoUri);
      setZodiacEmoji('');
    } else {
      setMemberPhotoUri(null);
      setZodiacEmoji(profile?.caregiverZodiacEmoji || member?.emoji || '👤');
    }

     // joiner 视角：从云端拉取主照顾者的打卡、日记和老人档案
    let checkIns: DailyCheckIn[] = [];
    let diaries: DiaryEntry[] = [];
    let creatorName = profile?.caregiverName || '照顾者';
    try {
      const [cloudCheckIns, cloudDiaries, cloudProfile] = await Promise.all([
        cloudGetCheckIns(undefined, 10),
        cloudGetDiaries(undefined, 10),
        cloudGetElderProfile(),
      ]);
      checkIns = (cloudCheckIns && cloudCheckIns.length > 0)
        ? cloudCheckIns as DailyCheckIn[]
        : await getAllCheckIns();
      diaries = (cloudDiaries && cloudDiaries.length > 0)
        ? cloudDiaries as DiaryEntry[]
        : await getDiaryEntries();
      if (cloudProfile?.nickname) setElderNickname(cloudProfile.nickname);
      if (cloudProfile?.caregiverName) {
        creatorName = cloudProfile.caregiverName;
        setCaregiverName(cloudProfile.caregiverName);
      }
    } catch {
      checkIns = await getAllCheckIns();
      diaries = await getDiaryEntries();
    }
    const latest = checkIns[0] ?? null;
    setLatestCheckIn(latest);
    setAllCheckIns(checkIns);
    // 日记去重：过滤未完成对话的，并按 serverDiaryId/id 去重旧脚数据
    const seenSrvIds = new Set<number>();
    const seenLocIds = new Set<string>();
    const cleanDiaries = diaries.filter(d => {
      if (d.conversationFinished === false) return false;
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
    let announcements: FamilyAnnouncement[] = [];
    try {
      const cloudAnns = await cloudGetAnnouncements(undefined, 30);
      announcements = (cloudAnns && cloudAnns.length > 0)
        ? cloudAnns as unknown as FamilyAnnouncement[]
        : await getFamilyAnnouncements(30);
    } catch {
      announcements = await getFamilyAnnouncements(30);
    }
    setLatestAnnounce(announcements[0] ?? null);
    setFeed(buildFeed(checkIns.slice(0, 2), cleanDiaries.slice(0, 3), announcements.slice(0, 2), creatorName));
    // 读取今日简报缓存
    try {
      const todayKey = new Date().toISOString().slice(0, 10);
      const cacheKey = activeFamilyId ? `share_briefing_cache_v1:${activeFamilyId}` : 'share_briefing_cache_v1';
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.date === todayKey && parsed.briefing?.summary) {
          setBriefingSummary(parsed.briefing.summary);
        } else {
          setBriefingSummary(null);
        }
      } else {
        setBriefingSummary(null);
      }
    } catch { setBriefingSummary(null); }
  }, [activeFamilyId]);

  // 修复：只保留 useFocusEffect 一个加载入口（loadData deps=[activeFamilyId]，切换家庭时自动重新执行）
  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  // 仅在 activeFamilyId 变为 null 时清空 UI（不再重复调用 loadData）
  useEffect(() => {
    if (!activeFamilyId) {
      setElderNickname('家人');
      setElderEmoji('🌸');
      setCaregiverName('');
      setLatestCheckIn(null);
      setLatestAnnounce(null);
      setFeed([]);
      setCurrentMember(null);
    }
  }, [activeFamilyId]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  function goSetup() {
    router.push('/(modals)/create-family' as any);
  }

  const greetingText = (() => {
    const h = new Date().getHours();
    const name = elderNickname || '家人';
    if (h < 6) return `${name}正在安睡，你的牵挂是最好的守护 💛`;
    if (h < 11) return `新的一天，${name}有你的关心更温暖 ☀️`;
    if (h < 14) return `午间小憩，记得也关心一下自己 🌿`;
    if (h < 18) return `下午好，有你在${name}不孤单 🧡`;
    return `晚上好，感谢每一天对${name}的惦念 🌙`;
  })();

  const statusSummary = (() => {
    if (!latestCheckIn) return '今天还没有打卡，等照顾者完成后这里会显示详情';
    const parts: string[] = [];
    // 睡眠数据来自早间打卡，始终显示
    if (latestCheckIn.morningDone && latestCheckIn.sleepHours != null) {
      const h = latestCheckIn.sleepHours;
      parts.push(`昨晚睡了 ${h} 小时`);
    }
    // 心情和用药只有晚间打卡完成后才显示真实数据
    if (latestCheckIn.eveningDone) {
      if (latestCheckIn.medicationTaken === false) {
        parts.push('今日药还没吃');
      } else if (latestCheckIn.medicationTaken) {
        parts.push('今日药已吃');
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
      parts.push('晚间打卡待记录');
      if (latestCheckIn.morningNotes) {
        const note = latestCheckIn.morningNotes.slice(0, 20);
        parts.push(`备注：${note}`);
      }
    }
    return parts.length > 0 ? parts.join('，') : '打卡已记录';
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
          <View style={{ flex: 1 }}>
            <View style={styles.dateRow}>
              <Text style={styles.dateText}>{todayLabel}</Text>
              <Text style={styles.lunarDot}>·</Text>
              <Text style={styles.lunarText}>{lunarDate.full}</Text>
            </View>
            <Text style={styles.pageTitle}>{greetingText}</Text>
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
            {memberPhotoUri ? (
              <Image source={{ uri: memberPhotoUri }} style={styles.avatarPhoto} />
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
                <LinearGradient
                  colors={Gradients.peach}
                  style={styles.elderAvatarGrad}
                >
                  <Text style={{ fontSize: 28 }}>{elderEmoji}</Text>
                </LinearGradient>
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
                    : '今天还没有打卡记录'}
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
                  color: AppColors.purple.strong, bg: AppColors.purple.soft
                },
                {
                  emoji: latestCheckIn?.eveningDone ? (latestCheckIn.moodEmoji || '😊') : '😊',
                  label: '心情',
                  val: latestCheckIn?.eveningDone ? '已记录' : '未记录',
                  color: AppColors.peach.primary, bg: AppColors.peach.soft
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

            {/* 最新日记摘要 */}
            {allDiaries.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: AppColors.border.soft }}>
                <Text style={{ fontSize: 16, marginRight: 6 }}>📔</Text>
                <Text style={{ fontSize: 13, color: AppColors.text.secondary, flex: 1 }} numberOfLines={2}>
                  {allDiaries[0].moodEmoji} {allDiaries[0].content || '无详细内容'}
                </Text>
              </View>
            )}

            {/* Footer：记录人 + 小马虎 */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: AppColors.border.soft }}>
              <Text style={{ fontSize: 12, color: AppColors.text.tertiary }}>记录人：{caregiverName || '照顾者'}</Text>
              <Text style={{ fontSize: 12, color: AppColors.text.tertiary }}>小马虎</Text>
            </View>

            {/* 操作按钮：查看简报（仅晚间打卡完成后显示） */}
            {latestCheckIn?.eveningDone && (
              <TouchableOpacity
                style={{ marginTop: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: AppColors.peach.primary, alignItems: 'center' }}
                onPress={() => router.push('/share' as any)}
              >
                <Text style={{ fontSize: 13, color: '#fff', fontWeight: '600' }}>📋 查看今日简报</Text>
              </TouchableOpacity>
            )}
            {/* 晚间未完成时显示引导 */}
            {!latestCheckIn?.eveningDone && (
              <TouchableOpacity
                style={{ marginTop: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: AppColors.purple.soft, alignItems: 'center' }}
                onPress={() => router.push('/(tabs)/checkin' as any)}
              >
                <Text style={{ fontSize: 13, color: AppColors.purple.strong, fontWeight: '600' }}>
                  {latestCheckIn?.morningDone ? '去完成晚间打卡 →' : '去完成今日打卡 →'}
                </Text>
              </TouchableOpacity>
            )}
          </LinearGradient>
        </View>

        <AnnouncementCard
          latest={latestAnnounce}
          onViewAll={() => router.push('/family' as any)}
          onCompose={() => router.push({ pathname: '/(tabs)/family', params: { openCompose: '1' } } as any)}
        />

        {feed.length > 0 && (
          <View style={styles.feedSection}>
            <View style={styles.feedLabelRow}>
              <Text style={styles.feedLabelIcon}>📋</Text>
              <Text style={styles.feedSectionLabel}>今日活动记录</Text>
            </View>
            {feed.map((item, i) => (
              <FeedRow key={item.id} item={item} isLast={i === feed.length - 1} />
            ))}
          </View>
        )}

        {/* 趋势图表 — 与主照顾者首页完全一致，显示被照顾者的睡眠/心情等趋势 */}
        {allCheckIns.length > 0 && (
          <TrendChart
            checkIns={allCheckIns}
            diaryEntries={allDiaries}
            patientNickname={elderNickname}
            caregiverName={caregiverName}
          />
        )}

        {feed.length === 0 && (
          <View style={styles.emptyFeed}>
            <Text style={styles.emptyFeedEmoji}>📋</Text>
            <Text style={styles.emptyFeedTitle}>今日暂无更新</Text>
            <Text style={styles.emptyFeedSub}>主要照顾者完成打卡后，{'\n'}这里会显示{elderNickname}的最新状况</Text>
          </View>
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
  scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 20, paddingBottom: 18 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dateText: { fontSize: 12, fontWeight: '600', color: AppColors.text.tertiary, letterSpacing: 0.3 },
  lunarDot: { fontSize: 12, color: AppColors.border.soft },
  lunarText: { fontSize: 11, color: AppColors.peach.primary, fontWeight: '500' },
  pageTitle: { fontSize: 18, fontWeight: '700', color: AppColors.purple.strong, letterSpacing: -0.2, lineHeight: 26, marginBottom: 10 },
  familyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6,
    backgroundColor: AppColors.green.soft,
    borderWidth: 1.5, borderColor: AppColors.green.primary,
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
    borderWidth: 1, borderColor: AppColors.peach.primary,
  },
  tipIcon: { fontSize: 20 },
  tipText: { fontSize: 13, color: AppColors.peach.primary, fontWeight: '600', flex: 1, lineHeight: 19 },

  elderCardNew: {
    borderRadius: 20, marginBottom: 16, overflow: 'hidden',
    ...SHADOWS.md, borderWidth: 1.5, borderColor: AppColors.peach.primary + '60',
  },
  elderCardBody: { borderRadius: 20, padding: 18 },
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
  metricsRowNew: { flexDirection: 'row', gap: 10 },
  metricItemNew: {
    flex: 1, alignItems: 'center', gap: 4,
    paddingVertical: 12, borderRadius: 14,
  },
  metricLabelNew: { fontSize: 11, color: AppColors.text.secondary, fontWeight: '500' },
  metricValNew: { fontSize: 14, fontWeight: '800' },

  announceCard: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 18, marginBottom: 16,
    borderWidth: 1.5, borderColor: AppColors.purple.primary,
    ...SHADOWS.md, overflow: 'hidden',
  },
  announceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  announceHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  announceHeaderIcon: { fontSize: 14 },
  announceHeaderTitle: { fontSize: 12, fontWeight: '700', color: AppColors.purple.strong, letterSpacing: 0.3 },
  announceArrow: { fontSize: 22, color: AppColors.purple.primary, fontWeight: '300', opacity: 0.7 },
  announceContent: { backgroundColor: AppColors.purple.soft, marginHorizontal: 12, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: AppColors.purple.primary + '40' },
  announceText: { fontSize: 14, fontWeight: '600', color: AppColors.text.primary, lineHeight: 20 },
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
    borderWidth: 1,
    borderColor: AppColors.peach.primary + '30',
  },
  composeHintIcon: { fontSize: 16, marginRight: 8 },
  composeHintText: { flex: 1, fontSize: 13, color: AppColors.text.secondary, fontWeight: '500' },
  composeHintArrow: { fontSize: 18, color: AppColors.peach.primary, fontWeight: '300', opacity: 0.7 },

  feedSection: { marginBottom: 16 },
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

  emptyFeed: { alignItems: 'center', paddingVertical: 28, marginBottom: 16 },
  emptyFeedEmoji: { fontSize: 36, marginBottom: 8 },
  emptyFeedTitle: { fontSize: 15, fontWeight: '700', color: AppColors.text.tertiary, marginBottom: 4 },
  emptyFeedSub: { fontSize: 13, color: AppColors.text.tertiary, textAlign: 'center', lineHeight: 20 },

  upgradeCard: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 20, padding: 20, marginBottom: 12,
    ...SHADOWS.md, borderWidth: 1.5, borderColor: AppColors.purple.primary + '60',
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
    marginBottom: 16, borderWidth: 1.5, borderColor: '#EDAABB',
  },
  switchToCreatorIcon: { fontSize: 24 },
  switchToCreatorTitle: { fontSize: 14, fontWeight: '700', color: '#B8426A', marginBottom: 2 },
  switchToCreatorSub: { fontSize: 12, color: '#B8426A', opacity: 0.7, lineHeight: 16 },
});
