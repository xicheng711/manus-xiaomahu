import { useRef, useEffect, useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Animated, Easing,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { getDiaryEntries, DiaryEntry } from '@/lib/storage';
import { COLORS, SHADOWS, RADIUS, fadeInUp, pressAnimation } from '@/lib/animations';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const MOOD_OPTIONS = [
  { emoji: '😄', label: '很开心', color: '#22C55E' },
  { emoji: '😊', label: '还不错', color: '#84CC16' },
  { emoji: '😌', label: '平静', color: COLORS.textSecondary },
  { emoji: '😕', label: '有点累', color: '#F59E0B' },
  { emoji: '😢', label: '不太好', color: '#EF4444' },
  { emoji: '😤', label: '烦躁', color: '#DC2626' },
];

// ─── Diary Card ───────────────────────────────────────────────────────────────
function DiaryCard({ entry, onPress, index }: { entry: DiaryEntry; onPress: () => void; index: number }) {
  const mood = MOOD_OPTIONS.find(m => m.emoji === entry.moodEmoji) || MOOD_OPTIONS[2];
  const hasAiReply = !!entry.aiReply;
  const aiPreview = entry.aiReply
    ? entry.aiReply.length > 60 ? entry.aiReply.slice(0, 60) + '...' : entry.aiReply
    : null;
  const timeStr = entry.createdAt
    ? new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '';

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 60, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: index * 60, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.diaryCard}
        onPress={() => pressAnimation(scaleAnim, onPress)}
        activeOpacity={0.9}
      >
        <View style={styles.diaryCardHeader}>
          <View style={styles.diaryDateRow}>
            <Text style={styles.diaryDate}>{entry.date}</Text>
            {timeStr ? <Text style={styles.diaryTime}>{timeStr}</Text> : null}
          </View>
          <View style={[styles.moodBadge, { backgroundColor: mood.color + '18' }]}>
            <Text style={styles.moodBadgeEmoji}>{entry.moodEmoji}</Text>
            <Text style={[styles.moodBadgeLabel, { color: mood.color }]}>{mood.label}</Text>
          </View>
        </View>

        {entry.tags && entry.tags.length > 0 && (
          <View style={styles.tagRow}>
            {entry.tags.slice(0, 4).map((tag, i) => (
              <View key={i} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
            {entry.tags.length > 4 && (
              <View style={styles.tag}><Text style={styles.tagText}>+{entry.tags.length - 4}</Text></View>
            )}
          </View>
        )}

        {entry.content ? (
          <Text style={styles.diaryContent} numberOfLines={2}>{entry.content}</Text>
        ) : null}

        {hasAiReply ? (
          <View style={styles.aiPreviewBox}>
            <View style={styles.aiPreviewHeader}>
              <Text style={styles.aiPreviewIcon}>🩺</Text>
              <Text style={styles.aiPreviewLabel}>AI 护理顾问回复</Text>
            </View>
            <Text style={styles.aiPreviewText} numberOfLines={2}>{aiPreview}</Text>
          </View>
        ) : null}

        <View style={styles.tapHint}>
          <Text style={styles.tapHintText}>点击查看详情 →</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyState({ onStart }: { onStart: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fadeInUp(fadeAnim, slideAnim, { duration: 600 });
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.emptyState, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Animated.View style={[styles.emptyEmojiCircle, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={styles.emptyEmoji}>📖</Text>
      </Animated.View>
      <Text style={styles.emptyTitle}>还没有日记</Text>
      <Text style={styles.emptyText}>每天记录一点点，{'\n'}积累成最珍贵的回忆</Text>
      <Animated.View style={{ transform: [{ scale: btnScale }] }}>
        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => pressAnimation(btnScale, onStart)}
          activeOpacity={0.85}
        >
          <Text style={styles.startBtnText}>开始第一篇日记 ✏️</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function DiaryScreen() {
  const router = useRouter();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;
  const fabScale = useRef(new Animated.Value(1)).current;
  const fabBreath = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fadeInUp(headerFade, headerSlide, { duration: 500 });
    // Breathing animation for FAB
    Animated.loop(
      Animated.sequence([
        Animated.timing(fabBreath, { toValue: 1.08, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(fabBreath, { toValue: 1.0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useFocusEffect(useCallback(() => {
    loadEntries();
  }, []));

  async function loadEntries() {
    const e = await getDiaryEntries();
    setEntries(e.slice(0, 30));
  }

  function openDetail(entryId: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Open unified diary session page (restores full conversation history)
    router.push({ pathname: '/diary-edit', params: { id: entryId } } as any);
  }

  function openNewEntry() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/diary-edit' } as any);
  }

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
          <View>
            <Text style={styles.title}>护理日记</Text>
            <Text style={styles.subtitle}>
              {new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}
            </Text>
          </View>
          <Animated.View style={{ transform: [{ scale: fabScale }] }}>
            <TouchableOpacity
              style={styles.writeBtn}
              onPress={() => pressAnimation(fabScale, openNewEntry)}
              activeOpacity={0.85}
            >
              <Text style={styles.writeBtnText}>✏️ 写日记</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        {/* Entry list or empty state */}
        {entries.length === 0 ? (
          <EmptyState onStart={openNewEntry} />
        ) : (
          <View style={styles.entriesList}>
            <View style={styles.listTitleRow}>
              <Text style={styles.listTitle}>📅 最近记录</Text>
              <Text style={styles.listCount}>{entries.length} 篇</Text>
            </View>
            {entries.map((entry, i) => (
              <DiaryCard key={entry.id} entry={entry} onPress={() => openDetail(entry.id)} index={i} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* FAB -- floating action button */}
      {entries.length > 0 && (
        <Animated.View style={[styles.fab, { transform: [{ scale: fabBreath }] }]}>
          <TouchableOpacity
            style={styles.fabBtn}
            onPress={() => pressAnimation(fabScale, openNewEntry)}
            activeOpacity={0.85}
          >
            <Text style={styles.fabIcon}>✏️</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 100 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  writeBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.pill,
    paddingHorizontal: 18, paddingVertical: 10,
    ...SHADOWS.glow(COLORS.primary),
  },
  writeBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Entry list
  entriesList: { gap: 12 },
  listTitleRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  listTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  listCount: { fontSize: 13, color: COLORS.textSecondary },

  // Diary card
  diaryCard: {
    backgroundColor: '#FFFFFF', borderRadius: RADIUS.lg,
    padding: 16, ...SHADOWS.md,
  },
  diaryCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  diaryDateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  diaryDate: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  diaryTime: { fontSize: 12, color: COLORS.textSecondary },
  moodBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill,
  },
  moodBadgeEmoji: { fontSize: 14 },
  moodBadgeLabel: { fontSize: 12, fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tag: {
    backgroundColor: '#F3F4F6', borderRadius: RADIUS.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  tagText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  diaryContent: { fontSize: 14, color: COLORS.text, lineHeight: 20, marginBottom: 8 },
  aiPreviewBox: {
    backgroundColor: '#F0F7FF', borderRadius: 10, padding: 10, marginTop: 4,
  },
  aiPreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  aiPreviewIcon: { fontSize: 13 },
  aiPreviewLabel: { fontSize: 12, fontWeight: '600', color: '#3B82F6' },
  aiPreviewText: { fontSize: 13, color: '#374151', lineHeight: 18 },
  tapHint: { alignItems: 'flex-end', marginTop: 8 },
  tapHintText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyEmojiCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#FFF3E0', alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  emptyEmoji: { fontSize: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  startBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.pill,
    paddingHorizontal: 28, paddingVertical: 14,
    ...SHADOWS.glow(COLORS.primary),
  },
  startBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // FAB
  fab: {
    position: 'absolute', bottom: 28, right: 24,
  },
  fabBtn: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabIcon: { fontSize: 24 },
});
