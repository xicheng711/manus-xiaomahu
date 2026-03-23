import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated, Easing, Platform, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenContainer } from '@/components/screen-container';
import {
  getProfile, getYesterdayCheckIn, getTodayCheckIn, upsertCheckIn,
  getWeeklySleepData, DailyCheckIn,
} from '@/lib/storage';
import { scoreSleepInput } from '@/lib/sleep-scoring';
import { trpc } from '@/lib/trpc';
import { BackButton } from '@/components/back-button';
import { COLORS, RADIUS, SHADOWS } from '@/lib/animations';
import { BarChart } from 'react-native-gifted-charts';

const { width: SW } = Dimensions.get('window');
const CHART_W = Math.min(SW - 64, 360);

function LoadingScreen() {
  const bar1 = useRef(new Animated.Value(0)).current;
  const bar2 = useRef(new Animated.Value(0)).current;
  const bar3 = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.85)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0)).current;
  const titleY = useRef(new Animated.Value(Platform.OS === 'web' ? 0 : 18)).current;

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
    Animated.parallel([
      Animated.timing(titleOpacity, { toValue: 1, duration: 600, delay: 300, useNativeDriver: true }),
      Animated.timing(titleY, { toValue: 0, duration: 600, delay: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  const bar1H = bar1.interpolate({ inputRange: [0, 1], outputRange: ['0%', '60%'] });
  const bar2H = bar2.interpolate({ inputRange: [0, 1], outputRange: ['0%', '45%'] });
  const bar3H = bar3.interpolate({ inputRange: [0, 1], outputRange: ['0%', '85%'] });

  return (
    <LinearGradient colors={['#FFF7ED', '#FDF2F8', '#FAF5FF']} style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
        <Animated.View style={[ldStyles.card, { transform: [{ scale: cardScale }], opacity: cardOpacity }]}>
          <View style={ldStyles.bars}>
            <View style={ldStyles.barTrack}><Animated.View style={[ldStyles.barFill, { height: bar1H, backgroundColor: '#4ADE80' }]} /></View>
            <View style={ldStyles.barTrack}><Animated.View style={[ldStyles.barFill, { height: bar2H, backgroundColor: '#F87171' }]} /></View>
            <View style={ldStyles.barTrack}><Animated.View style={[ldStyles.barFill, { height: bar3H, backgroundColor: '#60A5FA' }]} /></View>
          </View>
        </Animated.View>
        <Animated.View style={{ alignItems: 'center', marginTop: 32, opacity: titleOpacity, transform: [{ translateY: titleY }] }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#7C3AED', marginBottom: 8 }}>小马虎正在整理数据...</Text>
          <Text style={{ fontSize: 14, color: '#9CA3AF' }}>正在生成护理总结</Text>
        </Animated.View>
      </View>
    </LinearGradient>
  );
}

const ldStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF', borderRadius: 28, padding: 28,
    shadowColor: '#A855F7', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 10,
    width: 160, height: 160, justifyContent: 'flex-end',
  },
  bars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: '100%' },
  barTrack: { width: 32, height: '100%', justifyContent: 'flex-end' },
  barFill: { width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
});

function getScoreDisplay(score: number) {
  if (score >= 90) return { label: '状态极佳', color: '#16A34A', bgColor: '#F0FDF4', emoji: '🌟' };
  if (score >= 75) return { label: '状态良好', color: '#2563EB', bgColor: '#EFF6FF', emoji: '😊' };
  if (score >= 60) return { label: '状态平稳', color: '#D97706', bgColor: '#FFFBEB', emoji: '😌' };
  if (score >= 40) return { label: '需要关注', color: '#EA580C', bgColor: '#FFF7ED', emoji: '🤗' };
  return { label: '需要照顾', color: '#DC2626', bgColor: '#FEF2F2', emoji: '💕' };
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

let _adviceCache: { date: string; key: string; advice: { careScore?: number; summary?: string; encouragement?: string } } | null = null;

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function buildCacheKey(today: any, yesterday: any): string {
  const ci = today ?? yesterday;
  if (!ci) return 'empty';
  return [ci.moodScore ?? '', ci.sleepHours ?? '', ci.medicationTaken ?? '', ci.morningNotes ?? '', ci.mealOption ?? ''].join('|');
}

export default function AssistantScreen() {
  const [advice, setAdvice] = useState<{
    careScore?: number; summary?: string; encouragement?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elderNickname, setElderNickname] = useState('家人');
  const [caregiverName, setCaregiverName] = useState('照顾者');
  const [weeklyData, setWeeklyData] = useState<Array<{
    date: string; sleepHours: number; sleepType?: 'quick' | 'detailed';
    sleepSegments: any[]; nightWakings: number; daytimeNap: boolean; hasMorningData: boolean;
  }>>([]);
  const [todayCheckIn, setTodayCheckIn] = useState<DailyCheckIn | null>(null);
  const [yesterdayCheckIn, setYesterdayCheckIn] = useState<DailyCheckIn | null>(null);
  const fadeAnim = useRef(new Animated.Value(Platform.OS === 'web' ? 1 : 0)).current;

  const getDailyAdviceMutation = trpc.ai.getDailyAdvice.useMutation();

  useFocusEffect(useCallback(() => { loadData(); }, []));

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const profile = await getProfile();
      const nickname = profile?.nickname || profile?.name || '家人';
      const caregiver = profile?.caregiverName || '照顾者';
      setElderNickname(nickname);
      setCaregiverName(caregiver);

      const yesterday = await getYesterdayCheckIn();
      const today = await getTodayCheckIn();
      setTodayCheckIn(today);
      setYesterdayCheckIn(yesterday);

      const weekly = await getWeeklySleepData(7);
      setWeeklyData(weekly);

      const todayKey = getTodayKey();
      const cacheKey = buildCacheKey(today, yesterday);

      if (_adviceCache && _adviceCache.date === todayKey && _adviceCache.key === cacheKey) {
        setAdvice(_adviceCache.advice);
        setLoading(false);
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
        return;
      }

      const sleepData = yesterday?.sleepInput ?? today?.sleepInput ?? null;
      const sleepAnalysis = sleepData ? scoreSleepInput(sleepData) : null;

      const result = await getDailyAdviceMutation.mutateAsync({
        elderNickname: nickname,
        caregiverName: caregiver,
        city: profile?.city || undefined,
        baseline: profile?.careNeeds?.selectedNeeds?.length ? { care_needs: profile.careNeeds.selectedNeeds } : undefined,
        sleep_analysis: sleepAnalysis ? {
          score: sleepAnalysis.score,
          problems: sleepAnalysis.problems,
          sleep_range: yesterday?.sleepRange ?? today?.sleepRange ?? undefined,
        } : undefined,
        today_input: {
          mood: today?.moodScore && today.moodScore >= 7 ? '良好' : today?.moodScore && today.moodScore >= 5 ? '一般' : '较差',
          mood_score: today?.moodScore ?? yesterday?.moodScore ?? undefined,
          medication_taken: today?.medicationTaken ?? yesterday?.medicationTaken ?? undefined,
          meal: today?.mealOption ?? yesterday?.mealOption ?? undefined,
          notes: today?.morningNotes || today?.eveningNotes || yesterday?.eveningNotes || undefined,
        },
        careNeeds: profile?.careNeeds?.selectedNeeds ?? undefined,
      });

      if (result.success && result.advice) {
        setAdvice(result.advice);
        _adviceCache = { date: todayKey, key: cacheKey, advice: result.advice };
        if (result.advice.careScore != null) {
          const todayDateStr = new Date().toISOString().split('T')[0];
          upsertCheckIn({ date: todayDateStr, careScore: result.advice.careScore }).catch(() => {});
        }
      } else {
        setError(result.error ?? '小马虎暂时无法生成分析');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误，请检查连接');
    } finally {
      setLoading(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }
  }

  const sleepBarData = useMemo(() => {
    const reversed = [...weeklyData].reverse();
    return reversed.map((d, i) => {
      const dayOfWeek = new Date(d.date + 'T00:00:00').getDay();
      const label = WEEKDAY_LABELS[dayOfWeek];
      const hours = d.sleepHours || 0;
      const color = hours >= 7 ? '#6C9E6C' : hours >= 5 ? '#F59E0B' : hours > 0 ? '#EF4444' : '#E5E7EB';
      return {
        value: hours,
        label,
        frontColor: color,
        topLabelComponent: () => (
          <Text style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>
            {hours > 0 ? `${hours}h` : ''}
          </Text>
        ),
      };
    });
  }, [weeklyData]);

  const avgSleep = useMemo(() => {
    const withData = weeklyData.filter(d => d.sleepHours > 0);
    if (withData.length === 0) return 0;
    return Math.round((withData.reduce((s, d) => s + d.sleepHours, 0) / withData.length) * 10) / 10;
  }, [weeklyData]);

  const totalWakings = useMemo(() => weeklyData.reduce((s, d) => s + d.nightWakings, 0), [weeklyData]);

  if (loading) return <LoadingScreen />;

  if (error || !advice) {
    return (
      <ScreenContainer containerClassName="bg-[#FFF7ED]">
        <View style={s.header}>
          <BackButton onPress={() => router.replace('/(tabs)' as any)} />
          <Text style={s.headerTitle}>护理总结</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={s.errorWrap}>
          <Text style={{ fontSize: 56, marginBottom: 16 }}>😅</Text>
          <Text style={s.errorTitle}>暂时无法生成分析</Text>
          <Text style={s.errorText}>{error ?? '请先完成今日打卡'}</Text>
          <TouchableOpacity style={s.retryBtn} onPress={loadData}>
            <Text style={s.retryBtnText}>重新生成</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.replace('/(tabs)' as any)} style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 15, color: '#9CA3AF' }}>返回首页</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const score = advice.careScore ?? 70;
  const sd = getScoreDisplay(score);
  const todayLabel = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const ci = todayCheckIn ?? yesterdayCheckIn;

  const moodLabel = ci?.moodScore ? (ci.moodScore >= 7 ? '状态不错' : ci.moodScore >= 5 ? '状态一般' : '状态欠佳') : null;
  const moodEmoji = ci?.moodScore ? (ci.moodScore >= 7 ? '😊' : ci.moodScore >= 5 ? '😐' : '😟') : null;
  const medTaken = ci?.medicationTaken;
  const mealLabel = ci?.mealOption ?? null;
  const sleepH = ci?.sleepHours ?? 0;

  return (
    <ScreenContainer containerClassName="bg-[#FAFAF8]">
      <View style={s.header}>
        <BackButton onPress={() => router.replace('/(tabs)' as any)} />
        <Text style={s.headerTitle}>护理总结</Text>
        <TouchableOpacity onPress={() => router.push('/share' as any)}>
          <LinearGradient colors={['#6C9E6C', '#7AB87A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.shareBtn}>
            <Text style={s.shareBtnText}>分享</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <Animated.View style={{ opacity: fadeAnim }}>

          <Text style={s.dateLabel}>{todayLabel}</Text>

          <LinearGradient
            colors={[sd.bgColor, '#FFFFFF']}
            style={s.scoreCard}
          >
            <View style={s.scoreRow}>
              <View style={[s.scoreCircle, { borderColor: sd.color + '40' }]}>
                <Text style={{ fontSize: 28 }}>{sd.emoji}</Text>
                <Text style={[s.scoreNum, { color: sd.color }]}>{score}</Text>
                <Text style={s.scoreMax}>/100</Text>
              </View>
              <View style={s.scoreRight}>
                <View style={[s.scoreBadge, { backgroundColor: sd.color }]}>
                  <Text style={s.scoreBadgeText}>{sd.label}</Text>
                </View>
                <Text style={s.scoreSummary}>{advice.summary || `${elderNickname}今天整体状态不错`}</Text>
              </View>
            </View>
            <View style={s.encourageRow}>
              <Text style={{ fontSize: 18 }}>💛</Text>
              <Text style={s.encourageText}>{advice.encouragement || `${caregiverName}，辛苦了！`}</Text>
            </View>
          </LinearGradient>

          <Text style={s.sectionTitle}>昨日记录回顾</Text>
          <View style={s.reviewGrid}>
            <View style={[s.reviewCard, { backgroundColor: '#F0FDF4' }]}>
              <Text style={s.reviewEmoji}>{moodEmoji || '📋'}</Text>
              <Text style={s.reviewLabel}>情绪</Text>
              <Text style={s.reviewValue}>{moodLabel || '未记录'}</Text>
            </View>
            <View style={[s.reviewCard, { backgroundColor: '#EFF6FF' }]}>
              <Text style={s.reviewEmoji}>{sleepH > 0 ? '😴' : '📋'}</Text>
              <Text style={s.reviewLabel}>睡眠</Text>
              <Text style={s.reviewValue}>{sleepH > 0 ? `${sleepH}小时` : '未记录'}</Text>
            </View>
            <View style={[s.reviewCard, { backgroundColor: medTaken ? '#F0FDF4' : '#FEF2F2' }]}>
              <Text style={s.reviewEmoji}>{medTaken == null ? '💊' : medTaken ? '✅' : '❌'}</Text>
              <Text style={s.reviewLabel}>用药</Text>
              <Text style={s.reviewValue}>{medTaken == null ? '未记录' : medTaken ? '已服药' : '未服药'}</Text>
            </View>
            <View style={[s.reviewCard, { backgroundColor: '#FFFBEB' }]}>
              <Text style={s.reviewEmoji}>🍚</Text>
              <Text style={s.reviewLabel}>饮食</Text>
              <Text style={s.reviewValue}>{mealLabel || '未记录'}</Text>
            </View>
          </View>

          <Text style={s.sectionTitle}>近一周睡眠趋势</Text>
          <View style={s.chartCard}>
            <View style={s.chartHeader}>
              <View>
                <Text style={s.chartMetric}>{avgSleep > 0 ? `${avgSleep}小时` : '--'}</Text>
                <Text style={s.chartMetricLabel}>平均睡眠</Text>
              </View>
              <View style={s.chartStatRow}>
                <View style={s.chartStatPill}>
                  <View style={[s.chartDot, { backgroundColor: '#6C9E6C' }]} />
                  <Text style={s.chartStatText}>7h+</Text>
                </View>
                <View style={s.chartStatPill}>
                  <View style={[s.chartDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={s.chartStatText}>5-7h</Text>
                </View>
                <View style={s.chartStatPill}>
                  <View style={[s.chartDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={s.chartStatText}>&lt;5h</Text>
                </View>
              </View>
            </View>
            {sleepBarData.length > 0 && sleepBarData.some(d => d.value > 0) ? (
              <BarChart
                data={sleepBarData}
                width={CHART_W}
                height={140}
                barWidth={28}
                spacing={16}
                roundedTop
                roundedBottom={false}
                noOfSections={4}
                maxValue={12}
                yAxisThickness={0}
                xAxisThickness={1}
                xAxisColor="#E5E7EB"
                rulesColor="#F3F4F6"
                rulesType="solid"
                yAxisTextStyle={{ fontSize: 10, color: '#9CA3AF' }}
                xAxisLabelTextStyle={{ fontSize: 11, color: '#6B7280', fontWeight: '500' }}
                isAnimated
                animationDuration={600}
              />
            ) : (
              <View style={s.emptyChart}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>📊</Text>
                <Text style={s.emptyText}>还没有足够的睡眠数据</Text>
                <Text style={s.emptySubtext}>坚持打卡，数据会越来越丰富</Text>
              </View>
            )}
            {totalWakings > 0 && (
              <View style={s.wakingRow}>
                <Text style={{ fontSize: 14 }}>🌙</Text>
                <Text style={s.wakingText}>本周夜醒共 {totalWakings} 次</Text>
              </View>
            )}
          </View>

          {ci?.sleepSegments && ci.sleepSegments.length > 0 && (
            <>
              <Text style={s.sectionTitle}>昨晚睡眠时段</Text>
              <View style={s.segmentCard}>
                {ci.sleepSegments.map((seg: any, i: number) => {
                  const startD = new Date(seg.start);
                  const endD = new Date(seg.end);
                  const ms = endD.getTime() - startD.getTime();
                  const hrs = ms <= 0 ? 0 : Math.min(ms / 3600000, 16);
                  const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                  return (
                    <View key={i} style={s.segmentRow}>
                      <View style={[s.segmentDot, { backgroundColor: '#6C9E6C' }]} />
                      <Text style={s.segmentLabel}>{`睡眠 ${i + 1}`}</Text>
                      <Text style={s.segmentTime}>{fmt(startD)} - {fmt(endD)}</Text>
                      <Text style={s.segmentDuration}>{Math.round(hrs * 10) / 10}h</Text>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          <View style={{ height: 40 }} />
        </Animated.View>
      </ScrollView>

      <View style={s.bottomBar}>
        <TouchableOpacity onPress={() => router.replace('/(tabs)' as any)} activeOpacity={0.88} style={{ flex: 1 }}>
          <LinearGradient colors={['#A07858', '#8B6914']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.bottomBtn}>
            <Text style={s.bottomBtnText}>返回首页</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.95)', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: '#1A1A1A', textAlign: 'center' },
  shareBtn: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  shareBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  scroll: { padding: 20, paddingBottom: 24 },
  dateLabel: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginBottom: 16 },
  scoreCard: {
    borderRadius: 24, padding: 20, marginBottom: 24,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginBottom: 16 },
  scoreCircle: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  scoreNum: { fontSize: 36, fontWeight: '900', lineHeight: 40 },
  scoreMax: { fontSize: 12, color: '#9CA3AF' },
  scoreRight: { flex: 1, gap: 8 },
  scoreBadge: { alignSelf: 'flex-start', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4 },
  scoreBadgeText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  scoreSummary: { fontSize: 14, color: '#374151', lineHeight: 21 },
  encourageRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 14, padding: 12,
  },
  encourageText: { flex: 1, fontSize: 14, color: '#92400E', fontWeight: '600', lineHeight: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', marginBottom: 12 },
  reviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  reviewCard: {
    width: (SW - 50) / 2 - 5, borderRadius: 16, padding: 14,
    alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)',
  },
  reviewEmoji: { fontSize: 24 },
  reviewLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },
  reviewValue: { fontSize: 14, fontWeight: '700', color: '#374151' },
  chartCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 18, marginBottom: 24,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  chartMetric: { fontSize: 24, fontWeight: '900', color: '#1A1A1A' },
  chartMetricLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  chartStatRow: { flexDirection: 'row', gap: 8 },
  chartStatPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chartDot: { width: 8, height: 8, borderRadius: 4 },
  chartStatText: { fontSize: 11, color: '#6B7280' },
  emptyChart: { alignItems: 'center', paddingVertical: 30 },
  emptyText: { fontSize: 14, color: '#9CA3AF', marginBottom: 4 },
  emptySubtext: { fontSize: 12, color: '#D1D5DB' },
  wakingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  wakingText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  segmentCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 24,
    borderWidth: 1, borderColor: '#E5E7EB', gap: 10,
  },
  segmentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  segmentDot: { width: 10, height: 10, borderRadius: 5 },
  segmentLabel: { fontSize: 13, color: '#374151', fontWeight: '600', width: 50 },
  segmentTime: { flex: 1, fontSize: 13, color: '#6B7280' },
  segmentDuration: { fontSize: 13, fontWeight: '700', color: '#374151' },
  bottomBar: {
    backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  bottomBtn: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
  bottomBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  errorText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginBottom: 24, lineHeight: 21 },
  retryBtn: { backgroundColor: '#6C9E6C', borderRadius: 20, paddingHorizontal: 32, paddingVertical: 14 },
  retryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
