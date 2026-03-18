import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Animated, ActivityIndicator, Share, Dimensions, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { BackButton } from '@/components/back-button';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenContainer } from '@/components/screen-container';
import { getProfile, getTodayCheckIn, getYesterdayCheckIn, type DailyCheckIn } from '@/lib/storage';
import { trpc } from '@/lib/trpc';
import * as Haptics from 'expo-haptics';

const { width: SW } = Dimensions.get('window');

// ─── Score Ring (animated) ───────────────────────────────────────────────────
function ScoreRing({ score, size = 100 }: { score: number; size?: number }) {
  const color = score >= 80 ? '#16A34A' : score >= 60 ? '#3B82F6' : score >= 40 ? '#F59E0B' : '#EF4444';
  const bgColor = score >= 80 ? '#F0FDF4' : score >= 60 ? '#EFF6FF' : score >= 40 ? '#FFFBEB' : '#FEF2F2';
  const label = score >= 80 ? '状态极佳' : score >= 60 ? '状态良好' : score >= 40 ? '需要关注' : '需要照顾';
  const emoji = score >= 80 ? '🌟' : score >= 60 ? '😊' : score >= 40 ? '🤗' : '💕';
  return (
    <View style={[ringStyles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor }]}>
      <View style={[ringStyles.ring, { width: size - 12, height: size - 12, borderRadius: (size - 12) / 2, borderColor: color }]}>
        <Text style={[ringStyles.score, { color, fontSize: size * 0.32 }]}>{score}</Text>
        <Text style={[ringStyles.label, { color }]}>{emoji} {label}</Text>
      </View>
    </View>
  );
}
const ringStyles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  ring: { alignItems: 'center', justifyContent: 'center', borderWidth: 4 },
  score: { fontWeight: '900', lineHeight: 42 },
  label: { fontSize: 11, fontWeight: '700', marginTop: 2 },
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
        <Text style={cardStyles.summaryText}>{briefing.summary}</Text>
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
        <Text style={cardStyles.caregiverText}>{briefing.caregiverNote}</Text>
      </View>

      {/* ── Footer ── */}
      <View style={cardStyles.footer}>
        <Text style={cardStyles.footerLeft}>由 {caregiverName} 用心记录</Text>
        <Text style={cardStyles.footerRight}>✨ Gemini AI · 小马虎</Text>
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

  const generateBriefingMutation = trpc.ai.generateBriefing.useMutation();

  useFocusEffect(useCallback(() => { loadAndGenerate(); }, []));

  async function loadAndGenerate() {
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
      } else {
        setError('简报生成失败，请重试');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成失败，请检查网络');
    } finally {
      setGenerating(false);
    }
  }

  async function handleShare() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const text = shareText || buildFallbackShareText();
    try { await Share.share({ message: text, title: `${elderNickname}今日护理日报` }); } catch {}
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
  if (loading) {
    return (
      <ScreenContainer containerClassName="bg-background">
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingEmoji}>📊</Text>
          <Text style={styles.loadingTitle}>正在生成今日简报...</Text>
          <Text style={styles.loadingSubtitle}>Gemini AI 正在撰写</Text>
          <ActivityIndicator color="#6C9E6C" size="large" style={{ marginTop: 20 }} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.title}>📋 今日简报</Text>
          <TouchableOpacity onPress={loadAndGenerate} style={styles.refreshBtn}>
            <Text style={styles.refreshBtnText}>🔄</Text>
          </TouchableOpacity>
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
            <Text style={styles.generatingText}>✨ Gemini AI 正在生成精美简报...</Text>
          </View>
        ) : briefing && checkIn ? (
          <>
            <BriefingCard
              briefing={briefing}
              checkIn={checkIn}
              careScore={careScore}
              elderNickname={elderNickname}
              caregiverName={caregiverName}
              elderEmoji={elderEmoji}
            />

            {/* ── Share Text Preview ── */}
            {shareText ? (
              <View style={styles.shareTextBox}>
                <Text style={styles.shareTextLabel}>📝 分享文字预览</Text>
                <Text style={styles.shareTextContent}>{shareText}</Text>
              </View>
            ) : null}

            {/* ── Export Long Image Button ── */}
            <TouchableOpacity
              style={styles.exportImageBtn}
              onPress={() => router.push('/export-image' as any)}
            >
              <Text style={styles.exportImageIcon}>🖼️</Text>
              <Text style={styles.exportImageText}>导出精美长图</Text>
              <Text style={styles.exportImageSub}>保存到相册 / 分享到微信</Text>
            </TouchableOpacity>

            {/* ── WeChat Share Button ── */}
            <TouchableOpacity style={styles.shareWechatBtn} onPress={handleShare}>
              <Text style={styles.shareWechatIcon}>💬</Text>
              <Text style={styles.shareWechatText}>一键分享文字到微信</Text>
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
              <Text style={styles.disclaimerText}>✨ 由 Gemini AI 生成 · 仅供参考，不构成医疗建议</Text>
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
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingEmoji: { fontSize: 64, marginBottom: 16 },
  loadingTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  loadingSubtitle: { fontSize: 14, color: '#9B9B9B' },
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
  shareTextBox: {
    backgroundColor: '#FAFAF8', borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: '#EBEBEB',
  },
  shareTextLabel: { fontSize: 13, fontWeight: '700', color: '#9B9B9B', marginBottom: 10 },
  shareTextContent: { fontSize: 14, color: '#374151', lineHeight: 22 },
  exportImageBtn: {
    alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: '#3B82F6', borderRadius: 20, padding: 18, marginBottom: 12,
  },
  exportImageIcon: { fontSize: 28 },
  exportImageText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  exportImageSub: { fontSize: 12, color: '#FFFFFFBB' },
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
