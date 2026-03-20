import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated, Easing, Platform, Dimensions, TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenContainer } from '@/components/screen-container';
import { getProfile, getYesterdayCheckIn, getTodayCheckIn } from '@/lib/storage';
import { scoreSleepInput } from '@/lib/sleep-scoring';
import { trpc } from '@/lib/trpc';
import { BackButton } from '@/components/back-button';
import { COLORS, RADIUS, SHADOWS } from '@/lib/animations';

const { width: SW } = Dimensions.get('window');

// ─── AI 分析加载屏 ────────────────────────────────────────────────────────────
function AILoadingScreen() {
  // Bar heights (0→1)
  const bar1 = useRef(new Animated.Value(0)).current;
  const bar2 = useRef(new Animated.Value(0)).current;
  const bar3 = useRef(new Animated.Value(0)).current;
  // Card scale-in
  const cardScale = useRef(new Animated.Value(0.85)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  // Floating badge
  const badgeY = useRef(new Animated.Value(0)).current;
  const badgeRot = useRef(new Animated.Value(0)).current;
  // Progress bar 0→100 looping
  const progressVal = useRef(new Animated.Value(0)).current;
  // Shimmer
  const shimmerX = useRef(new Animated.Value(-1)).current;
  // Status pulse (3 phases)
  const pulse1 = useRef(new Animated.Value(0.4)).current;
  const pulse2 = useRef(new Animated.Value(0.4)).current;
  const pulse3 = useRef(new Animated.Value(0.4)).current;
  // Title fade
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleY = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    // Card entrance
    Animated.parallel([
      Animated.timing(cardScale, { toValue: 1, duration: 450, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Bars staggered
    Animated.stagger(180, [
      Animated.timing(bar1, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(bar2, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: false }),
      Animated.timing(bar3, { toValue: 1, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]).start();

    // Floating badge
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

    // Progress loop
    const runProgress = () => {
      progressVal.setValue(0);
      Animated.timing(progressVal, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }).start(({ finished }) => {
        if (finished) runProgress();
      });
    };
    runProgress();

    // Shimmer loop
    Animated.loop(Animated.timing(shimmerX, { toValue: 2, duration: 1500, easing: Easing.linear, useNativeDriver: false })).start();

    // Status pulse staggered
    const makePulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
      ]));
    makePulse(pulse1, 0).start();
    makePulse(pulse2, 500).start();
    makePulse(pulse3, 1000).start();

    // Title
    Animated.parallel([
      Animated.timing(titleOpacity, { toValue: 1, duration: 600, delay: 300, useNativeDriver: true }),
      Animated.timing(titleY, { toValue: 0, duration: 600, delay: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  const badgeSpin = badgeRot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '5deg'] });
  const bar1H = bar1.interpolate({ inputRange: [0, 1], outputRange: ['0%', '60%'] });
  const bar2H = bar2.interpolate({ inputRange: [0, 1], outputRange: ['0%', '45%'] });
  const bar3H = bar3.interpolate({ inputRange: [0, 1], outputRange: ['0%', '85%'] });
  const progressW = progressVal.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const shimmerLeft = shimmerX.interpolate({ inputRange: [-1, 2], outputRange: ['-30%', '130%'] });

  const STATUS = [
    { emoji: '💾', label: '数据收集', bg: '#DBEAFE', pulse: pulse1 },
    { emoji: '📊', label: '智能分析', bg: '#EDE9FE', pulse: pulse2 },
    { emoji: '📈', label: '生成报告', bg: '#FCE7F3', pulse: pulse3 },
  ];

  return (
    <LinearGradient
      colors={['#FFF7ED', '#FDF2F8', '#FAF5FF']}
      style={ldStyles.root}
    >
      <View style={ldStyles.center}>
        {/* ── 白卡图表区 ── */}
        <View style={ldStyles.cardWrap}>
          <Animated.View style={[ldStyles.card, { transform: [{ scale: cardScale }], opacity: cardOpacity }]}>
            {/* 网格背景 */}
            <View style={ldStyles.gridBg} />
            {/* 柱状图 */}
            <View style={ldStyles.bars}>
              <View style={ldStyles.barTrack}>
                <Animated.View style={[ldStyles.barFill, { height: bar1H, backgroundColor: '#4ADE80' }]} />
              </View>
              <View style={ldStyles.barTrack}>
                <Animated.View style={[ldStyles.barFill, { height: bar2H, backgroundColor: '#F87171' }]} />
              </View>
              <View style={ldStyles.barTrack}>
                <Animated.View style={[ldStyles.barFill, { height: bar3H, backgroundColor: '#60A5FA' }]} />
              </View>
            </View>
          </Animated.View>

          {/* 浮动徽章 */}
          <Animated.View style={[ldStyles.badge, { transform: [{ translateY: badgeY }, { rotate: badgeSpin }] }]}>
            <LinearGradient colors={['#A855F7', '#EC4899']} style={ldStyles.badgeGrad}>
              <Text style={ldStyles.badgeEmoji}>✨</Text>
            </LinearGradient>
          </Animated.View>
        </View>

        {/* ── 文字区 ── */}
        <Animated.View style={[ldStyles.textBlock, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}>
          <Text style={ldStyles.title}>小马虎正在分析记录...</Text>
          <Text style={ldStyles.subtitle}>正在整理今日数据...</Text>
        </Animated.View>

        {/* ── 进度条 ── */}
        <Animated.View style={[ldStyles.progressWrap, { opacity: titleOpacity }]}>
          <View style={ldStyles.progressTrack}>
            <Animated.View style={[ldStyles.progressFill, { width: progressW }]}>
              <LinearGradient colors={['#A855F7', '#EC4899', '#F97316']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            </Animated.View>
            {/* Shimmer */}
            <Animated.View style={[ldStyles.shimmer, { left: shimmerLeft }]} />
          </View>
        </Animated.View>

        {/* ── 状态指示器 ── */}
        <Animated.View style={[ldStyles.statusRow, { opacity: titleOpacity }]}>
          {STATUS.map((s, i) => (
            <Animated.View key={i} style={[ldStyles.statusItem, { opacity: s.pulse }]}>
              <View style={[ldStyles.statusIcon, { backgroundColor: s.bg }]}>
                <Text style={{ fontSize: 18 }}>{s.emoji}</Text>
              </View>
              <Text style={ldStyles.statusLabel}>{s.label}</Text>
            </Animated.View>
          ))}
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

const ldStyles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  cardWrap: { position: 'relative', marginBottom: 40 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 28, padding: 28,
    shadowColor: '#A855F7', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
    width: 180, height: 180, justifyContent: 'flex-end',
  },
  gridBg: {
    ...StyleSheet.absoluteFillObject, borderRadius: 28, opacity: 0.06,
    borderWidth: 0.5, borderColor: '#000',
  },
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
  statusRow: { flexDirection: 'row', gap: 24 },
  statusItem: { alignItems: 'center', gap: 8 },
  statusIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusLabel: { fontSize: 12, color: '#9CA3AF' },
});

// ─── Score display helpers ───────────────────────────────────────────────────
function getScoreDisplay(score: number) {
  if (score >= 90) return { label: '状态极佳', color: '#16A34A', bgColor: '#F0FDF4', mascot: '🌟' };
  if (score >= 75) return { label: '状态良好', color: '#2563EB', bgColor: '#EFF6FF', mascot: '😊' };
  if (score >= 60) return { label: '状态平稳', color: '#D97706', bgColor: '#FFFBEB', mascot: '😌' };
  if (score >= 40) return { label: '需要关注', color: '#EA580C', bgColor: '#FFF7ED', mascot: '🤗' };
  return { label: '需要照顾', color: '#DC2626', bgColor: '#FEF2F2', mascot: '💕' };
}

// ─── Sub-components ──────────────────────────────────────────────────────────
function ScoreRing({ score, color, bgColor, mascot }: { score: number; color: string; bgColor: string; mascot: string }) {
  const scaleAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0)).current;
  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 100 }).start();
  }, []);
  return (
    <Animated.View style={[styles.scoreRing, { backgroundColor: bgColor, transform: [{ scale: scaleAnim }] }]}>
      <Text style={styles.scoreMascot}>{mascot}</Text>
      <Text style={[styles.scoreNum, { color }]}>{score}</Text>
      <Text style={styles.scoreMax}>/100</Text>
    </Animated.View>
  );
}

function AdviceCard({ card, index }: { card: any; index: number }) {
  const fadeAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 0 : 24)).current;
  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: index * 120, useNativeDriver: true }),
    ]).start();
  }, []);

  const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
    high: { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
    medium: { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' },
    low: { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
  };
  const theme = priorityColors[card.priority] ?? priorityColors.low;

  return (
    <Animated.View style={[styles.adviceCard, { backgroundColor: theme.bg, borderColor: theme.border, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.adviceHeader}>
        <Text style={styles.adviceIcon}>{card.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.adviceTitle, { color: theme.text }]}>{card.title}</Text>
          {card.priority === 'high' && (
            <View style={[styles.priorityBadge, { backgroundColor: theme.text }]}>
              <Text style={styles.priorityText}>重点关注</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={styles.adviceText}>{card.advice}</Text>
      {card.actionTips?.length > 0 && (
        <View style={styles.tipsContainer}>
          {card.actionTips.map((tip: string, i: number) => (
            <View key={i} style={styles.tipRow}>
              <Text style={[styles.tipBullet, { color: theme.text }]}>•</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  );
}

// ─── 当日分析缓存（模块级，避免重复生成）────────────────────────────────────
let _adviceCache: { date: string; checkInKey: string; advice: any; weather: any } | null = null;

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 根据打卡关键字段生成指纹，任意字段变化即失效缓存 */
function buildCheckInKey(today: any, yesterday: any): string {
  const ci = today ?? yesterday;
  if (!ci) return 'empty';
  return [
    ci.moodScore ?? '',
    ci.sleepHours ?? '',
    ci.medicationTaken ?? '',
    ci.morningNotes ?? '',
    ci.mealOption ?? '',
    ci.caregiverMoodScore ?? '',
    ci.sleepInput ? JSON.stringify(ci.sleepInput) : '',
  ].join('|');
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function AssistantScreen() {
  const [aiAdvice, setAiAdvice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elderNickname, setElderNickname] = useState('老宝');
  const [caregiverName, setCaregiverName] = useState('照顾者');
  const [city, setCity] = useState('');
  const [weatherData, setWeatherData] = useState<any>(null);
  const fadeAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0)).current;

  const getDailyAdviceMutation = trpc.ai.getDailyAdvice.useMutation();

  useFocusEffect(useCallback(() => {
    loadData();
  }, []));

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const profile = await getProfile();
      const nickname = profile?.nickname || profile?.name || '老宝';
      const caregiver = profile?.caregiverName || '照顾者';
      const cityName = profile?.city || '';
      setElderNickname(nickname);
      setCaregiverName(caregiver);
      setCity(cityName);

      // ── 先获取打卡数据，构造指纹 ──
      const yesterday = await getYesterdayCheckIn();
      const today = await getTodayCheckIn();
      const todayKey = getTodayKey();
      const checkInKey = buildCheckInKey(today, yesterday);

      // ── 命中当日缓存且打卡数据未变，直接使用 ──
      if (_adviceCache && _adviceCache.date === todayKey && _adviceCache.checkInKey === checkInKey) {
        setAiAdvice(_adviceCache.advice);
        setWeatherData(_adviceCache.weather);
        setLoading(false);
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        return;
      }

      const extraNotes = today?.morningNotes || '';

      // 规则引擎计算睡眠评分（昨日数据 or 今日早间）
      const sleepData = yesterday?.sleepInput ?? today?.sleepInput ?? null;
      const sleepAnalysis = sleepData ? scoreSleepInput(sleepData) : null;

      const result = await getDailyAdviceMutation.mutateAsync({
        elderNickname: nickname,
        caregiverName: caregiver,
        city: cityName || undefined,
        // v4.1 结构化输入
        baseline: profile?.careNeeds?.selectedNeeds?.length
          ? { care_needs: profile.careNeeds.selectedNeeds }
          : undefined,
        sleep_analysis: sleepAnalysis ? {
          score: sleepAnalysis.score,
          problems: sleepAnalysis.problems,
          sleep_range: yesterday?.sleepRange ?? today?.sleepRange ?? undefined,
        } : undefined,
        today_input: {
          mood: today?.moodScore && today.moodScore >= 7 ? '良好' : today?.moodScore && today.moodScore >= 5 ? '一般' : '较差',
          mood_score: today?.moodScore ?? yesterday?.moodScore ?? undefined,
          medication_taken: today?.medicationTaken ?? yesterday?.medicationTaken ?? undefined,
          meal: today?.mealOption ?? yesterday?.mealOption ?? today?.mealNotes ?? yesterday?.mealNotes ?? undefined,
          caregiver_mood: today?.caregiverMoodScore
            ? (today.caregiverMoodScore >= 7 ? '精力充沛' : today.caregiverMoodScore >= 5 ? '状态一般' : '比较疲惫')
            : undefined,
          notes: extraNotes || today?.eveningNotes || yesterday?.eveningNotes || undefined,
        },
        // 向后兼容旧 schema
        careNeeds: profile?.careNeeds?.selectedNeeds ?? undefined,
        extraNotes: extraNotes || undefined,
      });

      if (result.success && result.advice) {
        setAiAdvice(result.advice);
        setWeatherData(result.weather);
        // 写入当日缓存（含打卡指纹，打卡数据变化会自动失效）
        _adviceCache = { date: todayKey, checkInKey, advice: result.advice, weather: result.weather };
      } else {
        setError(result.error ?? '小马虎分析失败，请稍后重试');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误，请检查连接');
    } finally {
      setLoading(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }
  }

  if (loading) {
    return <AILoadingScreen />;
  }

  if (error || !aiAdvice) {
    return (
      <ScreenContainer containerClassName="bg-[#FFF0F5]">
        <View style={styles.chatHeader}>
          <BackButton onPress={() => router.replace('/(tabs)' as any)} />
          <View style={styles.chatHeaderCenter}>
            <View style={styles.chatHeaderDot} />
            <Text style={styles.chatHeaderTitle}>今日数据分析</Text>
          </View>
          <View style={{ width: 80 }} />
        </View>
        <View style={[styles.errorContainer, { flex: 1 }]}>
          <Text style={styles.errorEmoji}>😅</Text>
          <Text style={styles.errorTitle}>暂时无法生成分析</Text>
          <Text style={styles.errorText}>{error ?? '请先完成今日打卡再查看'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryBtnText}>🔄 重新生成</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backBtn2} onPress={() => router.replace('/(tabs)' as any)}>
            <Text style={styles.backBtn2Text}>← 返回首页</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const scoreDisplay = getScoreDisplay(aiAdvice.careScore ?? 70);
  const todayLabel = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <ScreenContainer containerClassName="bg-[#FFF0F5]">
      {/* ── Sticky Header ── */}
      <View style={styles.chatHeader}>
        <BackButton onPress={() => router.replace('/(tabs)' as any)} />
        <View style={styles.chatHeaderCenter}>
          <View style={styles.chatHeaderDot} />
          <Text style={styles.chatHeaderTitle}>今日数据分析</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/share' as any)}>
          <LinearGradient colors={['#F472B6', '#FB7185']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chatSaveBtn}>
            <Text style={styles.chatSaveBtnText}>📤 分享</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ── Scrollable chat ── */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.chatScroll} showsVerticalScrollIndicator={false}>

        {/* Date divider */}
        <View style={styles.chatDateRow}>
          <View style={styles.chatDatePill}>
            <Text style={styles.chatDateText}>📅 {todayLabel} ☀️</Text>
          </View>
        </View>

        {/* Weather badge */}
        {weatherData && (
          <View style={styles.weatherBadge}>
            <Text style={styles.weatherText}>
              {weatherData.icon} {city} {weatherData.temp}°C {weatherData.description}
            </Text>
          </View>
        )}

        {/* AI identifier */}
        <View style={styles.chatAIIdentifier}>
          <LinearGradient colors={['#A78BFA', '#F472B6']} style={styles.chatAIAvatar}>
            <Text style={{ fontSize: 18 }}>🐴</Text>
          </LinearGradient>
          <View style={{ gap: 3 }}>
            <Text style={styles.chatAIName}>小马虎护理顾问</Text>
            <LinearGradient colors={['#3B82F6', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chatAIBadge}>
              <Text style={styles.chatAIBadgeText}>✨ 数据分析</Text>
            </LinearGradient>
          </View>
        </View>

        {/* ── Score + Greeting bubble ── */}
        <Animated.View style={[styles.chatBubbleAI, { opacity: fadeAnim }]}>
          <View style={styles.chatDecoSticker}><Text style={{ fontSize: 16 }}>✨</Text></View>
          <View style={styles.chatDecoDots}>
            <View style={[styles.chatDecoDot, { backgroundColor: '#F9A8D4' }]} />
            <View style={[styles.chatDecoDot, { backgroundColor: '#C4B5FD' }]} />
            <View style={[styles.chatDecoDot, { backgroundColor: '#93C5FD' }]} />
          </View>
          <Text style={styles.greetingText}>{aiAdvice.greeting}</Text>
          <ScoreRing score={aiAdvice.careScore ?? 70} color={scoreDisplay.color} bgColor={scoreDisplay.bgColor} mascot={scoreDisplay.mascot} />
          <View style={[styles.scoreLabelBadge, { backgroundColor: scoreDisplay.color }]}>
            <Text style={styles.scoreLabelText}>{aiAdvice.scoreLabel ?? scoreDisplay.label}</Text>
          </View>
          <Text style={styles.overallText}>{aiAdvice.overallAssessment}</Text>
        </Animated.View>

        {/* Watch Out bubble */}
        {aiAdvice.watchOut && (
          <View style={styles.chatBubbleAI}>
            <View style={styles.watchOutCard}>
              <Text style={styles.watchOutIcon}>⚠️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.watchOutLabel}>今日特别注意</Text>
                <Text style={styles.watchOutText}>{aiAdvice.watchOut}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Advice Cards */}
        <Text style={styles.sectionTitle}>📊 今日数据分析</Text>
        {(aiAdvice.adviceCards ?? []).map((card: any, i: number) => (
          <View key={i} style={styles.chatBubbleAI}>
            <AdviceCard card={card} index={i} />
          </View>
        ))}

        {/* Outdoor bubble */}
        {aiAdvice.outdoorAdvice && (
          <View style={styles.chatBubbleAI}>
            <View style={styles.outdoorCard}>
              <Text style={styles.outdoorIcon}>🌿</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.outdoorLabel}>户外活动建议</Text>
                <Text style={styles.outdoorText}>{aiAdvice.outdoorAdvice}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Nutrition bubble */}
        {aiAdvice.nutritionAdvice && (
          <View style={styles.chatBubbleAI}>
            <Text style={styles.nutritionTitle}>🥗 今日营养建议</Text>
            {aiAdvice.nutritionAdvice.breakfast?.length > 0 && (
              <View style={styles.mealSection}>
                <Text style={styles.mealTitle}>🌅 早餐</Text>
                {aiAdvice.nutritionAdvice.breakfast.map((s: string, i: number) => (
                  <Text key={i} style={styles.mealItem}>• {s}</Text>
                ))}
              </View>
            )}
            {aiAdvice.nutritionAdvice.lunch?.length > 0 && (
              <View style={styles.mealSection}>
                <Text style={styles.mealTitle}>☀️ 午餐</Text>
                {aiAdvice.nutritionAdvice.lunch.map((s: string, i: number) => (
                  <Text key={i} style={styles.mealItem}>• {s}</Text>
                ))}
              </View>
            )}
            {aiAdvice.nutritionAdvice.dinner?.length > 0 && (
              <View style={styles.mealSection}>
                <Text style={styles.mealTitle}>🌙 晚餐</Text>
                {aiAdvice.nutritionAdvice.dinner.map((s: string, i: number) => (
                  <Text key={i} style={styles.mealItem}>• {s}</Text>
                ))}
              </View>
            )}
            {aiAdvice.nutritionAdvice.hydration && (
              <View style={styles.hydrationBox}>
                <Text style={styles.hydrationIcon}>💧</Text>
                <Text style={styles.hydrationText}>{aiAdvice.nutritionAdvice.hydration}</Text>
              </View>
            )}
          </View>
        )}

        {/* Encouragement bubble */}
        <View style={[styles.chatBubbleAI, { borderColor: '#FBCFE8' }]}>
          <View style={{ position: 'absolute', bottom: -10, left: -6, zIndex: 10 }}>
            <Text style={{ fontSize: 22 }}>💖</Text>
          </View>
          <View style={styles.encourageCard}>
            <Text style={styles.encourageEmoji}>💕</Text>
            <Text style={styles.encourageText}>{aiAdvice.encouragement}</Text>
          </View>
        </View>

        {/* AI badge */}
        <View style={styles.aiBadge}>
          <Text style={styles.aiBadgeText}>✨ 由小马虎分析生成</Text>
        </View>

        <View style={{ height: 8 }} />
      </ScrollView>

      {/* ── Bottom input bar ── */}
      <View style={styles.chatBottomBar}>
        <View style={styles.chatInputRow}>
          <View style={styles.chatInputWrap}>
            <TextInput
              style={styles.chatInput}
              placeholder="继续询问小马虎...💭"
              placeholderTextColor="#D1A5B8"
            />
          </View>
          <TouchableOpacity>
            <LinearGradient colors={['#F472B6', '#FB7185']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.chatSendBtn}>
              <Text style={styles.chatSendBtnText}>➤</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.chatEndBtn} onPress={() => router.replace('/(tabs)' as any)}>
          <Text style={styles.chatEndBtnText}>结束并返回首页 →</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // ── Chat UI ──────────────────────────────────────────────────────────────
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.92)', borderBottomWidth: 2, borderBottomColor: '#FECDD3',
  },
  chatHeaderCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  chatHeaderDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F472B6' },
  chatHeaderTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A1A' },
  chatSaveBtn: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chatSaveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  chatScroll: { padding: 16, paddingBottom: 24 },
  chatDateRow: { alignItems: 'center', marginBottom: 14 },
  chatDatePill: {
    backgroundColor: 'rgba(255,255,255,0.75)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: '#FECDD3',
  },
  chatDateText: { fontSize: 12, color: '#9B9B9B' },
  chatAIIdentifier: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  chatAIAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chatAIName: { fontSize: 13, fontWeight: '800', color: '#1A1A1A' },
  chatAIBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  chatAIBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  chatBubbleAI: {
    backgroundColor: '#fff', borderRadius: 24, padding: 18, marginBottom: 12,
    borderWidth: 2, borderColor: '#FECDD3',
    shadowColor: '#EC4899', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
  },
  chatDecoSticker: {
    position: 'absolute', top: -12, right: -8, zIndex: 10,
    backgroundColor: '#FDE047', borderRadius: 18, width: 34, height: 34,
    alignItems: 'center', justifyContent: 'center',
  },
  chatDecoDots: { flexDirection: 'row', gap: 4, justifyContent: 'flex-end', marginBottom: 10 },
  chatDecoDot: { width: 6, height: 6, borderRadius: 3 },
  chatBottomBar: {
    backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20,
    borderTopWidth: 2, borderTopColor: '#FECDD3', gap: 10,
  },
  chatInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chatInputWrap: {
    flex: 1, backgroundColor: '#FFF0F8', borderRadius: 24,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1.5, borderColor: '#FECDD3',
  },
  chatInput: { fontSize: 15, color: '#374151' },
  chatSendBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  chatSendBtnText: { fontSize: 18, color: '#fff', fontWeight: '700' },
  chatEndBtn: {
    backgroundColor: '#1A1A2E', borderRadius: 24, paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
  },
  chatEndBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  // ── Legacy / shared ───────────────────────────────────────────────────────
  container: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  refreshBtn: { padding: 8, borderRadius: RADIUS.sm, backgroundColor: 'rgba(0,0,0,0.04)' },
  refreshBtnText: { fontSize: 20 },
  weatherBadge: { backgroundColor: '#EFF6FF', borderRadius: 14, padding: 10, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: '#BFDBFE' },
  weatherText: { fontSize: 14, color: '#1D4ED8', fontWeight: '600' },
  scoreSection: { alignItems: 'center', marginBottom: 20 },
  greetingText: { fontSize: 15, color: '#687076', marginBottom: 16, fontWeight: '500', textAlign: 'center' },
  scoreRing: { width: 160, height: 160, borderRadius: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 12, gap: 2 },
  scoreMascot: { fontSize: 32 },
  scoreNum: { fontSize: 52, fontWeight: '900', lineHeight: 56 },
  scoreMax: { fontSize: 14, color: '#9BA1A6' },
  scoreLabelBadge: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 14 },
  scoreLabelText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  overallText: { fontSize: 15, color: '#374151', textAlign: 'center', lineHeight: 23, paddingHorizontal: 8 },
  watchOutCard: { flexDirection: 'row', gap: 12, backgroundColor: '#FFFBEB', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#FDE68A', alignItems: 'flex-start' },
  watchOutIcon: { fontSize: 22 },
  watchOutLabel: { fontSize: 12, fontWeight: '700', color: '#92400E', marginBottom: 4 },
  watchOutText: { fontSize: 14, color: '#78350F', lineHeight: 21 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#11181C', marginBottom: 12 },
  adviceCard: { borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1 },
  adviceHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 10 },
  adviceIcon: { fontSize: 28 },
  adviceTitle: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  priorityBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  priorityText: { fontSize: 11, color: '#fff', fontWeight: '700' },
  adviceText: { fontSize: 14, color: '#374151', lineHeight: 21, marginBottom: 10 },
  tipsContainer: { gap: 6 },
  tipRow: { flexDirection: 'row', gap: 8 },
  tipBullet: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  tipText: { flex: 1, fontSize: 13, color: '#4B5563', lineHeight: 20 },
  outdoorCard: { flexDirection: 'row', gap: 12, backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#BBF7D0', alignItems: 'flex-start' },
  outdoorIcon: { fontSize: 22 },
  outdoorLabel: { fontSize: 12, fontWeight: '700', color: '#166534', marginBottom: 4 },
  outdoorText: { fontSize: 14, color: '#166534', lineHeight: 21 },
  nutritionCard: { backgroundColor: '#F0FDF4', borderRadius: 20, padding: 18, marginBottom: 12, marginTop: 8 },
  nutritionTitle: { fontSize: 17, fontWeight: '800', color: '#166534', marginBottom: 14 },
  mealSection: { marginBottom: 12 },
  mealTitle: { fontSize: 14, fontWeight: '700', color: '#166534', marginBottom: 6 },
  mealItem: { fontSize: 13, color: '#374151', lineHeight: 20, marginLeft: 4 },
  hydrationBox: { flexDirection: 'row', gap: 8, backgroundColor: '#DCFCE7', borderRadius: 12, padding: 12, marginTop: 8, alignItems: 'center' },
  hydrationIcon: { fontSize: 18 },
  hydrationText: { flex: 1, fontSize: 13, color: '#166534', lineHeight: 19 },
  encourageCard: { flexDirection: 'row', gap: 12, backgroundColor: '#FFF0F6', borderRadius: 20, padding: 18, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: '#FBCFE8' },
  encourageEmoji: { fontSize: 32 },
  encourageText: { flex: 1, fontSize: 14, color: '#BE185D', lineHeight: 21, fontWeight: '500' },
  aiBadge: { alignItems: 'center', marginBottom: 16 },
  aiBadgeText: { fontSize: 12, color: '#9BA1A6' },
  actionRow: { flexDirection: 'row', gap: 12 },
  checkinBtn: { flex: 1, backgroundColor: '#FF6B6B', borderRadius: 20, padding: 16, alignItems: 'center' },
  checkinBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  shareBtn: { flex: 1, backgroundColor: '#7C3AED', borderRadius: 20, padding: 16, alignItems: 'center' },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingEmoji: { fontSize: 72, textAlign: 'center', marginBottom: 20 },
  loadingTitle: { fontSize: 20, fontWeight: '700', color: '#11181C', marginBottom: 8 },
  loadingSubtitle: { fontSize: 14, color: '#687076', textAlign: 'center' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorEmoji: { fontSize: 64, marginBottom: 16 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: '#11181C', marginBottom: 8 },
  errorText: { fontSize: 14, color: '#687076', textAlign: 'center', marginBottom: 24, lineHeight: 21 },
  retryBtn: { backgroundColor: '#FF6B6B', borderRadius: 20, paddingHorizontal: 32, paddingVertical: 14, marginBottom: 12 },
  retryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  backBtn2: { padding: 12 },
  backBtn2Text: { fontSize: 15, color: '#687076' },
});
