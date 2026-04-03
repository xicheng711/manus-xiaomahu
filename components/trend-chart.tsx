import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { DailyCheckIn, DiaryEntry } from '@/lib/storage';
import { AppColors } from '@/lib/design-tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_W = SCREEN_WIDTH - 80;

type Period = '7d' | 'year';

// emoji → 数字分数（满分10，对应日记里的5档心情）
const CAREGIVER_MOOD_SCORE: Record<string, number> = {
  '😊': 10, // 挺好的
  '😌': 8,  // 还行
  '😕': 7,  // 有点累
  '😢': 5,  // 不太好
  '😤': 2,  // 快撑不住了
};

interface TrendChartProps {
  checkIns: DailyCheckIn[];
  diaryEntries?: DiaryEntry[];
  patientNickname?: string;
  caregiverName?: string;
}

function getWeekRange(offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  // Start from Monday: if today is Sunday (0), go back 6 days; otherwise go back (dayOfWeek-1) days
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - daysToMonday + (offset * 7));
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const label = `${startOfWeek.getMonth() + 1}月${startOfWeek.getDate()}日 至 ${endOfWeek.getMonth() + 1}月${endOfWeek.getDate()}日`;
  return { start: startOfWeek, end: endOfWeek, label };
}

function getMonthRange(offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const label = `${start.getFullYear()}年${start.getMonth() + 1}月`;
  return { start, end, label };
}

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function buildDateRange(start: Date, end: Date): string[] {
  const range: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    range.push(dateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return range;
}

function MoodGauge({ avgMood, prevAvg }: { avgMood: number; prevAvg: number | null }) {
  const pct = Math.min(1, Math.max(0, avgMood / 10));
  const accentColor = avgMood >= 8 ? '#16A34A' : avgMood >= 5 ? '#F59E0B' : '#F97316';
  const emoji = avgMood >= 8 ? '😄' : avgMood >= 6 ? '😊' : avgMood >= 4 ? '😌' : avgMood >= 2 ? '😕' : '😢';
  const statusLabel = avgMood >= 8 ? '本周心情很好' : avgMood >= 6 ? '本周心情不错' : avgMood >= 4 ? '本周心情平稳' : avgMood >= 2 ? '本周心情一般' : '本周需要关注';

  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progressAnim, { toValue: pct, duration: 1200, delay: 300, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [avgMood]);
  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={gaugeStyles.row}>
      <View style={[gaugeStyles.badge, { backgroundColor: AppColors.peach.soft }]}>
        <Text style={gaugeStyles.badgeEmoji}>{emoji}</Text>
        <Text style={[gaugeStyles.badgeScore, { color: accentColor }]}>{avgMood.toFixed(1)}</Text>
      </View>
      <View style={gaugeStyles.stats}>
        <View style={gaugeStyles.topRow}>
          <Text style={[gaugeStyles.statusLabel, { color: accentColor }]}>{statusLabel}</Text>
          <Text style={gaugeStyles.scoreSmall}><Text style={{ color: accentColor, fontWeight: '800' }}>{avgMood.toFixed(1)}</Text> / 10</Text>
        </View>
        <View style={gaugeStyles.progressLabelRow}>
          <Text style={gaugeStyles.progressLabel}>心情健康度</Text>
          <Text style={[gaugeStyles.progressPct, { color: accentColor }]}>{Math.round(pct * 100)}%</Text>
        </View>
        <View style={gaugeStyles.progressTrack}>
          <Animated.View style={[gaugeStyles.progressFill, { width: progressWidth, backgroundColor: accentColor }]} />
        </View>
      </View>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  badge: {
    width: 60, height: 60, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', gap: 0,
  },
  badgeEmoji: { fontSize: 24, lineHeight: 28 },
  badgeScore: { fontSize: 11, fontWeight: '800', lineHeight: 14 },
  stats: { flex: 1, gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusLabel: { fontSize: 14, fontWeight: '700' },
  scoreSmall: { fontSize: 12, color: AppColors.text.tertiary },
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  progressLabel: { fontSize: 12, color: AppColors.text.tertiary, fontWeight: '500' },
  progressPct: { fontSize: 12, fontWeight: '700' },
  progressTrack: {
    height: 8, backgroundColor: AppColors.border.soft, borderRadius: 4, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
});

const MOOD_EMOJIS: Record<string, { emoji: string; label: string }> = {
  '😄': { emoji: '😄', label: '很开心' },
  '😊': { emoji: '😊', label: '还不错' },
  '😌': { emoji: '😌', label: '平静' },
  '😕': { emoji: '😕', label: '有点累' },
  '😢': { emoji: '😢', label: '不太好' },
  '😤': { emoji: '😤', label: '烦躁' },
};

function MoodDistribution({ checkIns }: { checkIns: DailyCheckIn[] }) {
  const counts: Record<string, number> = {};
  checkIns.forEach(c => {
    if (c.moodEmoji) {
      counts[c.moodEmoji] = (counts[c.moodEmoji] || 0) + 1;
    }
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, n]) => s + n, 0);
  const topMood = sorted[0];

  if (sorted.length === 0) {
    return (
      <View style={distStyles.card}>
        <Text style={distStyles.title}>心情分布</Text>
        <Text style={distStyles.empty}>暂无数据</Text>
      </View>
    );
  }

  return (
    <View style={distStyles.card}>
      <Text style={distStyles.title}>心情分布</Text>
      <View style={distStyles.emojiRow}>
        {sorted.slice(0, 5).map(([emoji, count]) => (
          <View key={emoji} style={distStyles.emojiItem}>
            <View style={distStyles.emojiCircle}>
              <Text style={distStyles.emoji}>{emoji}</Text>
              <View style={distStyles.countBadge}>
                <Text style={distStyles.countText}>{count}</Text>
              </View>
            </View>
            <Text style={distStyles.emojiLabel}>{MOOD_EMOJIS[emoji]?.label ?? ''}</Text>
          </View>
        ))}
      </View>
      <View style={distStyles.summaryRow}>
        <Text style={distStyles.summaryText}>共记录心情：{total}条</Text>
        {topMood && (
          <Text style={distStyles.summaryText}>最多心情：{MOOD_EMOJIS[topMood[0]]?.label ?? topMood[0]}</Text>
        )}
      </View>
    </View>
  );
}

const distStyles = StyleSheet.create({
  card: { backgroundColor: AppColors.surface.whiteStrong, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: AppColors.border.soft },
  title: { fontSize: 14, fontWeight: '700', color: AppColors.text.primary, marginBottom: 14 },
  empty: { fontSize: 13, color: AppColors.text.tertiary, textAlign: 'center', paddingVertical: 16 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 },
  emojiItem: { alignItems: 'center', gap: 4 },
  emojiCircle: { position: 'relative' },
  emoji: { fontSize: 32 },
  countBadge: {
    position: 'absolute', top: -4, right: -8,
    backgroundColor: AppColors.coral.primary, borderRadius: 10, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  countText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  emojiLabel: { fontSize: 11, color: AppColors.text.tertiary, fontWeight: '500' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: AppColors.bg.secondary, paddingTop: 10 },
  summaryText: { fontSize: 12, color: AppColors.text.tertiary },
});

function SmoothCurveChart({ data, color }: {
  data: { label: string; value: number; hasData: boolean }[];
  color: string;
}) {
  const chartH = 100;
  const maxVal = 10;
  const validData = data.filter(d => d.hasData);

  if (validData.length < 2) {
    return (
      <View style={[curveStyles.emptyChart, { height: chartH }]}>
        <Text style={curveStyles.emptyText}>需要至少2天数据才能显示趋势</Text>
      </View>
    );
  }

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * CHART_W,
    y: d.hasData ? chartH - (d.value / maxVal) * chartH : -1,
    hasData: d.hasData,
    value: d.value,
    label: d.label,
  }));

  const yLabels = ['😄', '😊', '😐', '😕', '😢'];

  return (
    <View>
      <View style={curveStyles.chartContainer}>
        <View style={curveStyles.yAxis}>
          {yLabels.map((e, i) => (
            <Text key={i} style={curveStyles.yEmoji}>{e}</Text>
          ))}
        </View>
        <View style={[curveStyles.chartArea, { height: chartH }]}>
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
            <View key={i} style={[curveStyles.gridLine, { bottom: `${pct * 100}%` }]} />
          ))}
          {points.map((p, i) => {
            if (!p.hasData) return null;
            return (
              <View key={i}>
                <View style={[curveStyles.dot, {
                  left: p.x - 5,
                  bottom: (p.value / maxVal) * chartH - 5,
                  backgroundColor: color,
                }]} />
                <View style={[curveStyles.valueLabel, {
                  left: p.x - 12,
                  bottom: (p.value / maxVal) * chartH + 8,
                }]}>
                  <Text style={[curveStyles.valueLabelText, { color }]}>{p.value}</Text>
                </View>
              </View>
            );
          })}
          {points.reduce<React.ReactNode[]>((acc, p, i) => {
            if (i === 0 || !p.hasData) return acc;
            const prev = points.slice(0, i).reverse().find(pp => pp.hasData);
            if (!prev) return acc;
            const dx = p.x - prev.x;
            const dy = (p.value / maxVal) * chartH - (prev.value / maxVal) * chartH;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(-dy, dx) * (180 / Math.PI);
            acc.push(
              <View
                key={`line-${i}`}
                style={[curveStyles.line, {
                  width: len,
                  left: prev.x,
                  bottom: (prev.value / maxVal) * chartH - 1,
                  backgroundColor: color + '60',
                  transform: [{ rotate: `${angle}deg` }],
                  transformOrigin: 'left center',
                }]}
              />
            );
            return acc;
          }, [])}
        </View>
      </View>
      <View style={curveStyles.xAxis}>
        {data.map((d, i) => (
          <Text key={i} style={curveStyles.xLabel} numberOfLines={1}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

const curveStyles = StyleSheet.create({
  chartContainer: { flexDirection: 'row' },
  yAxis: { width: 24, justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  yEmoji: { fontSize: 14 },
  chartArea: { flex: 1, position: 'relative', marginLeft: 8 },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: AppColors.border.soft },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: AppColors.surface.whiteStrong },
  valueLabel: { position: 'absolute' },
  valueLabelText: { fontSize: 10, fontWeight: '700', textAlign: 'center', width: 24 },
  line: { position: 'absolute', height: 2.5, borderRadius: 1.5 },
  emptyChart: { alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.bg.secondary, borderRadius: 12 },
  emptyText: { fontSize: 13, color: AppColors.text.tertiary },
  xAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingLeft: 32 },
  xLabel: { fontSize: 10, color: AppColors.text.tertiary, textAlign: 'center', flex: 1 },
});

function SleepChart({ data }: { data: { label: string; value: number; hasData: boolean; isToday?: boolean; nightWakings?: number; nightAwakeShort?: string | null }[] }) {
  const chartH = 110;
  const maxVal = 12;
  const barW = 22;

  return (
    <View style={sleepStyles.root}>
      {/* Y-axis */}
      <View style={[sleepStyles.yAxis, { height: chartH }]}>
        <Text style={sleepStyles.yLabel}>12h</Text>
        <Text style={sleepStyles.yLabel}>6h</Text>
        <Text style={sleepStyles.yLabel}>0</Text>
      </View>

      {/* Bars */}
      <View style={sleepStyles.barsArea}>
        {data.map((d, i) => {
          const fillH = d.hasData ? Math.max(6, (d.value / maxVal) * chartH) : 0;
          const barColor = !d.hasData
            ? 'transparent'
            : d.value >= 7 ? AppColors.green.primary
            : d.value >= 5 ? '#F0A500'
            : AppColors.coral.primary;
          const labelColor = !d.hasData ? AppColors.text.tertiary
            : d.value >= 7 ? AppColors.green.primary
            : d.value >= 5 ? '#F0A500'
            : AppColors.coral.primary;
          const isToday = d.isToday ?? false;
          const hasWaking = d.hasData && (d.nightWakings ?? 0) > 0;

          return (
            <View key={i} style={sleepStyles.barCol}>
              {/* sleep value label */}
              <Text style={[sleepStyles.valueLabel, { color: labelColor, opacity: d.hasData ? 1 : 0 }]}>
                {d.hasData ? `${d.value}h` : ''}
              </Text>
              {/* track + fill */}
              <View style={[sleepStyles.track, { height: chartH, width: barW }]}>
                <View style={[sleepStyles.fill, { height: fillH, width: barW, backgroundColor: barColor }]} />
              </View>
              {/* day label */}
              <Text style={[sleepStyles.dayLabel, isToday && sleepStyles.dayLabelToday]}>
                {d.label}
              </Text>
              {/* night waking indicator */}
              <View style={sleepStyles.wakeRow}>
                {hasWaking ? (
                  <Text style={sleepStyles.wakeLabel}>
                    {'🌙'}{d.nightWakings}{d.nightAwakeShort ? ` ${d.nightAwakeShort}` : '次'}
                  </Text>
                ) : (
                  <Text style={sleepStyles.wakeEmpty}>{d.hasData ? '—' : ''}</Text>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const sleepStyles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  yAxis: { width: 26, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 4, paddingTop: 16 },
  yLabel: { fontSize: 9, color: AppColors.text.tertiary },
  barsArea: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  barCol: { alignItems: 'center', gap: 4 },
  valueLabel: { fontSize: 10, fontWeight: '600', marginBottom: 2, minHeight: 14 },
  track: {
    backgroundColor: AppColors.border.soft,
    borderRadius: 8,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 8,
  },
  dayLabel: { fontSize: 10, color: AppColors.text.tertiary, marginTop: 4 },
  dayLabelToday: { color: AppColors.green.primary, fontWeight: '700' },
  wakeRow: { alignItems: 'center', marginTop: 2, minHeight: 14 },
  wakeLabel: { fontSize: 9, color: AppColors.purple.strong, fontWeight: '600' },
  wakeEmpty: { fontSize: 9, color: AppColors.border.soft },
});

// ─── Nap Bar Chart ──────────────────────────────────────────────────────────
function NapChart({ data }: {
  data: { label: string; value: number; hasData: boolean; isToday?: boolean }[];
}) {
  const chartH = 90;
  const maxVal = 120; // max 120 minutes
  const barW = 22;

  return (
    <View style={napStyles.root}>
      {/* Y-axis */}
      <View style={[napStyles.yAxis, { height: chartH }]}>
        <Text style={napStyles.yLabel}>2h</Text>
        <Text style={napStyles.yLabel}>1h</Text>
        <Text style={napStyles.yLabel}>0</Text>
      </View>

      {/* Bars */}
      <View style={napStyles.barsArea}>
        {data.map((d, i) => {
          const fillH = d.hasData ? Math.max(4, (d.value / maxVal) * chartH) : 0;
          const barColor = d.hasData ? '#F59E0B' : 'transparent';
          const labelColor = d.hasData ? '#D97706' : AppColors.text.tertiary;
          const isToday = d.isToday ?? false;

          return (
            <View key={i} style={napStyles.barCol}>
              <Text style={[napStyles.valueLabel, { color: labelColor, opacity: d.hasData ? 1 : 0 }]}>
                {d.hasData ? (d.value >= 60 ? `${(d.value / 60).toFixed(1)}h` : `${d.value}m`) : ''}
              </Text>
              <View style={[napStyles.track, { height: chartH, width: barW }]}>
                <View style={[napStyles.fill, { height: fillH, width: barW, backgroundColor: barColor }]} />
              </View>
              <Text style={[napStyles.dayLabel, isToday && napStyles.dayLabelToday]}>
                {d.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const napStyles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  yAxis: { width: 26, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 4, paddingTop: 16 },
  yLabel: { fontSize: 9, color: AppColors.text.tertiary },
  barsArea: { flex: 1, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  barCol: { alignItems: 'center', gap: 4 },
  valueLabel: { fontSize: 10, fontWeight: '600', marginBottom: 2, minHeight: 14 },
  track: {
    backgroundColor: AppColors.border.soft,
    borderRadius: 8,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  fill: { borderRadius: 8 },
  dayLabel: { fontSize: 10, color: AppColors.text.tertiary, marginTop: 4 },
  dayLabelToday: { color: '#F59E0B', fontWeight: '700' },
});

function MedicationChart({ data }: { data: { label: string; taken: boolean | null }[] }) {
  const takenCount = data.filter(d => d.taken === true).length;
  const missedCount = data.filter(d => d.taken === false).length;

  return (
    <View>
      <View style={medStyles.dotGrid}>
        {data.map((d, i) => (
          <View key={i} style={medStyles.dotCol}>
            <View style={[
              medStyles.dot,
              d.taken === null ? medStyles.dotEmpty : d.taken ? medStyles.dotGreen : medStyles.dotRed,
            ]}>
              <Text style={medStyles.dotText}>
                {d.taken === null ? '—' : d.taken ? '✓' : '✗'}
              </Text>
            </View>
            <Text style={medStyles.dotLabel}>{d.label}</Text>
          </View>
        ))}
      </View>
      <View style={medStyles.legend}>
        <View style={medStyles.legendItem}>
          <View style={[medStyles.legendDot, { backgroundColor: AppColors.green.soft }]} />
          <Text style={medStyles.legendText}>按时 {takenCount}天</Text>
        </View>
        <View style={medStyles.legendItem}>
          <View style={[medStyles.legendDot, { backgroundColor: AppColors.coral.soft }]} />
          <Text style={medStyles.legendText}>漏药 {missedCount}天</Text>
        </View>
      </View>
    </View>
  );
}

const medStyles = StyleSheet.create({
  dotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 12 },
  dotCol: { alignItems: 'center', minWidth: 30 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  dotEmpty: { backgroundColor: AppColors.border.soft },
  dotGreen: { backgroundColor: AppColors.green.soft },
  dotRed: { backgroundColor: AppColors.coral.soft },
  dotText: { fontSize: 12, fontWeight: '700' },
  dotLabel: { fontSize: 9, color: AppColors.text.tertiary },
  legend: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 12, color: AppColors.text.secondary },
});

export function TrendChart({ checkIns, diaryEntries = [], patientNickname = '家人', caregiverName = '照顾者' }: TrendChartProps) {
  // 用日记的 caregiverMoodEmoji 建立 date → score 映射
  const diaryMoodMap = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of diaryEntries) {
      if (e.caregiverMoodEmoji && CAREGIVER_MOOD_SCORE[e.caregiverMoodEmoji]) {
        map[e.date] = CAREGIVER_MOOD_SCORE[e.caregiverMoodEmoji];
      }
    }
    return map;
  }, [diaryEntries]);
  const [period, setPeriod] = useState<Period>('7d');
  const [offset, setOffset] = useState(0);

  const checkInMap = new Map(checkIns.map(c => [c.date, c]));

  const currentYear = new Date().getFullYear();
  const yearLabel = `${currentYear}年`;

  const yearSleepData = Array.from({ length: 12 }, (_, m) => {
    const label = `${m + 1}月`;
    const monthCheckIns = checkIns.filter(c => {
      const d = new Date(c.date);
      return d.getFullYear() === currentYear && d.getMonth() === m;
    });
    const withSleep = monthCheckIns.filter(c => c.sleepHours > 0);
    const avg = withSleep.length > 0
      ? withSleep.reduce((s, c) => s + c.sleepHours, 0) / withSleep.length
      : 0;
    return { label, value: parseFloat(avg.toFixed(1)), hasData: withSleep.length > 0 };
  });

  const yearMedData = Array.from({ length: 12 }, (_, m) => {
    const label = `${m + 1}月`;
    const monthCheckIns = checkIns.filter(c => {
      const d = new Date(c.date);
      return d.getFullYear() === currentYear && d.getMonth() === m && c.medicationTaken !== null;
    });
    const taken = monthCheckIns.filter(c => c.medicationTaken === true).length;
    const total = monthCheckIns.length;
    return { label, taken: total > 0 ? taken >= total / 2 : null };
  });

  const range = getWeekRange(offset);
  const dateRange = buildDateRange(range.start, range.end);
  const periodLabel = offset === 0 ? '本周' : offset === -1 ? '上周' : `${Math.abs(offset)}周前`;

  const periodCheckIns = dateRange.map(d => checkInMap.get(d)).filter(Boolean) as DailyCheckIn[];

  const todayStr = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`; })();
  const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

  const sleepData = period === 'year' ? yearSleepData : dateRange.map(date => {
    const c = checkInMap.get(date);
    const d = new Date(date + 'T12:00:00');
    const wakeTime = c?.nightAwakeTime;
    const wakeShort = wakeTime === '10-30分钟' ? '<30分'
      : wakeTime === '30-60分钟' ? '<1h'
      : wakeTime === '1小时以上' ? '>1h'
      : null;
    return {
      label: DAY_LABELS[d.getDay()],
      value: c?.sleepHours ?? 0,
      hasData: !!c && c.sleepHours > 0,
      isToday: date === todayStr,
      nightWakings: c?.nightWakings ?? 0,
      nightAwakeShort: wakeShort,
    };
  });

  const medData = period === 'year' ? yearMedData : dateRange.map(date => {
    const c = checkInMap.get(date);
    const d = new Date(date + 'T12:00:00');
    return { label: DAY_LABELS[d.getDay()], taken: c ? c.medicationTaken : null };
  });

  const relevantCheckIns = period === 'year'
    ? checkIns.filter(c => new Date(c.date).getFullYear() === currentYear)
    : periodCheckIns;
  const sleepWithData = relevantCheckIns.filter(c => c.sleepHours > 0);
  const avgSleep = sleepWithData.length > 0
    ? sleepWithData.reduce((s, c) => s + c.sleepHours, 0) / sleepWithData.length : 0;
  const sleepSubtitle = avgSleep > 0
    ? `${period === 'year' ? yearLabel : periodLabel}平均 ${avgSleep.toFixed(1)}h · ${avgSleep >= 7 ? '睡眠充足 ✅' : '睡眠不足 ⚠️'}`
    : `${period === 'year' ? yearLabel : periodLabel}暂无睡眠记录`;

  // 白天小睡数据
  const yearNapData = Array.from({ length: 12 }, (_, m) => {
    const label = `${m + 1}月`;
    const monthCheckIns = checkIns.filter(c => {
      const d = new Date(c.date);
      return d.getFullYear() === currentYear && d.getMonth() === m;
    });
    const withNap = monthCheckIns.filter(c => (c.napMinutes ?? 0) > 0);
    const avg = withNap.length > 0
      ? withNap.reduce((s, c) => s + (c.napMinutes ?? 0), 0) / withNap.length
      : 0;
    return { label, value: Math.round(avg), hasData: withNap.length > 0 };
  });

  const napData = period === 'year' ? yearNapData : dateRange.map(date => {
    const c = checkInMap.get(date);
    const d = new Date(date + 'T12:00:00');
    const napMins = c?.napMinutes ?? 0;
    return {
      label: DAY_LABELS[d.getDay()],
      value: napMins,
      hasData: !!c && napMins > 0,
      isToday: date === todayStr,
    };
  });

  const napWithData = (period === 'year' ? checkIns.filter(c => new Date(c.date).getFullYear() === currentYear) : periodCheckIns)
    .filter(c => (c.napMinutes ?? 0) > 0);
  const avgNap = napWithData.length > 0
    ? napWithData.reduce((s, c) => s + (c.napMinutes ?? 0), 0) / napWithData.length : 0;
  const napSubtitle = avgNap > 0
    ? `${period === 'year' ? yearLabel : periodLabel}平均 ${avgNap >= 60 ? (avgNap / 60).toFixed(1) + 'h' : Math.round(avgNap) + '分钟'}`
    : `${period === 'year' ? yearLabel : periodLabel}暂无小睡记录`;


  // 心情分数：优先用日记里的 caregiverMoodEmoji，已废弃的 caregiverMoodScore 作为兜底
  const cgMoodDates = dateRange.filter(d => (diaryMoodMap[d] ?? (checkInMap.get(d)?.caregiverMoodScore ?? 0)) > 0);
  const avgCaregiverMood = cgMoodDates.length > 0
    ? cgMoodDates.reduce((s, d) => s + (diaryMoodMap[d] ?? checkInMap.get(d)?.caregiverMoodScore ?? 0), 0) / cgMoodDates.length : 0;

  const prevRange = getWeekRange(offset - 1);
  const prevDateRange = buildDateRange(prevRange.start, prevRange.end);
  const prevCgMoodDates = prevDateRange.filter(d => (diaryMoodMap[d] ?? (checkInMap.get(d)?.caregiverMoodScore ?? 0)) > 0);
  const prevAvgCaregiverMood = prevCgMoodDates.length > 0
    ? prevCgMoodDates.reduce((s, d) => s + (diaryMoodMap[d] ?? checkInMap.get(d)?.caregiverMoodScore ?? 0), 0) / prevCgMoodDates.length : null;

  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <View style={styles.periodToggle}>
          {(['7d', 'year'] as Period[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => { setPeriod(p); setOffset(0); }}
            >
              <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>
                {p === '7d' ? '周' : '月'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.dateNav}>
        <View>
          <Text style={styles.dateNavPeriod}>{period === 'year' ? yearLabel : periodLabel}</Text>
          <Text style={styles.dateNavRange}>{period === 'year' ? '1月 — 12月' : range.label}</Text>
        </View>
        {period === '7d' && (
          <View style={styles.dateNavArrows}>
            <TouchableOpacity style={styles.arrowBtn} onPress={() => setOffset(o => o - 1)}>
              <Text style={styles.arrowText}>‹</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.arrowBtn, offset === 0 && styles.arrowBtnDisabled]}
              onPress={() => { if (offset < 0) setOffset(o => o + 1); }}
              disabled={offset === 0}
            >
              <Text style={[styles.arrowText, offset === 0 && styles.arrowTextDisabled]}>›</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconWrap}>
            <Text style={styles.sectionIcon}>😴</Text>
          </View>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>{patientNickname}的夜晚睡眠时长</Text>
            <Text style={styles.sectionSubtitle}>{sleepSubtitle}</Text>
          </View>
        </View>
        <SleepChart data={sleepData} />
      </View>

      {/* 白天小睡 card */}
      <View style={[styles.sectionCard, { borderColor: '#FDE68A' }]}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconWrap, { backgroundColor: '#FEF3C7' }]}>
            <Text style={styles.sectionIcon}>☀️</Text>
          </View>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>{patientNickname}的白天小睡</Text>
            <Text style={styles.sectionSubtitle}>{napSubtitle}</Text>
          </View>
        </View>
        <NapChart data={napData} />
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconWrap, { backgroundColor: AppColors.coral.soft }]}>
            <Text style={styles.sectionIcon}>💊</Text>
          </View>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>{patientNickname}的用药情况</Text>
            <Text style={styles.sectionSubtitle}>{periodLabel}服药记录</Text>
          </View>
        </View>
        <MedicationChart data={medData} />
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconWrap, { backgroundColor: AppColors.peach.soft }]}>
            <Text style={styles.sectionIcon}>🌡️</Text>
          </View>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>{caregiverName}的心情指数</Text>
            <Text style={styles.sectionSubtitle}>照顾好自己，才能更好地照顾家人 💜</Text>
          </View>
        </View>
        {avgCaregiverMood > 0 ? (
          <MoodGauge avgMood={avgCaregiverMood} prevAvg={prevAvgCaregiverMood} flat />
        ) : (
          <View style={styles.emptyHint}>
            <Text style={styles.emptyHintText}>每日打卡时记录您的心情，这里会显示趋势图 😊</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 0 },
  toggleRow: { alignItems: 'center', marginBottom: 14 },
  periodToggle: {
    flexDirection: 'row', backgroundColor: AppColors.bg.secondary, borderRadius: 12, padding: 3,
  },
  periodBtn: { paddingHorizontal: 28, paddingVertical: 8, borderRadius: 10 },
  periodBtnActive: {
    backgroundColor: AppColors.surface.whiteStrong,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
  },
  periodBtnText: { fontSize: 15, fontWeight: '700', color: AppColors.text.tertiary },
  periodBtnTextActive: { color: AppColors.text.primary },
  dateNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14, paddingHorizontal: 2,
  },
  dateNavPeriod: { fontSize: 18, fontWeight: '900', color: AppColors.text.primary, letterSpacing: -0.3 },
  dateNavRange: { fontSize: 13, color: AppColors.text.tertiary, marginTop: 3 },
  dateNavArrows: { flexDirection: 'row', gap: 8 },
  arrowBtn: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: AppColors.surface.whiteStrong,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  arrowBtnDisabled: { opacity: 0.3 },
  arrowText: { fontSize: 22, fontWeight: '600', color: AppColors.text.primary, lineHeight: 26 },
  arrowTextDisabled: { color: AppColors.text.tertiary },
  sectionCard: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 20, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: AppColors.border.soft,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  sectionIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: AppColors.green.soft,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionIcon: { fontSize: 22 },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: AppColors.text.primary },
  sectionSubtitle: { fontSize: 12, color: AppColors.text.tertiary, marginTop: 2 },
  emptyHint: {
    paddingVertical: 20, alignItems: 'center',
    backgroundColor: AppColors.bg.secondary, borderRadius: 14,
  },
  emptyHintText: { fontSize: 13, color: AppColors.text.tertiary, textAlign: 'center' },
});
