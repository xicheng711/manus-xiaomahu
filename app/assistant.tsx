import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenContainer } from '@/components/screen-container';
import { getProfile, getYesterdayCheckIn, getTodayCheckIn } from '@/lib/storage';
import { scoreSleepInput } from '@/lib/sleep-scoring';
import { trpc } from '@/lib/trpc';
import { BackButton } from '@/components/back-button';
import { COLORS, RADIUS, SHADOWS } from '@/lib/animations';

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

      const yesterday = await getYesterdayCheckIn();
      const today = await getTodayCheckIn();
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
      } else {
        setError(result.error ?? 'AI建议生成失败，请稍后重试');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '网络错误，请检查连接');
    } finally {
      setLoading(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }
  }

  if (loading) {
    return (
      <ScreenContainer containerClassName="bg-[#FFF8F0]">
        <View style={styles.loadingContainer}>
          <Animated.Text style={[styles.loadingEmoji, {
            transform: [{ scale: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.1] }) }]
          }]}>🐴🐯</Animated.Text>
          <Text style={styles.loadingTitle}>小马虎正在分析...</Text>
          <Text style={styles.loadingSubtitle}>Gemini AI 正在生成专业护理建议</Text>
          <ActivityIndicator color="#FF6B6B" size="large" style={{ marginTop: 20 }} />
        </View>
      </ScreenContainer>
    );
  }

  if (error || !aiAdvice) {
    return (
      <ScreenContainer containerClassName="bg-[#FFF8F0]">
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>😅</Text>
          <Text style={styles.errorTitle}>暂时无法生成建议</Text>
          <Text style={styles.errorText}>{error ?? '请稍后重试'}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryBtnText}>🔄 重新生成</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backBtn2} onPress={() => router.back()}>
            <Text style={styles.backBtn2Text}>← 返回首页</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  const scoreDisplay = getScoreDisplay(aiAdvice.careScore ?? 70);

  return (
    <ScreenContainer containerClassName="bg-[#FFF8F0]">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.title}>今日护理预测</Text>
          <TouchableOpacity onPress={loadData} style={styles.refreshBtn} activeOpacity={0.7}>
            <Text style={styles.refreshBtnText}>🔄</Text>
          </TouchableOpacity>
        </View>

        {/* Weather badge */}
        {weatherData && (
          <View style={styles.weatherBadge}>
            <Text style={styles.weatherText}>
              {weatherData.icon} {city} {weatherData.temp}°C {weatherData.description}
            </Text>
          </View>
        )}

        {/* Score section */}
        <Animated.View style={[styles.scoreSection, { opacity: fadeAnim }]}>
          <Text style={styles.greetingText}>{aiAdvice.greeting}</Text>
          <ScoreRing
            score={aiAdvice.careScore ?? 70}
            color={scoreDisplay.color}
            bgColor={scoreDisplay.bgColor}
            mascot={scoreDisplay.mascot}
          />
          <View style={[styles.scoreLabelBadge, { backgroundColor: scoreDisplay.color }]}>
            <Text style={styles.scoreLabelText}>{aiAdvice.scoreLabel ?? scoreDisplay.label}</Text>
          </View>
          <Text style={styles.overallText}>{aiAdvice.overallAssessment}</Text>
        </Animated.View>

        {/* Watch Out */}
        {aiAdvice.watchOut && (
          <View style={styles.watchOutCard}>
            <Text style={styles.watchOutIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.watchOutLabel}>今日特别注意</Text>
              <Text style={styles.watchOutText}>{aiAdvice.watchOut}</Text>
            </View>
          </View>
        )}

        {/* Advice Cards */}
        <Text style={styles.sectionTitle}>📋 今日护理建议</Text>
        {(aiAdvice.adviceCards ?? []).map((card: any, i: number) => (
          <AdviceCard key={i} card={card} index={i} />
        ))}

        {/* Outdoor advice */}
        {aiAdvice.outdoorAdvice && (
          <View style={styles.outdoorCard}>
            <Text style={styles.outdoorIcon}>🌿</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.outdoorLabel}>户外活动建议</Text>
              <Text style={styles.outdoorText}>{aiAdvice.outdoorAdvice}</Text>
            </View>
          </View>
        )}

        {/* Nutrition */}
        {aiAdvice.nutritionAdvice && (
          <View style={styles.nutritionCard}>
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

        {/* Encouragement */}
        <View style={styles.encourageCard}>
          <Text style={styles.encourageEmoji}>💕</Text>
          <Text style={styles.encourageText}>{aiAdvice.encouragement}</Text>
        </View>

        {/* AI badge */}
        <View style={styles.aiBadge}>
          <Text style={styles.aiBadgeText}>✨ 由 Gemini 2.5 Flash AI 专业生成</Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.checkinBtn} onPress={() => router.push('/(tabs)/checkin' as any)}>
            <Text style={styles.checkinBtnText}>📋 去打卡</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shareBtn} onPress={() => router.push('/share' as any)}>
            <Text style={styles.shareBtnText}>📤 分享</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
