import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, ActivityIndicator, Share, Dimensions, Platform, Easing, Alert, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { BackButton } from '@/components/back-button';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenContainer } from '@/components/screen-container';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProfile, getTodayCheckIn, getYesterdayCheckIn, getWeeklySleepData, upsertCheckIn, getCheckInByDate, type DailyCheckIn } from '@/lib/storage';
import { trpc } from '@/lib/trpc';
import * as Haptics from 'expo-haptics';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { AppColors, Gradients, Shadows } from '@/lib/design-tokens';
import { useWeather } from '@/lib/weather-context';
import { useFamilyContext } from '@/lib/family-context';

const { width: SW } = Dimensions.get('window');


// ─── emoji→moodScore 权威映射（与 storage.ts/checkin.tsx 同步）─────────────
const MOOD_FIX: Record<string, number> = { '😄': 10, '😊': 9, '😌': 8, '😕': 5, '😢': 3, '😤': 2 };
function fixMoodScore(ci: any): any {
  if (!ci || !ci.moodEmoji || MOOD_FIX[ci.moodEmoji] === undefined) return ci;
  return { ...ci, moodScore: MOOD_FIX[ci.moodEmoji] };
}

// ─── 当日简报缓存（内存 + AsyncStorage 双层）────────────────────────────────
let _briefingCache: { date: string; briefing: any; shareText: string; checkIn: any } | null = null;
function getTodayKey() { return new Date().toISOString().slice(0, 10); }
function getCachedBriefing() {
  if (_briefingCache && _briefingCache.date === getTodayKey()) {
    return { ..._briefingCache, checkIn: fixMoodScore(_briefingCache.checkIn) };
  }
  return null;
}
function setCachedBriefing(briefing: any, shareText: string, checkIn?: any) {
  const entry = { date: getTodayKey(), briefing, shareText, checkIn: checkIn || null };
  _briefingCache = entry;
  AsyncStorage.setItem('share_briefing_cache_v1', JSON.stringify(entry)).catch(() => {});
}
async function loadPersistedBriefing() {
  if (_briefingCache && _briefingCache.date === getTodayKey()) {
    return { ..._briefingCache, checkIn: fixMoodScore(_briefingCache.checkIn) };
  }
  try {
    const raw = await AsyncStorage.getItem('share_briefing_cache_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.date === getTodayKey()) {
        _briefingCache = parsed;
        return { ...parsed, checkIn: fixMoodScore(parsed.checkIn) };
      }
    }
  } catch {}
  return null;
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
    { emoji: '📋', label: '整理数据', bg: AppColors.green.soft, pulse: pulse1 },
    { emoji: '📊', label: '分析趋势', bg: AppColors.purple.soft, pulse: pulse2 },
    { emoji: '📝', label: '生成简报', bg: AppColors.coral.soft, pulse: pulse3 },
  ];

  return (
    <LinearGradient colors={[...Gradients.appBg]} style={slStyles.root}>
      <View style={slStyles.center}>
        <View style={slStyles.cardWrap}>
          <Animated.View style={[slStyles.card, { transform: [{ scale: cardScale }], opacity: cardOpacity }]}>
            <View style={slStyles.gridBg} />
            <View style={slStyles.bars}>
              <View style={slStyles.barTrack}>
                <Animated.View style={[slStyles.barFill, { height: bar1H, backgroundColor: AppColors.green.primary }]} />
              </View>
              <View style={slStyles.barTrack}>
                <Animated.View style={[slStyles.barFill, { height: bar2H, backgroundColor: AppColors.coral.primary }]} />
              </View>
              <View style={slStyles.barTrack}>
                <Animated.View style={[slStyles.barFill, { height: bar3H, backgroundColor: AppColors.purple.primary }]} />
              </View>
            </View>
          </Animated.View>
          <Animated.View style={[slStyles.badge, { transform: [{ translateY: badgeY }, { rotate: badgeSpin }] }]}>
            <LinearGradient colors={[...Gradients.purple]} style={slStyles.badgeGrad}>
              <Text style={slStyles.badgeEmoji}>📰</Text>
            </LinearGradient>
          </Animated.View>
        </View>

        <Animated.View style={[slStyles.textBlock, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}>
          <Text style={slStyles.title}>正在整理今日数据</Text>
          <Text style={slStyles.subtitle}>汇总照护记录，生成状态报告</Text>
        </Animated.View>

        <Animated.View style={[slStyles.progressWrap, { opacity: titleOpacity }]}>
          <View style={slStyles.progressTrack}>
            <Animated.View style={[slStyles.progressFill, { width: progressW }]}>
              <LinearGradient colors={[...Gradients.purple, AppColors.coral.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
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
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 28, padding: 28,
    shadowColor: AppColors.purple.strong, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
    width: 180, height: 180, justifyContent: 'flex-end',
  },
  gridBg: { ...StyleSheet.absoluteFillObject, borderRadius: 28, opacity: 0.06, borderWidth: 0.5, borderColor: AppColors.shadow.default },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: '100%' },
  barTrack: { width: 36, height: '100%', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  badge: { position: 'absolute', top: -18, right: -18 },
  badgeGrad: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: AppColors.purple.strong, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 6 },
  badgeEmoji: { fontSize: 22 },
  textBlock: { alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 22, fontWeight: '800', color: AppColors.purple.strong, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: AppColors.text.secondary, textAlign: 'center' },
  progressWrap: { width: '100%', marginBottom: 32 },
  progressTrack: { height: 8, backgroundColor: AppColors.border.soft, borderRadius: 8, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 8, overflow: 'hidden' },
  shimmer: { position: 'absolute', top: 0, width: '25%', height: '100%', backgroundColor: 'rgba(255,255,255,0.4)' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  statusItem: { alignItems: 'center', gap: 6, flex: 1 },
  statusIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusLabel: { fontSize: 12, color: AppColors.text.secondary, fontWeight: '600', textAlign: 'center' },
});

// ─── Score Ring (animated) ───────────────────────────────────────────────────

// ─── Data Badge ──────────────────────────────────────────────────────────────
function DataBadge({ emoji, label, value, color }: { emoji: string; label: string; value: string; color: string }) {
  return (
    <View style={[badgeStyles.badge, { backgroundColor: color + '14', borderColor: color + '25' }]}>
      <Text style={badgeStyles.emoji}>{emoji}</Text>
      <Text style={badgeStyles.value}>{value}</Text>
      <Text style={[badgeStyles.label, { color: color }]}>{label}</Text>
    </View>
  );
}
const badgeStyles = StyleSheet.create({
  badge: { flex: 1, borderRadius: 18, padding: 14, alignItems: 'center', gap: 4, minWidth: 70, borderWidth: 1 },
  emoji: { fontSize: 22 },
  value: { fontSize: 14, fontWeight: '800', color: AppColors.text.primary },
  label: { fontSize: 11, fontWeight: '600' },
});

// ─── Beautiful Briefing Card ─────────────────────────────────────────────────
function AnimatedBadge({ emoji, label, value, color, delay }: { emoji: string; label: string; value: string; color: string; delay: number }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <DataBadge emoji={emoji} label={label} value={value} color={color} />
    </Animated.View>
  );
}

function BriefingCard({ briefing, checkIn, elderNickname, caregiverName, elderEmoji, historyDate }: {
  briefing: any; checkIn: DailyCheckIn;
  elderNickname: string; caregiverName: string; elderEmoji: string; historyDate?: string;
}) {
  const scaleAnim = useRef(new Animated.Value(0.92)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 100 }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const today = historyDate
    ? (() => { const d = new Date(historyDate + 'T00:00:00'); return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }); })()
    : new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  // 严格基于实际记录判断：早间字段需要 morningDone，晚间字段需要 eveningDone
  const hasMorning = checkIn.morningDone === true;
  const hasEvening = checkIn.eveningDone === true;

  // 睡眠数据来自早间打卡
  const sleepValue = hasMorning && checkIn.sleepHours ? `${checkIn.sleepHours}h` : null;
  const sleepQualityLabel = checkIn.sleepQuality === 'good' ? '良好' : checkIn.sleepQuality === 'fair' ? '一般' : '较差';
  const sleepLabel = sleepValue ? `${sleepValue} · ${sleepQualityLabel}` : '未记录';

  // 心情来自晚间打卡
  const moodValue = hasEvening && checkIn.moodScore != null ? `${checkIn.moodScore}/10` : '未记录';
  const moodEmoji = hasEvening && checkIn.moodEmoji ? checkIn.moodEmoji : '—';

  // 用药来自晚间打卡
  const medLabel = hasEvening && checkIn.medicationTaken != null
    ? (checkIn.medicationTaken ? '按时 ✅' : '漏药 ❌')
    : '未记录';

  // 饮食来自晚间打卡
  const mealValue = hasEvening
    ? (checkIn.mealNotes && checkIn.mealNotes.trim()
        ? (checkIn.mealNotes.length > 6 ? checkIn.mealNotes.slice(0, 6) + '…' : checkIn.mealNotes)
        : (checkIn.mealOption ? checkIn.mealOption : '已记录'))
    : '未记录';

  return (
    <Animated.View style={[cardStyles.card, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
      {/* ── Header ribbon ── */}
      <LinearGradient colors={[AppColors.green.soft, '#F0F7F2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={cardStyles.headerRibbon}>
        <View style={cardStyles.headerLeft}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, overflow: 'hidden' }}>
              <Image source={require('@/assets/images/app-icon.png')} style={{ width: 24, height: 24, backgroundColor: 'transparent' }} />
            </View>
            <Text style={cardStyles.appName}>小马虎 · 每日护理简报</Text>
          </View>
          <Text style={cardStyles.date}>{today}</Text>
        </View>
      </LinearGradient>

      {/* ── Elder Info ── */}
      <View style={cardStyles.elderSection}>
        <View style={cardStyles.elderInfo}>
          <View style={cardStyles.elderAvatarWrap}>
            <Text style={cardStyles.elderEmoji}>{elderEmoji}</Text>
          </View>
          <View>
            <Text style={cardStyles.elderName}>{elderNickname}</Text>
            <Text style={cardStyles.elderSub}>今日护理简报</Text>
          </View>
        </View>
      </View>

      {/* ── Data Grid (4 badges with staggered entrance) ── */}
      <View style={cardStyles.dataGrid}>
        <AnimatedBadge emoji="😴" label="睡眠" value={sleepLabel} color={AppColors.green.muted} delay={0} />
        <AnimatedBadge emoji={moodEmoji !== '—' ? moodEmoji : '😊'} label="心情" value={moodValue} color={AppColors.peach.primary} delay={100} />
      </View>
      <View style={cardStyles.dataGrid}>
        <AnimatedBadge emoji="💊" label="用药" value={medLabel} color={AppColors.purple.strong} delay={200} />
        <AnimatedBadge emoji="🍽️" label="饮食" value={mealValue} color={AppColors.coral.primary} delay={300} />
      </View>

       {/* ── 智能总结 ── */}
      <View style={cardStyles.summaryBox}>
        <View style={cardStyles.summaryHeader}>
          <Text style={cardStyles.summaryIcon}>📋</Text>
          <Text style={cardStyles.summaryTitle}>今日状态总结</Text>
        </View>
        <Text style={cardStyles.summaryText}>
          {briefing.summary && briefing.summary.trim().length > 0
            ? briefing.summary
            : (() => {
                const parts: string[] = [];
                if (hasMorning && checkIn.sleepHours) parts.push(`睡眠${checkIn.sleepHours}小时，质量${sleepQualityLabel}`);
                if (hasEvening && checkIn.moodScore != null) parts.push(`心情${checkIn.moodScore >= 8 ? '良好' : checkIn.moodScore >= 6 ? '一般' : '较差'}`);
                if (hasEvening && checkIn.medicationTaken != null) parts.push(checkIn.medicationTaken ? '用药完成' : '未按时服药');
                if (hasEvening && checkIn.mealOption) parts.push(`进食${checkIn.mealOption.includes('正常') ? '正常' : checkIn.mealOption.includes('偏少') ? '偏少' : '较少'}`);
                return parts.length > 0 ? parts.join('，') + '。' : '暂无足够数据生成总结。';
              })()
          }
        </Text>
      </View>

      {/* Highlights 已移除，避免与今日状态总结重复 */}

      {/* ── Footer ── */}
      <View style={cardStyles.footer}>
        <Text style={cardStyles.footerLeft}>记录人：{caregiverName}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View style={{ width: 14, height: 14, borderRadius: 3, overflow: 'hidden' }}>
              <Image source={require('@/assets/images/app-icon.png')} style={{ width: 14, height: 14, backgroundColor: 'transparent' }} />
            </View>
          <Text style={cardStyles.footerRight}>小马虎</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FBF7F4', borderRadius: 24, padding: 0, marginBottom: 20,
    shadowColor: '#8B7B75', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 3,
    borderWidth: 1, borderColor: '#EDE4DF',
    overflow: 'hidden',
  },
  headerRibbon: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 14, marginBottom: 4 },
  headerLeft: {},
  appName: { fontSize: 14, fontWeight: '800', color: AppColors.green.strong, letterSpacing: -0.3 },
  date: { fontSize: 13, color: AppColors.text.tertiary, marginTop: 3 },
  elderSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 22 },
  elderInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  elderAvatarWrap: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F3EDE8', alignItems: 'center', justifyContent: 'center' },
  elderEmoji: { fontSize: 32 },
  elderName: { fontSize: 20, fontWeight: '800', color: AppColors.text.primary },
  elderSub: { fontSize: 13, color: AppColors.text.tertiary, marginTop: 2 },
  dataGrid: { flexDirection: 'row', gap: 10, marginBottom: 10, paddingHorizontal: 22 },
  summaryBox: { backgroundColor: '#F0EDE8', borderRadius: 16, padding: 16, marginTop: 6, marginBottom: 14, marginHorizontal: 22 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  summaryIcon: { fontSize: 16 },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: AppColors.text.primary },
  summaryText: { fontSize: 14, color: AppColors.text.secondary, lineHeight: 22 },
  highlightsBox: {
    backgroundColor: '#F7F4F0', borderRadius: 14, padding: 14,
    marginBottom: 14, marginHorizontal: 22, gap: 6,
  },
  highlightRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  highlightDot: { fontSize: 16, color: '#A89080', lineHeight: 22, marginTop: 0 },
  highlightText: { flex: 1, fontSize: 13, color: '#6B5B52', lineHeight: 22 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#EDE4DF', paddingTop: 14, paddingBottom: 18, paddingHorizontal: 22 },
  footerLeft: { fontSize: 12, color: AppColors.text.tertiary },
  footerRight: { fontSize: 12, color: AppColors.green.muted, fontWeight: '600' },
});

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const CHART_W = SW - 80;

function SleepDetailSection({ checkIn }: { checkIn: DailyCheckIn }) {
  const segments = checkIn.sleepSegments ?? [];
  const totalSleepHours = checkIn.sleepHours ?? 0;
  const wakingsCount = checkIn.nightWakings ?? 0;
  const awakeHours = checkIn.sleepType === 'detailed'
    ? (checkIn.awakeHours ?? 0)
    : Math.max(0, Math.round((8 - totalSleepHours) * 10) / 10);
  const donutData = [
    { value: totalSleepHours || 0.1, color: '#6EE7B7' },
    { value: awakeHours > 0 ? awakeHours : 0.1, color: '#FEF3C7' },
  ];

  return (
    <View style={sleepStyles.card}>
      <Text style={sleepStyles.sectionTitle}>🌙 昨晚睡眠详情</Text>
      <View style={sleepStyles.donutRow}>
        <PieChart
          donut
          innerRadius={30}
          radius={45}
          data={donutData}
          centerLabelComponent={() => (
            <View style={{ justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: AppColors.text.primary }}>{totalSleepHours}h</Text>
            </View>
          )}
        />
        <View style={{ marginLeft: 20, flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: AppColors.text.primary }}>总睡眠 {totalSleepHours} 小时</Text>
          <Text style={{ fontSize: 13, color: '#D97706', marginTop: 4 }}>
            {awakeHours > 0 ? `夜间清醒 ${awakeHours} 小时 · ` : ''}醒来 {wakingsCount} 次
          </Text>
          <View style={sleepStyles.legendRow}>
            <View style={sleepStyles.legendItem}>
              <View style={[sleepStyles.legendDot, { backgroundColor: '#6EE7B7' }]} />
              <Text style={sleepStyles.legendText}>睡眠</Text>
            </View>
            <View style={sleepStyles.legendItem}>
              <View style={[sleepStyles.legendDot, { backgroundColor: '#FEF3C7' }]} />
              <Text style={sleepStyles.legendText}>清醒</Text>
            </View>
          </View>
        </View>
      </View>

      {segments.length > 0 && (
        <View style={sleepStyles.timeline}>
          {segments.map((seg: any, i: number) => {
            const startD = new Date(seg.start);
            const endD = new Date(seg.end);
            const ms = endD.getTime() - startD.getTime();
            const hrs = ms <= 0 ? 0 : Math.min(ms / 3600000, 16);
            const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            const isLast = i === segments.length - 1;
            return (
              <View key={i} style={sleepStyles.segRow}>
                <View style={sleepStyles.segTimeline}>
                  <View style={sleepStyles.segDot} />
                  {!isLast && <View style={sleepStyles.segLine} />}
                </View>
                <Text style={sleepStyles.segLabel}>{`睡眠 ${i + 1}`}</Text>
                <Text style={sleepStyles.segTime}>{fmt(startD)} - {fmt(endD)}</Text>
                <View style={sleepStyles.segBadge}>
                  <Text style={sleepStyles.segDuration}>{Math.round(hrs * 10) / 10}h</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function WeeklySleepChart({ weeklyData }: { weeklyData: Array<{ date: string; sleepHours: number; awakeHours: number; nightWakings: number }> }) {
  const { stackData, chartMax } = useMemo(() => {
    const reversed = [...weeklyData].reverse();
    let peak = 0;
    const data = reversed.map((d) => {
      const dayOfWeek = new Date(d.date + 'T00:00:00').getDay();
      const label = WEEKDAY_LABELS[dayOfWeek];
      const sleep = d.sleepHours || 0;
      const awake = d.awakeHours || 0;
      const hasData = sleep > 0;
      const total = sleep + awake;
      if (total > peak) peak = total;
      const sleepColor = hasData
        ? (sleep >= 7 ? '#6EE7B7' : sleep >= 5 ? '#F59E0B' : '#FCA5A5')
        : AppColors.bg.secondary;
      const stacks = hasData
        ? [
            { value: sleep, color: sleepColor },
            ...(awake > 0 ? [{ value: awake, color: '#FEF3C7', marginBottom: 2 }] : []),
          ]
        : [{ value: 0.15, color: AppColors.bg.secondary }];
      return {
        stacks,
        label,
        topLabelComponent: () => (
          <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#4B5563', marginBottom: 4 }}>
            {hasData ? `${sleep}h` : ''}
          </Text>
        ),
      };
    });
    const chartMax = Math.max(12, peak + 3);
    return { stackData: data, chartMax };
  }, [weeklyData]);

  if (weeklyData.length === 0) return null;

  const hasAwakeData = weeklyData.some(d => d.awakeHours > 0);

  return (
    <View style={sleepStyles.card}>
      <Text style={sleepStyles.sectionTitle}>📊 近一周睡眠趋势</Text>
      <View style={sleepStyles.chartLegend}>
        <View style={sleepStyles.legendItem}>
          <View style={[sleepStyles.legendDot, { backgroundColor: '#6EE7B7' }]} />
          <Text style={sleepStyles.legendText}>7h+</Text>
        </View>
        <View style={sleepStyles.legendItem}>
          <View style={[sleepStyles.legendDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={sleepStyles.legendText}>5-7h</Text>
        </View>
        <View style={sleepStyles.legendItem}>
          <View style={[sleepStyles.legendDot, { backgroundColor: '#FCA5A5' }]} />
          <Text style={sleepStyles.legendText}>&lt;5h</Text>
        </View>
        {hasAwakeData && (
          <View style={sleepStyles.legendItem}>
            <View style={[sleepStyles.legendDot, { backgroundColor: '#FEF3C7' }]} />
            <Text style={sleepStyles.legendText}>清醒</Text>
          </View>
        )}
      </View>
      <View style={{ paddingRight: 10, paddingBottom: 10, width: '100%' }}>
        <BarChart
          stackData={stackData}
          adjustToWidth
          width={CHART_W}
          height={150}
          barBorderTopLeftRadius={6}
          barBorderTopRightRadius={6}
          noOfSections={4}
          maxValue={chartMax}
          yAxisThickness={0}
          yAxisLabelWidth={30}
          xAxisThickness={1}
          xAxisColor={AppColors.border.soft}
          rulesColor={AppColors.bg.secondary}
          rulesType="solid"
          initialSpacing={10}
          endSpacing={40}
          yAxisTextStyle={{ fontSize: 10, color: AppColors.text.tertiary }}
          xAxisLabelTextStyle={{ fontSize: 11, color: AppColors.text.secondary, fontWeight: '500' }}
          isAnimated
          animationDuration={600}
        />
      </View>
    </View>
  );
}

function WeeklyNapChart({ weeklyData }: { weeklyData: Array<{ date: string; napMinutes: number }> }) {
  const napBars = useMemo(() => {
    const reversed = [...weeklyData].reverse();
    return reversed.map((d) => {
      const dayOfWeek = new Date(d.date + 'T00:00:00').getDay();
      const label = WEEKDAY_LABELS[dayOfWeek];
      const mins = d.napMinutes || 0;
      const hasData = mins > 0;
      return {
        value: hasData ? mins : 0.1,
        label,
        frontColor: hasData ? '#F59E0B' : '#F3F4F6',
        topLabelComponent: () => (
          <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#92400E', marginBottom: 4 }}>
            {hasData ? (mins >= 60 ? `${(mins / 60).toFixed(1).replace('.0', '')}h` : `${mins}m`) : ''}
          </Text>
        ),
      };
    });
  }, [weeklyData]);

  const hasAnyNap = weeklyData.some(d => d.napMinutes > 0);
  if (!hasAnyNap) return null;

  return (
    <View style={sleepStyles.card}>
      <Text style={sleepStyles.sectionTitle}>☀️ 近一周白天小睡趋势</Text>
      <View style={{ paddingRight: 10, paddingBottom: 10, width: '100%' }}>
        <BarChart
          data={napBars}
          adjustToWidth
          width={CHART_W}
          height={120}
          barBorderTopLeftRadius={6}
          barBorderTopRightRadius={6}
          noOfSections={3}
          maxValue={Math.max(90, Math.max(...weeklyData.map(d => d.napMinutes)) + 20)}
          yAxisThickness={0}
          yAxisLabelWidth={30}
          xAxisThickness={1}
          xAxisColor={AppColors.border.soft}
          rulesColor={AppColors.bg.secondary}
          rulesType="solid"
          initialSpacing={10}
          endSpacing={40}
          yAxisTextStyle={{ fontSize: 10, color: AppColors.text.tertiary }}
          xAxisLabelTextStyle={{ fontSize: 11, color: AppColors.text.secondary, fontWeight: '500' }}
          isAnimated
          animationDuration={600}
        />
      </View>
    </View>
  );
}

const sleepStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FBF7F4', borderRadius: 20, padding: 18, marginBottom: 16,
    shadowColor: '#8B7B75', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2,
    borderWidth: 1, borderColor: '#EDE4DF',
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: AppColors.text.primary, marginBottom: 14 },
  donutRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  legendRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: AppColors.text.secondary },
  chartLegend: { flexDirection: 'row', gap: 12, marginBottom: 12, justifyContent: 'flex-end' },
  timeline: { borderTopWidth: 1, borderTopColor: AppColors.border.soft, paddingTop: 12 },
  segRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 },
  segTimeline: { width: 16, alignItems: 'center' },
  segDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#6EE7B7', borderWidth: 2, borderColor: '#D1FAE5' },
  segLine: { width: 2, height: 24, backgroundColor: AppColors.border.soft, marginTop: 2 },
  segLabel: { fontSize: 13, color: AppColors.text.primary, fontWeight: '600', width: 50 },
  segTime: { flex: 1, fontSize: 13, color: AppColors.text.secondary },
  segBadge: { backgroundColor: AppColors.bg.secondary, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  segDuration: { fontSize: 13, fontWeight: '700', color: AppColors.text.primary },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function ShareScreen() {
  const [briefing, setBriefing] = useState<any>(null);
  const [checkIn, setCheckIn] = useState<DailyCheckIn | null>(null);
  const [backfillNotice, setBackfillNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(!getCachedBriefing());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elderNickname, setElderNickname] = useState('家人');
  const [elderEmoji, setElderEmoji] = useState('🐯');
  const [caregiverName, setCaregiverName] = useState('照顾者');
  const [shareText, setShareText] = useState('');
  const [copied, setCopied] = useState(false);
  const [sharingImage, setSharingImage] = useState(false);
  const [weeklyData, setWeeklyData] = useState<Array<{ date: string; sleepHours: number; awakeHours: number; nightWakings: number; napMinutes: number }>>([]);
  const [todayCi, setTodayCi] = useState<DailyCheckIn | null>(null);
  const [yesterdayCi, setYesterdayCi] = useState<DailyCheckIn | null>(null);
  const [viewMode, setViewMode] = useState<'today' | 'yesterday'>('today');
  const { weatherData } = useWeather();
  const { activeMembership } = useFamilyContext();
  const isJoiner = activeMembership?.role === 'joiner';
  const cardRef = useRef<View>(null);
  const sharePulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(sharePulse, { toValue: 1.02, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(sharePulse, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);

  const generateBriefingMutation = trpc.ai.generateBriefing.useMutation();

  const params = useLocalSearchParams<{ refresh?: string; date?: string }>();
  const loadedRef = useRef(false);
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      const forceRefresh = params.refresh === '1';
      const historyDate = params.date; // 历史日期参数，如 '2025-04-01'
      if (historyDate) {
        // 历史模式：直接加载指定日期数据，不走缓存
        loadHistoryDate(historyDate);
      } else {
        if (forceRefresh) {
          _briefingCache = null;
          AsyncStorage.removeItem('share_briefing_cache_v1').catch(() => {});
        }
        loadAndGenerate(forceRefresh);
      }
    }
  }, []);
  useFocusEffect(useCallback(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadAndGenerate(false);
    } else if (error) {
      // 之前是错误状态（缺少昨晚记录），用户可能已经去补卡了，强制刷新
      _briefingCache = null;
      AsyncStorage.removeItem('share_briefing_cache_v1').catch(() => {});
      loadAndGenerate(true);
    } else {
      recheckBackfill();
    }
  }, [error]));

  async function loadHistoryDate(dateStr: string) {
    setError(null);
    setLoading(true);
    try {
      const profile = await getProfile();
      const nickname = profile?.nickname || profile?.name || '家人';
      const caregiver = profile?.caregiverName || '照顾者';
      const emoji = profile?.zodiacEmoji || '🐯';
      setElderNickname(nickname);
      setCaregiverName(caregiver);
      setElderEmoji(emoji);

      const ci = await getCheckInByDate(dateStr);
      if (!ci) {
        setError(`${dateStr} 无打卡记录`);
        setLoading(false);
        return;
      }

      const fixedCi = fixMoodScore(ci);
      setCheckIn(fixedCi);
      setViewMode('today'); // 展示模式不影响历史记录

      // 加载周数据
      const weekly = await getWeeklySleepData(7);
      setWeeklyData(weekly.map(d => ({ date: d.date, sleepHours: d.sleepHours, awakeHours: d.awakeHours, nightWakings: d.nightWakings, napMinutes: d.napMinutes })));

      // 使用本地构建简报（历史模式不调用 AI）
      const fallback = buildLocalBriefing(nickname, caregiver, fixedCi);
      setBriefing(fallback);
      setShareText(fallback.shareText);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function recheckBackfill() {
    try {
      const today = await getTodayCheckIn();
      const yesterday = await getYesterdayCheckIn();
      setTodayCi(today);
      setYesterdayCi(yesterday);
    } catch {}
  }

  async function loadAndGenerate(forceRefresh = false) {
    setError(null);

    if (!forceRefresh) {
      const memCached = getCachedBriefing();
      if (memCached) {
        setBriefing(memCached.briefing);
        setShareText(memCached.shareText);
        if (memCached.checkIn) {
          setCheckIn(memCached.checkIn);
        }
        setLoading(false);
        loadSupplementaryData();
        recheckBackfill();
        return;
      }
    }

    if (!forceRefresh) {
      const persisted = await loadPersistedBriefing();
      if (persisted) {
        setBriefing(persisted.briefing);
        setShareText(persisted.shareText);
        if (persisted.checkIn) {
          setCheckIn(persisted.checkIn);
        }
        setLoading(false);
        loadSupplementaryData();
        recheckBackfill();
        return;
      }
    }

    setLoading(true);
    try {
      const profile = await getProfile();
      const nickname = profile?.nickname || profile?.name || '家人';
      const caregiver = profile?.caregiverName || '照顾者';
      const emoji = profile?.zodiacEmoji || '🐯';
      setElderNickname(nickname);
      setCaregiverName(caregiver);
      setElderEmoji(emoji);

      const today = await getTodayCheckIn();
      const yesterday = await getYesterdayCheckIn();
      setTodayCi(today);
      setYesterdayCi(yesterday);

      // 优先使用昨晚已完成的记录，其次今日已完成的记录
      // 如果昨晚记录缺失，先提示用户补录，不生成总结
      const hasYesterdayEvening = yesterday?.eveningDone;
      const hasTodayMorning = today?.morningDone;

      if (!hasYesterdayEvening && !hasTodayMorning) {
        setError('请先完成今日打卡，再生成简报');
        setLoading(false);
        return;
      }

      // 如果有昨晚数据用昨晚，否则用今日早间
      const ci = (hasYesterdayEvening ? yesterday : today)!;
      setViewMode(hasYesterdayEvening ? 'yesterday' : 'today');

      setCheckIn(ci);
      loadSupplementaryData();
      await doGenerate(nickname, caregiver, ci, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function loadSupplementaryData() {
    try {
      const [profile, weekly, today, yesterday] = await Promise.all([
        getProfile(),
        getWeeklySleepData(7),
        getTodayCheckIn(),
        getYesterdayCheckIn(),
      ]);
      if (profile) {
        setElderNickname(profile.nickname || profile.name || '家人');
        setCaregiverName(profile.caregiverName || '照顾者');
        setElderEmoji(profile.zodiacEmoji || '🐯');
      }
      setWeeklyData(weekly.map(d => ({ date: d.date, sleepHours: d.sleepHours, awakeHours: d.awakeHours, nightWakings: d.nightWakings, napMinutes: d.napMinutes })));
      setTodayCi(today);
      setYesterdayCi(yesterday);
    } catch {}
  }

  async function doGenerate(nickname: string, caregiver: string, ci: DailyCheckIn, _score: number | null) {
    setGenerating(true);
    setBriefing(null);
    try {
      const dateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
      const aiPromise = generateBriefingMutation.mutateAsync({
        elderNickname: nickname,
        caregiverName: caregiver,
        date: dateStr,
        checkIn: {
          sleepHours: ci.sleepHours ?? 7,
          sleepQuality: ci.sleepQuality ?? 'fair',
          moodScore: ci.moodScore ?? 5,
          medicationTaken: ci.medicationTaken ?? true,
          napMinutes: ci.napMinutes ?? (ci.daytimeNap ? 30 : 0),
          notes: ci.eveningNotes || ci.morningNotes || undefined,
          // 只有用户实际选择了饮食选项才传，否则不传（避免 AI 默认为较差）
          mealSituation: ci.mealOption
            ? (ci.mealOption.includes('正常') ? 'good' : ci.mealOption.includes('偏少') ? 'fair' : 'poor')
            : undefined,
        },
        careScore: 0,
      });
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('智能助手超时')), 15000));
      const result = await Promise.race([aiPromise, timeout]) as any;
      if (result.success && result.briefing) {
        setBriefing(result.briefing);
        setShareText(result.briefing.shareText ?? '');
        setCachedBriefing(result.briefing, result.briefing.shareText ?? '', ci);
      } else {
        const fallback = buildLocalBriefing(nickname, caregiver, ci);
        setBriefing(fallback);
        setCachedBriefing(fallback, fallback.shareText, ci);
      }
    } catch (e) {
      const fallback = buildLocalBriefing(nickname, caregiver, ci);
      setBriefing(fallback);
      setCachedBriefing(fallback, fallback.shareText, ci);
    } finally {
      setGenerating(false);
    }
  }

  function buildLocalBriefing(nickname: string, caregiver: string, ci: DailyCheckIn) {
    const sleepLabel = ci.sleepQuality === 'good' ? '良好' : ci.sleepQuality === 'fair' ? '一般' : '较差';
    const dateStr = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    const napMins = ci.napMinutes ?? (ci.daytimeNap ? 30 : 0);
    const napStr = napMins > 0 ? (napMins >= 60 ? `${(napMins / 60).toFixed(1).replace('.0', '')}小时` : `${napMins}分钟`) : '';
    const encouragements = [
      `${nickname}今天辛苦了，有您的陪伴是最大的安心 ❤️`,
      `每一天的用心记录，都是对${nickname}最深的爱护 🌸`,
      `照顾好${nickname}，也别忘了照顾好自己，您做得很好 🌟`,
      `${nickname}有您在身边，一定感受得到这份温暖 🧡`,
    ];
    const encouragement = encouragements[new Date().getDay() % encouragements.length];
    // 严格基于用户实际输入构建总结，不使用随机鼓励语
    const parts: string[] = [];
    if (ci.sleepHours) parts.push(`睡眠${ci.sleepHours}小时，质量${sleepLabel}`);
    if (ci.moodScore !== undefined) parts.push(`心情${ci.moodScore >= 8 ? '良好' : ci.moodScore >= 6 ? '一般' : '较差'}（${ci.moodScore}/10）`);
    if (ci.medicationTaken !== undefined) parts.push(ci.medicationTaken ? '用药完成' : '今日未按时服药');
    if (ci.mealOption) parts.push(`进食${ci.mealOption.includes('正常') ? '正常' : ci.mealOption.includes('偏少') ? '偏少' : '较少'}`);
    if (napStr) parts.push(`白天小睡${napStr}`);
    const summary = parts.length > 0 ? parts.join('，') + '。' : `${nickname}今日照护记录已整理完毕。`;
    return {
      summary,
      highlights: [],
      attention: '',
      shareText: `【${nickname}今日照护简报】\n${dateStr}\n\n睡眠：${ci.sleepHours ?? '--'}小时（${sleepLabel}）${napStr ? `\n午休：${napStr}` : ''}\n心情：${ci.moodScore ?? '--'}/10\n用药：${ci.medicationTaken ? '已完成' : '未完成'}${ci.mealOption ? `\n饮食：${ci.mealOption}` : ''}\n\n记录人：${caregiver}`,
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
    if (!checkIn) return `【小马虎护理日报】${elderNickname}今日照护记录`;
    const sleepLabel = checkIn.sleepQuality === 'good' ? '良好' : checkIn.sleepQuality === 'fair' ? '一般' : '较差';
    return `【${elderNickname}今日照护简报】

${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}

睡眠：${checkIn.sleepHours}小时（${sleepLabel}）
心情：${checkIn.moodScore}/10
用药：${checkIn.medicationTaken ? '已完成' : '未完成'}
饮食：${checkIn.mealNotes || '已记录'}

记录人：${caregiverName}`;
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
          <Text style={styles.title}>📋 {params.date ? `${params.date} 记录` : viewMode === 'today' ? '今日' : '昨日'}记录分析</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* ── 日期切换 ── */}
        {!params.date && (todayCi || yesterdayCi) && (
          <View style={styles.dateSwitchRow}>
            <TouchableOpacity
              style={[styles.dateSwitchBtn, viewMode === 'today' && styles.dateSwitchBtnActive]}
              onPress={() => {
                if (todayCi) { setViewMode('today'); setCheckIn(todayCi); }
              }}
              disabled={!todayCi}
            >
              <Text style={[styles.dateSwitchText, viewMode === 'today' && styles.dateSwitchTextActive, !todayCi && { opacity: 0.35 }]}>今日</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.dateSwitchBtn, viewMode === 'yesterday' && styles.dateSwitchBtnActive]}
              onPress={() => {
                if (yesterdayCi) { setViewMode('yesterday'); setCheckIn(yesterdayCi); }
              }}
              disabled={!yesterdayCi}
            >
              <Text style={[styles.dateSwitchText, viewMode === 'yesterday' && styles.dateSwitchTextActive, !yesterdayCi && { opacity: 0.35 }]}>昨日</Text>
            </TouchableOpacity>
          </View>
        )}

        {error ? (
          <View style={styles.missingCheckinCard}>
            <View style={styles.missingCheckinTop}>
              <Text style={styles.missingCheckinEmoji}>🌙</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.missingCheckinTitle}>缺少昨晚打卡记录</Text>
                <Text style={styles.missingCheckinDesc}>补完昨晚的睡眠、用药、饮食记录后，才能生成完整的今日护理简报</Text>
              </View>
            </View>
            {!isJoiner && (
              <TouchableOpacity
                style={styles.missingCheckinBtn}
                onPress={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  const yDate = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
                  router.push({ pathname: '/(tabs)/checkin', params: { backfillDate: yDate } } as any);
                }}
              >
                <LinearGradient colors={['#A78BFA', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.missingCheckinBtnGradient}>
                  <Text style={styles.missingCheckinBtnText}>补打昨晚卡 →</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        ) : generating ? (
          <View style={styles.generatingBox}>
            <ActivityIndicator color={AppColors.green.muted} />
            <Text style={styles.generatingText}>正在整理数据，生成简报...</Text>
          </View>
        ) : briefing && checkIn ? (
          <>
            <View ref={cardRef} collapsable={false}>
              <BriefingCard
                briefing={briefing}
                checkIn={checkIn}
                elderNickname={elderNickname}
                caregiverName={caregiverName}
                elderEmoji={elderEmoji}
                historyDate={params.date}
              />
            </View>

            {!params.date && !(yesterdayCi?.eveningDone) && !isJoiner && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  const y = new Date();
                  y.setDate(y.getDate() - 1);
                  const yDate = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
                  router.push({ pathname: '/(tabs)/checkin', params: { backfillDate: yDate } } as any);
                }}
              >
                <LinearGradient
                  colors={['#FFF7ED', '#FEF3C7']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.backfillNotice}
                >
                  <View style={styles.backfillLeft}>
                    <Text style={styles.backfillIcon}>🌙</Text>
                    <View>
                      <Text style={styles.backfillTitle}>缺少昨晚打卡记录</Text>
                      <Text style={styles.backfillSub}>补完昨晚记录可获得更准确的健康分析</Text>
                    </View>
                  </View>
                  <View style={styles.backfillCtaBtn}>
                    <Text style={styles.backfillCtaBtnText}>去补卡</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {backfillNotice && (
              <View style={styles.backfillSuccess}>
                <Text style={styles.backfillSuccessText}>{backfillNotice}</Text>
              </View>
            )}

            {/* ── Last Night Sleep Detail (Donut + Timeline) ── */}
            <SleepDetailSection checkIn={checkIn} />

            {/* ── Weekly Sleep Trend (Bar Chart) ── */}
            <WeeklySleepChart weeklyData={weeklyData} />

            {/* ── Weekly Nap Trend (Bar Chart) ── */}
            <WeeklyNapChart weeklyData={weeklyData} />

            {/* ── WeChat Share Button (pulse) ── */}
            <Animated.View style={{ transform: [{ scale: sharePulse }] }}>
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
            </Animated.View>

            {/* ── Home Button ── */}
            <TouchableOpacity onPress={() => router.push('/(tabs)' as any)} activeOpacity={0.88} style={{ marginBottom: 12 }}>
              <LinearGradient colors={[...Gradients.peach]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.homeBottomBtn}>
                <Text style={styles.homeBottomBtnText}>🏠 返回首页</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* ── Family Sync Notice ── */}
            {!params.date && !isJoiner && <Text style={styles.familySyncNotice}>今日记录已自动同步到家庭空间</Text>}

            <View style={styles.disclaimer}>
              <Text style={styles.disclaimerText}>由小马虎整理 · 仅供参考</Text>
            </View>
          </>
        ) : (
          <View style={styles.errorBox}>
            <Text style={styles.errorEmoji}>📋</Text>
            <Text style={styles.errorText}>暂无分析数据</Text>
            <TouchableOpacity style={styles.checkinBtn} onPress={() => loadAndGenerate(true)}>
              <Text style={styles.checkinBtnText}>重新加载</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  homeBtn: { borderRadius: 22, paddingHorizontal: 16, paddingVertical: 9 },
  homeBtnText: { fontSize: 14, fontWeight: '700', color: AppColors.surface.whiteStrong },

  title: { flex: 1, fontSize: 17, fontWeight: '800', color: AppColors.text.primary, textAlign: 'center', letterSpacing: -0.3 },
  dateSwitchRow: {
    flexDirection: 'row', alignSelf: 'center', backgroundColor: AppColors.bg.secondary,
    borderRadius: 12, padding: 3, marginBottom: 14, gap: 2,
  },
  dateSwitchBtn: { paddingHorizontal: 24, paddingVertical: 8, borderRadius: 10 },
  dateSwitchBtnActive: {
    backgroundColor: AppColors.surface.whiteStrong,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
  },
  dateSwitchText: { fontSize: 14, fontWeight: '700', color: AppColors.text.tertiary },
  dateSwitchTextActive: { color: AppColors.text.primary },
  refreshBtn: { padding: 8 },
  refreshBtnText: { fontSize: 20 },
  generatingBox: {
    flexDirection: 'row', gap: 12, alignItems: 'center', justifyContent: 'center',
    padding: 24, backgroundColor: AppColors.green.soft, borderRadius: 16, marginBottom: 20,
  },
  generatingText: { fontSize: 15, color: AppColors.green.strong, fontWeight: '600' },
  errorBox: { alignItems: 'center', padding: 32, backgroundColor: '#FBF7F4', borderRadius: 20, borderWidth: 1, borderColor: '#EDE4DF' },
  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorText: { fontSize: 15, color: '#DC2626', textAlign: 'center', marginBottom: 16 },
  checkinBtn: { backgroundColor: AppColors.green.muted, borderRadius: 16, paddingHorizontal: 24, paddingVertical: 12 },
  checkinBtnText: { fontSize: 15, fontWeight: '700', color: AppColors.surface.whiteStrong },
  shareWechatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#07C160', borderRadius: 18, padding: 15, marginBottom: 12,
    shadowColor: '#07C160', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8,
  },
  shareWechatIcon: { fontSize: 22 },
  shareWechatText: { fontSize: 16, fontWeight: '700', color: AppColors.surface.whiteStrong },
  actionRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  copyBtn: { flex: 1, backgroundColor: AppColors.bg.secondary, borderRadius: 16, padding: 14, alignItems: 'center' },
  copiedBtn: { backgroundColor: AppColors.green.soft },
  copyBtnText: { fontSize: 14, fontWeight: '600', color: AppColors.text.primary },
  regenerateBtn: { flex: 1, backgroundColor: AppColors.green.soft, borderRadius: 16, padding: 14, alignItems: 'center' },
  regenerateBtnText: { fontSize: 14, fontWeight: '600', color: AppColors.green.strong },
  familySyncNotice: {
    fontSize: 12, color: AppColors.green.muted, textAlign: 'center', marginTop: 8, marginBottom: 4,
  },
  tipsCard: {
    backgroundColor: AppColors.bg.soft, borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: AppColors.border.soft, marginBottom: 16, gap: 8,
  },
  tipsTitle: { fontSize: 16, fontWeight: '700', color: AppColors.text.primary, marginBottom: 4 },
  tipItem: { fontSize: 13, color: AppColors.text.secondary, lineHeight: 20, paddingLeft: 4 },
  homeBottomBtn: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  homeBottomBtnText: { fontSize: 15, fontWeight: '800', color: AppColors.surface.whiteStrong },
  disclaimer: { alignItems: 'center', marginBottom: 8 },
  disclaimerText: { fontSize: 11, color: AppColors.text.tertiary, textAlign: 'center' },
  missingCheckinCard: {
    backgroundColor: '#FAF5FF', borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: '#DDD6FE', gap: 16,
    shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 2,
  },
  missingCheckinTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  missingCheckinEmoji: { fontSize: 36, lineHeight: 44 },
  missingCheckinTitle: { fontSize: 16, fontWeight: '800', color: '#5B21B6', marginBottom: 6 },
  missingCheckinDesc: { fontSize: 13, color: '#6D28D9', lineHeight: 20, opacity: 0.8 },
  missingCheckinBtn: { borderRadius: 16, overflow: 'hidden' },
  missingCheckinBtnGradient: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  missingCheckinBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  backfillNotice: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 18, paddingHorizontal: 18, paddingVertical: 16,
    marginBottom: 16, borderWidth: 1.5, borderColor: '#FDE68A',
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 3,
  },
  backfillLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  backfillIcon: { fontSize: 28 },
  backfillTitle: { fontSize: 15, fontWeight: '800', color: '#92400E', marginBottom: 3 },
  backfillSub: { fontSize: 12, color: '#B45309', opacity: 0.85, lineHeight: 17 },
  backfillCtaBtn: {
    backgroundColor: '#F59E0B', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 8,
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6,
  },
  backfillCtaBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  backfillText: { fontSize: 13, color: '#B8860B', fontWeight: '600' },
  backfillCta: { fontSize: 13, color: AppColors.green.strong, fontWeight: '700' },
  backfillSuccess: {
    backgroundColor: AppColors.green.soft, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10,
    marginBottom: 14, alignItems: 'center',
  },
  backfillSuccessText: { fontSize: 13, color: AppColors.green.strong, fontWeight: '600' },
});
