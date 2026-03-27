import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Animated, Easing, Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { PageHeader, PAGE_THEMES } from '@/components/page-header';
import { getDiaryEntries, deleteDiaryEntry, DiaryEntry, getCurrentUserIsCreator } from '@/lib/storage';
import { JoinerLockedScreen } from '@/components/joiner-locked-screen';
import { COLORS, SHADOWS, RADIUS, fadeInUp, pressAnimation } from '@/lib/animations';
import { AppColors, Gradients } from '@/lib/design-tokens';
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

const CAREGIVER_MOOD_MAP: Record<string, { label: string; color: string }> = {
  '😊': { label: '挺好的', color: '#22C55E' },
  '😌': { label: '还行', color: '#84CC16' },
  '😕': { label: '有点累', color: '#F59E0B' },
  '😢': { label: '不太好', color: '#EF4444' },
  '😤': { label: '快撑不住了', color: '#DC2626' },
};

// ─── Diary Card ───────────────────────────────────────────────────────────────
function DiaryCard({ entry, onPress, onDelete, index, editMode }: {
  entry: DiaryEntry;
  onPress: () => void;
  onDelete: () => void;
  index: number;
  editMode: boolean;
}) {
  const mood = MOOD_OPTIONS.find(m => m.emoji === entry.moodEmoji) || MOOD_OPTIONS[2];
  const cgMood = entry.caregiverMoodEmoji ? CAREGIVER_MOOD_MAP[entry.caregiverMoodEmoji] : null;
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
  const deleteShake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 60, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: index * 60, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (editMode) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(deleteShake, { toValue: 1.5, duration: 80, useNativeDriver: true }),
          Animated.timing(deleteShake, { toValue: -1.5, duration: 80, useNativeDriver: true }),
          Animated.timing(deleteShake, { toValue: 0, duration: 80, useNativeDriver: true }),
        ]),
        { iterations: 3 }
      ).start();
    }
  }, [editMode]);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.diaryCard, editMode && styles.diaryCardEditMode]}
        onPress={() => !editMode && pressAnimation(scaleAnim, onPress)}
        activeOpacity={editMode ? 1 : 0.9}
      >
        <View style={styles.diaryCardHeader}>
          <View style={styles.diaryDateRow}>
            <Text style={styles.diaryDate}>{entry.date}</Text>
            {timeStr ? <Text style={styles.diaryTime}>{timeStr}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <View style={[styles.moodBadge, { backgroundColor: mood.color + '18' }]}>
              <Text style={styles.moodBadgeEmoji}>{entry.moodEmoji}</Text>
              <Text style={[styles.moodBadgeLabel, { color: mood.color }]}>{mood.label}</Text>
            </View>
            {cgMood && (
              <View style={[styles.moodBadge, { backgroundColor: AppColors.coral.soft }]}>
                <Text style={styles.moodBadgeEmoji}>{entry.caregiverMoodEmoji}</Text>
                <Text style={[styles.moodBadgeLabel, { color: cgMood.color }]}>我{cgMood.label}</Text>
              </View>
            )}
            {editMode && (
              <Animated.View style={{ transform: [{ translateX: deleteShake }] }}>
                <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} activeOpacity={0.8}>
                  <Text style={styles.deleteBtnText}>🗑️</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
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
              <Text style={styles.aiPreviewLabel}>小马虎护理回复</Text>
            </View>
            <Text style={styles.aiPreviewText} numberOfLines={2}>{aiPreview}</Text>
          </View>
        ) : null}

        {!editMode && (
          <View style={styles.tapHint}>
            <Text style={styles.tapHintText}>点击查看详情 →</Text>
          </View>
        )}
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

// ─── Calendar View ────────────────────────────────────────────────────────────
const WEEK_DAYS = ['日', '一', '二', '三', '四', '五', '六'];

function CalendarView({ entries, onOpenEntry }: { entries: DiaryEntry[]; onOpenEntry: (id: string) => void }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const entriesByDate = useMemo(() => {
    const m: Record<string, DiaryEntry[]> = {};
    entries.forEach(e => {
      const d = new Date(e.createdAt);
      if (!isNaN(d.getTime())) {
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        if (!m[key]) m[key] = [];
        m[key].push(e);
      }
    });
    return m;
  }, [entries]);

  const entryDatesSet = useMemo(() => new Set(Object.keys(entriesByDate)), [entriesByDate]);

  const dateMoodEmoji = useMemo(() => {
    const m: Record<string, string> = {};
    Object.entries(entriesByDate).forEach(([key, es]) => {
      if (es.length > 0 && es[0].moodEmoji) {
        m[key] = es[0].moodEmoji;
      }
    });
    return m;
  }, [entriesByDate]);

  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isAtMax = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  function goMonth(delta: number) {
    let m = viewMonth + delta, y = viewYear;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setViewMonth(m); setViewYear(y); setSelectedDate(null);
  }

  function dayKey(day: number) {
    return `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }

  function handleDayPress(day: number) {
    const key = dayKey(day);
    if (!entryDatesSet.has(key)) return;
    setSelectedDate(prev => prev === key ? null : key);
  }

  return (
    <View style={calStyles.root}>
      <View style={calStyles.navRow}>
        <TouchableOpacity onPress={() => goMonth(-1)} style={calStyles.navBtn}>
          <Text style={calStyles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={calStyles.monthLabel}>{viewYear}年{viewMonth + 1}月</Text>
        <TouchableOpacity onPress={() => goMonth(1)} style={calStyles.navBtn} disabled={isAtMax}>
          <Text style={[calStyles.navArrow, isAtMax && { color: AppColors.border.soft }]}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={calStyles.weekRow}>
        {WEEK_DAYS.map(d => <Text key={d} style={calStyles.weekDay}>{d}</Text>)}
      </View>

      <View style={calStyles.grid}>
        {cells.map((day, idx) => {
          if (!day) return <View key={`e${idx}`} style={calStyles.cell} />;
          const key = dayKey(day);
          const hasEntry = entryDatesSet.has(key);
          const isToday = key === todayKey;
          const isSel = selectedDate === key;
          return (
            <TouchableOpacity key={key} style={calStyles.cell} onPress={() => handleDayPress(day)} activeOpacity={hasEntry ? 0.7 : 1}>
              <View style={[calStyles.dayCircle, isToday && calStyles.dayToday, isSel && calStyles.daySelected, hasEntry && !isToday && !isSel && calStyles.dayHasEntry]}>
                <Text style={[calStyles.dayText, isToday && calStyles.dayTextToday, isSel && calStyles.dayTextSelected]}>{day}</Text>
              </View>
              {hasEntry && dateMoodEmoji[key] ? (
                <Text style={calStyles.dayMoodEmoji}>{dateMoodEmoji[key]}</Text>
              ) : hasEntry ? (
                <View style={[calStyles.dot, isSel && { backgroundColor: AppColors.surface.whiteStrong }]} />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {selectedDate && entriesByDate[selectedDate] && (
        <View style={calStyles.selectedSection}>
          <Text style={calStyles.selectedLabel}>{selectedDate.replace(/-/g, '年').replace(/年(\d+)年/, '年$1月').replace(/月(\d+)$/, '月$1日')} 的日记</Text>
          {entriesByDate[selectedDate].map(e => {
            const cg = e.caregiverMoodEmoji ? CAREGIVER_MOOD_MAP[e.caregiverMoodEmoji] : null;
            return (
              <TouchableOpacity key={e.id} style={calStyles.miniCard} onPress={() => onOpenEntry(e.id)} activeOpacity={0.8}>
                <Text style={calStyles.miniMood}>{e.moodEmoji || '📔'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={calStyles.miniContent} numberOfLines={2}>{e.content}</Text>
                  {cg && (
                    <Text style={calStyles.miniCaregiverMood}>我的心情：{e.caregiverMoodEmoji} {cg.label}</Text>
                  )}
                </View>
                <Text style={{ fontSize: 12, color: AppColors.text.tertiary }}>›</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
function DiaryScreenContent() {
  const router = useRouter();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; date: string } | null>(null);
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;
  const fabScale = useRef(new Animated.Value(1)).current;
  const fabBreath = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fadeInUp(headerFade, headerSlide, { duration: 500 });
    Animated.loop(
      Animated.sequence([
        Animated.timing(fabBreath, { toValue: 1.08, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(fabBreath, { toValue: 1.0, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useFocusEffect(useCallback(() => {
    loadEntries();
    setEditMode(false);
  }, []));

  async function loadEntries() {
    const e = await getDiaryEntries();
    setEntries(e.slice(0, 30));
  }

  function openDetail(entryId: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/diary-edit', params: { id: entryId } } as any);
  }

  function openNewEntry() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: '/diary-edit' } as any);
  }

  function confirmDelete(entryId: string, entryDate: string) {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleteTarget({ id: entryId, date: entryDate });
  }

  async function executeDelete() {
    if (!deleteTarget) return;
    await deleteDiaryEntry(deleteTarget.id);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDeleteTarget(null);
    const updated = await getDiaryEntries();
    const next = updated.slice(0, 30);
    setEntries(next);
    if (next.length === 0) setEditMode(false);
  }

  return (
    <ScreenContainer containerClassName="bg-[#F7F1F3]">
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View style={{ opacity: headerFade, transform: [{ translateY: headerSlide }] }}>
          <PageHeader
            theme={PAGE_THEMES.diary}
            subtitle={new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}
            style={{ marginBottom: 12 }}
          />
          <View style={styles.headerBtns}>
            {entries.length > 0 && (
              <TouchableOpacity
                style={[styles.manageBtn, editMode && styles.manageBtnActive]}
                onPress={() => setEditMode(v => !v)}
                activeOpacity={0.8}
              >
                <Text style={[styles.manageBtnText, editMode && styles.manageBtnTextActive]}>
                  {editMode ? '✓ 完成' : '管理'}
                </Text>
              </TouchableOpacity>
            )}
            {!editMode && (
              <Animated.View style={{ transform: [{ scale: fabScale }] }}>
                <TouchableOpacity
                  style={styles.writeBtn}
                  onPress={() => pressAnimation(fabScale, openNewEntry)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.writeBtnText}>✏️ 写日记</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        </Animated.View>

        {/* Edit mode hint */}
        {editMode && (
          <View style={styles.editHintRow}>
            <Text style={styles.editHintText}>🗑️ 点击日记右侧的删除按钮来删除日记</Text>
          </View>
        )}

        {/* Entry list or empty state */}
        {entries.length === 0 ? (
          <EmptyState onStart={openNewEntry} />
        ) : (
          <>
            <View style={styles.selfCareBanner}>
              <Text style={styles.selfCareEmoji}>💕</Text>
              <Text style={styles.selfCareText}>照顾好自己，才能更好地照顾家人 ❤️</Text>
            </View>

            {/* ── 日记列表 ── */}
            <View style={styles.entriesList}>
              <View style={styles.listTitleRow}>
                <Text style={styles.listTitle}>{editMode ? '🗑️ 选择要删除的日记' : '📅 最近记录'}</Text>
                <Text style={styles.listCount}>共 {entries.length} 篇</Text>
              </View>
              {(editMode ? entries : entries.slice(0, 7)).map((entry, i) => (
                <DiaryCard
                  key={entry.id}
                  entry={entry}
                  onPress={() => openDetail(entry.id)}
                  onDelete={() => confirmDelete(entry.id, entry.date)}
                  index={i}
                  editMode={editMode}
                />
              ))}
            </View>

            {/* ── 日历回顾 ── */}
            {!editMode && (
              <View style={{ marginTop: 24 }}>
                <View style={styles.listTitleRow}>
                  <Text style={styles.listTitle}>🗓️ 日历回顾</Text>
                  <Text style={styles.listCount}>点击有记录的日期</Text>
                </View>
                <CalendarView entries={entries} onOpenEntry={openDetail} />
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* FAB */}
      {entries.length > 0 && !editMode && (
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

      {/* Custom delete confirmation modal */}
      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalIcon}>🗑️</Text>
            <Text style={styles.modalTitle}>删除日记</Text>
            <Text style={styles.modalMsg}>
              确定要删除 {deleteTarget?.date} 的日记吗？{'\n'}删除后无法恢复。
            </Text>
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setDeleteTarget(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalDeleteBtn}
                onPress={executeDelete}
                activeOpacity={0.8}
              >
                <Text style={styles.modalDeleteText}>删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  headerBtns: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 16 },
  manageBtn: {
    borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1.5, borderColor: AppColors.border.soft, backgroundColor: AppColors.bg.secondary,
  },
  manageBtnActive: { borderColor: AppColors.status.error, backgroundColor: '#FEF2F2' },
  manageBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  manageBtnTextActive: { color: '#DC2626' },
  writeBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.pill,
    paddingHorizontal: 18, paddingVertical: 10,
    ...SHADOWS.glow(COLORS.primary),
  },
  writeBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Edit mode hint
  editHintRow: {
    backgroundColor: '#FEF2F2', borderRadius: RADIUS.md,
    padding: 10, marginBottom: 12,
    borderWidth: 1, borderColor: '#FECACA',
  },
  editHintText: { fontSize: 13, color: '#B91C1C', textAlign: 'center', fontWeight: '500' },

  selfCareBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: AppColors.coral.soft, borderRadius: RADIUS.lg,
    padding: 12, marginBottom: 14,
    borderWidth: 1, borderColor: AppColors.coral.primary + '30',
  },
  selfCareEmoji: { fontSize: 18 },
  selfCareText: { fontSize: 13, color: AppColors.coral.primary, fontWeight: '600', flex: 1 },

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
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: RADIUS.lg,
    padding: 16, ...SHADOWS.md,
  },
  diaryCardEditMode: {
    borderWidth: 1.5, borderColor: '#FECACA',
    backgroundColor: '#FFFAFA',
  },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#FECACA',
  },
  deleteBtnText: { fontSize: 16 },
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
    backgroundColor: AppColors.bg.secondary, borderRadius: RADIUS.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  tagText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  diaryContent: { fontSize: 14, color: COLORS.text, lineHeight: 20, marginBottom: 8 },
  aiPreviewBox: {
    backgroundColor: AppColors.purple.soft, borderRadius: 10, padding: 10, marginTop: 4,
  },
  aiPreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  aiPreviewIcon: { fontSize: 13 },
  aiPreviewLabel: { fontSize: 12, fontWeight: '600', color: AppColors.purple.strong },
  aiPreviewText: { fontSize: 13, color: AppColors.text.primary, lineHeight: 18 },
  tapHint: { alignItems: 'flex-end', marginTop: 8 },
  tapHintText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },

  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 60, paddingBottom: 40 },
  emptyEmojiCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: AppColors.peach.soft, alignItems: 'center', justifyContent: 'center',
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

  // Delete confirmation modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalBox: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 20,
    padding: 28, width: 300, alignItems: 'center',
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
  },
  modalIcon: { fontSize: 36, marginBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: AppColors.text.primary, marginBottom: 10 },
  modalMsg: { fontSize: 14, color: AppColors.text.secondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  modalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: AppColors.bg.secondary, alignItems: 'center',
    borderWidth: 1, borderColor: AppColors.border.soft,
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: AppColors.text.secondary },
  modalDeleteBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: AppColors.status.error, alignItems: 'center',
  },
  modalDeleteText: { fontSize: 15, fontWeight: '700', color: AppColors.surface.whiteStrong },
});

const calStyles = StyleSheet.create({
  root: { backgroundColor: AppColors.surface.whiteStrong, borderRadius: 18, padding: 16, ...SHADOWS.md, marginTop: 4 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: AppColors.bg.secondary },
  navArrow: { fontSize: 22, fontWeight: '700', color: AppColors.text.primary, lineHeight: 28 },
  monthLabel: { fontSize: 15, fontWeight: '800', color: AppColors.text.primary, letterSpacing: -0.2 },
  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: AppColors.text.tertiary },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '14.285714%', alignItems: 'center', paddingVertical: 4 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dayHasEntry: { backgroundColor: AppColors.green.soft },
  dayToday: { backgroundColor: AppColors.green.muted },
  daySelected: { backgroundColor: AppColors.text.primary },
  dayText: { fontSize: 13, fontWeight: '500', color: AppColors.text.primary },
  dayTextToday: { color: AppColors.surface.whiteStrong, fontWeight: '800' },
  dayTextSelected: { color: AppColors.surface.whiteStrong, fontWeight: '800' },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: AppColors.green.muted, marginTop: 2 },
  dayMoodEmoji: { fontSize: 10, marginTop: 1, lineHeight: 12 },
  selectedSection: { marginTop: 14, borderTopWidth: 1, borderTopColor: AppColors.border.soft, paddingTop: 12, gap: 8 },
  selectedLabel: { fontSize: 13, fontWeight: '700', color: AppColors.text.primary, marginBottom: 4 },
  miniCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: AppColors.bg.secondary, borderRadius: 12, padding: 10 },
  miniMood: { fontSize: 22 },
  miniContent: { fontSize: 13, color: AppColors.text.primary, lineHeight: 18 },
  miniCaregiverMood: { fontSize: 11, color: AppColors.text.tertiary, marginTop: 3 },
});

export default function DiaryScreen() {
  const [isCreator, setIsCreator] = useState<boolean | null>(null);
  useFocusEffect(useCallback(() => { getCurrentUserIsCreator().then(v => setIsCreator(v)); }, []));
  if (isCreator === null) return null;
  if (!isCreator) return (
    <JoinerLockedScreen
      icon="📔"
      title="护理日记"
      description="记录家人护理日记是主要照顾者的专属功能。"
    />
  );
  return <DiaryScreenContent />;
}
