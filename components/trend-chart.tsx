import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { DailyCheckIn } from '@/lib/storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_W = SCREEN_WIDTH - 80;

type Period = '7d' | 'year';

interface TrendChartProps {
  checkIns: DailyCheckIn[];
  patientNickname?: string;
  caregiverName?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getWeekRange(offset: number): { start: Date; end: Date; label: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek + (offset * 7));
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

// ─── Mood Gauge (thermometer-style — Figma redesign) ─────────────────────────
function MoodGauge({ avgMood, prevAvg }: { avgMood: number; prevAvg: number | null }) {
  const pct = Math.min(1, Math.max(0, avgMood / 10));
  // Always orange/amber for the Figma look; green only at very high scores
  const gradStart = avgMood >= 8 ? '#4ADE80' : avgMood >= 5 ? '#FBBF24' : '#F97316';
  const gradEnd   = avgMood >= 8 ? '#16A34A' : avgMood >= 5 ? '#F59E0B' : '#EF4444';
  const accentColor = avgMood >= 8 ? '#16A34A' : avgMood >= 5 ? '#F59E0B' : '#F97316';
  const bgColor = '#FFF8EE';
  const emoji = avgMood >= 8 ? '😄' : avgMood >= 6 ? '😊' : avgMood >= 4 ? '😌' : avgMood >= 2 ? '😕' : '😢';
  const statusLabel = avgMood >= 8 ? '本周心情很好' : avgMood >= 6 ? '本周心情不错' : avgMood >= 4 ? '本周心情平稳' : avgMood >= 2 ? '本周心情一般' : '本周需要关注';

  const THERMO_H = 140;
  const fillAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(fillAnim, { toValue: pct, speed: 3, bounciness: 6, useNativeDriver: false }).start();
    Animated.timing(progressAnim, { toValue: pct, duration: 1500, delay: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [avgMood]);

  const fillHeight = fillAnim.interpolate({ inputRange: [0, 1], outputRange: [0, THERMO_H] });
  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[gaugeStyles.card, { backgroundColor: bgColor }]}>
      <View style={gaugeStyles.titleRow}>
        <Text style={gaugeStyles.title}>心情指数</Text>
        <Text style={gaugeStyles.titleEmoji}>😊</Text>
      </View>
      <View style={gaugeStyles.row}>
        {/* Thermometer — wider, orange gradient */}
        <View style={gaugeStyles.thermoOuter}>
          {/* Track */}
          <View style={gaugeStyles.thermoTrack}>
            {/* Animated fill from bottom */}
            <Animated.View style={[gaugeStyles.thermoFillWrapper, { height: fillHeight }]}>
              <LinearGradient
                colors={[gradEnd, gradStart]}
                start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </View>
          {/* Bulb — large circle with emoji + white highlight */}
          <View style={[gaugeStyles.thermoBulb, { backgroundColor: accentColor }]}>
            <Text style={gaugeStyles.thermoBulbEmoji}>{emoji}</Text>
            {/* White highlight */}
            <View style={gaugeStyles.bulbHighlight} />
          </View>
        </View>

        {/* Stats column */}
        <View style={gaugeStyles.stats}>
          {/* Big number */}
          <View style={gaugeStyles.numRow}>
            <Text style={[gaugeStyles.avgNum, { color: accentColor }]}>{avgMood.toFixed(1)}</Text>
            <Text style={gaugeStyles.avgLabel}> / 10</Text>
          </View>
          {/* Status label pill */}
          <View style={[gaugeStyles.statusPill, { backgroundColor: '#fff' }]}>
            <Text style={gaugeStyles.statusEmoji}>{emoji}</Text>
            <Text style={[gaugeStyles.statusText, { color: accentColor }]}>{statusLabel}</Text>
          </View>
          {/* Progress bar */}
          <View style={gaugeStyles.progressSection}>
            <View style={gaugeStyles.progressLabelRow}>
              <Text style={gaugeStyles.progressLabel}>心情健康度</Text>
              <Text style={[gaugeStyles.progressPct, { color: accentColor }]}>{Math.round(pct * 100)}%</Text>
            </View>
            <View style={gaugeStyles.progressTrack}>
              <Animated.View style={[gaugeStyles.progressFill, { width: progressWidth, backgroundColor: accentColor }]} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  card: { borderRadius: 20, padding: 18, marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  title: { fontSize: 15, fontWeight: '800', color: '#374151' },
  titleEmoji: { fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 24 },
  // Thermometer
  thermoOuter: { alignItems: 'center', width: 52 },
  thermoTrack: {
    width: 22, height: 140, backgroundColor: '#E5E7EB', borderRadius: 11,
    overflow: 'hidden', justifyContent: 'flex-end',
  },
  thermoFillWrapper: { width: '100%', overflow: 'hidden', borderRadius: 11 },
  thermoBulb: {
    width: 52, height: 52, borderRadius: 26, marginTop: -10,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  thermoBulbEmoji: { fontSize: 26 },
  bulbHighlight: {
    position: 'absolute', top: 8, left: 10,
    width: 12, height: 8, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  // Stats
  stats: { flex: 1 },
  numRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  avgNum: { fontSize: 52, fontWeight: '900', lineHeight: 56 },
  avgLabel: { fontSize: 16, color: '#9B9B9B', marginBottom: 8 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    marginBottom: 14, alignSelf: 'flex-start',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  statusEmoji: { fontSize: 16 },
  statusText: { fontSize: 14, fontWeight: '700' },
  // Progress bar
  progressSection: {},
  progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 12, color: '#9B9B9B', fontWeight: '500' },
  progressPct: { fontSize: 12, fontWeight: '700' },
  progressTrack: {
    height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
});

// ─── Mood Distribution ───────────────────────────────────────────────────────
const MOOD_EMOJIS: Record<string, { emoji: string; label: string }> = {
  '😄': { emoji: '😄', label: '很开心' },
  '😊': { emoji: '😊', label: '还不错' },
  '😌': { emoji: '😌', label: '平静' },
  '😕': { emoji: '😕', label: '有点累' },
  '😢': { emoji: '😢', label: '不太好' },
  '😤': { emoji: '😤', label: '烦躁' },
};

function MoodDistribution({ checkIns }: { checkIns: DailyCheckIn[] }) {
  // Count mood emojis
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
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F0F0EE' },
  title: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 14 },
  empty: { fontSize: 13, color: '#9B9B9B', textAlign: 'center', paddingVertical: 16 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 14 },
  emojiItem: { alignItems: 'center', gap: 4 },
  emojiCircle: { position: 'relative' },
  emoji: { fontSize: 32 },
  countBadge: {
    position: 'absolute', top: -4, right: -8,
    backgroundColor: '#FF6B6B', borderRadius: 10, minWidth: 18, height: 18,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  countText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  emojiLabel: { fontSize: 11, color: '#9B9B9B', fontWeight: '500' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 10 },
  summaryText: { fontSize: 12, color: '#9B9B9B' },
});

// ─── Smooth Curve Chart (SVG-like with RN Views) ────────────────────────────
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

  // Calculate points
  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * CHART_W,
    y: d.hasData ? chartH - (d.value / maxVal) * chartH : -1,
    hasData: d.hasData,
    value: d.value,
    label: d.label,
  }));

  // Y-axis emoji labels
  const yLabels = ['😄', '😊', '😐', '😕', '😢'];

  return (
    <View>
      <View style={curveStyles.chartContainer}>
        {/* Y-axis emojis */}
        <View style={curveStyles.yAxis}>
          {yLabels.map((e, i) => (
            <Text key={i} style={curveStyles.yEmoji}>{e}</Text>
          ))}
        </View>
        {/* Chart area */}
        <View style={[curveStyles.chartArea, { height: chartH }]}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => (
            <View key={i} style={[curveStyles.gridLine, { bottom: `${pct * 100}%` }]} />
          ))}
          {/* Data points and connecting lines */}
          {points.map((p, i) => {
            if (!p.hasData) return null;
            return (
              <View key={i}>
                {/* Point */}
                <View style={[curveStyles.dot, {
                  left: p.x - 5,
                  bottom: (p.value / maxVal) * chartH - 5,
                  backgroundColor: color,
                }]} />
                {/* Value label */}
                <View style={[curveStyles.valueLabel, {
                  left: p.x - 12,
                  bottom: (p.value / maxVal) * chartH + 8,
                }]}>
                  <Text style={[curveStyles.valueLabelText, { color }]}>{p.value}</Text>
                </View>
              </View>
            );
          })}
          {/* Connecting line segments */}
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
      {/* X-axis labels */}
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
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#F0F0EE' },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#fff' },
  valueLabel: { position: 'absolute' },
  valueLabelText: { fontSize: 10, fontWeight: '700', textAlign: 'center', width: 24 },
  line: { position: 'absolute', height: 2.5, borderRadius: 1.5 },
  emptyChart: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAFAF8', borderRadius: 12 },
  emptyText: { fontSize: 13, color: '#BBBBB8' },
  xAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingLeft: 32 },
  xLabel: { fontSize: 10, color: '#BBBBB8', textAlign: 'center', flex: 1 },
});

// ─── Sleep Bar Chart ─────────────────────────────────────────────────────────
function SleepChart({ data }: { data: { label: string; value: number; hasData: boolean }[] }) {
  const chartH = 100;
  const maxVal = 12;
  const barW = Math.max(8, Math.min(20, (CHART_W - 20) / data.length - 4));

  return (
    <View>
      <View style={sleepStyles.chartArea}>
        <View style={sleepStyles.yAxis}>
          <Text style={sleepStyles.yLabel}>12h</Text>
          <Text style={sleepStyles.yLabel}>6h</Text>
          <Text style={sleepStyles.yLabel}>0</Text>
        </View>
        <View style={[sleepStyles.barsContainer, { height: chartH }]}>
          {[0, 0.5, 1].map((pct, i) => (
            <View key={i} style={[sleepStyles.gridLine, { bottom: `${pct * 100}%` }]} />
          ))}
          {data.map((d, i) => {
            const h = d.hasData ? Math.max(4, (d.value / maxVal) * chartH) : 0;
            const color = d.value >= 7 ? '#6EE7B7' : d.value >= 5 ? '#FCD34D' : '#FCA5A5';
            return (
              <View key={i} style={sleepStyles.barCol}>
                <View style={sleepStyles.barWrapper}>
                  {d.hasData ? (
                    <>
                      <Text style={sleepStyles.barValue}>{d.value}h</Text>
                      <View style={[sleepStyles.bar, { height: h, backgroundColor: color, width: barW, borderRadius: barW / 2 }]} />
                    </>
                  ) : (
                    <View style={[sleepStyles.barEmpty, { width: barW, borderRadius: barW / 2 }]} />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </View>
      <View style={sleepStyles.xAxis}>
        {data.map((d, i) => (
          <Text key={i} style={sleepStyles.xLabel} numberOfLines={1}>{d.label}</Text>
        ))}
      </View>
    </View>
  );
}

const sleepStyles = StyleSheet.create({
  chartArea: { flexDirection: 'row' },
  yAxis: { width: 28, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 4, height: 100 },
  yLabel: { fontSize: 10, color: '#BBBBB8' },
  barsContainer: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', position: 'relative' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#F0F0EE' },
  barCol: { alignItems: 'center', flex: 1 },
  barWrapper: { height: 100, justifyContent: 'flex-end', alignItems: 'center' },
  bar: { minHeight: 4 },
  barEmpty: { height: 4, backgroundColor: '#EBEBEB' },
  barValue: { fontSize: 9, color: '#9B9B9B', marginBottom: 2 },
  xAxis: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 4 },
  xLabel: { fontSize: 10, color: '#BBBBB8', textAlign: 'center', flex: 1 },
});

// ─── Medication Compliance ───────────────────────────────────────────────────
function MedicationChart({ data }: { data: { label: string; taken: boolean | null }[] }) {
  const takenCount = data.filter(d => d.taken === true).length;
  const missedCount = data.filter(d => d.taken === false).length;
  const total = takenCount + missedCount;
  const rate = total > 0 ? Math.round((takenCount / total) * 100) : 0;

  return (
    <View>
      {/* Rate bar */}
      <View style={medStyles.rateRow}>
        <Text style={medStyles.rateLabel}>服药率</Text>
        <Text style={[medStyles.rateNum, { color: rate >= 80 ? '#16A34A' : rate >= 50 ? '#F0A500' : '#DC2626' }]}>{rate}%</Text>
      </View>
      <View style={medStyles.rateBar}>
        <View style={[medStyles.rateFill, { width: `${rate}%`, backgroundColor: rate >= 80 ? '#16A34A' : rate >= 50 ? '#F0A500' : '#DC2626' }]} />
      </View>
      {/* Dot grid */}
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
      {/* Legend */}
      <View style={medStyles.legend}>
        <View style={medStyles.legendItem}>
          <View style={[medStyles.legendDot, { backgroundColor: '#DCFCE7' }]} />
          <Text style={medStyles.legendText}>按时 {takenCount}天</Text>
        </View>
        <View style={medStyles.legendItem}>
          <View style={[medStyles.legendDot, { backgroundColor: '#FEE2E2' }]} />
          <Text style={medStyles.legendText}>漏药 {missedCount}天</Text>
        </View>
      </View>
    </View>
  );
}

const medStyles = StyleSheet.create({
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rateLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  rateNum: { fontSize: 24, fontWeight: '900' },
  rateBar: { height: 8, backgroundColor: '#F0F0EE', borderRadius: 4, overflow: 'hidden', marginBottom: 14 },
  rateFill: { height: '100%', borderRadius: 4 },
  dotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 12 },
  dotCol: { alignItems: 'center', minWidth: 30 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  dotEmpty: { backgroundColor: '#F0F0EE' },
  dotGreen: { backgroundColor: '#DCFCE7' },
  dotRed: { backgroundColor: '#FEE2E2' },
  dotText: { fontSize: 12, fontWeight: '700' },
  dotLabel: { fontSize: 9, color: '#BBBBB8' },
  legend: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 12, color: '#6B7280' },
});

// ─── Main Component ──────────────────────────────────────────────────────────
export function TrendChart({ checkIns, patientNickname = '家人', caregiverName = '照顾者' }: TrendChartProps) {
  const [period, setPeriod] = useState<Period>('7d');
  const [offset, setOffset] = useState(0);

  const checkInMap = new Map(checkIns.map(c => [c.date, c]));

  // ── Year mode: 12 monthly buckets for current year ──────────────────────────
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

  // ── Weekly mode: single week range with offset ───────────────────────────────
  const range = getWeekRange(offset);
  const dateRange = buildDateRange(range.start, range.end);
  const periodLabel = offset === 0 ? '本周' : offset === -1 ? '上周' : `${Math.abs(offset)}周前`;

  const periodCheckIns = dateRange.map(d => checkInMap.get(d)).filter(Boolean) as DailyCheckIn[];

  const sleepData = period === 'year' ? yearSleepData : dateRange.map(date => {
    const c = checkInMap.get(date);
    const d = new Date(date);
    return { label: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()], value: c?.sleepHours ?? 0, hasData: !!c && c.sleepHours > 0 };
  });

  const medData = period === 'year' ? yearMedData : dateRange.map(date => {
    const c = checkInMap.get(date);
    const d = new Date(date);
    return { label: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()], taken: c ? c.medicationTaken : null };
  });

  // Sleep subtitle
  const relevantCheckIns = period === 'year'
    ? checkIns.filter(c => new Date(c.date).getFullYear() === currentYear)
    : periodCheckIns;
  const sleepWithData = relevantCheckIns.filter(c => c.sleepHours > 0);
  const avgSleep = sleepWithData.length > 0
    ? sleepWithData.reduce((s, c) => s + c.sleepHours, 0) / sleepWithData.length : 0;
  const sleepSubtitle = avgSleep > 0
    ? `${period === 'year' ? yearLabel : periodLabel}平均 ${avgSleep.toFixed(1)}h · ${avgSleep >= 7 ? '睡眠充足 ✅' : '睡眠不足 ⚠️'}`
    : `${period === 'year' ? yearLabel : periodLabel}暂无睡眠记录`;

  // Medication stats
  const medWithData = relevantCheckIns.filter(c => c.medicationTaken !== null);
  const medTaken = medWithData.filter(c => c.medicationTaken === true).length;
  const medRate = medWithData.length > 0 ? Math.round((medTaken / medWithData.length) * 100) : null;

  // Caregiver mood
  const cgMoodCheckIns = periodCheckIns.filter(c => (c.caregiverMoodScore ?? 0) > 0);
  const avgCaregiverMood = cgMoodCheckIns.length > 0
    ? cgMoodCheckIns.reduce((s, c) => s + (c.caregiverMoodScore || 0), 0) / cgMoodCheckIns.length : 0;
  const prevRange = getWeekRange(offset - 1);
  const prevDateRange = buildDateRange(prevRange.start, prevRange.end);
  const prevCheckIns = prevDateRange.map(d => checkInMap.get(d)).filter(Boolean) as DailyCheckIn[];
  const prevCgMoodCheckIns = prevCheckIns.filter(c => (c.caregiverMoodScore ?? 0) > 0);
  const prevAvgCaregiverMood = prevCgMoodCheckIns.length > 0
    ? prevCgMoodCheckIns.reduce((s, c) => s + (c.caregiverMoodScore || 0), 0) / prevCgMoodCheckIns.length : null;

  return (
    <View style={styles.container}>
      {/* ── Period Toggle ── */}
      <View style={styles.toggleRow}>
        <View style={styles.periodToggle}>
          {(['7d', 'year'] as Period[]).map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodBtn, period === p && styles.periodBtnActive]}
              onPress={() => { setPeriod(p); setOffset(0); }}
            >
              <Text style={[styles.periodBtnText, period === p && styles.periodBtnTextActive]}>
                {p === '7d' ? '周' : '年'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Date Navigation ── */}
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

      {/* ── Sleep Chart ── */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionIconWrap}>
            <Text style={styles.sectionIcon}>😴</Text>
          </View>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>{patientNickname}的睡眠时长</Text>
            <Text style={styles.sectionSubtitle}>{sleepSubtitle}</Text>
          </View>
        </View>
        <SleepChart data={sleepData} />
      </View>

      {/* ── Medication ── */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconWrap, { backgroundColor: '#FFF0F6' }]}>
            <Text style={styles.sectionIcon}>💊</Text>
          </View>
          <View style={styles.sectionHeaderText}>
            <Text style={styles.sectionTitle}>{patientNickname}的用药情况</Text>
            <Text style={styles.sectionSubtitle}>
              {medRate !== null ? `${periodLabel}服药记录 · 服药率 ${medRate}%` : `${periodLabel}服药记录`}
            </Text>
          </View>
        </View>
        <MedicationChart data={medData} />
      </View>

      {/* ── Caregiver Mood ── */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconWrap, { backgroundColor: '#FFF8EE' }]}>
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
            <Text style={styles.emptyHintText}>每日打卡时记录你的心情，这里会显示趋势图 😊</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { gap: 0 },
  toggleRow: { alignItems: 'center', marginBottom: 14 },
  periodToggle: {
    flexDirection: 'row', backgroundColor: '#F0F0EE', borderRadius: 12, padding: 3,
  },
  periodBtn: { paddingHorizontal: 28, paddingVertical: 8, borderRadius: 10 },
  periodBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
  },
  periodBtnText: { fontSize: 15, fontWeight: '700', color: '#9B9B9B' },
  periodBtnTextActive: { color: '#1A1A1A' },
  dateNav: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 14, paddingHorizontal: 2,
  },
  dateNavPeriod: { fontSize: 18, fontWeight: '900', color: '#1A1A1A', letterSpacing: -0.3 },
  dateNavRange: { fontSize: 13, color: '#9B9B9B', marginTop: 3 },
  dateNavArrows: { flexDirection: 'row', gap: 8 },
  arrowBtn: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  arrowBtnDisabled: { opacity: 0.3 },
  arrowText: { fontSize: 22, fontWeight: '600', color: '#374151', lineHeight: 26 },
  arrowTextDisabled: { color: '#BBBBB8' },
  sectionCard: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#F0F0EE',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  sectionIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#F0F6F0',
    alignItems: 'center', justifyContent: 'center',
  },
  sectionIcon: { fontSize: 22 },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#374151' },
  sectionSubtitle: { fontSize: 12, color: '#9B9B9B', marginTop: 2 },
  emptyHint: {
    paddingVertical: 20, alignItems: 'center',
    backgroundColor: '#FAFAF8', borderRadius: 14,
  },
  emptyHintText: { fontSize: 13, color: '#9B9B9B', textAlign: 'center' },
});