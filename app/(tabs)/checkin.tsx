import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Animated, Platform, Easing, Dimensions, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { JoinerLockedScreen } from '@/components/joiner-locked-screen';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenContainer } from '@/components/screen-container';
import { PageHeader, PAGE_THEMES } from '@/components/page-header';
import { upsertCheckIn, getTodayCheckIn, getAllCheckIns, getProfile, DailyCheckIn, SleepInput, CareBriefing, todayStr, getCurrentUserIsCreator, getBriefingByDate } from '@/lib/storage';
import { scoreSleepInput } from '@/lib/sleep-scoring';
import { COLORS, SHADOWS, RADIUS, fadeInUp, pressAnimation } from '@/lib/animations';
import { AppColors, Gradients } from '@/lib/design-tokens';
import * as Haptics from 'expo-haptics';
import ConfettiCannon from 'react-native-confetti-cannon';

const { width } = Dimensions.get('window');

// ─── Scroll Picker ───────────────────────────────────────────────────────────
function ScrollPicker({ items, selectedIndex, onSelect, itemHeight = 52 }: {
  items: string[]; selectedIndex: number; onSelect: (i: number) => void; itemHeight?: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const VISIBLE = 5;
  const containerHeight = itemHeight * VISIBLE;
  const paddingItems = Math.floor(VISIBLE / 2);
  const paddedItems = [...Array(paddingItems).fill(''), ...items, ...Array(paddingItems).fill('')];
  const didInitialScroll = useRef(false);

  const handleScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / itemHeight);
    if (idx >= 0 && idx < items.length) onSelect(idx);
  };

  React.useEffect(() => {
    if (!didInitialScroll.current && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ y: selectedIndex * itemHeight, animated: false });
      }, 50);
      didInitialScroll.current = true;
    }
  }, [selectedIndex]);

  return (
    <View style={[styles.pickerWrap, { height: containerHeight }]}>
      <View style={[styles.pickerHighlight, { top: itemHeight * paddingItems, height: itemHeight }]} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScroll}
        nestedScrollEnabled
        contentOffset={{ x: 0, y: selectedIndex * itemHeight }}
      >
        {paddedItems.map((item, index) => {
          const realIdx = index - paddingItems;
          const isSelected = realIdx === selectedIndex;
          return (
            <View key={index} style={[styles.pickerItem, { height: itemHeight }]}>
              <Text style={[styles.pickerText, isSelected && styles.pickerTextSelected]}>{item}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Animated Option Card ────────────────────────────────────────────────────
function OptionCard({ label, icon, selected, onPress }: {
  label: string; icon: string; selected: boolean; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const bgAnim = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(bgAnim, { toValue: selected ? 1 : 0, speed: 14, bounciness: 4, useNativeDriver: false }).start();
  }, [selected]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 80, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 20, bounciness: 10, useNativeDriver: true }),
    ]).start();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Animated.View style={{ transform: [{ scale }], flex: 1 }}>
      <TouchableOpacity
        style={[styles.optionCard, selected && styles.optionCardSelected]}
        onPress={handlePress}
        activeOpacity={0.9}
      >
        <Text style={styles.optionIcon}>{icon}</Text>
        <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
        {selected && (
          <View style={styles.optionCheckCircle}>
            <Text style={styles.optionCheck}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Animated Mood Card ──────────────────────────────────────────────────────
function MoodCard({ emoji, label, selected, onPress }: {
  emoji: string; label: string; selected: boolean; onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const emojiScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (selected) {
      Animated.sequence([
        Animated.timing(emojiScale, { toValue: 1.3, duration: 150, useNativeDriver: true }),
        Animated.spring(emojiScale, { toValue: 1.1, speed: 12, bounciness: 10, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.timing(emojiScale, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [selected]);

  return (
    <Animated.View style={{ transform: [{ scale }], width: (width - 80) / 3 }}>
      <TouchableOpacity
        style={[styles.moodCard, selected && styles.moodCardSelected]}
        onPress={() => pressAnimation(scale, onPress)}
        activeOpacity={0.85}
      >
        <Animated.Text style={[styles.moodEmoji, { transform: [{ scale: emojiScale }] }]}>{emoji}</Animated.Text>
        <Text style={[styles.moodLabel, selected && styles.moodLabelSelected]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Celebration Effect ─────────────────────────────────────────────────────
function CelebrationEffect() {
  const { width: W } = Dimensions.get('window');
  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <ConfettiCannon
        count={200}
        origin={{ x: W / 2, y: -20 }}
        autoStart
        fadeOut
        explosionSpeed={400}
        fallSpeed={3000}
        colors={[AppColors.coral.primary, '#FFD93D', '#6BCB77', '#4D96FF', '#FF922B', '#CC5DE8', '#F06595', '#74C0FC']}
      />
    </View>
  );
}

// ─── Progress Bar ────────────────────────────────────────────────────────────
function AnimatedProgress({ current, total }: { current: number; total: number }) {
  const progressAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    Animated.spring(progressAnim, {
      toValue: (current + 1) / total,
      speed: 10,
      bounciness: 4,
      useNativeDriver: false,
    }).start();
  }, [current, total]);

  useEffect(() => {
    const shimmerLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 2,
          duration: 1800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.delay(600),
      ])
    );
    shimmerLoop.start();
    return () => shimmerLoop.stop();
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [-1, 2],
    outputRange: [-80, 200],
  });

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressBg}>
        <Animated.View style={[styles.progressFill, { width: progressWidth }]}>
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: 40,
              backgroundColor: 'rgba(255,255,255,0.45)',
              borderRadius: 3,
              transform: [{ translateX: shimmerTranslate }],
            }}
          />
        </Animated.View>
      </View>
      <Text style={styles.progressText}>{current + 1} / {total}</Text>
    </View>
  );
}

// ─── Role Badge ──────────────────────────────────────────────────────────────
function RoleBadge({ label, color, bgColor }: { label: string; color: string; bgColor: string }) {
  return (
    <View style={[styles.roleBadge, { backgroundColor: bgColor }]}>
      <Text style={[styles.roleBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Moods ───────────────────────────────────────────────────────────────────
const MOODS = [
  { emoji: '😄', label: '很开心', score: 10 },
  { emoji: '😊', label: '还不错', score: 9 },
  { emoji: '😌', label: '平静', score: 8 },
  { emoji: '😕', label: '有点累', score: 5 },
  { emoji: '😢', label: '不太好', score: 3 },
  { emoji: '😤', label: '烦躁', score: 2 },
];

// ─── Month Calendar ────────────────────────────────────────────────────────
const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_NAMES = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];

function MonthCalendar({ checkIns, caregiverName = '照顾者' }: { checkIns: DailyCheckIn[]; caregiverName?: string }) {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<DailyCheckIn | null>(null);
  const [selectedBriefing, setSelectedBriefing] = useState<CareBriefing | null>(null);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const popupScale = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [showModal, setShowModal] = useState(false);

  async function openDayDetail(checkIn: DailyCheckIn) {
    setSelectedDay(checkIn);
    setSelectedBriefing(null);
    setBriefingLoading(true);
    setShowModal(true);
    overlayOpacity.setValue(0);
    popupScale.setValue(0.85);
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(popupScale, { toValue: 1, friction: 8, tension: 65, useNativeDriver: true }),
    ]).start();
    const briefing = await getBriefingByDate(checkIn.date);
    if (mountedRef.current) {
      setSelectedBriefing(briefing);
      setBriefingLoading(false);
    }
  }

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  function closeDayDetail() {
    Animated.parallel([
      Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(popupScale, { toValue: 0.85, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      if (mountedRef.current) {
        setShowModal(false);
        setSelectedDay(null);
        setSelectedBriefing(null);
      }
    });
  }

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const checkInMap: Record<string, DailyCheckIn> = {};
  checkIns.forEach(c => { checkInMap[c.date] = c; });

  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const cells: Array<null | { day: number; dateStr: string; checkIn: DailyCheckIn | null }> = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateStr, checkIn: checkInMap[dateStr] ?? null });
  }

  const canGoNext = year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth());

  return (
    <View style={calStyles.wrapper}>
      {/* Month nav */}
      <View style={calStyles.monthRow}>
        <TouchableOpacity onPress={() => setViewDate(new Date(year, month - 1, 1))} style={calStyles.navBtn}>
          <Text style={calStyles.navBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={calStyles.monthTitle}>{year}年 {MONTH_NAMES[month]}</Text>
        <TouchableOpacity
          onPress={() => canGoNext && setViewDate(new Date(year, month + 1, 1))}
          style={[calStyles.navBtn, !canGoNext && { opacity: 0.3 }]}
        >
          <Text style={calStyles.navBtnText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Week labels */}
      <View style={calStyles.weekRow}>
        {WEEK_LABELS.map(l => <Text key={l} style={calStyles.weekLabel}>{l}</Text>)}
      </View>

      {/* Day grid */}
      <View style={calStyles.grid}>
        {cells.map((cell, idx) => {
          if (!cell) return <View key={`p${idx}`} style={calStyles.cell} />;
          const { day, dateStr, checkIn } = cell;
          const isFuture = dateStr > todayDateStr;
          const isToday = dateStr === todayDateStr;
          const morningDone = checkIn?.morningDone ?? false;
          const eveningDone = checkIn?.eveningDone ?? false;
          const bothDone = morningDone && eveningDone;
          const anyDone = morningDone || eveningDone;

          return (
            <TouchableOpacity
              key={dateStr}
              style={calStyles.cell}
              onPress={() => { if (!isFuture && checkIn) openDayDetail(checkIn); }}
              activeOpacity={anyDone ? 0.7 : 1}
            >
              <View style={[
                calStyles.dayCircle,
                isToday && calStyles.dayCircleToday,
                bothDone && calStyles.dayCircleDone,
              ]}>
                <Text style={[
                  calStyles.dayNum,
                  isFuture && calStyles.dayNumFuture,
                  isToday && !bothDone && calStyles.dayNumToday,
                  bothDone && calStyles.dayNumDone,
                ]}>{day}</Text>
              </View>
              {anyDone && (
                <View style={[
                  calStyles.dot,
                  bothDone ? calStyles.dotBoth : morningDone ? calStyles.dotMorning : calStyles.dotEvening,
                ]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legend */}
      <View style={calStyles.legendRow}>
        <View style={calStyles.legendItem}><View style={[calStyles.legendDot, calStyles.dotBoth]} /><Text style={calStyles.legendText}>全天</Text></View>
        <View style={calStyles.legendItem}><View style={[calStyles.legendDot, calStyles.dotMorning]} /><Text style={calStyles.legendText}>早间</Text></View>
        <View style={calStyles.legendItem}><View style={[calStyles.legendDot, calStyles.dotEvening]} /><Text style={calStyles.legendText}>晚间</Text></View>
      </View>

      {/* Day detail modal — shows briefing or fallback check-in data */}
      <Modal visible={showModal} transparent animationType="none" onRequestClose={closeDayDetail}>
        <Animated.View style={[calStyles.overlay, { opacity: overlayOpacity }]}>
          <TouchableOpacity style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center', padding: 20 }} activeOpacity={1} onPress={closeDayDetail}>
            <Animated.View style={[calStyles.popup, { transform: [{ scale: popupScale }] }]}>
              <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                {/* ── Date header ── */}
                <View style={calStyles.popupDateRow}>
                  <Text style={calStyles.popupDateEmoji}>📅</Text>
                  <Text style={calStyles.popupDate}>{selectedDay?.date}</Text>
                  {selectedBriefing && (
                    <View style={[calStyles.scoreBadge, {
                      backgroundColor: selectedBriefing.careScore >= 80 ? '#F0FDF4' : selectedBriefing.careScore >= 60 ? '#EFF6FF' : '#FFFBEB',
                    }]}>
                      <Text style={[calStyles.scoreBadgeText, {
                        color: selectedBriefing.careScore >= 80 ? '#16A34A' : selectedBriefing.careScore >= 60 ? '#3B82F6' : '#F59E0B',
                      }]}>{selectedBriefing.careScore}分</Text>
                    </View>
                  )}
                </View>
                <View style={calStyles.popupDivider} />

                {/* ── Loading state ── */}
                {briefingLoading && (
                  <View style={calStyles.briefingLoadingRow}>
                    <Text style={calStyles.briefingLoadingText}>加载简报中…</Text>
                  </View>
                )}

                {/* ── Briefing content (primary) ── */}
                {!briefingLoading && selectedBriefing && (
                  <View style={calStyles.briefingContent}>
                    <View style={calStyles.briefingSummaryBox}>
                      <Text style={calStyles.briefingSummaryLabel}>📋 今日简报</Text>
                      <Text style={calStyles.briefingSummaryText}>{selectedBriefing.summary}</Text>
                    </View>
                    <View style={calStyles.briefingEncouragementBox}>
                      <Text style={calStyles.briefingEncouragementText}>💜 {selectedBriefing.encouragement}</Text>
                    </View>
                    {/* Key stats row */}
                    <View style={calStyles.briefingStatsRow}>
                      {selectedDay?.eveningDone && (
                        <>
                          <View style={calStyles.briefingStat}>
                            <Text style={calStyles.briefingStatEmoji}>{selectedDay.moodEmoji || '😊'}</Text>
                            <Text style={calStyles.briefingStatLabel}>心情 {selectedDay.moodScore}/10</Text>
                          </View>
                          <View style={calStyles.briefingStat}>
                            <Text style={calStyles.briefingStatEmoji}>{selectedDay.medicationTaken ? '✅' : '❌'}</Text>
                            <Text style={calStyles.briefingStatLabel}>{selectedDay.medicationTaken ? '已服药' : '未服药'}</Text>
                          </View>
                        </>
                      )}
                      {selectedDay?.morningDone && (
                        <View style={calStyles.briefingStat}>
                          <Text style={calStyles.briefingStatEmoji}>💤</Text>
                          <Text style={calStyles.briefingStatLabel}>{selectedDay.sleepRange ?? `${selectedDay.sleepHours}h`}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}

                {/* ── Fallback: no briefing, show raw check-in data ── */}
                {!briefingLoading && !selectedBriefing && (
                  <View>
                    <Text style={calStyles.noBriefingHint}>当天未生成 AI 简报</Text>
                    {selectedDay?.morningDone && (
                      <View style={calStyles.popupSection}>
                        <Text style={calStyles.popupSectionTitle}>🌅 早间打卡</Text>
                        <Text style={calStyles.popupItem}>
                          💤 睡眠：{selectedDay.sleepRange ?? `${selectedDay.sleepHours}小时`}
                          {selectedDay.nightAwakenings ? ` · 夜醒${selectedDay.nightAwakenings}` : ` · ${selectedDay.sleepQuality === 'good' ? '良好' : selectedDay.sleepQuality === 'fair' ? '一般' : '较差'}`}
                        </Text>
                        {selectedDay.napDuration && selectedDay.napDuration !== '没有' && (
                          <Text style={calStyles.popupItem}>☀️ 白天小睡：{selectedDay.napDuration}</Text>
                        )}
                        {selectedDay.caregiverMoodEmoji && (
                          <Text style={calStyles.popupItem}>{selectedDay.caregiverMoodEmoji} {caregiverName}心情已记录</Text>
                        )}
                        {selectedDay.morningNotes ? <Text style={calStyles.popupNote}>📝 {selectedDay.morningNotes}</Text> : null}
                      </View>
                    )}
                    {selectedDay?.eveningDone && (
                      <View style={calStyles.popupSection}>
                        <Text style={calStyles.popupSectionTitle}>🌙 晚间记录</Text>
                        <Text style={calStyles.popupItem}>{selectedDay.moodEmoji} 心情：{selectedDay.moodScore}/10</Text>
                        <Text style={calStyles.popupItem}>💊 用药：{selectedDay.medicationTaken ? '✅ 已按时服药' : '❌ 未服药'}</Text>
                        {selectedDay.mealNotes ? <Text style={calStyles.popupItem}>🍽️ {selectedDay.mealNotes}</Text> : null}
                        {selectedDay.eveningNotes ? <Text style={calStyles.popupNote}>📝 {selectedDay.eveningNotes}</Text> : null}
                      </View>
                    )}
                  </View>
                )}

                <TouchableOpacity style={calStyles.popupClose} onPress={closeDayDetail}>
                  <Text style={calStyles.popupCloseText}>关闭</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </View>
  );
}

// ─── CheckinLanding ───────────────────────────────────────────────────────────
function CheckinLanding({
  checkIn,
  elderNickname,
  caregiverName = '照顾者',
  onStartMorning,
  onStartEvening,
  onViewMorning,
}: {
  checkIn: DailyCheckIn | null;
  elderNickname: string;
  caregiverName?: string;
  onStartMorning: () => void;
  onStartEvening: () => void;
  onViewMorning: () => void;
}) {
  const morningDone = checkIn?.morningDone ?? false;
  const eveningDone = checkIn?.eveningDone ?? false;
  const [allCheckIns, setAllCheckIns] = useState<DailyCheckIn[]>([]);

  useEffect(() => {
    getAllCheckIns().then(setAllCheckIns);
  }, [checkIn]);

  const morningTime = morningDone && checkIn?.completedAt
    ? new Date(checkIn.completedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <ScrollView contentContainerStyle={styles.landingContainer} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <PageHeader
        theme={PAGE_THEMES.checkin}
        subtitle={new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}
        right={
          <View style={styles.progressPill}>
            <Text style={styles.progressPillText}>
              {(morningDone ? 1 : 0) + (eveningDone ? 1 : 0)}/2 完成
            </Text>
          </View>
        }
      />

      {/* Morning block */}
      <View style={[styles.checkinBlock, morningDone && styles.checkinBlockDone]}>
        <View style={styles.checkinBlockHeader}>
          <View style={[styles.checkinBlockIcon, { backgroundColor: morningDone ? '#FFF3E0' : '#FFF8F0' }]}>
            <Text style={styles.checkinBlockIconText}>🌅</Text>
          </View>
          <View style={styles.checkinBlockInfo}>
            <Text style={styles.checkinBlockTitle}>早间打卡</Text>
            {morningDone ? (
              <Text style={styles.checkinBlockStatus}>
                ✅ 已完成{morningTime ? ` · ${morningTime}` : ''}
              </Text>
            ) : (
              <Text style={styles.checkinBlockStatusPending}>⏳ 待完成</Text>
            )}
          </View>
          {morningDone && (
            <View style={styles.doneCheckCircle}>
              <Text style={styles.doneCheckText}>✓</Text>
            </View>
          )}
        </View>

        {morningDone && checkIn && (
          <View style={styles.checkinSummary}>
            <View style={styles.checkinSummaryRow}>
              <Text style={styles.checkinSummaryItem}>
                💤 {elderNickname}睡了 {checkIn.sleepHours}h
              </Text>
              {checkIn.caregiverMoodEmoji && (
                <Text style={styles.checkinSummaryItem}>
                  {checkIn.caregiverMoodEmoji} {caregiverName}的心情已记录
                </Text>
              )}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.checkinBlockBtn, morningDone && styles.checkinBlockBtnSecondary]}
          onPress={morningDone ? onViewMorning : onStartMorning}
          activeOpacity={0.85}
        >
          <Text style={[styles.checkinBlockBtnText, morningDone && styles.checkinBlockBtnTextSecondary]}>
            {morningDone ? '查看已记录内容' : '开始早间打卡 →'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Evening block */}
      <View style={[styles.checkinBlock, eveningDone && styles.checkinBlockDone]}>
        <View style={styles.checkinBlockHeader}>
          <View style={[styles.checkinBlockIcon, { backgroundColor: eveningDone ? AppColors.purple.soft : '#F5F0FF' }]}>
            <Text style={styles.checkinBlockIconText}>🌙</Text>
          </View>
          <View style={styles.checkinBlockInfo}>
            <Text style={styles.checkinBlockTitle}>晚间记录</Text>
            {eveningDone ? (
              <Text style={styles.checkinBlockStatus}>✅ 已完成</Text>
            ) : morningDone ? (
              <Text style={styles.checkinBlockStatusPending}>⏳ 今晚可以继续记录</Text>
            ) : (
              <Text style={styles.checkinBlockStatusLocked}>🔒 先完成早间打卡</Text>
            )}
          </View>
          {eveningDone && (
            <View style={[styles.doneCheckCircle, { backgroundColor: AppColors.purple.strong }]}>
              <Text style={styles.doneCheckText}>✓</Text>
            </View>
          )}
        </View>

        {eveningDone && checkIn && (
          <View style={styles.checkinSummary}>
            <View style={styles.checkinSummaryRow}>
              <Text style={styles.checkinSummaryItem}>
                {checkIn.moodEmoji} 心情 {checkIn.moodScore}/10
              </Text>
              <Text style={styles.checkinSummaryItem}>
                💊 {checkIn.medicationTaken ? '已服药' : '未服药'}
              </Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.checkinBlockBtn,
            styles.checkinBlockBtnEvening,
            (!morningDone || eveningDone) && styles.checkinBlockBtnSecondary,
          ]}
          onPress={onStartEvening}
          disabled={!morningDone && !eveningDone}
          activeOpacity={0.85}
        >
          <Text style={[
            styles.checkinBlockBtnText,
            (!morningDone || eveningDone) && styles.checkinBlockBtnTextSecondary,
          ]}>
            {eveningDone ? '查看晚间记录' : morningDone ? '开始晚间记录 →' : '今晚再来记录'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tip */}
      <View style={styles.landingTip}>
        <Text style={styles.landingTipText}>
          💡 每天两次记录，帮助掌握{elderNickname}的状态变化，及时发现需要关注的情况。
        </Text>
      </View>

      {/* History Calendar */}
      <View style={calStyles.sectionHeader}>
        <Text style={calStyles.sectionTitle}>📅 打卡历史</Text>
        <Text style={calStyles.sectionSub}>点击有记录的日期查看详情</Text>
      </View>
      <MonthCalendar checkIns={allCheckIns} caregiverName={caregiverName} />
    </ScrollView>
  );
}

// ─── Sleep Data Constants (v4.0) ─────────────────────────────────────────────
const SLEEP_RANGES = ['少于4小时', '4-6小时', '6-7小时', '7-9小时', '9小时以上'];
const SLEEP_RANGE_HOURS = [3.5, 5.0, 6.5, 8.0, 9.5]; // 用于图表的近似值（向后兼容）
const SLEEP_RANGE_ICONS = ['😴', '🌙', '💤', '✨', '🛌'];
// ─── 枚举键 → index 映射（评分引擎使用）───────────────────────────────────────
const SLEEP_RANGE_KEYS: SleepInput['nightSleepDuration'][] = ['lt4', '4to6', '6to7', '7to9', 'gt9'];
const AWAKENINGS = ['没醒', '1-2次', '3-4次', '5次以上'];
const AWAKENINGS_ICONS = ['😴', '🌛', '😵', '🚨'];
const AWAKENINGS_KEYS: SleepInput['awakenCount'][] = ['0', '1to2', '3to4', '5plus'];
const AWAKE_TIMES = ['几乎没有', '10-30分钟', '30-60分钟', '1小时以上'];
const AWAKE_TIME_ICONS = ['✅', '😐', '😫', '😩'];
const AWAKE_TIME_KEYS: SleepInput['awakeDuration'][] = ['none', '10to30', '30to60', 'gt60'];
const NAP_DURATIONS = ['没有', '少于20分钟', '20-60分钟', '1小时以上'];
const NAP_ICONS = ['☀️', '⏱️', '😪', '🛏️'];
const NAP_KEYS: NonNullable<SleepInput['napDuration']>[] = ['none', 'lt20', '20to60', 'gt60'];
const MEAL_OPTIONS = ['正常进食', '食量偏少', '几乎没吃'];
const MEAL_ICONS = ['🍽️', '🥢', '🚫'];

// ─── Main Screen ─────────────────────────────────────────────────────────────
function CheckinScreenContent() {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState<DailyCheckIn | null>(null);
  const [mode, setMode] = useState<'landing' | 'morning' | 'evening'>('landing');
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [elderNickname, setElderNickname] = useState('家人');
  const [caregiverName, setCaregiverName] = useState('您');
  const [streak, setStreak] = useState(1);

  // Morning fields — v5.0 睡眠记录（快捷 / 详细）
  const [sleepType, setSleepType] = useState<'quick' | 'detailed'>('quick');
  const [sleepRangeIdx, setSleepRangeIdx] = useState(3);  // "7-9小时"（快捷模式）
  const [sleepSegments, setSleepSegments] = useState<Array<{ start: string; end: string }>>([]);
  const [awakeningsIdx, setAwakeningsIdx] = useState(0);  // "没醒"
  const [awakeTimeIdx, setAwakeTimeIdx] = useState(0);    // "几乎没有"
  const [napIdx, setNapIdx] = useState(0);                // "没有"
  const [nightWakings, setNightWakings] = useState(0);
  const [morningNotes, setMorningNotes] = useState('');

  // Evening fields
  const [moodIdx, setMoodIdx] = useState(1);
  const [medicationTaken, setMedicationTaken] = useState(true);
  const [mealOptionIdx, setMealOptionIdx] = useState(0);
  const [mealCustom, setMealCustom] = useState('');
  const [napMinutes, setNapMinutes] = useState(0);
  const [eveningNotes, setEveningNotes] = useState('');

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;
  const doneFade = useRef(new Animated.Value(0)).current;
  const doneScale = useRef(new Animated.Value(0.8)).current;
  const saveBtnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fadeInUp(headerFade, headerSlide, { duration: 500 });
  }, []);

  // ── 从一条 check-in 记录恢复睡眠相关的 state ─────────────────────────────
  function restoreSleepFields(c: DailyCheckIn) {
    // 优先使用枚举键（v4.1），否则降级到显示字符串（v4.0）
    if (c.sleepInput) {
      const ri = SLEEP_RANGE_KEYS.indexOf(c.sleepInput.nightSleepDuration);
      if (ri >= 0) setSleepRangeIdx(ri);
      const ai = AWAKENINGS_KEYS.indexOf(c.sleepInput.awakenCount);
      if (ai >= 0) setAwakeningsIdx(ai);
      const wi = AWAKE_TIME_KEYS.indexOf(c.sleepInput.awakeDuration);
      if (wi >= 0) setAwakeTimeIdx(wi);
      const ni = NAP_KEYS.indexOf(c.sleepInput.napDuration ?? 'none');
      if (ni >= 0) setNapIdx(ni);
    } else {
      // 降级：用显示字符串
      if (c.sleepRange) {
        const idx = SLEEP_RANGES.indexOf(c.sleepRange);
        if (idx >= 0) setSleepRangeIdx(idx);
      } else {
        const h = c.sleepHours ?? 8;
        if (h < 4) setSleepRangeIdx(0);
        else if (h < 6) setSleepRangeIdx(1);
        else if (h < 7) setSleepRangeIdx(2);
        else if (h <= 9) setSleepRangeIdx(3);
        else setSleepRangeIdx(4);
      }
      if (c.nightAwakenings) {
        const idx = AWAKENINGS.indexOf(c.nightAwakenings);
        if (idx >= 0) setAwakeningsIdx(idx);
      }
      if (c.nightAwakeTime) {
        const idx = AWAKE_TIMES.indexOf(c.nightAwakeTime);
        if (idx >= 0) setAwakeTimeIdx(idx);
      }
      if (c.napDuration) {
        const idx = NAP_DURATIONS.indexOf(c.napDuration);
        if (idx >= 0) setNapIdx(idx);
      }
    }
  }

  useFocusEffect(useCallback(() => {
    // 加载姓名
    getProfile().then(profile => {
      if (profile) {
        setElderNickname(profile.nickname || profile.name || '家人');
        setCaregiverName(profile.caregiverName || '您');
      }
    });

    // 加载今日打卡，或从最近历史预填
    (async () => {
      const today = await getTodayCheckIn();
      setCheckIn(today);

      if (today) {
        // 今日已有数据 → 完整恢复
        restoreSleepFields(today);
        setMorningNotes(today.morningNotes ?? '');
        if (today.sleepType) setSleepType(today.sleepType);
        if (today.sleepSegments) setSleepSegments(today.sleepSegments);
        if (today.nightWakings != null) setNightWakings(today.nightWakings);
        if (today.napMinutes != null) setNapMinutes(today.napMinutes);
        else if (today.daytimeNap) setNapMinutes(30);
        const mIdx = MOODS.findIndex(m => m.score === today.moodScore);
        if (mIdx >= 0) setMoodIdx(mIdx);
        setMedicationTaken(today.medicationTaken ?? true);
        if (today.mealOption) {
          const parts = today.mealOption.split('、');
          const idx = MEAL_OPTIONS.indexOf(parts[0]?.trim());
          if (idx >= 0) setMealOptionIdx(idx);
          const customParts = parts.filter(p => !MEAL_OPTIONS.includes(p.trim())).map(p => p.trim()).filter(Boolean);
          setMealCustom(customParts.join('、') || '');
        }
        setEveningNotes(today.eveningNotes ?? '');
      } else {
        // 今日没有数据 → 尝试用最近一次历史打卡预填睡眠字段
        // 策略：取过去7天中最近一条有 morningDone 的记录
        const recent = await getAllCheckIns();
        const todayDate = todayStr();
        const lastMorning = recent
          .filter(r => r.date !== todayDate && r.morningDone)
          .sort((a, b) => b.date.localeCompare(a.date))[0];
        if (lastMorning) {
          restoreSleepFields(lastMorning);
          // 注意：只预填睡眠字段，不预填心情/用药（每天状态不同）
          // caregiverMoodIdx 保持默认（正常）
        }
        // 无历史数据 → 保持 useState 初始值（7-9小时 / 没醒 / 几乎没有 / 没有）
      }

      // 计算连续打卡天数
      getAllCheckIns().then(all => {
        const sorted = [...new Set(all.map(c => c.date))].sort().reverse();
        let count = 0;
        let prev = todayStr();
        for (const d of sorted) {
          const diff = (new Date(prev).getTime() - new Date(d).getTime()) / 86400000;
          if (diff <= 1) { count++; prev = d; } else break;
        }
        setStreak(Math.max(count, 1));
      });

      setMode('landing');
      setStep(0);
      setDone(false);
    })();
  }, []));

  const selectedMood = MOODS[moodIdx];

  function animateStep(next: () => void) {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 120, useNativeDriver: true }),
    ]).start(() => {
      next();
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    });
  }

  function nextStep() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const maxSteps = mode === 'morning' ? morningSteps.length : eveningSteps.length;
    if (step < maxSteps - 1) {
      animateStep(() => setStep(s => s + 1));
    } else {
      handleSave();
    }
  }

  function prevStep() {
    if (step > 0) {
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      animateStep(() => setStep(s => s - 1));
    } else {
      // Go back to landing
      setMode('landing');
    }
  }

  async function handleSave() {
    setSaving(true);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const data: Partial<DailyCheckIn> & { date: string } = { date: todayStr() };
    if (mode === 'morning') {
      // ── 构建结构化 SleepInput（v4.1 评分引擎输入）────────────────────────
      const sleepInput: SleepInput = {
        nightSleepDuration: SLEEP_RANGE_KEYS[sleepRangeIdx],
        awakenCount: AWAKENINGS_KEYS[awakeningsIdx],
        awakeDuration: AWAKE_TIME_KEYS[awakeTimeIdx],
        napDuration: NAP_KEYS[napIdx],
        notes: morningNotes || undefined,
      };
      // 规则引擎打分（非AI）
      const { score: sleepScore, problems: sleepProblems } = scoreSleepInput(sleepInput);

      const derivedQuality: 'good' | 'fair' | 'poor' =
        nightWakings === 0 ? 'good' : nightWakings <= 2 ? 'fair' : 'poor';
      const effectiveSleepHours = sleepType === 'detailed' && sleepSegments.length > 0
        ? computeSegmentTotal()
        : SLEEP_RANGE_HOURS[sleepRangeIdx];

      Object.assign(data, {
        sleepInput,
        sleepScore,
        sleepProblems,
        sleepType,
        sleepSegments: sleepType === 'detailed' ? sleepSegments : undefined,
        awakeHours: sleepType === 'detailed' && sleepSegments.length >= 2 ? computeAwakeHours() : undefined,
        nightWakings,
        sleepHours: Math.round(effectiveSleepHours * 10) / 10,
        sleepQuality: derivedQuality,
        sleepRange: SLEEP_RANGES[sleepRangeIdx],
        nightAwakenings: AWAKENINGS[awakeningsIdx],
        nightAwakeTime: AWAKE_TIMES[awakeTimeIdx],
        napDuration: NAP_DURATIONS[napIdx],
        morningNotes,
        morningDone: true,
      });
    } else {
      Object.assign(data, {
        moodEmoji: selectedMood.emoji,
        moodScore: selectedMood.score,
        medicationTaken,
        mealOption: [MEAL_OPTIONS[mealOptionIdx]].concat(mealCustom.trim() ? [mealCustom.trim()] : []).join('、'),
        mealNotes: [MEAL_OPTIONS[mealOptionIdx]].concat(mealCustom.trim() ? [mealCustom.trim()] : []).join('、'),
        daytimeNap: napMinutes > 0,
        napMinutes,
        eveningNotes,
        eveningDone: true,
      });
    }
    await upsertCheckIn(data);
    setSaving(false);
    if (mode === 'morning') {
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      router.replace('/share' as any);
      return;
    }
    if (Platform.OS !== 'web') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 200);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 400);
    }
    setShowCelebration(true);
    doneFade.setValue(0);
    doneScale.setValue(0.8);
    setDone(true);
    Animated.parallel([
      Animated.timing(doneFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(doneScale, { toValue: 1, speed: 8, bounciness: 10, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setShowCelebration(false), 2500);
  }

  // ── Done State ──
  if (done) {
    const isMorning = mode === 'morning';

    if (!isMorning) {
      const streakDots = Math.min(streak, 7);
      return (
        <LinearGradient colors={['#3B0D7A', AppColors.purple.strong, AppColors.purple.strong, '#8B5CF6']} style={{ flex: 1 }}>
          {showCelebration && <CelebrationEffect />}
          {/* Star field */}
          <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            {[
              { top: '6%', left: '12%' }, { top: '11%', left: '78%' }, { top: '18%', left: '45%' },
              { top: '8%', left: '60%' }, { top: '25%', left: '88%' }, { top: '32%', left: '5%' },
              { top: '15%', left: '28%' }, { top: '4%', left: '92%' }, { top: '22%', left: '70%' },
              { top: '38%', left: '55%' }, { top: '12%', left: '38%' }, { top: '30%', left: '20%' },
              { top: '42%', left: '80%' }, { top: '48%', left: '10%' }, { top: '35%', left: '65%' },
              { top: '50%', left: '40%' }, { top: '55%', left: '90%' }, { top: '60%', left: '25%' },
              { top: '65%', left: '70%' }, { top: '70%', left: '50%' },
            ].map((pos, i) => (
              <Text key={i} style={{
                position: 'absolute', top: pos.top as any, left: pos.left as any,
                color: '#fff', opacity: 0.3 + (i % 4) * 0.15,
                fontSize: i % 4 === 0 ? 5 : i % 3 === 0 ? 4 : 3,
              }}>●</Text>
            ))}
          </View>

          <Animated.View style={[styles.doneContainer, { opacity: doneFade, transform: [{ scale: doneScale }] }]}>
            {/* Moon icon + check badge */}
            <View style={{ position: 'relative', marginBottom: 28 }}>
              <Text style={{ fontSize: 90, lineHeight: 100 }}>🌙</Text>
              <View style={styles.nightCheckBadge}>
                <Text style={{ fontSize: 20, color: '#fff', fontWeight: '900' }}>✓</Text>
              </View>
            </View>

            {/* White card */}
            <View style={styles.nightCard}>
              <Text style={styles.nightTitle}>晚间记录已保存</Text>

              <View style={styles.nightSparkleRow}>
                <Text style={styles.nightSparkle}>今日照护记录完整</Text>
              </View>

              <Text style={styles.nightSub}>
                {'今天的数据已整理完毕\n可以写一篇护理日记，记录详细情况'}
              </Text>

              {/* Streak badge */}
              <View style={styles.nightStreakBadge}>
                <View style={styles.nightStreakDots}>
                  {Array.from({ length: streakDots }).map((_, i) => (
                    <View key={i} style={styles.nightStreakDot} />
                  ))}
                </View>
                <Text style={styles.nightStreakText}>已连续打卡 {streak} 天</Text>
              </View>

              {/* Main diary button — pink/rose gradient */}
              <TouchableOpacity
                style={styles.nightDiaryBtn}
                onPress={() => router.push('/diary-edit' as any)}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#EC4899', '#F43F5E', '#F97316']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                  style={styles.nightDiaryBtnInner}
                >
                  <Text style={styles.nightDiaryIcon}>📖</Text>
                  <Text style={styles.nightDiaryBtnText}>写今天的护理日记 →</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Secondary home button */}
              <TouchableOpacity style={styles.nightHomeBtn} onPress={() => router.replace('/(tabs)' as any)} activeOpacity={0.7}>
                <Text style={styles.nightHomeBtnText}>🏠 回到首页</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.nightFooter}>持续记录有助于掌握长期变化趋势</Text>
          </Animated.View>
        </LinearGradient>
      );
    }

    return (
      <ScreenContainer containerClassName="bg-[#F7F1F3]">
        <Animated.View style={[styles.doneContainer, { opacity: doneFade, transform: [{ scale: doneScale }] }]}>
          {showCelebration && <CelebrationEffect />}
          <View style={styles.doneEmojiCircle}>
            <Text style={styles.doneEmoji}>🌅</Text>
          </View>
          <Text style={styles.doneTitle}>早间记录已保存</Text>
          <Text style={styles.doneSub}>
            {`${elderNickname}今日照护数据已整理完毕\n可查看详细分析报告`}
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace('/share' as any)}>
            <Text style={styles.doneBtnText}>查看今日分析报告 →</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.doneBtnSecondary} onPress={() => {
            setDone(false);
            setMode('landing');
          }}>
            <Text style={styles.doneBtnSecondaryText}>查看今日打卡状态</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScreenContainer>
    );
  }

  // ── Landing ──
  if (mode === 'landing') {
    return (
      <ScreenContainer containerClassName="bg-[#F7F1F3]">
        <CheckinLanding
          checkIn={checkIn}
          elderNickname={elderNickname}
          caregiverName={caregiverName}
          onStartMorning={() => { setStep(0); setMode('morning'); }}
          onStartEvening={() => { setStep(0); setMode('evening'); }}
          onViewMorning={() => { setStep(0); setMode('morning'); }}
        />
      </ScreenContainer>
    );
  }

  const computeSegmentHours = (seg: { start: string; end: string }) => {
    const ms = new Date(seg.end).getTime() - new Date(seg.start).getTime();
    if (ms <= 0) return 0;
    return Math.min(ms / 3600000, 16);
  };

  const computeSegmentTotal = () => {
    if (sleepSegments.length === 0) return 0;
    return sleepSegments.reduce((sum, seg) => sum + computeSegmentHours(seg), 0);
  };

  const computeAwakeHours = () => {
    if (sleepSegments.length < 2) return 0;
    const sorted = [...sleepSegments].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    let total = 0;
    for (let i = 1; i < sorted.length; i++) {
      const prevEnd = new Date(sorted[i - 1].end).getTime();
      const currStart = new Date(sorted[i].start).getTime();
      const gap = currStart - prevEnd;
      if (gap > 0) total += gap / 3600000;
    }
    return Math.round(total * 10) / 10;
  };

  const addSleepSegment = () => {
    setSleepSegments(prev => {
      let next;
      if (prev.length > 0) {
        const lastEnd = new Date(prev[prev.length - 1].end);
        const newStart = new Date(lastEnd);
        const newEnd = new Date(lastEnd);
        newEnd.setMinutes(newEnd.getMinutes() + 90);
        next = [...prev, { start: newStart.toISOString(), end: newEnd.toISOString() }];
      } else {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const defaultStart = new Date(yesterday);
        defaultStart.setHours(22, 0, 0, 0);
        const defaultEnd = new Date();
        defaultEnd.setHours(6, 30, 0, 0);
        next = [...prev, { start: defaultStart.toISOString(), end: defaultEnd.toISOString() }];
      }
      setNightWakings(Math.max(0, next.length - 1));
      return next;
    });
  };

  const removeSleepSegment = (idx: number) => {
    setSleepSegments(prev => {
      const next = prev.filter((_, i) => i !== idx);
      setNightWakings(Math.max(0, next.length - 1));
      return next;
    });
  };

  const updateSegmentTime = (idx: number, field: 'start' | 'end', hour: number, minute: number) => {
    setSleepSegments(prev => {
      const updated = [...prev];
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const baseDate = hour >= 18 ? yesterday : today;
      const d = new Date(baseDate);
      d.setHours(hour, minute, 0, 0);
      updated[idx] = { ...updated[idx], [field]: d.toISOString() };
      return updated;
    });
  };

  // ── Morning Steps (v6.0: 2 screens only) ──
  const morningSteps = [
    {
      role: 'elder' as const,
      roleLabel: `【${elderNickname}】的状态`,
      q: `${elderNickname}昨晚睡眠情况`,
      emoji: '🌤️',
      hint: sleepType === 'quick' ? '选择总睡眠时长' : '添加具体睡眠时间段',
      content: (
        <View style={{ gap: 12 }}>
          <View style={styles.sleepToggleRow}>
            <TouchableOpacity
              style={[styles.sleepToggleBtn, sleepType === 'quick' && styles.sleepToggleBtnActive]}
              onPress={() => setSleepType('quick')}
              activeOpacity={0.8}
            >
              <Text style={[styles.sleepToggleText, sleepType === 'quick' && styles.sleepToggleTextActive]}>⚡ 快捷记录</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sleepToggleBtn, sleepType === 'detailed' && styles.sleepToggleBtnActive]}
              onPress={() => {
                setSleepType('detailed');
                if (sleepSegments.length === 0) addSleepSegment();
              }}
              activeOpacity={0.8}
            >
              <Text style={[styles.sleepToggleText, sleepType === 'detailed' && styles.sleepToggleTextActive]}>📋 详细记录</Text>
            </TouchableOpacity>
          </View>

          {sleepType === 'quick' ? (
            <View style={styles.pillList}>
              {SLEEP_RANGES.map((label, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.pillItem, sleepRangeIdx === i && styles.pillItemSelected]}
                  onPress={() => {
                    setSleepRangeIdx(i);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.pillIcon}>{SLEEP_RANGE_ICONS[i]}</Text>
                  <Text style={[styles.pillLabel, sleepRangeIdx === i && styles.pillLabelSelected]}>{label}</Text>
                  {sleepRangeIdx === i && <Text style={styles.pillCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={styles.segmentTotalBar}>
                <Text style={styles.segmentTotalText}>
                  总计：{computeSegmentTotal().toFixed(1)} 小时
                  {sleepSegments.length >= 2 && computeAwakeHours() > 0
                    ? `  |  夜间清醒：${computeAwakeHours()} 小时`
                    : ''}
                </Text>
              </View>
              {sleepSegments.map((seg, idx) => {
                const s = new Date(seg.start);
                const e = new Date(seg.end);
                return (
                  <View key={idx} style={styles.segmentCard}>
                    <View style={styles.segmentHeader}>
                      <Text style={styles.segmentTitle}>时间段 {idx + 1}</Text>
                      {sleepSegments.length > 1 && (
                        <TouchableOpacity onPress={() => removeSleepSegment(idx)}>
                          <Text style={styles.segmentRemoveBtn}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <View style={styles.segmentTimeRow}>
                      <View style={styles.segmentTimeBlock}>
                        <Text style={styles.segmentTimeLabel}>入睡</Text>
                        <View style={styles.timePickerRow}>
                          <TouchableOpacity
                            style={styles.timeAdjustBtn}
                            onPress={() => updateSegmentTime(idx, 'start', (s.getHours() - 1 + 24) % 24, s.getMinutes())}
                          >
                            <Text style={styles.timeAdjustText}>−</Text>
                          </TouchableOpacity>
                          <Text style={styles.timeDisplay}>
                            {s.getHours().toString().padStart(2, '0')}:{s.getMinutes().toString().padStart(2, '0')}
                          </Text>
                          <TouchableOpacity
                            style={styles.timeAdjustBtn}
                            onPress={() => updateSegmentTime(idx, 'start', (s.getHours() + 1) % 24, s.getMinutes())}
                          >
                            <Text style={styles.timeAdjustText}>+</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.timePickerRow}>
                          <TouchableOpacity
                            style={styles.timeAdjustBtnSmall}
                            onPress={() => updateSegmentTime(idx, 'start', s.getHours(), (s.getMinutes() - 15 + 60) % 60)}
                          >
                            <Text style={styles.timeAdjustTextSmall}>-15分</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.timeAdjustBtnSmall}
                            onPress={() => updateSegmentTime(idx, 'start', s.getHours(), (s.getMinutes() + 15) % 60)}
                          >
                            <Text style={styles.timeAdjustTextSmall}>+15分</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      <Text style={styles.segmentArrow}>→</Text>
                      <View style={styles.segmentTimeBlock}>
                        <Text style={styles.segmentTimeLabel}>醒来</Text>
                        <View style={styles.timePickerRow}>
                          <TouchableOpacity
                            style={styles.timeAdjustBtn}
                            onPress={() => updateSegmentTime(idx, 'end', (e.getHours() - 1 + 24) % 24, e.getMinutes())}
                          >
                            <Text style={styles.timeAdjustText}>−</Text>
                          </TouchableOpacity>
                          <Text style={styles.timeDisplay}>
                            {e.getHours().toString().padStart(2, '0')}:{e.getMinutes().toString().padStart(2, '0')}
                          </Text>
                          <TouchableOpacity
                            style={styles.timeAdjustBtn}
                            onPress={() => updateSegmentTime(idx, 'end', (e.getHours() + 1) % 24, e.getMinutes())}
                          >
                            <Text style={styles.timeAdjustText}>+</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.timePickerRow}>
                          <TouchableOpacity
                            style={styles.timeAdjustBtnSmall}
                            onPress={() => updateSegmentTime(idx, 'end', e.getHours(), (e.getMinutes() - 15 + 60) % 60)}
                          >
                            <Text style={styles.timeAdjustTextSmall}>-15分</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.timeAdjustBtnSmall}
                            onPress={() => updateSegmentTime(idx, 'end', e.getHours(), (e.getMinutes() + 15) % 60)}
                          >
                            <Text style={styles.timeAdjustTextSmall}>+15分</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
              <TouchableOpacity style={styles.addSegmentBtn} onPress={addSleepSegment}>
                <Text style={styles.addSegmentText}>＋ 添加睡眠时间段</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={{ marginTop: 8, backgroundColor: AppColors.bg.secondary, borderRadius: 16, padding: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 10 }}>夜间醒来次数</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                style={[styles.counterBtn, nightWakings === 0 && styles.counterBtnDisabled]}
                onPress={() => {
                  if (nightWakings > 0) setNightWakings(v => v - 1);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.counterBtnText}>−</Text>
              </TouchableOpacity>
              <View style={styles.counterDisplay}>
                <Text style={styles.counterValue}>{nightWakings}</Text>
                <Text style={styles.counterUnit}>次</Text>
              </View>
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => {
                  setNightWakings(v => v + 1);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.counterBtnText}>＋</Text>
              </TouchableOpacity>
            </View>
            {nightWakings === 0 && (
              <Text style={{ fontSize: 13, color: '#9BA1A6', textAlign: 'center', marginTop: 6 }}>一夜无中断，睡眠连续性良好</Text>
            )}
            {nightWakings >= 3 && (
              <Text style={{ fontSize: 13, color: '#E67E22', textAlign: 'center', marginTop: 6 }}>频繁醒来需关注 ⚠️</Text>
            )}
          </View>

          <View style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 8 }}>还有什么要补充的吗？（可选）</Text>
            <TextInput
              style={styles.noteInput}
              placeholder={`例如：${elderNickname}夜间醒来找水、情绪有些不稳...`}
              value={morningNotes}
              onChangeText={setMorningNotes}
              multiline numberOfLines={3}
              placeholderTextColor="#B8BCC0"
              returnKeyType="done"
            />
          </View>
        </View>
      ),
    },
  ];

  // ── Evening Steps ──
  const eveningSteps = [
    {
      role: 'elder' as const,
      roleLabel: `【${elderNickname}】的状态`,
      q: `${elderNickname}今天心情怎么样？`,
      emoji: '💛',
      hint: '选择最接近的情绪',
      content: (
        <View>
          <View style={styles.moodGrid}>
            {MOODS.map((m, i) => (
              <MoodCard
                key={i}
                emoji={m.emoji}
                label={m.label}
                selected={moodIdx === i}
                onPress={() => {
                  setMoodIdx(i);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
              />
            ))}
          </View>
          {moodIdx >= 0 && (
            <View style={styles.moodScoreContainer}>
              <Text style={styles.moodScoreEmoji}>{selectedMood.emoji}</Text>
              <Text style={styles.moodScore}>心情分数：{selectedMood.score}/10</Text>
            </View>
          )}
        </View>
      ),
    },
    {
      role: 'elder' as const,
      roleLabel: `【${elderNickname}】的状态`,
      q: '今天按时吃药了吗？',
      emoji: '💊',
      hint: '记录用药情况',
      content: (
        <View style={styles.optionRow}>
          <OptionCard icon="✅" label="按时吃了" selected={medicationTaken} onPress={() => setMedicationTaken(true)} />
          <OptionCard icon="❌" label="没有吃" selected={!medicationTaken} onPress={() => setMedicationTaken(false)} />
        </View>
      ),
    },
    {
      role: 'elder' as const,
      roleLabel: `【${elderNickname}】的状态`,
      q: `${elderNickname}今天吃了什么？`,
      emoji: '🍽️',
      hint: '选择饮食情况，也可以补充具体内容',
      content: (
        <View style={{ gap: 10 }}>
          {MEAL_OPTIONS.map((label, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.pillItem, mealOptionIdx === i && styles.pillItemSelected]}
              onPress={() => {
                setMealOptionIdx(i);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.pillIcon}>{MEAL_ICONS[i]}</Text>
              <Text style={[styles.pillLabel, mealOptionIdx === i && styles.pillLabelSelected]}>{label}</Text>
              {mealOptionIdx === i && <Text style={styles.pillCheck}>✓</Text>}
            </TouchableOpacity>
          ))}
          <TextInput
            style={styles.mealCustomInput}
            placeholder={`补充${elderNickname}今天吃的东西…`}
            value={mealCustom}
            onChangeText={setMealCustom}
            placeholderTextColor="#B8BCC0"
            returnKeyType="done"
          />
        </View>
      ),
    },
    {
      role: 'elder' as const,
      roleLabel: `【${elderNickname}】的状态`,
      q: `${elderNickname}白天有小睡吗？`,
      emoji: '😴',
      hint: '选择小睡时长（30分钟为单位）',
      content: (
        <View style={{ gap: 16 }}>
          <View style={{ backgroundColor: AppColors.bg.secondary, borderRadius: 16, padding: 16, alignItems: 'center' }}>
            <View style={styles.napScrollRow}>
              <TouchableOpacity
                style={[styles.counterBtn, napMinutes === 0 && styles.counterBtnDisabled]}
                onPress={() => {
                  if (napMinutes >= 30) setNapMinutes(v => v - 30);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.counterBtnText}>−</Text>
              </TouchableOpacity>
              <View style={styles.napDisplay}>
                <Text style={styles.napValue}>{napMinutes === 0 ? '没有小睡' : napMinutes >= 60 ? `${(napMinutes / 60).toFixed(1).replace('.0', '')} 小时` : `${napMinutes} 分钟`}</Text>
                <Text style={styles.napUnit}>{napMinutes > 0 ? '每次点击 ± 30分钟' : '点击 ＋ 添加时长'}</Text>
              </View>
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => {
                  if (napMinutes < 300) setNapMinutes(v => v + 30);
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.counterBtnText}>＋</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.napQuickRow}>
              {[0, 30, 60, 90, 120].map(mins => (
                <TouchableOpacity
                  key={mins}
                  style={[styles.napQuickBtn, napMinutes === mins && styles.napQuickBtnActive]}
                  onPress={() => {
                    setNapMinutes(mins);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.napQuickText, napMinutes === mins && styles.napQuickTextActive]}>
                    {mins === 0 ? '无' : mins < 60 ? `${mins}分` : `${mins / 60}h`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {napMinutes >= 120 && (
            <Text style={{ fontSize: 13, color: '#E67E22', textAlign: 'center' }}>白天小睡较长，可能影响夜间睡眠 ⚠️</Text>
          )}
        </View>
      ),
    },
    {
      role: 'notes' as const,
      roleLabel: '补充备注（可选）',
      q: '今天有什么要补充的吗？',
      emoji: '📝',
      hint: '如有特殊情况可以记录（可选）',
      content: (
        <TextInput
          style={styles.noteInput}
          placeholder="例如：今天情绪有些波动、需要多安抚..."
          value={eveningNotes}
          onChangeText={setEveningNotes}
          multiline numberOfLines={4}
          placeholderTextColor="#B8BCC0"
          returnKeyType="done"
        />
      ),
    },
  ];

  const currentSteps = mode === 'morning' ? morningSteps : eveningSteps;
  const currentStep = currentSteps[step];
  const isLast = step === currentSteps.length - 1;

  const roleBadgeProps = (currentStep as any).role === 'elder'
    ? { label: currentStep.roleLabel, color: '#2563EB', bgColor: '#EFF6FF' }
    : (currentStep as any).role === 'caregiver'
    ? { label: currentStep.roleLabel, color: AppColors.purple.strong, bgColor: AppColors.purple.soft }
    : { label: currentStep.roleLabel, color: '#059669', bgColor: '#ECFDF5' };

  return (
    <ScreenContainer containerClassName="bg-[#F7F1F3]">
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
          <View>
            <Text style={styles.appName}>{mode === 'morning' ? '早间打卡' : '晚间记录'}</Text>
            <Text style={styles.date}>{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</Text>
          </View>
          <TouchableOpacity style={styles.backToLanding} onPress={() => setMode('landing')}>
            <Text style={styles.backToLandingText}>← 返回</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Animated Progress Bar — hide when single step */}
        {currentSteps.length > 1 && <AnimatedProgress current={step} total={currentSteps.length} />}

        {/* Question Card */}
        <Animated.View style={[styles.questionCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {/* Role badge */}
          <RoleBadge {...roleBadgeProps} />

          <View style={styles.questionHeader}>
            <View style={styles.questionEmojiCircle}>
              <Text style={styles.questionEmojiText}>{(currentStep as any).emoji || '📋'}</Text>
            </View>
            {currentSteps.length > 1 && (
              <Text style={styles.questionNum}>第 {step + 1} / {currentSteps.length} 题</Text>
            )}
          </View>
          <Text style={styles.question}>{currentStep.q}</Text>
          <Text style={styles.hint}>{currentStep.hint}</Text>
          <View style={styles.answerArea}>
            {currentStep.content}
          </View>
        </Animated.View>

        {/* Nav buttons */}
        <View style={styles.navRow}>
          <TouchableOpacity style={styles.backBtn} onPress={prevStep} activeOpacity={0.8}>
            <Text style={styles.backBtnText}>← {step > 0 ? '上一题' : '返回'}</Text>
          </TouchableOpacity>
          <Animated.View style={[{ flex: 2, transform: [{ scale: saveBtnScale }] }]}>
            <TouchableOpacity
              style={[styles.nextBtn, saving && styles.nextBtnDisabled, isLast && styles.nextBtnFinish]}
              onPress={() => pressAnimation(saveBtnScale, nextStep)}
              disabled={saving}
              activeOpacity={0.85}
            >
              <Text style={styles.nextBtnText}>
                {saving ? '保存中...' : isLast
                  ? (mode === 'morning' ? '完成早间打卡 🌅' : '完成晚间记录 🌙')
                  : '下一题 →'}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },

  // Landing
  landingContainer: { padding: 20, paddingBottom: 40 },
  landingHeader: { marginBottom: 24 },
  landingTitle: { fontSize: 26, fontWeight: '900', color: COLORS.text, letterSpacing: -0.5 },
  landingDate: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  progressPill: {
    marginTop: 10, alignSelf: 'flex-start',
    backgroundColor: COLORS.primaryBg, borderRadius: RADIUS.pill,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  progressPillText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  checkinBlock: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: RADIUS.xxl, padding: 20, marginBottom: 16,
    borderWidth: 1.5, borderColor: '#F0F0F0',
    ...SHADOWS.md,
  },
  checkinBlockDone: { borderColor: '#D1FAE5' },
  checkinBlockHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  checkinBlockIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  checkinBlockIconText: { fontSize: 22 },
  checkinBlockInfo: { flex: 1 },
  checkinBlockTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  checkinBlockStatus: { fontSize: 12, color: '#059669', fontWeight: '600', marginTop: 2 },
  checkinBlockStatusPending: { fontSize: 12, color: '#F59E0B', fontWeight: '600', marginTop: 2 },
  checkinBlockStatusLocked: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 },
  doneCheckCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center',
  },
  doneCheckText: { fontSize: 14, color: '#fff', fontWeight: '700' },
  checkinSummary: { marginBottom: 12 },
  checkinSummaryRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  checkinSummaryItem: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  checkinBlockBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.xl,
    paddingVertical: 13, alignItems: 'center',
    ...SHADOWS.glow(COLORS.primary),
  },
  checkinBlockBtnEvening: { backgroundColor: AppColors.purple.strong, ...SHADOWS.glow(AppColors.purple.strong) },
  checkinBlockBtnSecondary: {
    backgroundColor: AppColors.bg.secondary, borderWidth: 1, borderColor: '#EBEBEB',
    shadowOpacity: 0,
  },
  checkinBlockBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  checkinBlockBtnTextSecondary: { color: COLORS.textSecondary },
  landingTip: {
    backgroundColor: '#FFF8F0', borderRadius: RADIUS.lg, padding: 14,
    borderWidth: 1, borderColor: '#FFE4C4',
  },
  landingTipText: { fontSize: 13, color: '#92400E', lineHeight: 20 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  appName: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  date: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  backToLanding: {
    backgroundColor: AppColors.bg.secondary, borderRadius: RADIUS.pill,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1, borderColor: '#EBEBEB',
  },
  backToLandingText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },

  // Role badge
  roleBadge: {
    alignSelf: 'flex-start', borderRadius: RADIUS.pill,
    paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '700' },

  // Progress
  progressContainer: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20,
  },
  progressBg: {
    flex: 1, height: 6, backgroundColor: '#F0F0F0', borderRadius: 3, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: COLORS.primary, borderRadius: 3,
  },
  progressText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },

  // Question card
  questionCard: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: RADIUS.xxl, padding: 24, marginBottom: 20,
    borderWidth: 1, borderColor: '#F0F0F0',
    ...SHADOWS.lg,
  },
  questionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  questionEmojiCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  questionEmojiText: { fontSize: 18 },
  questionNum: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  question: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 6, lineHeight: 30 },
  hint: { fontSize: 13, color: COLORS.textMuted, marginBottom: 20 },
  answerArea: { minHeight: 120 },

  // Picker
  pickerWrap: { backgroundColor: AppColors.bg.secondary, borderRadius: RADIUS.lg, overflow: 'hidden', position: 'relative' },
  pickerHighlight: {
    position: 'absolute', left: 0, right: 0,
    backgroundColor: 'rgba(255,107,107,0.1)', borderRadius: RADIUS.sm, zIndex: 1, pointerEvents: 'none',
  },
  pickerItem: { justifyContent: 'center', alignItems: 'center' },
  pickerText: { fontSize: 16, color: COLORS.textMuted },
  pickerTextSelected: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  selectedDisplay: { textAlign: 'center', fontSize: 14, color: COLORS.primary, fontWeight: '700', marginTop: 12 },
  stepContent: { alignItems: 'center', width: '100%' },

  // Pill list (v4.0 — 全宽列选项)
  pillList: { gap: 10 },
  pillItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 16,
    borderRadius: RADIUS.lg, backgroundColor: AppColors.bg.secondary,
    borderWidth: 1.5, borderColor: '#EBEBEB',
  },
  pillItemSelected: {
    backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary,
  },
  pillIcon: { fontSize: 22, width: 28, textAlign: 'center' },
  pillLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#374151' },
  pillLabelSelected: { color: COLORS.primary },
  pillCheck: { fontSize: 16, color: COLORS.primary, fontWeight: '700' },

  // 2-column grid pills (for 4 options)
  optionGrid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridPill: {
    width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 14,
    borderRadius: RADIUS.lg, backgroundColor: AppColors.bg.secondary,
    borderWidth: 1.5, borderColor: '#EBEBEB',
  },
  gridPillSelected: {
    backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary,
  },
  gridPillLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#374151', flexWrap: 'wrap' },
  gridPillLabelSelected: { color: COLORS.primary },

  // Options
  optionRow: { flexDirection: 'row', gap: 10 },
  optionCard: {
    alignItems: 'center', padding: 18, borderRadius: RADIUS.lg,
    backgroundColor: AppColors.bg.secondary, borderWidth: 1.5, borderColor: '#EBEBEB', gap: 8,
  },
  optionCardSelected: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  optionIcon: { fontSize: 32 },
  optionLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, textAlign: 'center' },
  optionLabelSelected: { color: COLORS.primary },
  optionCheckCircle: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#059669', alignItems: 'center', justifyContent: 'center',
  },
  optionCheck: { fontSize: 12, color: '#fff', fontWeight: '700' },

  // Mood
  moodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  moodCard: {
    alignItems: 'center', padding: 14, borderRadius: RADIUS.lg,
    backgroundColor: AppColors.bg.secondary, borderWidth: 1.5, borderColor: '#EBEBEB', gap: 6,
  },
  moodCardSelected: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  moodEmoji: { fontSize: 32 },
  moodLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  moodLabelSelected: { color: COLORS.primary, fontWeight: '700' },
  moodScoreContainer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 16, backgroundColor: COLORS.primaryBg,
    borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 8, alignSelf: 'center',
  },
  moodScoreEmoji: { fontSize: 18 },
  moodScore: { fontSize: 14, color: COLORS.primary, fontWeight: '700' },

  // Caregiver support note
  caregiverSupportNote: {
    marginTop: 14, backgroundColor: '#FDF4FF', borderRadius: RADIUS.lg,
    padding: 12, borderWidth: 1, borderColor: '#E9D5FF',
  },
  caregiverSupportText: {
    fontSize: 13, color: AppColors.purple.strong, textAlign: 'center', lineHeight: 20, fontWeight: '500',
  },

  // Notes
  noteInput: {
    backgroundColor: AppColors.bg.secondary, borderRadius: RADIUS.lg, padding: 16,
    fontSize: 15, color: COLORS.text, borderWidth: 1.5, borderColor: '#EBEBEB',
    minHeight: 110, textAlignVertical: 'top', lineHeight: 22,
  },
  mealCustomInput: {
    backgroundColor: AppColors.bg.secondary, borderRadius: RADIUS.lg, padding: 14,
    fontSize: 14, color: COLORS.text, borderWidth: 1.5, borderColor: AppColors.border.soft,
    marginTop: 4, lineHeight: 20,
  },
  noteHint: {
    fontSize: 12, color: COLORS.textMuted, marginTop: 8, lineHeight: 18,
  },

  sleepToggleRow: {
    flexDirection: 'row', gap: 8, marginBottom: 4,
  },
  sleepToggleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: RADIUS.lg,
    backgroundColor: AppColors.bg.secondary, alignItems: 'center',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  sleepToggleBtnActive: {
    backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary,
  },
  sleepToggleText: { fontSize: 14, fontWeight: '600', color: '#9BA1A6' },
  sleepToggleTextActive: { color: COLORS.primary },

  segmentTotalBar: {
    backgroundColor: '#EEF9EE', borderRadius: RADIUS.lg,
    padding: 10, alignItems: 'center',
  },
  segmentTotalText: { fontSize: 15, fontWeight: '700', color: '#059669' },

  segmentCard: {
    backgroundColor: AppColors.bg.secondary, borderRadius: RADIUS.lg,
    padding: 14, borderWidth: 1, borderColor: AppColors.border.soft,
  },
  segmentHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  segmentTitle: { fontSize: 13, fontWeight: '700', color: '#374151' },
  segmentRemoveBtn: { fontSize: 16, color: '#EF4444', fontWeight: '700', padding: 4 },

  segmentTimeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  segmentTimeBlock: { flex: 1, alignItems: 'center', gap: 6 },
  segmentTimeLabel: { fontSize: 12, fontWeight: '600', color: '#9BA1A6' },
  segmentArrow: { fontSize: 18, color: '#9BA1A6', fontWeight: '700' },

  timePickerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeAdjustBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: AppColors.border.soft, alignItems: 'center', justifyContent: 'center',
  },
  timeAdjustText: { fontSize: 18, fontWeight: '700', color: '#374151' },
  timeDisplay: {
    fontSize: 20, fontWeight: '800', color: '#11181C',
    minWidth: 60, textAlign: 'center',
  },
  timeAdjustBtnSmall: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    backgroundColor: AppColors.bg.secondary,
  },
  timeAdjustTextSmall: { fontSize: 11, fontWeight: '600', color: AppColors.text.secondary },

  addSegmentBtn: {
    borderRadius: RADIUS.lg, padding: 12,
    borderWidth: 1.5, borderColor: COLORS.primary, borderStyle: 'dashed',
    alignItems: 'center',
  },
  addSegmentText: { fontSize: 14, fontWeight: '600', color: COLORS.primary },

  counterRow: {
    flexDirection: 'row', alignItems: 'center', gap: 20,
  },
  counterBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.primaryBg, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: COLORS.primary,
  },
  counterBtnDisabled: {
    backgroundColor: AppColors.bg.secondary, borderColor: AppColors.border.soft,
  },
  counterBtnText: { fontSize: 24, fontWeight: '700', color: COLORS.primary },
  counterDisplay: { alignItems: 'center' },
  counterValue: { fontSize: 48, fontWeight: '900', color: '#11181C' },
  counterUnit: { fontSize: 14, fontWeight: '600', color: '#9BA1A6', marginTop: -4 },

  napScrollRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16,
  },
  napDisplay: { alignItems: 'center', minWidth: 140 },
  napValue: { fontSize: 22, fontWeight: '800', color: '#11181C' },
  napUnit: { fontSize: 12, color: '#9BA1A6', marginTop: 2 },
  napQuickRow: {
    flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
  },
  napQuickBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: AppColors.bg.secondary, borderWidth: 1, borderColor: AppColors.border.soft,
  },
  napQuickBtnActive: {
    backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary,
  },
  napQuickText: { fontSize: 13, fontWeight: '600', color: AppColors.text.secondary },
  napQuickTextActive: { color: COLORS.primary },

  // Nav
  navRow: { flexDirection: 'row', gap: 12 },
  backBtn: {
    flex: 1, padding: 16, borderRadius: RADIUS.xl,
    backgroundColor: AppColors.bg.secondary, alignItems: 'center',
    borderWidth: 1, borderColor: '#EBEBEB',
  },
  backBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  nextBtn: {
    padding: 16, borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primary, alignItems: 'center',
    ...SHADOWS.glow(COLORS.primary),
  },
  nextBtnFinish: { backgroundColor: COLORS.secondary, ...SHADOWS.glow(COLORS.secondary) },
  nextBtnDisabled: { backgroundColor: AppColors.border.soft },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Done
  doneContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  doneEmojiCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    ...SHADOWS.glow(COLORS.primary),
  },
  doneEmoji: { fontSize: 52 },
  doneTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  doneSub: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  doneBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.xl,
    paddingHorizontal: 32, paddingVertical: 14,
    ...SHADOWS.glow(COLORS.primary),
    marginBottom: 12,
  },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  doneBtnSecondary: {
    paddingHorizontal: 24, paddingVertical: 10,
  },
  doneBtnSecondaryText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },

  // ── Night / Evening done screen ──
  nightMoonOuter: {
    width: 210, height: 210, borderRadius: 105,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28,
    shadowColor: '#C4B5FD', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 50, elevation: 30,
  },
  nightMoonInner: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  nightCheckBadge: {
    position: 'absolute', bottom: -8, right: -12,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#22C55E',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#22C55E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.6, shadowRadius: 8, elevation: 8,
  },
  nightCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 32, padding: 28,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  nightTitle: { fontSize: 28, fontWeight: '800', color: AppColors.surface.whiteStrong, textAlign: 'center', marginBottom: 10 },
  nightSparkleRow: { alignItems: 'center', marginBottom: 8 },
  nightSparkle: { fontSize: 17, color: '#FCD34D', fontWeight: '700' },
  nightSub: { fontSize: 15, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 24, marginBottom: 20 },
  nightStreakBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24, paddingVertical: 10, paddingHorizontal: 16, marginBottom: 22,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  nightStreakDots: { flexDirection: 'row', gap: 5 },
  nightStreakDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ADE80' },
  nightStreakText: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  nightDiaryBtn: { borderRadius: 18, overflow: 'hidden', marginBottom: 14,
    shadowColor: '#EC4899', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 12 },
  nightDiaryBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 18, paddingHorizontal: 24, gap: 10,
  },
  nightDiaryIcon: { fontSize: 22 },
  nightDiaryBtnText: { fontSize: 18, fontWeight: '800', color: '#fff' },
  nightHomeBtn: {
    alignItems: 'center', paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  nightHomeBtnText: { fontSize: 15, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  nightFooter: { marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
});

// ─── Calendar Styles ──────────────────────────────────────────────────────────
const CELL_SIZE = Math.floor((width - 76) / 7);
const calStyles = StyleSheet.create({
  sectionHeader: { marginTop: 20, marginBottom: 10, flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  sectionSub: { fontSize: 12, color: COLORS.textMuted },

  wrapper: {
    backgroundColor: AppColors.surface.whiteStrong,
    borderRadius: RADIUS.xxl,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    ...SHADOWS.md,
  },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  navBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  navBtnText: { fontSize: 22, color: COLORS.primary, fontWeight: '700' },
  monthTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },

  weekRow: { flexDirection: 'row', marginBottom: 6 },
  weekLabel: { width: CELL_SIZE, textAlign: 'center', fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL_SIZE, height: CELL_SIZE + 6, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4 },
  dayCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  dayCircleToday: { borderWidth: 2, borderColor: COLORS.primary },
  dayCircleDone: { backgroundColor: '#059669' },
  dayNum: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  dayNumFuture: { color: '#D1D5DB' },
  dayNumToday: { color: COLORS.primary, fontWeight: '800' },
  dayNumDone: { color: '#fff', fontWeight: '700' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 1 },
  dotBoth: { backgroundColor: '#059669' },
  dotMorning: { backgroundColor: '#F59E0B' },
  dotEvening: { backgroundColor: AppColors.purple.strong },

  legendRow: { flexDirection: 'row', gap: 16, marginTop: 12, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: COLORS.textMuted },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  popup: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: RADIUS.xxl, padding: 20,
    width: '100%', maxWidth: 340,
    ...SHADOWS.lg,
  },
  popupDateRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  popupDateEmoji: { fontSize: 20 },
  popupDate: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  popupDivider: { height: 1, backgroundColor: '#F0F0F0', marginBottom: 12 },
  popupSection: { marginBottom: 12 },
  popupSectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  popupItem: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 3 },
  popupNote: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 4 },
  popupClose: {
    marginTop: 12, paddingVertical: 10, borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primaryBg, alignItems: 'center',
  },
  popupCloseText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },

  scoreBadge: {
    marginLeft: 'auto',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  scoreBadgeText: {
    fontSize: 13,
    fontWeight: '800',
  },

  briefingLoadingRow: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  briefingLoadingText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },

  briefingContent: {
    gap: 10,
  },
  briefingSummaryBox: {
    backgroundColor: '#F7F3FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(124,103,200,0.15)',
  },
  briefingSummaryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: AppColors.purple.strong,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  briefingSummaryText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 20,
  },
  briefingEncouragementBox: {
    backgroundColor: '#FDF9F0',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(233,197,143,0.3)',
  },
  briefingEncouragementText: {
    fontSize: 12,
    color: '#7A6040',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  briefingStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  briefingStat: {
    flex: 1,
    backgroundColor: '#F9F6FF',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: 'rgba(206,196,242,0.3)',
  },
  briefingStatEmoji: { fontSize: 18 },
  briefingStatLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '600' },

  noBriefingHint: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingVertical: 8,
    fontStyle: 'italic',
    marginBottom: 4,
  },
});

export default function CheckinScreen() {
  const [isCreator, setIsCreator] = useState<boolean | null>(null);
  useFocusEffect(useCallback(() => { getCurrentUserIsCreator().then(v => setIsCreator(v)); }, []));
  if (isCreator === null) return null;
  if (!isCreator) return (
    <JoinerLockedScreen
      icon="✨"
      title="每日打卡"
      description="记录家人每天的状态是主要照顾者的专属功能。"
    />
  );
  return <CheckinScreenContent />;
}
