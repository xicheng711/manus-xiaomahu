import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Platform, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { BackButton } from '@/components/back-button';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenContainer } from '@/components/screen-container';
import {
  getProfile, getTodayCheckIn, getYesterdayCheckIn,
  getMedications, getDiaryEntries,
  type DailyCheckIn, type ElderProfile, type Medication, type DiaryEntry,
} from '@/lib/storage';
import { trpc } from '@/lib/trpc';
import * as Haptics from 'expo-haptics';

const SW = Dimensions.get('window').width;

// ─── Long Image Card (rendered as a capturable view) ─────────────────────────
function LongImageCard({
  profile, checkIn, medications, diaryEntries, encouragement, briefing, viewRef,
}: {
  profile: ElderProfile;
  checkIn: DailyCheckIn;
  medications: Medication[];
  diaryEntries: DiaryEntry[];
  encouragement: string;
  briefing: any;
  viewRef: React.RefObject<View | null>;
}) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const timeStr = today.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const elderName = profile.nickname || profile.name || '老宝';
  const caregiverName = profile.caregiverName || '照顾者';
  const zodiacEmoji = profile.zodiacEmoji || '🐯';
  const sleepLabel = checkIn.sleepQuality === 'good' ? '良好 😴' : checkIn.sleepQuality === 'fair' ? '一般 😐' : '较差 😟';
  const medLabel = checkIn.medicationTaken ? '已按时服药 ✅' : '未按时服药 ❌';
  const careScore = checkIn.careScore || 70;
  const scoreColor = careScore >= 80 ? '#16A34A' : careScore >= 60 ? '#3B82F6' : careScore >= 40 ? '#F59E0B' : '#EF4444';
  const scoreLabel = careScore >= 80 ? '状态极佳' : careScore >= 60 ? '状态良好' : careScore >= 40 ? '需要关注' : '需要照顾';

  // Today's diary entries
  const todayDiaries = diaryEntries.filter(d => d.date === checkIn.date).slice(0, 3);
  // Active medications
  const activeMeds = medications.filter(m => m.active).slice(0, 5);

  return (
    <View ref={viewRef as any} style={imgStyles.card} collapsable={false}>
      {/* ── Decorative Top Bar ── */}
      <View style={imgStyles.topBar}>
        <View style={imgStyles.topBarInner}>
          <Text style={imgStyles.topBarEmoji}>🐴🐯</Text>
          <Text style={imgStyles.topBarTitle}>小马虎 · 每日护理简报</Text>
        </View>
      </View>

      {/* ── Date & Elder Info ── */}
      <View style={imgStyles.dateSection}>
        <Text style={imgStyles.dateText}>{dateStr}</Text>
        <View style={imgStyles.elderRow}>
          <View style={imgStyles.elderAvatar}>
            <Text style={imgStyles.elderAvatarEmoji}>{zodiacEmoji}</Text>
          </View>
          <View style={imgStyles.elderInfo}>
            <Text style={imgStyles.elderName}>{elderName}</Text>
            <Text style={imgStyles.elderSub}>由 {caregiverName} 用心记录</Text>
          </View>
        </View>
      </View>

      {/* ── Care Score ── */}
      <View style={imgStyles.scoreSection}>
        <View style={[imgStyles.scoreBadge, { backgroundColor: scoreColor + '15', borderColor: scoreColor + '30' }]}>
          <Text style={[imgStyles.scoreNum, { color: scoreColor }]}>{careScore}</Text>
          <Text style={[imgStyles.scoreLabel, { color: scoreColor }]}>{scoreLabel}</Text>
        </View>
        <Text style={imgStyles.scoreSuffix}>/ 100 护理指数</Text>
      </View>

      {/* ── Divider ── */}
      <View style={imgStyles.divider} />

      {/* ── Data Cards ── */}
      <Text style={imgStyles.sectionTitle}>📊 今日数据</Text>
      <View style={imgStyles.dataGrid}>
        <View style={[imgStyles.dataCard, { backgroundColor: '#F0FDF4' }]}>
          <Text style={imgStyles.dataIcon}>😴</Text>
          <Text style={imgStyles.dataLabel}>睡眠</Text>
          <Text style={imgStyles.dataValue}>{checkIn.sleepHours} 小时</Text>
          <Text style={imgStyles.dataSub}>{sleepLabel}</Text>
        </View>
        <View style={[imgStyles.dataCard, { backgroundColor: '#FFFBEB' }]}>
          <Text style={imgStyles.dataIcon}>{checkIn.moodEmoji || '😊'}</Text>
          <Text style={imgStyles.dataLabel}>心情</Text>
          <Text style={imgStyles.dataValue}>{checkIn.moodScore}/10</Text>
          <Text style={imgStyles.dataSub}>情绪评分</Text>
        </View>
      </View>
      <View style={imgStyles.dataGrid}>
        <View style={[imgStyles.dataCard, { backgroundColor: '#EFF6FF' }]}>
          <Text style={imgStyles.dataIcon}>💊</Text>
          <Text style={imgStyles.dataLabel}>用药</Text>
          <Text style={imgStyles.dataValue}>{medLabel}</Text>
          <Text style={imgStyles.dataSub}>{checkIn.medicationNotes || '按时服药'}</Text>
        </View>
        <View style={[imgStyles.dataCard, { backgroundColor: '#FDF2F8' }]}>
          <Text style={imgStyles.dataIcon}>🍽️</Text>
          <Text style={imgStyles.dataLabel}>饮食</Text>
          <Text style={imgStyles.dataValue}>{checkIn.mealNotes ? (checkIn.mealNotes.length > 8 ? checkIn.mealNotes.slice(0, 8) + '…' : checkIn.mealNotes) : '已记录'}</Text>
          <Text style={imgStyles.dataSub}>饮食情况</Text>
        </View>
      </View>

      {/* ── Morning Notes ── */}
      {checkIn.morningNotes ? (
        <View style={imgStyles.notesBox}>
          <Text style={imgStyles.notesIcon}>🌅</Text>
          <View style={imgStyles.notesContent}>
            <Text style={imgStyles.notesTitle}>早上记录</Text>
            <Text style={imgStyles.notesText}>{checkIn.morningNotes}</Text>
          </View>
        </View>
      ) : null}

      {/* ── Evening Notes ── */}
      {checkIn.eveningNotes ? (
        <View style={imgStyles.notesBox}>
          <Text style={imgStyles.notesIcon}>🌙</Text>
          <View style={imgStyles.notesContent}>
            <Text style={imgStyles.notesTitle}>晚上记录</Text>
            <Text style={imgStyles.notesText}>{checkIn.eveningNotes}</Text>
          </View>
        </View>
      ) : null}

      {/* ── Medications List ── */}
      {activeMeds.length > 0 && (
        <>
          <View style={imgStyles.divider} />
          <Text style={imgStyles.sectionTitle}>💊 今日用药</Text>
          {activeMeds.map((med, i) => (
            <View key={i} style={imgStyles.medRow}>
              <Text style={imgStyles.medIcon}>{med.icon || '💊'}</Text>
              <View style={imgStyles.medInfo}>
                <Text style={imgStyles.medName}>{med.name}</Text>
                <Text style={imgStyles.medDetail}>{med.dosage} · {med.frequency}</Text>
              </View>
              <Text style={imgStyles.medTime}>{med.times?.join(', ') || ''}</Text>
            </View>
          ))}
        </>
      )}

      {/* ── Diary Entries ── */}
      {todayDiaries.length > 0 && (
        <>
          <View style={imgStyles.divider} />
          <Text style={imgStyles.sectionTitle}>📝 今日日记</Text>
          {todayDiaries.map((entry, i) => (
            <View key={i} style={imgStyles.diaryBox}>
              <View style={imgStyles.diaryHeader}>
                <Text style={imgStyles.diaryMood}>{entry.moodEmoji}</Text>
                <Text style={imgStyles.diaryMoodLabel}>{entry.moodLabel || ''}</Text>
                {entry.tags?.map((tag, j) => (
                  <View key={j} style={imgStyles.diaryTag}>
                    <Text style={imgStyles.diaryTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
              {entry.content ? (
                <Text style={imgStyles.diaryContent} numberOfLines={4}>
                  {entry.content}
                </Text>
              ) : null}
            </View>
          ))}
        </>
      )}

      {/* ── AI Summary ── */}
      {briefing?.summary && (
        <>
          <View style={imgStyles.divider} />
          <Text style={imgStyles.sectionTitle}>🤖 AI 状态总结</Text>
          <View style={imgStyles.aiBox}>
            <Text style={imgStyles.aiText}>{briefing.summary}</Text>
          </View>
        </>
      )}

      {/* ── AI Encouragement (different every day) ── */}
      <View style={imgStyles.divider} />
      <View style={imgStyles.encourageBox}>
        <Text style={imgStyles.encourageIcon}>💪</Text>
        <Text style={imgStyles.encourageTitle}>今日加油</Text>
        <Text style={imgStyles.encourageText}>{encouragement}</Text>
      </View>

      {/* ── Footer ── */}
      <View style={imgStyles.footer}>
        <View style={imgStyles.footerDivider} />
        <Text style={imgStyles.footerText}>🐴🐯 小马虎 · 用爱守护每一天</Text>
        <Text style={imgStyles.footerSub}>{dateStr} {timeStr} · Gemini AI 生成</Text>
      </View>
    </View>
  );
}

const imgStyles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 0, padding: 24, width: SW - 40,
  },
  topBar: {
    backgroundColor: '#6C9E6C', borderRadius: 16, padding: 14, marginBottom: 20,
  },
  topBarInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  topBarEmoji: { fontSize: 20 },
  topBarTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: 1 },
  dateSection: { marginBottom: 16 },
  dateText: { fontSize: 14, color: '#9B9B9B', marginBottom: 12 },
  elderRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  elderAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#FFF0F0', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFD4D4',
  },
  elderAvatarEmoji: { fontSize: 28 },
  elderInfo: {},
  elderName: { fontSize: 22, fontWeight: '800', color: '#1A1A1A' },
  elderSub: { fontSize: 13, color: '#9B9B9B', marginTop: 2 },
  scoreSection: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  scoreBadge: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 16,
    borderWidth: 1.5, alignItems: 'center',
  },
  scoreNum: { fontSize: 32, fontWeight: '900' },
  scoreLabel: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  scoreSuffix: { fontSize: 14, color: '#9B9B9B' },
  divider: { height: 1, backgroundColor: '#F0F0EE', marginVertical: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 12 },
  dataGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  dataCard: {
    flex: 1, borderRadius: 16, padding: 14, alignItems: 'center', gap: 4,
  },
  dataIcon: { fontSize: 24 },
  dataLabel: { fontSize: 11, color: '#9B9B9B', fontWeight: '500' },
  dataValue: { fontSize: 15, fontWeight: '800', color: '#1A1A1A' },
  dataSub: { fontSize: 11, color: '#6B7280' },
  notesBox: {
    flexDirection: 'row', gap: 10, backgroundColor: '#FAFAF8',
    borderRadius: 14, padding: 14, marginTop: 8,
  },
  notesIcon: { fontSize: 18, marginTop: 2 },
  notesContent: { flex: 1 },
  notesTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 4 },
  notesText: { fontSize: 13, color: '#6B7280', lineHeight: 20 },
  medRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F3',
  },
  medIcon: { fontSize: 20 },
  medInfo: { flex: 1 },
  medName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A' },
  medDetail: { fontSize: 12, color: '#9B9B9B', marginTop: 1 },
  medTime: { fontSize: 12, color: '#6C9E6C', fontWeight: '600' },
  diaryBox: {
    backgroundColor: '#FAFAF8', borderRadius: 14, padding: 14, marginBottom: 8,
  },
  diaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  diaryMood: { fontSize: 20 },
  diaryMoodLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  diaryTag: { backgroundColor: '#E8F5E9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  diaryTagText: { fontSize: 11, color: '#2E7D32' },
  diaryContent: { fontSize: 13, color: '#4B5563', lineHeight: 20 },
  aiBox: { backgroundColor: '#F0F7EE', borderRadius: 14, padding: 14 },
  aiText: { fontSize: 14, color: '#374151', lineHeight: 22 },
  encourageBox: {
    backgroundColor: '#FFF7ED', borderRadius: 18, padding: 18,
    alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: '#FDBA7440',
  },
  encourageIcon: { fontSize: 32 },
  encourageTitle: { fontSize: 15, fontWeight: '800', color: '#EA580C' },
  encourageText: { fontSize: 15, color: '#9A3412', lineHeight: 24, textAlign: 'center', fontWeight: '600' },
  footer: { alignItems: 'center', marginTop: 16, gap: 6 },
  footerDivider: { width: 40, height: 2, backgroundColor: '#6C9E6C', borderRadius: 1, marginBottom: 4 },
  footerText: { fontSize: 13, fontWeight: '700', color: '#6C9E6C' },
  footerSub: { fontSize: 11, color: '#BBBBB8' },
});

// ─── Main Export Image Screen ────────────────────────────────────────────────
export default function ExportImageScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ElderProfile | null>(null);
  const [checkIn, setCheckIn] = useState<DailyCheckIn | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [encouragement, setEncouragement] = useState('你的坚持和付出，是最温暖的守护 💕');
  const [briefing, setBriefing] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<View | null>(null);

  const generateBriefingMutation = trpc.ai.generateBriefing.useMutation();

  useFocusEffect(useCallback(() => { loadData(); }, []));

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const p = await getProfile();
      setProfile(p);
      const today = await getTodayCheckIn();
      const yesterday = await getYesterdayCheckIn();
      const ci = today || yesterday;
      if (!ci) {
        setError('请先完成今日打卡，再导出简报');
        setLoading(false);
        return;
      }
      setCheckIn(ci);
      const meds = await getMedications();
      setMedications(meds);
      const diaries = await getDiaryEntries();
      setDiaryEntries(diaries);

      // Generate briefing with encouragement
      const nickname = p?.nickname || p?.name || '老宝';
      const caregiver = p?.caregiverName || '照顾者';
      const dateStr = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

      try {
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
          careScore: ci.careScore || 70,
        });
        if (result.success && result.briefing) {
          setBriefing(result.briefing);
          if (result.briefing.encouragement) {
            setEncouragement(result.briefing.encouragement);
          } else if (result.briefing.caregiverNote) {
            setEncouragement(result.briefing.caregiverNote);
          }
        }
      } catch {
        // Use fallback encouragement
        const fallbacks = [
          '每一天的陪伴，都是最珍贵的礼物。你做得很好！',
          '照顾者也需要被照顾，记得今天也给自己一个拥抱 🤗',
          '你的爱和耐心，是最好的良药。加油！💪',
          '今天也辛苦了，你的付出家人都看在眼里 ❤️',
          '坚持记录每一天，这份用心就是最大的力量 ✨',
        ];
        setEncouragement(fallbacks[new Date().getDate() % fallbacks.length]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveToAlbum() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      // Use react-native-view-shot to capture the card
      const ViewShot = require('react-native-view-shot');
      const uri = await ViewShot.captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      if (Platform.OS === 'web') {
        // Web: download the image
        const link = document.createElement('a');
        link.href = uri;
        link.download = `小马虎_${checkIn?.date || 'daily'}_简报.png`;
        link.click();
        Alert.alert('保存成功', '图片已下载');
      } else {
        // Native: save to media library
        const MediaLibrary = require('expo-media-library');
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('需要权限', '请在设置中允许小马虎访问相册');
          return;
        }
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('保存成功 🎉', '简报图片已保存到相册');
      }
    } catch (e) {
      console.warn('Save error:', e);
      Alert.alert('保存失败', '请重试或使用截图功能');
    } finally {
      setSaving(false);
    }
  }

  async function handleShareToWechat() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    try {
      const ViewShot = require('react-native-view-shot');
      const uri = await ViewShot.captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      if (Platform.OS === 'web') {
        // Web fallback: share text
        const { Share } = require('react-native');
        await Share.share({ message: briefing?.shareText || '小马虎每日护理简报' });
      } else {
        const Sharing = require('expo-sharing');
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: '分享护理简报',
            UTI: 'public.png',
          });
        } else {
          Alert.alert('分享不可用', '当前设备不支持分享功能');
        }
      }
    } catch (e) {
      console.warn('Share error:', e);
      Alert.alert('分享失败', '请重试');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ScreenContainer containerClassName="bg-background">
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingEmoji}>🖼️</Text>
          <Text style={styles.loadingTitle}>正在生成简报长图...</Text>
          <Text style={styles.loadingSub}>AI 正在为您准备精美简报</Text>
          <ActivityIndicator color="#6C9E6C" size="large" style={{ marginTop: 20 }} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.title}>🖼️ 导出长图</Text>
          <TouchableOpacity onPress={loadData} style={styles.refreshBtn}>
            <Text style={styles.refreshText}>🔄</Text>
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorEmoji}>😅</Text>
            <Text style={styles.errorText}>{error}</Text>
            {error.includes('打卡') && (
              <TouchableOpacity style={styles.goCheckinBtn} onPress={() => router.push('/(tabs)/checkin' as any)}>
                <Text style={styles.goCheckinText}>去打卡 →</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : profile && checkIn ? (
          <>
            {/* Preview hint */}
            <View style={styles.previewHint}>
              <Text style={styles.previewHintText}>👇 预览长图（可滚动查看）</Text>
            </View>

            {/* The capturable card */}
            <View style={styles.cardWrapper}>
              <LongImageCard
                profile={profile}
                checkIn={checkIn}
                medications={medications}
                diaryEntries={diaryEntries}
                encouragement={encouragement}
                briefing={briefing}
                viewRef={cardRef}
              />
            </View>

            {/* Action buttons */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.btnDisabled]}
                onPress={handleSaveToAlbum}
                disabled={saving}
              >
                <Text style={styles.saveBtnIcon}>📥</Text>
                <Text style={styles.saveBtnText}>{saving ? '保存中...' : '保存到相册'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.wechatBtn, saving && styles.btnDisabled]}
                onPress={handleShareToWechat}
                disabled={saving}
              >
                <Text style={styles.wechatBtnIcon}>💬</Text>
                <Text style={styles.wechatBtnText}>{saving ? '处理中...' : '分享到微信'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.tipText}>
              💡 点击"保存到相册"后，可以在微信中选择图片发送给家人
            </Text>
          </>
        ) : null}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },

  title: { fontSize: 18, fontWeight: '700', color: '#1A1A1A' },
  refreshBtn: { padding: 8 },
  refreshText: { fontSize: 20 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingEmoji: { fontSize: 64, marginBottom: 16 },
  loadingTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  loadingSub: { fontSize: 14, color: '#9B9B9B' },
  errorBox: { alignItems: 'center', padding: 32, backgroundColor: '#FEF2F2', borderRadius: 20 },
  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorText: { fontSize: 15, color: '#DC2626', textAlign: 'center', marginBottom: 16 },
  goCheckinBtn: { backgroundColor: '#6C9E6C', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
  goCheckinText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  previewHint: { alignItems: 'center', marginBottom: 12 },
  previewHintText: { fontSize: 13, color: '#9B9B9B' },
  cardWrapper: {
    borderRadius: 20, overflow: 'hidden', marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 8,
    borderWidth: 1, borderColor: '#F0F0EE',
  },
  actions: { gap: 12, marginBottom: 16 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#3B82F6', borderRadius: 20, padding: 16,
  },
  saveBtnIcon: { fontSize: 20 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  wechatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#07C160', borderRadius: 20, padding: 16,
  },
  wechatBtnIcon: { fontSize: 20 },
  wechatBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  btnDisabled: { opacity: 0.6 },
  tipText: { fontSize: 12, color: '#9B9B9B', textAlign: 'center', marginTop: 4 },
});
