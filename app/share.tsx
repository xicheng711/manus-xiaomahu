import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, ActivityIndicator, Share, Dimensions, Platform, Easing, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { BackButton } from '@/components/back-button';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenContainer } from '@/components/screen-container';
import { getProfile, getTodayCheckIn, getYesterdayCheckIn, type DailyCheckIn } from '@/lib/storage';
import { trpc } from '@/lib/trpc';
import * as Haptics from 'expo-haptics';

const { width: SW } = Dimensions.get('window');

// ─── 当日简报缓存（避免返回后重新生成）────────────────────────────────────────
let _briefingCache: { date: string; briefing: any; shareText: string } | null = null;
function getTodayKey() { return new Date().toISOString().slice(0, 10); }
function getCachedBriefing() {
  if (_briefingCache && _briefingCache.date === getTodayKey()) return _briefingCache;
  return null;
}
function setCachedBriefing(briefing: any, shareText: string) {
  _briefingCache = { date: getTodayKey(), briefing, shareText };
}

// ─── 简报生成加载屏 ──────────────────────────────────────────────────────────
function ShareLoadingScreen() {
  const bar1 = useRef(new Animated.Value(0)).current;
  const bar2 = useRef(new Animated.Value(0)).current;
  const bar3 = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.85)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const badgeY = useRef(new Animated.Value(0)).current;
  const badgeRot = useRef(new Animated.Value(0)).current;
  const progressVal = useRef(new Animated.Value(0)).current;
  const shimmerX = useRef(new Animated.Value(-1)).current;
  const pulse1 = useRef(new Animated.Value(0.4)).current;
  const pulse2 = useRef(new Animated.Value(0.4)).current;
  const pulse3 = useRef(new Animated.Value(0.4)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardScale, { toValue: 1, duration: 450, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
    Animated.stagger(180, [
      Animated.timing(bar1, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(bar2, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(bar3, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]).start();
    Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(badgeY, { toValue: -10, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(badgeRot, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(badgeY, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(badgeRot, { toValue: 0, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    ])).start();
    const runProgress = () => {
      progressVal.setValue(0);
      Animated.timing(progressVal, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.ease), useNativeDriver: false })
        .start(({ finished }) => { if (finished) runProgress(); });
    };
    runProgress();
    Animated.loop(Animated.timing(shimmerX, { toValue: 2, duration: 1500, easing: Easing.linear, useNativeDriver: false })).start();
    const makePulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
      ]));
    makePulse(pulse1, 0).start();
    makePulse(pulse2, 500).start();
    makePulse(pulse3, 1000).start();
    Animated.parallel([
      Animated.timing(titleOpacity, { toValue: 1, duration: 600, delay: 300, useNativeDriver: true }),
      Animated.timing(titleY, { toValue: 0, duration: 600, delay: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  const badgeSpin = badgeRot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '5deg'] });
  const bar1H = bar1.interpolate({ inputRange: [0, 1], outputRange: ['0%', '55%'] });
  const bar2H = bar2.interpolate({ inputRange: [0, 1], outputRange: ['0%', '80%'] });
  const bar3H = bar3.interpolate({ inputRange: [0, 1], outputRange: ['0%', '40%'] });
  const progressW = progressVal.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const shimmerLeft = shimmerX.interpolate({ inputRange: [-1, 2], outputRange: ['-30%', '130%'] });

  const STATUS = [
    { emoji: '📋', label: '今日打卡', bg: '#DBEAFE', pulse: pulse1 },
    { emoji: '🤖', label: 'AI 撰写', bg: '#EDE9FE', pulse: pulse2 },
    { emoji: '📰', label: '生成简报', bg: '#FCE7F3', pulse: pulse3 },
  ];

  return (
    <LinearGradient colors={['#FFF7ED', '#FDF2F8', '#FAF5FF']} style={slStyles.root}>
      <View style={slStyles.center}>
        <View style={slStyles.cardWrap}>
          <Animated.View style={[slStyles.card, { transform: [{ scale: cardScale }], opacity: cardOpacity }]}>
            <View style={slStyles.gridBg} />
            <View style={slStyles.bars}>
              <View style={slStyles.barTrack}>
                <Animated.View style={[slStyles.barFill, { height: bar1H, backgroundColor: '#4ADE80' }]} />
              </View>
              <View style={slStyles.barTrack}>
                <Animated.View style={[slStyles.barFill, { height: bar2H, backgroundColor: '#F87171' }]} />
              </View>
              <View style={slStyles.barTrack}>
                <Animated.View style={[slStyles.barFill, { height: bar3H, backgroundColor: '#60A5FA' }]} />
              </View>
            </View>
          </Animated.View>
          <Animated.View style={[slStyles.badge, { transform: [{ translateY: badgeY }, { rotate: badgeSpin }] }]}>
            <LinearGradient colors={['#A855F7', '#EC4899']} style={slStyles.badgeGrad}>
              <Text style={slStyles.badgeEmoji}>📰</Text>
            </LinearGradient>
          </Animated.View>
        </View>

        <Animated.View style={[slStyles.textBlock, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}>
          <Text style={slStyles.title}>小马虎正在生成简报...</Text>
          <Text style={slStyles.subtitle}>AI 正在整理今日记录，请稍候</Text>
        </Animated.View>

        <Animated.View style={[slStyles.progressWrap, { opacity: titleOpacity }]}>
          <View style={slStyles.progressTrack}>
            <Animated.View style={[slStyles.progressFill, { width: progressW }]}>
              <LinearGradient colors={['#A855F7', '#EC4899', '#F97316']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
            <Animated.View style={[slStyles.shimmer, { left: shimmerLeft }]} />
          </View>
        </Animated.View>

        <Animated.View style={[slStyles.statusRow, { opacity: titleOpacity }]}>
          {STATUS.map((s, i) => (
            <Animated.View key={i} style={[slStyles.statusItem, { opacity: s.pulse }]}>
              <View style={[slStyles.statusIcon, { backgroundColor: s.bg }]}>
                <Text style={{ fontSize: 18 }}>{s.emoji}</Text>
              </View>
              <Text style={slStyles.statusLabel}>{s.label}</Text>
            </Animated.View>
          ))}
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

const slStyles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  cardWrap: { position: 'relative', marginBottom: 40 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 28, padding: 28,
    shadowColor: '#A855F7', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
    width: 180, height: 180, justifyContent: 'flex-end',
  },
  gridBg: { ...StyleSheet.absoluteFillObject, borderRadius: 28, opacity: 0.06, borderWidth: 0.5, borderColor: '#000' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: '100%' },
  barTrack: { width: 36, height: '100%', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  badge: { position: 'absolute', top: -18, right: -18 },
  badgeGrad: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#A855F7', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6 },
  badgeEmoji: { fontSize: 22 },
  textBlock: { alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 22, fontWeight: '800', color: '#7C3AED', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#6B7280', textAlign: 'center' },
  progressWrap: { width: '100%', marginBottom: 32 },
  progressTrack: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 8, overflow: 'hidden' },
  shimmer: { position: 'absolute', top: 0, width: '25%', height: '100%', backgroundColor: 'rgba(255,255,255,0.4)' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  statusItem: { alignItems: 'center', gap: 6, flex: 1 },
  statusIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', textAlign: 'center' },
});

// ─── Score Ring (animated) ───────────────────────────────────────────────────
function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const color = score >= 80 ? '#16A34A' : score >= 60 ? '#3B82F6' : score >= 40 ? '#F59E0B' : '#EF4444';
  const bgColor = score >= 80 ? '#F0FDF4' : score >= 60 ? '#EFF6FF' : score >= 40 ? '#FFFBEB' : '#FEF2F2';
  const label = score >= 80 ? '状态极佳' : score >= 60 ? '状态良好' : score >= 40 ? '需要关注' : '需要照顾';
  const emoji = score >= 80 ? '🌟' : score >= 60 ? '😊' : score >= 40 ? '🤗' : '💕';
  return (
    <View style={ringStyles.wrapper}>
      <View style={[ringStyles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor, borderWidth: 4, borderColor: color }]}>
        <Text style={[ringStyles.score, { color, fontSize: size * 0.36 }]}>{score}</Text>
        <Text style={[ringStyles.scoreUnit, { color }]}>分</Text>
      </View>
      <Text style={[ringStyles.label, { color }]}>{emoji} {label}</Text>
    </View>
  );
}
const ringStyles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 6 },
  container: { alignItems: 'center', justifyContent: 'center' },
  score: { fontWeight: '900', lineHeight: undefined },
  scoreUnit: { fontSize: 11, fontWeight: '700', marginTop: -2 },
  label: { fontSize: 11, fontWeight: '700' },
});

// ─── Data Badge ──────────────────────────────────────────────────────────────
function DataBadge({ emoji, label, value, color }: { emoji: string; label: string; value: string; color: string }) {
  return (
    <View style={[badgeStyles.badge, { backgroundColor: color + '12' }]}>
      <Text style={badgeStyles.emoji}>{emoji}</Text>
      <Text style={badgeStyles.value}>{value}</Text>
      <Text style={badgeStyles.label}>{label}</Text>
    </View>
  );
}
const badgeStyles = StyleSheet.create({
  badge: { flex: 1, borderRadius: 16, padding: 14, alignItems: 'center', gap: 4, minWidth: 70 },
  emoji: { fontSize: 24 },
  value: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  label: { fontSize: 11, color: '#9B9B9B', fontWeight: '500' },
});

// ─── Beautiful Briefing Card ─────────────────────────────────────────────────
function BriefingCard({ briefing, checkIn, careScore, elderNickname, caregiverName, elderEmoji }: {
  briefing: any; checkIn: DailyCheckIn; careScore: number;
  elderNickname: string; caregiverName: string; elderEmoji: string;
}) {
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 100 }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const today = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const sleepLabel = checkIn.sleepQuality === 'good' ? '良好' : checkIn.sleepQuality === 'fair' ? '一般' : '较差';
  const medLabel = checkIn.medicationTaken ? '按时 ✅' : '漏药 ❌';

  return (
    <Animated.View style={[cardStyles.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      {/* ── Header ── */}
      <View style={cardStyles.header}>
        <View style={cardStyles.headerLeft}>
          <Text style={cardStyles.appName}>🐴🐯 小马虎 · 每日护理简报</Text>
          <Text style={cardStyles.date}>{today}</Text>
        </View>
      </View>

      {/* ── Elder Info + Score ── */}
      <View style={cardStyles.elderSection}>
        <View style={cardStyles.elderInfo}>
          <Text style={cardStyles.elderEmoji}>{elderEmoji}</Text>
          <View>
            <Text style={cardStyles.elderName}>{elderNickname}</Text>
            <Text style={cardStyles.elderSub}>今日护理简报</Text>
          </View>
        </View>
        <ScoreRing score={careScore} size={88} />
      </View>

      {/* ── Data Grid (4 badges) ── */}
      <View style={cardStyles.dataGrid}>
        <DataBadge emoji="😴" label="睡眠" value={`${checkIn.sleepHours}h · ${sleepLabel}`} color="#6C9E6C" />
        <DataBadge emoji={checkIn.moodEmoji || '😊'} label="心情" value={`${checkIn.moodScore}/10`} color="#F0A500" />
      </View>
      <View style={cardStyles.dataGrid}>
        <DataBadge emoji="💊" label="用药" value={medLabel} color="#3B82F6" />
        <DataBadge emoji="🍽️" label="饮食" value={checkIn.mealNotes ? (checkIn.mealNotes.length > 6 ? checkIn.mealNotes.slice(0, 6) + '…' : checkIn.mealNotes) : '已记录'} color="#EC4899" />
      </View>

      {/* ── AI Summary ── */}
      <View style={cardStyles.summaryBox}>
        <Text style={cardStyles.summaryIcon}>📋</Text>
        <Text style={cardStyles.summaryTitle}>今日状态总结</Text>
        <Text style={cardStyles.summaryText}>
          {briefing.summary && briefing.summary.trim().length > 0
            ? briefing.summary
            : `${elderNickname}今日整体状态${careScore >= 80 ? '很好' : careScore >= 60 ? '良好' : careScore >= 40 ? '一般，需要多关注' : '欠佳，需要重点照护'}。睡眠${checkIn.sleepHours}小时，心情评分${checkIn.moodScore}/10，用药${checkIn.medicationTaken ? '按时完成' : '有漏服情况'}。${caregiverName}今天辛苦了！`}
        </Text>
      </View>

      {/* ── Highlights ── */}
      {briefing.highlights?.length > 0 && (
        <View style={cardStyles.highlightsBox}>
          {briefing.highlights.map((h: string, i: number) => (
            <View key={i} style={cardStyles.highlightRow}>
              <Text style={cardStyles.highlightIcon}>✨</Text>
              <Text style={cardStyles.highlightText}>{h}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Caregiver Note ── */}
      <View style={cardStyles.caregiverBox}>
        <Text style={cardStyles.caregiverIcon}>💕</Text>
        <Text style={cardStyles.caregiverText}>
          {briefing.caregiverNote && briefing.caregiverNote.trim().length > 0
            ? briefing.caregiverNote
            : `${caregiverName}，每一天的坚持都是对${elderNickname}最深的爱。感谢你的付出，好好休息！`}
        </Text>
      </View>

      {/* ── Footer ── */}
      <View style={cardStyles.footer}>
        <Text style={cardStyles.footerLeft}>由 {caregiverName} 用心记录</Text>
        <Text style={cardStyles.footerRight}>✨ 小马虎</Text>
      </View>
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 22, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 10,
    borderWidth: 1, borderColor: '#F0F0EE',
  },
  header: { marginBottom: 18 },
  headerLeft: {},
  appName: { fontSize: 14, fontWeight: '800', color: '#6C9E6C', letterSpacing: -0.3 },
  date: { fontSize: 13, color: '#9B9B9B', marginTop: 3 },
  elderSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  elderInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  elderEmoji: { fontSize: 40 },
  elderName: { fontSize: 20, fontWeight: '800', color: '#1A1A1A' },
  elderSub: { fontSize: 13, color: '#9B9B9B', marginTop: 2 },
  dataGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  summaryBox: { backgroundColor: '#F8FAF6', borderRadius: 16, padding: 16, marginTop: 6, marginBottom: 14 },
  summaryIcon: { fontSize: 18, marginBottom: 6 },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: '#3D7A3D', marginBottom: 8 },
  summaryText: { fontSize: 14, color: '#374151', lineHeight: 22 },
  highlightsBox: { gap: 8, marginBottom: 14 },
  highlightRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  highlightIcon: { fontSize: 14, marginTop: 2 },
  highlightText: { flex: 1, fontSize: 13, color: '#4B5563', lineHeight: 20 },
  caregiverBox: {
    flexDirection: 'row', gap: 10, backgroundColor: '#FFF5F7', borderRadius: 14, padding: 14,
    marginBottom: 16, alignItems: 'center',
  },
  caregiverIcon: { fontSize: 20 },
  caregiverText: { flex: 1, fontSize: 13, color: '#BE185D', lineHeight: 20, fontStyle: 'italic' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 14 },
  footerLeft: { fontSize: 12, color: '#BBBBB8' },
  footerRight: { fontSize: 12, color: '#6C9E6C', fontWeight: '600' },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ShareScreen() {
  const [briefing, setBriefing] = useState<any>(null);
  const [checkIn, setCheckIn] = useState<DailyCheckIn | null>(null);
  const [careScore, setCareScore] = useState(70);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elderNickname, setElderNickname] = useState('老宝');
  const [elderEmoji, setElderEmoji] = useState('🐯');
  const [caregiverName, setCaregiverName] = useState('照顾者');
  const [shareText, setShareText] = useState('');
  const [copied, setCopied] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const cardRef = useRef<View>(null);

  const generateBriefingMutation = trpc.ai.generateBriefing.useMutation();

  useFocusEffect(useCallback(() => { loadAndGenerate(false); }, []));

  async function loadAndGenerate(forceRefresh = false) {
    setLoading(true);
    setError(null);
    try {
      const profile = await getProfile();
      const nickname = profile?.nickname || profile?.name || '老宝';
      const caregiver = profile?.caregiverName || '照顾者';
      const emoji = profile?.zodiacEmoji || '🐯';
      setElderNickname(nickname);
      setCaregiverName(caregiver);
      setElderEmoji(emoji);

      const today = await getTodayCheckIn();
      const yesterday = await getYesterdayCheckIn();
      const ci = today || yesterday;

      if (!ci) {
        setError('请先完成今日打卡，再生成简报');
        setLoading(false);
        return;
      }

      setCheckIn(ci);
      const score = ci.careScore || 70;
      setCareScore(score);

      // ── 命中缓存直接展示，无需重新调用 AI ──
      if (!forceRefresh) {
        const cached = getCachedBriefing();
        if (cached) {
          setBriefing(cached.briefing);
          setShareText(cached.shareText);
          setLoading(false);
          return;
        }
      }

      await doGenerate(nickname, caregiver, ci, score);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function doGenerate(nickname: string, caregiver: string, ci: DailyCheckIn, score: number) {
    setGenerating(true);
    setBriefing(null);
    try {
      const dateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
      const result = await generateBriefingMutation.mutateAsync({
        elderNickname: nickname,
        caregiverName: caregiver,
        date: dateStr,
        checkIn: {
          sleepHours: ci.sleepHours ?? 7,
          sleepQuality: ci.sleepQuality ?? 'fair',
          moodScore: ci.moodScore ?? 5,
          medicationTaken: ci.medicationTaken ?? true,
          notes: ci.eveningNotes || ci.morningNotes || undefined,
        },
        careScore: score,
      });
      if (result.success && result.briefing) {
        setBriefing(result.briefing);
        setShareText(result.briefing.shareText ?? '');
        setCachedBriefing(result.briefing, result.briefing.shareText ?? '');
      } else {
        // 生成失败时构建本地 fallback 并缓存
        const fallback = buildLocalBriefing(nickname, caregiver, ci, score);
        setBriefing(fallback);
        setCachedBriefing(fallback, fallback.shareText);
      }
    } catch (e) {
      const fallback = buildLocalBriefing(nickname, caregiver, ci, score);
      setBriefing(fallback);
      setCachedBriefing(fallback, fallback.shareText);
    } finally {
      setGenerating(false);
    }
  }

  function buildLocalBriefing(nickname: string, caregiver: string, ci: DailyCheckIn, score: number) {
    const sleepLabel = ci.sleepQuality === 'good' ? '良好' : ci.sleepQuality === 'fair' ? '一般' : '较差';
    const scoreLabel = score >= 80 ? '很好' : score >= 60 ? '良好' : score >= 40 ? '一般，需多关注' : '欠佳，需重点照护';
    const dateStr = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    return {
      summary: `${dateStr}，${nickname}今日整体状态${scoreLabel}。睡眠${ci.sleepHours ?? '--'}小时（${sleepLabel}），心情${ci.moodScore ?? '--'}/10，用药${ci.medicationTaken ? '按时完成' : '有漏服'}。`,
      highlights: [
        ci.medicationTaken ? '今日按时服药 💊' : '注意：今日未按时服药 ⚠️',
        `睡眠${ci.sleepHours ?? '--'}小时，质量${sleepLabel}`,
        ci.eveningNotes || ci.morningNotes ? `备注：${(ci.eveningNotes || ci.morningNotes || '').slice(0, 30)}` : null,
      ].filter(Boolean) as string[],
      caregiverNote: `辛苦了，好好休息！`,
      shareText: `🐴🐯【小马虎 · 每日护理简报】\n📅 ${dateStr}\n👴 ${nickname} 今日护理指数：${score}/100\n😴 睡眠：${ci.sleepHours ?? '--'}小时（${sleepLabel}）\n💊 用药：${ci.medicationTaken ? '已按时服药 ✅' : '未按时服药 ❌'}\n由 ${caregiver} 用心记录 💕`,
    };
  }

  async function handleShare() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const text = shareText || buildFallbackShareText();
    try { await Share.share({ message: text, title: `${elderNickname}今日护理日报` }); } catch {}
  }

  async function handleShareAsImage() {
    if (Platform.OS === 'web') {
      // Web fallback: just share text
      await handleShare();
      return;
    }
    if (!cardRef.current) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSharingImage(true);
    try {
      const ViewShot = require('react-native-view-shot');
      const uri = await ViewShot.captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      const Sharing = require('expo-sharing');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: '分享到微信',
          UTI: 'public.png',
        });
      } else {
        Alert.alert('无法分享', '当前设备不支持分享功能');
      }
    } catch (e) {
      Alert.alert('截图失败', '请稍后重试');
    } finally {
      setSharingImage(false);
    }
  }

  function buildFallbackShareText(): string {
    if (!checkIn) return `【小马虎护理日报】${elderNickname}今日护理指数：${careScore}/100`;
    const sleepLabel = checkIn.sleepQuality === 'good' ? '良好' : checkIn.sleepQuality === 'fair' ? '一般' : '较差';
    return `🐴🐯【小马虎 · 每日护理简报】

📅 ${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
👴 ${elderNickname} 今日护理指数：${careScore}/100

😴 睡眠：${checkIn.sleepHours}小时（${sleepLabel}）
${checkIn.moodEmoji} 心情：${checkIn.moodScore}/10
💊 用药：${checkIn.medicationTaken ? '已按时服药 ✅' : '未按时服药 ❌'}
🍽️ 饮食：${checkIn.mealNotes || '已记录'}

由 ${caregiverName} 用心记录 💕
—— 小马虎 · 用爱守护每一天`;
  }

  function handleCopy() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const text = shareText || buildFallbackShareText();
    // Use Clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Loading ──
  if (loading) return <ShareLoadingScreen />;

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.title}>📋 今日简报</Text>
          <View style={{ width: 36 }} />
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorEmoji}>😅</Text>
            <Text style={styles.errorText}>{error}</Text>
            {error.includes('打卡') && (
              <TouchableOpacity style={styles.checkinBtn} onPress={() => router.push('/(tabs)/checkin' as any)}>
                <Text style={styles.checkinBtnText}>去打卡 →</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : generating ? (
          <View style={styles.generatingBox}>
            <ActivityIndicator color="#6C9E6C" />
            <Text style={styles.generatingText}>✨ 小马虎正在生成精美简报...</Text>
          </View>
        ) : briefing && checkIn ? (
          <>
            <View ref={cardRef} collapsable={false}>
              <BriefingCard
                briefing={briefing}
                checkIn={checkIn}
                careScore={careScore}
                elderNickname={elderNickname}
                caregiverName={caregiverName}
                elderEmoji={elderEmoji}
              />
            </View>

            {/* ── WeChat Share Button ── */}
            <TouchableOpacity
              style={[styles.shareWechatBtn, sharingImage && { opacity: 0.7 }]}
              onPress={handleShareAsImage}
              disabled={sharingImage}
            >
              {sharingImage ? (
                <ActivityIndicator color="#fff" style={{ marginRight: 6 }} />
              ) : (
                <Text style={styles.shareWechatIcon}>💬</Text>
              )}
              <Text style={styles.shareWechatText}>
                {sharingImage ? '生成图片中...' : '一键分享到微信'}
              </Text>
            </TouchableOpacity>

            {/* ── Action Row ── */}
            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.copyBtn, copied && styles.copiedBtn]} onPress={handleCopy}>
                <Text style={styles.copyBtnText}>{copied ? '✅ 已复制' : '📋 复制文字'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.regenerateBtn}
                onPress={async () => {
                  if (checkIn) await doGenerate(elderNickname, caregiverName, checkIn, careScore);
                }}
              >
                <Text style={styles.regenerateBtnText}>✨ 重新生成</Text>
              </TouchableOpacity>
            </View>

            {/* ── Tips ── */}
            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>💡 家庭协作建议</Text>
              <Text style={styles.tipItem}>每天分享日报，让所有家人了解{elderNickname}的状态</Text>
              <Text style={styles.tipItem}>建立家庭微信群，共同讨论护理方案</Text>
              <Text style={styles.tipItem}>轮流照顾，避免单人长期照顾导致疲惫</Text>
              <Text style={styles.tipItem}>重要医疗信息及时同步给所有家庭成员</Text>
            </View>

            <View style={styles.disclaimer}>
              <Text style={styles.disclaimerText}>✨ 由小马虎生成 · 仅供参考</Text>
            </View>
          </>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },

  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  refreshBtn: { padding: 8 },
  refreshBtnText: { fontSize: 20 },
  generatingBox: {
    flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center',
    padding: 24, backgroundColor: '#F0F7EE', borderRadius: 16, marginBottom: 20,
  },
  generatingText: { fontSize: 15, color: '#3D7A3D', fontWeight: '600' },
  errorBox: { alignItems: 'center', padding: 32, backgroundColor: '#FEF2F2', borderRadius: 20 },
  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorText: { fontSize: 15, color: '#DC2626', textAlign: 'center', marginBottom: 16 },
  checkinBtn: { backgroundColor: '#6C9E6C', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
  checkinBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  shareWechatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#07C160', borderRadius: 20, padding: 16, marginBottom: 12,
  },
  shareWechatIcon: { fontSize: 22 },
  shareWechatText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  copyBtn: { flex: 1, backgroundColor: '#F5F5F3', borderRadius: 16, padding: 14, alignItems: 'center' },
  copiedBtn: { backgroundColor: '#F0FDF4' },
  copyBtnText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  regenerateBtn: { flex: 1, backgroundColor: '#F0F7EE', borderRadius: 16, padding: 14, alignItems: 'center' },
  regenerateBtnText: { fontSize: 14, fontWeight: '600', color: '#3D7A3D' },
  tipsCard: {
    backgroundColor: '#FAFAF8', borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: '#EBEBEB', marginBottom: 16, gap: 8,
  },
  tipsTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  tipItem: { fontSize: 13, color: '#6B7280', lineHeight: 20, paddingLeft: 4 },
  disclaimer: { alignItems: 'center', marginBottom: 8 },
  disclaimerText: { fontSize: 11, color: '#BBBBB8', textAlign: 'center' },
});
