import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, Easing, Modal, TextInput, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  getProfile, getAllCheckIns, getDiaryEntries, getFamilyAnnouncements,
  getFamilyRoom, getCurrentMember,
  saveFamilyAnnouncement,
  DailyCheckIn, DiaryEntry, FamilyAnnouncement, FamilyMember,
} from '@/lib/storage';
import { getLunarDate, getFormattedDate } from '@/lib/lunar';
import { COLORS, SHADOWS, RADIUS } from '@/lib/animations';

// ─── Feed item type ───────────────────────────────────────────────────────────
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

  // Latest check-in morning
  const latest = checkIns[0];
  if (latest) {
    if (latest.morningDone) {
      items.push({
        id: `ci-m-${latest.id}`, type: 'checkin',
        time: latest.completedAt ? timeStr(latest.completedAt) : '早间',
        icon: '✅', color: '#10B981', bg: '#ECFDF5', tag: '早间打卡',
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
        icon: '🌙', color: '#8B5CF6', bg: '#F5F3FF', tag: '晚间打卡',
        title: `今日护理完成${latest.careScore ? ` ⭐ ${latest.careScore}分` : ''}`,
        detail: `心情 ${latest.moodEmoji || '😴'} · ${latest.medicationTaken ? '用药已服' : '用药未记录'} · ${latest.mealOption || latest.mealNotes || '饮食正常'}`,
        author: null,
        sortKey: latest.completedAt ? new Date(latest.completedAt).getTime() : Date.now() - 1800000,
      });
    }
  }

  // Diary entries (top 3)
  diaries.slice(0, 3).forEach(d => {
    items.push({
      id: `diary-${d.id}`, type: 'diary',
      time: d.createdAt ? timeStr(d.createdAt) : d.date,
      icon: '📔', color: '#F59E0B', bg: '#FFFBEB', tag: '护理日记',
      title: d.content.length > 20 ? d.content.slice(0, 20) + '…' : d.content,
      detail: d.tags && d.tags.length ? d.tags.slice(0, 3).join(' · ') : `${d.moodEmoji || '😊'} ${d.moodLabel || ''}`,
      author: caregiverName || '照顾者',
      sortKey: d.createdAt ? new Date(d.createdAt).getTime() : new Date(d.date).getTime(),
    });
  });

  // Announcements (top 3)
  announcements.slice(0, 3).forEach(a => {
    items.push({
      id: `ann-${a.id}`, type: 'announce',
      time: timeStr(a.createdAt),
      icon: '📢', color: '#0EA5E9', bg: '#EFF6FF', tag: '家庭公告',
      title: a.content.length > 24 ? a.content.slice(0, 24) + '…' : a.content,
      detail: a.emoji ? `${a.emoji} ${a.content}` : a.content,
      author: a.authorName,
      sortKey: new Date(a.createdAt).getTime(),
    });
  });

  return items.sort((a, b) => a.sortKey - b.sortKey);
}

// ─── Status card ─────────────────────────────────────────────────────────────
function ElderStatusCard({ elderNickname, elderEmoji, checkIn }: {
  elderNickname: string;
  elderEmoji: string;
  checkIn: DailyCheckIn | null;
}) {
  const scale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, speed: 8, bounciness: 10, useNativeDriver: true }).start();
  }, []);

  const score = checkIn?.careScore;
  const metrics = [
    { emoji: checkIn?.moodEmoji || '—',  label: '心情', val: checkIn ? (checkIn.moodScore >= 7 ? '好' : checkIn.moodScore >= 5 ? '还好' : '需关注') : '—', color: '#F59E0B' },
    { emoji: '💤',                        label: '睡眠', val: checkIn ? `${checkIn.sleepHours}h` : '—', color: '#6366F1' },
    { emoji: checkIn?.medicationTaken ? '✅' : (checkIn ? '❌' : '—'), label: '用药', val: checkIn ? (checkIn.medicationTaken ? '已服' : '未服') : '—', color: checkIn?.medicationTaken ? '#10B981' : '#EF4444' },
  ];

  return (
    <Animated.View style={[styles.elderCard, { transform: [{ scale }] }]}>
      <LinearGradient
        colors={['#FFF3E8', '#FDE8EF', '#FDF0F8']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.elderCardTop}
      >
        <View style={styles.elderCardRow}>
          <View style={styles.elderAvatar}>
            <Text style={{ fontSize: 26 }}>{elderEmoji}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.elderLabel}>被照顾者</Text>
            <Text style={styles.elderName}>{elderNickname}</Text>
            <View style={styles.elderStatusRow}>
              <View style={[styles.statusDot, { backgroundColor: checkIn ? '#34D399' : '#D1D5DB' }]} />
              <Text style={styles.elderStatusText}>
                {checkIn ? (checkIn.moodScore >= 7 ? '今天状态不错 😊' : checkIn.moodScore >= 5 ? '今天还好 😌' : '需要多关注 💜') : '暂无今日记录'}
              </Text>
            </View>
          </View>
          {score != null && (
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreNumber}>{score}</Text>
              <Text style={styles.scoreLabel}>护理分</Text>
            </View>
          )}
        </View>
      </LinearGradient>
      <View style={styles.metricsRow}>
        {metrics.map((m, i) => (
          <React.Fragment key={m.label}>
            {i > 0 && <View style={styles.metricDivider} />}
            <View style={styles.metricItem}>
              <Text style={{ fontSize: 18, lineHeight: 22 }}>{m.emoji}</Text>
              <Text style={styles.metricLabel}>{m.label}</Text>
              <Text style={[styles.metricVal, { color: m.color }]}>{m.val}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </Animated.View>
  );
}

// ─── Announcement card ────────────────────────────────────────────────────────
function AnnouncementCard({ latest, onPost, onViewAll }: {
  latest: FamilyAnnouncement | null;
  onPost: () => void;
  onViewAll: () => void;
}) {
  return (
    <View style={styles.announceCard}>
      <View style={styles.announceHeader}>
        <View style={styles.announceHeaderLeft}>
          <Text style={styles.announceHeaderIcon}>📢</Text>
          <Text style={styles.announceHeaderTitle}>家庭公告</Text>
        </View>
        <TouchableOpacity style={styles.postBtn} onPress={onPost} activeOpacity={0.8}>
          <Text style={styles.postBtnText}>＋ 发布公告</Text>
        </TouchableOpacity>
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
      ) : (
        <View style={styles.announceEmpty}>
          <Text style={styles.announceEmptyText}>暂无公告，发布第一条家庭公告吧</Text>
        </View>
      )}
      <TouchableOpacity style={styles.viewAllBtn} onPress={onViewAll} activeOpacity={0.8}>
        <Text style={styles.viewAllBtnText}>查看全部公告 →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Feed row ─────────────────────────────────────────────────────────────────
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

// ─── Upgrade inline card ──────────────────────────────────────────────────────
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
          colors={['#FF8904', '#FF637E', '#F6339A']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.upgradeBtnGradient}
        >
          <Text style={styles.upgradeBtnText}>＋ 创建我的家庭档案</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

// ─── Post Announcement Modal ──────────────────────────────────────────────────
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
      authorColor: member?.color ?? '#6B7280',
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
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          {done ? (
            <View style={styles.modalDone}>
              <Text style={{ fontSize: 44, marginBottom: 12 }}>🎉</Text>
              <Text style={styles.modalDoneTitle}>公告已发布！</Text>
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
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
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
      </View>
    </Modal>
  );
}

// ─── Main: JoinerHomeScreen ───────────────────────────────────────────────────
export function JoinerHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [elderNickname, setElderNickname] = useState('家人');
  const [elderEmoji, setElderEmoji] = useState('🌸');
  const [caregiverName, setCaregiverName] = useState('');
  const [latestCheckIn, setLatestCheckIn] = useState<DailyCheckIn | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [latestAnnounce, setLatestAnnounce] = useState<FamilyAnnouncement | null>(null);
  const [currentMember, setCurrentMember] = useState<FamilyMember | null>(null);
  const [postModal, setPostModal] = useState(false);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-12)).current;

  const todayLabel = getFormattedDate();
  const lunarDate = getLunarDate();

  const loadData = useCallback(async () => {
    const profile = await getProfile();
    if (profile) {
      setElderNickname(profile.nickname || profile.name || '家人');
      setCaregiverName(profile.caregiverName || '');
      if (profile.zodiacEmoji) setElderEmoji(profile.zodiacEmoji);
    }
    const member = await getCurrentMember();
    setCurrentMember(member);

    const checkIns = await getAllCheckIns();
    setLatestCheckIn(checkIns[0] ?? null);

    const diaries = await getDiaryEntries();
    const announcements = await getFamilyAnnouncements(30);
    setLatestAnnounce(announcements[0] ?? null);

    setFeed(buildFeed(checkIns.slice(0, 2), diaries.slice(0, 3), announcements.slice(0, 2), profile?.caregiverName || '照顾者'));
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  function goSetup() {
    router.push('/onboarding' as any);
  }

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient
        colors={['#FFF7ED', '#FDF2F8', '#FAF5FF']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        style={{ flex: 1, paddingTop: insets.top }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
          <View>
            <Text style={styles.dateText}>{todayLabel}</Text>
            <Text style={styles.lunarText}>{lunarDate.full}</Text>
            <Text style={styles.pageTitle}>{elderNickname}的今日动态</Text>
          </View>
          <View style={styles.headerAvatar}>
            <Text style={{ fontSize: 22 }}>👤</Text>
          </View>
        </Animated.View>

        {/* Announcement card */}
        <AnnouncementCard
          latest={latestAnnounce}
          onPost={() => setPostModal(true)}
          onViewAll={() => router.push('/family' as any)}
        />

        {/* Elder status */}
        <ElderStatusCard
          elderNickname={elderNickname}
          elderEmoji={elderEmoji}
          checkIn={latestCheckIn}
        />

        {/* Feed */}
        {feed.length > 0 && (
          <View style={styles.feedSection}>
            <Text style={styles.feedSectionLabel}>今日活动记录</Text>
            {feed.map((item, i) => (
              <FeedRow key={item.id} item={item} isLast={i === feed.length - 1} />
            ))}
          </View>
        )}

        {/* Upgrade card */}
        <UpgradeCard onPress={goSetup} />

        <View style={{ height: 20 }} />
      </ScrollView>

      <PostAnnouncementModal
        visible={postModal}
        onClose={() => setPostModal(false)}
        onPosted={() => { setPostModal(false); loadData(); }}
        member={currentMember}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 20, paddingBottom: 100 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 20, paddingBottom: 16 },
  dateText: { fontSize: 12, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.3, marginBottom: 2 },
  lunarText: { fontSize: 11, color: '#B07848', fontWeight: '500', marginBottom: 6 },
  pageTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A2E', letterSpacing: -0.3 },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#FFE4EC', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFBCD4',
  },

  // Announcement card
  announceCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, marginBottom: 12,
    borderWidth: 1.5, borderColor: '#BAE6FD',
    ...SHADOWS.md,
    overflow: 'hidden',
  },
  announceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  announceHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  announceHeaderIcon: { fontSize: 14 },
  announceHeaderTitle: { fontSize: 12, fontWeight: '700', color: '#0284C7', letterSpacing: 0.3 },
  postBtn: { backgroundColor: '#EFF6FF', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#BAE6FD' },
  postBtnText: { fontSize: 12, fontWeight: '700', color: '#0EA5E9' },
  announceContent: { backgroundColor: '#F0F9FF', marginHorizontal: 12, borderRadius: 12, padding: 12, marginBottom: 4, borderWidth: 1, borderColor: '#E0F2FE' },
  announceText: { fontSize: 14, fontWeight: '600', color: '#0F172A', lineHeight: 20 },
  announceFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  announceAuthorEmoji: { fontSize: 13, marginRight: 4 },
  announceAuthorName: { fontSize: 12, color: '#0284C7', fontWeight: '600' },
  announceTime: { fontSize: 12, color: '#94A3B8' },
  announceEmpty: { paddingHorizontal: 16, paddingBottom: 10 },
  announceEmptyText: { fontSize: 13, color: '#94A3B8', fontStyle: 'italic' },
  viewAllBtn: { borderTopWidth: 1, borderTopColor: '#E0F2FE', paddingVertical: 10, backgroundColor: '#F0F9FF', alignItems: 'center' },
  viewAllBtnText: { fontSize: 12, fontWeight: '700', color: '#38BDF8' },

  // Elder card
  elderCard: { borderRadius: 18, marginBottom: 12, overflow: 'hidden', ...SHADOWS.md, borderWidth: 1, borderColor: '#FDE8D8' },
  elderCardTop: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },
  elderCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  elderAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3, borderWidth: 2, borderColor: '#FFE4D6' },
  elderLabel: { fontSize: 11, fontWeight: '600', color: '#F97316', letterSpacing: 0.5, marginBottom: 2 },
  elderName: { fontSize: 18, fontWeight: '900', color: '#1A1A2E', letterSpacing: -0.3 },
  elderStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  elderStatusText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  scoreBadge: { backgroundColor: '#FFFFFF', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', ...SHADOWS.sm, borderWidth: 1, borderColor: '#FFE4D6' },
  scoreNumber: { fontSize: 24, fontWeight: '900', color: '#F97316', lineHeight: 26 },
  scoreLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', marginTop: 1 },
  metricsRow: { flexDirection: 'row', backgroundColor: '#FFFFFF', paddingVertical: 12 },
  metricItem: { flex: 1, alignItems: 'center', gap: 3 },
  metricDivider: { width: 1, backgroundColor: '#F3F4F6', marginVertical: 4 },
  metricLabel: { fontSize: 11, color: '#9CA3AF' },
  metricVal: { fontSize: 13, fontWeight: '700' },

  // Feed
  feedSection: { marginBottom: 12 },
  feedSectionLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  feedRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  feedTimeline: { alignItems: 'center', width: 30 },
  feedDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  feedLine: { width: 1, flex: 1, backgroundColor: '#E5E7EB', marginTop: 3, marginBottom: 3, minHeight: 16 },
  feedContent: { flex: 1, paddingBottom: 12 },
  feedTagRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' },
  feedTag: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  feedTagText: { fontSize: 11, fontWeight: '600' },
  feedAuthorRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  feedAuthorIcon: { fontSize: 10, opacity: 0.5 },
  feedAuthorName: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  feedTime: { fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' },
  feedTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A2E', marginBottom: 2 },
  feedDetail: { fontSize: 12, color: '#6B7280', lineHeight: 17 },

  // Upgrade
  upgradeCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 12, ...SHADOWS.md, borderWidth: 1, borderColor: '#E5E7EB' },
  upgradeSectionLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8, marginBottom: 14 },
  upgradeIconRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 },
  upgradeIconItem: { alignItems: 'center', gap: 5 },
  upgradeIconBox: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  upgradeIconLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '500' },
  upgradeDesc: { fontSize: 13, color: '#6B7280', lineHeight: 20, textAlign: 'center', marginBottom: 14 },
  upgradeBtn: { borderRadius: 14, overflow: 'hidden' },
  upgradeBtnGradient: { paddingVertical: 14, alignItems: 'center' },
  upgradeBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A2E', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: '#9CA3AF', marginBottom: 16 },
  modalInput: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, color: '#1A1A2E', lineHeight: 22,
    minHeight: 110, textAlignVertical: 'top', marginBottom: 14,
  },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  typeChip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  typeChipActive: { backgroundColor: '#EFF6FF', borderColor: '#BAE6FD' },
  typeChipText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  typeChipTextActive: { color: '#0EA5E9' },
  postSubmitBtn: { backgroundColor: '#0EA5E9', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  postSubmitBtnDisabled: { backgroundColor: '#F3F4F6' },
  postSubmitText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  postSubmitTextDisabled: { color: '#9CA3AF' },
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { fontSize: 14, color: '#9CA3AF', fontWeight: '600' },
  modalDone: { alignItems: 'center', paddingVertical: 16 },
  modalDoneTitle: { fontSize: 20, fontWeight: '800', color: '#1A1A2E', marginBottom: 6 },
  modalDoneSubtitle: { fontSize: 14, color: '#6B7280', marginBottom: 24 },
  modalDoneBtn: { backgroundColor: '#0EA5E9', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 40 },
  modalDoneBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
});
