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
  getProfile, getUserProfile, getFamilyProfile,
  getTodayCheckIn, getYesterdayCheckIn,
  getMedications, getDiaryEntries,
  type DailyCheckIn, type ElderProfile, type Medication, type DiaryEntry,
} from '@/lib/storage';
import { useFamilyContext } from '@/lib/family-context';
import { trpc } from '@/lib/trpc';
import { AppColors, Gradients } from '@/lib/design-tokens';
import * as Haptics from 'expo-haptics';

const SW = Dimensions.get('window').width;

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
  const elderName = profile.nickname || profile.name || '家人';
  const caregiverName = profile.caregiverName || '照顾者';
  const zodiacEmoji = profile.zodiacEmoji || '🐯';
  const sleepLabel = checkIn.sleepQuality === 'good' ? '良好 😴' : checkIn.sleepQuality === 'fair' ? '一般 😐' : '较差 😟';
  const medLabel = checkIn.medicationTaken ? '已按时服药 ✅' : '未按时服药 ❌';

  const todayDiaries = diaryEntries.filter(d => d.date === checkIn.date).slice(0, 3);
  const activeMeds = medications.filter(m => m.active).slice(0, 5);

  return (
    <View ref={viewRef as any} style={imgStyles.card} collapsable={false}>
      <View style={imgStyles.topBar}>
        <View style={imgStyles.topBarInner}>
          <Text style={imgStyles.topBarEmoji}>🐴🐯</Text>
          <Text style={imgStyles.topBarTitle}>小马虎 · 每日护理简报</Text>
        </View>
      </View>

      <View style={imgStyles.dateSection}>
        <Text style={imgStyles.dateText}>{dateStr}</Text>
        <View style={imgStyles.elderRow}>
          <View style={imgStyles.elderAvatar}>
            <Text style={imgStyles.elderAvatarEmoji}>{zodiacEmoji}</Text>
          </View>
          <View style={imgStyles.elderInfo}>
            <Text style={imgStyles.elderName}>{elderName}</Text>
            <Text style={imgStyles.elderSub}>记录人：{caregiverName}</Text>
          </View>
        </View>
      </View>

      <View style={imgStyles.divider} />

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
        <View style={[imgStyles.dataCard, { backgroundColor: AppColors.coral.soft }]}>
          <Text style={imgStyles.dataIcon}>🍽️</Text>
          <Text style={imgStyles.dataLabel}>饮食</Text>
          <Text style={imgStyles.dataValue}>{checkIn.mealNotes ? (checkIn.mealNotes.length > 8 ? checkIn.mealNotes.slice(0, 8) + '…' : checkIn.mealNotes) : '已记录'}</Text>
          <Text style={imgStyles.dataSub}>饮食情况</Text>
        </View>
      </View>

      {checkIn.morningNotes ? (
        <View style={imgStyles.notesBox}>
          <Text style={imgStyles.notesIcon}>🌅</Text>
          <View style={imgStyles.notesContent}>
            <Text style={imgStyles.notesTitle}>早上记录</Text>
            <Text style={imgStyles.notesText}>{checkIn.morningNotes}</Text>
          </View>
        </View>
      ) : null}

      {checkIn.eveningNotes ? (
        <View style={imgStyles.notesBox}>
          <Text style={imgStyles.notesIcon}>🌙</Text>
          <View style={imgStyles.notesContent}>
            <Text style={imgStyles.notesTitle}>晚上记录</Text>
            <Text style={imgStyles.notesText}>{checkIn.eveningNotes}</Text>
          </View>
        </View>
      ) : null}

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

      {briefing?.summary && (
        <>
          <View style={imgStyles.divider} />
          <Text style={imgStyles.sectionTitle}>📋 智能状态总结</Text>
          <View style={imgStyles.aiBox}>
            <Text style={imgStyles.aiText}>{briefing.summary}</Text>
          </View>
        </>
      )}

      <View style={imgStyles.divider} />
      <View style={imgStyles.encourageBox}>
        <Text style={imgStyles.encourageIcon}>💪</Text>
        <Text style={imgStyles.encourageTitle}>今日小结</Text>
        <Text style={imgStyles.encourageText}>{encouragement}</Text>
      </View>

      <View style={imgStyles.footer}>
        <View style={imgStyles.footerDivider} />
        <Text style={imgStyles.footerText}>小马虎 · 家庭照护助手</Text>
        <Text style={imgStyles.footerSub}>{dateStr} {timeStr} · 小马虎生成</Text>
      </View>
    </View>
  );
}

const imgStyles = StyleSheet.create({
  card: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 0, padding: 24, width: SW - 40,
  },
  topBar: {
    backgroundColor: AppColors.green.muted, borderRadius: 16, padding: 14, marginBottom: 20,
  },
  topBarInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  topBarEmoji: { fontSize: 20 },
  topBarTitle: { fontSize: 16, fontWeight: '800', color: AppColors.surface.whiteStrong, letterSpacing: 1 },
  dateSection: { marginBottom: 16 },
  dateText: { fontSize: 14, color: AppColors.text.tertiary, marginBottom: 12 },
  elderRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  elderAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: AppColors.coral.soft, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFD4D4',
  },
  elderAvatarEmoji: { fontSize: 28 },
  elderInfo: {},
  elderName: { fontSize: 22, fontWeight: '800', color: AppColors.text.primary },
  elderSub: { fontSize: 13, color: AppColors.text.tertiary, marginTop: 2 },
  scoreSection: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  scoreBadge: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 16,
    borderWidth: 1.5, alignItems: 'center',
  },
  scoreNum: { fontSize: 32, fontWeight: '900' },
  scoreLabel: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  scoreSuffix: { fontSize: 14, color: AppColors.text.tertiary },
  divider: { height: 1, backgroundColor: AppColors.border.soft, marginVertical: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: AppColors.text.primary, marginBottom: 12 },
  dataGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  dataCard: {
    flex: 1, borderRadius: 16, padding: 14, alignItems: 'center', gap: 4,
  },
  dataIcon: { fontSize: 24 },
  dataLabel: { fontSize: 11, color: AppColors.text.tertiary, fontWeight: '500' },
  dataValue: { fontSize: 15, fontWeight: '800', color: AppColors.text.primary },
  dataSub: { fontSize: 11, color: AppColors.text.secondary },
  notesBox: {
    flexDirection: 'row', gap: 10, backgroundColor: AppColors.bg.secondary,
    borderRadius: 14, padding: 14, marginTop: 8,
  },
  notesIcon: { fontSize: 18, marginTop: 2 },
  notesContent: { flex: 1 },
  notesTitle: { fontSize: 13, fontWeight: '700', color: AppColors.text.primary, marginBottom: 4 },
  notesText: { fontSize: 13, color: AppColors.text.secondary, lineHeight: 20 },
  medRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: AppColors.border.soft,
  },
  medIcon: { fontSize: 20 },
  medInfo: { flex: 1 },
  medName: { fontSize: 14, fontWeight: '700', color: AppColors.text.primary },
  medDetail: { fontSize: 12, color: AppColors.text.tertiary, marginTop: 1 },
  medTime: { fontSize: 12, color: AppColors.green.muted, fontWeight: '600' },
  diaryBox: {
    backgroundColor: AppColors.bg.secondary, borderRadius: 14, padding: 14, marginBottom: 8,
  },
  diaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  diaryMood: { fontSize: 20 },
  diaryMoodLabel: { fontSize: 13, fontWeight: '600', color: AppColors.text.primary },
  diaryTag: { backgroundColor: AppColors.green.soft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  diaryTagText: { fontSize: 11, color: '#2E7D32' },
  diaryContent: { fontSize: 13, color: AppColors.text.secondary, lineHeight: 20 },
  aiBox: { backgroundColor: AppColors.green.soft, borderRadius: 14, padding: 14 },
  aiText: { fontSize: 14, color: AppColors.text.primary, lineHeight: 22 },
  encourageBox: {
    backgroundColor: AppColors.peach.soft, borderRadius: 18, padding: 18,
    alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: AppColors.peach.primary + '40',
  },
  encourageIcon: { fontSize: 32 },
  encourageTitle: { fontSize: 15, fontWeight: '800', color: AppColors.coral.primary },
  encourageText: { fontSize: 15, color: AppColors.text.primary, lineHeight: 24, textAlign: 'center', fontWeight: '600' },
  footer: { alignItems: 'center', marginTop: 16, gap: 6 },
  footerDivider: { width: 40, height: 2, backgroundColor: AppColors.green.muted, borderRadius: 1, marginBottom: 4 },
  footerText: { fontSize: 13, fontWeight: '700', color: AppColors.green.muted },
  footerSub: { fontSize: 11, color: AppColors.text.tertiary },
});

export default function ExportImageScreen() {
  const { activeMembership } = useFamilyContext();
  const familyId = activeMembership?.familyId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<ElderProfile | null>(null);
  const [checkIn, setCheckIn] = useState<DailyCheckIn | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [encouragement, setEncouragement] = useState('今日照护记录已整理完毕');
  const [briefing, setBriefing] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const cardRef = useRef<View | null>(null);

  const generateBriefingMutation = trpc.ai.generateBriefing.useMutation();

  useFocusEffect(useCallback(() => { loadData(); }, [familyId]));

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // 称谓：family-scoped 优先，降级到 legacy profile
      const [userProfile, familyProfile, legacyProfile] = await Promise.all([
        getUserProfile(),
        getFamilyProfile(familyId),
        getProfile(),
      ]);
      const nickname = familyProfile?.nickname || familyProfile?.name
        || legacyProfile?.nickname || legacyProfile?.name || '家人';
      const caregiver = userProfile?.caregiverName || legacyProfile?.caregiverName || '照顾者';
      // 将 family-scoped 称谓合并到 profile 对象，传给 LongImageCard
      const mergedProfile: ElderProfile = {
        ...(legacyProfile ?? {} as ElderProfile),
        nickname,
        name: familyProfile?.name || legacyProfile?.name || '家人',
        caregiverName: caregiver,
        zodiacEmoji: familyProfile?.zodiacEmoji || legacyProfile?.zodiacEmoji || '🐯',
      };
      setProfile(mergedProfile);
      // 打卡/用药/日记：显式传 familyId
      const today = await getTodayCheckIn(familyId);
      const yesterday = await getYesterdayCheckIn(familyId);
      const ci = today || yesterday;
      if (!ci) {
        setError('请先完成今日打卡，再导出简报');
        setLoading(false);
        return;
      }
      setCheckIn(ci);
      const meds = await getMedications(familyId);
      setMedications(meds);
      const diaries = await getDiaryEntries(familyId);
      setDiaryEntries(diaries);
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
        });
        if (result.success && result.briefing) {
          setBriefing(result.briefing);
          if (result.briefing.suggestion) {
            setEncouragement(result.briefing.suggestion);
          } else if (result.briefing.summary) {
            setEncouragement(result.briefing.summary);
          }
        }
      } catch {
        setEncouragement('当前整体状态已整理，详情请查看打卡记录');
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
      const ViewShot = require('react-native-view-shot');
      const uri = await ViewShot.captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = uri;
        link.download = `小马虎_${checkIn?.date || 'daily'}_简报.png`;
        link.click();
        Alert.alert('保存成功', '图片已下载');
      } else {
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
          <Text style={styles.loadingSub}>智能助手正在为您准备精美简报</Text>
          <ActivityIndicator color={AppColors.green.muted} size="large" style={{ marginTop: 20 }} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer containerClassName="bg-background">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
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
            <View style={styles.previewHint}>
              <Text style={styles.previewHintText}>👇 预览长图（可滚动查看）</Text>
            </View>

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

  title: { fontSize: 18, fontWeight: '700', color: AppColors.text.primary },
  refreshBtn: { padding: 8 },
  refreshText: { fontSize: 20 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  loadingEmoji: { fontSize: 64, marginBottom: 16 },
  loadingTitle: { fontSize: 20, fontWeight: '700', color: AppColors.text.primary, marginBottom: 8 },
  loadingSub: { fontSize: 14, color: AppColors.text.tertiary },
  errorBox: { alignItems: 'center', padding: 32, backgroundColor: '#FEF2F2', borderRadius: 20 },
  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorText: { fontSize: 15, color: '#DC2626', textAlign: 'center', marginBottom: 16 },
  goCheckinBtn: { backgroundColor: AppColors.green.muted, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
  goCheckinText: { fontSize: 15, fontWeight: '700', color: AppColors.surface.whiteStrong },
  previewHint: { alignItems: 'center', marginBottom: 12 },
  previewHintText: { fontSize: 13, color: AppColors.text.tertiary },
  cardWrapper: {
    borderRadius: 20, overflow: 'hidden', marginBottom: 20,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 8,
    borderWidth: 1, borderColor: AppColors.border.soft,
  },
  actions: { gap: 12, marginBottom: 16 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#3B82F6', borderRadius: 20, padding: 16,
  },
  saveBtnIcon: { fontSize: 20 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: AppColors.surface.whiteStrong },
  wechatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#07C160', borderRadius: 20, padding: 16,
  },
  wechatBtnIcon: { fontSize: 20 },
  wechatBtnText: { fontSize: 16, fontWeight: '700', color: AppColors.surface.whiteStrong },
  btnDisabled: { opacity: 0.6 },
  tipText: { fontSize: 12, color: AppColors.text.tertiary, textAlign: 'center', marginTop: 4 },
});
