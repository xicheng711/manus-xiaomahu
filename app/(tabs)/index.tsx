import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, Modal, TextInput,
  StyleSheet, Dimensions, Animated, Easing, Platform, Image, Keyboard, KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets, SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useWeather } from '@/lib/weather-context';
import { getLunarDate, getFormattedDate } from '@/lib/lunar';
import { getTodayCheckIn, getYesterdayCheckIn, getProfile, getAllCheckIns, DailyCheckIn, joinFamilyRoom, getDiaryEntries, DiaryEntry, upsertCheckIn, getCurrentMember } from '@/lib/storage';
import { getZodiacFromDate } from '@/lib/zodiac';
import { TrendChart } from '@/components/trend-chart';
import { COLORS, SHADOWS, fadeInUp, pressAnimation } from '@/lib/animations';
import { AppColors, Gradients } from '@/lib/design-tokens';
import * as Haptics from 'expo-haptics';
import { WeeklyEcho } from '@/components/weekly-echo';
import { JoinerHomeScreen } from '@/components/joiner-home';
import { useFamilyContext } from '@/lib/family-context';

const { width } = Dimensions.get('window');

function getDailyStatusHint(checkIn: DailyCheckIn | null): string {
  if (!checkIn) return '完成今日打卡后，自动生成昨晚睡眠与今日状态摘要';
  const parts: string[] = [];
  if (checkIn.sleepHours != null) {
    if (checkIn.sleepHours >= 8) parts.push(`昨晚睡眠 ${checkIn.sleepHours} 小时，休息充足`);
    else if (checkIn.sleepHours >= 6) parts.push(`昨晚睡眠 ${checkIn.sleepHours} 小时，基本达标`);
    else if (checkIn.sleepHours >= 4) parts.push(`昨晚睡眠仅 ${checkIn.sleepHours} 小时，建议今日安排适当午休`);
    else parts.push(`昨晚睡眠 ${checkIn.sleepHours} 小时，严重不足，请密切关注精神状态`);
  }
  if (checkIn.nightWakings != null && checkIn.nightWakings >= 2) {
    parts.push(`夜间觉醒 ${checkIn.nightWakings} 次，建议排查夜间不适原因`);
  }
  if (checkIn.moodScore != null) {
    if (checkIn.moodScore >= 8) parts.push('情绪状态良好，无明显异常');
    else if (checkIn.moodScore >= 6) parts.push('情绪平稳，可继续维持现有照护节奏');
    else if (checkIn.moodScore >= 4) parts.push('情绪评分偏低，请关注是否有行为或环境诱因');
    else parts.push('情绪评分较低，建议增加陪伴时间并观察行为变化');
  }
  if (checkIn.medicationTaken === false) parts.push('今日用药记录未完成，请核实服药情况');
  if (parts.length === 0) return '今日打卡数据已记录完整';
  return parts.join('；');
}


// ─── 背景装饰：浮动云朵 ─────────────────────────────────────────────
function FloatingCloud({ top = 0, left = 0, delay = 0 }: { top?: number; left?: number; delay?: number }) {
  const floatY = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    setTimeout(() => {
      Animated.timing(fadeIn, { toValue: 0.55, duration: 1000, useNativeDriver: true }).start();
      Animated.loop(Animated.sequence([
        Animated.timing(floatY, { toValue: -8, duration: 5000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 5000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])).start();
    }, delay);
  }, []);
  return (
    <Animated.Text style={{ position: 'absolute', top, left, fontSize: 28, opacity: fadeIn, transform: [{ translateY: floatY }] }}>
      ☁️
    </Animated.Text>
  );
}


// ─── 背景装饰：闪烁星星 ✦ ───────────────────────────────────────────
function FloatingSparkle({ top = 0, left = 0, delay = 0, size = 9 }: {
  top?: number; left?: number; delay?: number; size?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    setTimeout(() => {
      Animated.loop(Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.08, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])).start();
    }, delay);
  }, []);
  return <Animated.Text style={{ position: 'absolute', top, left, fontSize: size, opacity, color: '#D4A8C8' }}>✦</Animated.Text>;
}

// ─── 打卡横幅：增强版 ─────────────────────────────────────────────────
function EnhancedCheckinBanner({
  morningDone, eveningDone, todayCheckIn, elderNickname, caregiverName, onPress,
}: {
  morningDone: boolean; eveningDone: boolean; todayCheckIn: DailyCheckIn | null;
  elderNickname: string; caregiverName: string; onPress: () => void;
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const wave1Scale = useRef(new Animated.Value(1)).current;
  const wave1Rotate = useRef(new Animated.Value(0)).current;
  const wave2Scale = useRef(new Animated.Value(1)).current;
  const wave2Rotate = useRef(new Animated.Value(0)).current;

  const starAnimations = useRef(
    Array.from({ length: 4 }, () => ({
      scale: new Animated.Value(0),
      opacity: new Animated.Value(0),
      rotate: new Animated.Value(0),
    }))
  ).current;

  // 星星位置固定（不在渲染时用 Math.random）
  const starPositions: Array<{ top: string | number; left: string | number }> = useMemo(() => [
    { top: '22%', left: '18%' }, { top: '55%', left: '64%' },
    { top: '28%', left: '78%' }, { top: '68%', left: '38%' },
  ], []);

  useEffect(() => {
    if (!morningDone) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.02, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])).start();

      Animated.loop(Animated.parallel([
        Animated.sequence([
          Animated.timing(wave1Scale, { toValue: 1.4, duration: 6000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(wave1Scale, { toValue: 1, duration: 6000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.timing(wave1Rotate, { toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: true }),
      ])).start();

      Animated.loop(Animated.parallel([
        Animated.sequence([
          Animated.timing(wave2Scale, { toValue: 1.5, duration: 5000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(wave2Scale, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
        Animated.timing(wave2Rotate, { toValue: 1, duration: 10000, easing: Easing.linear, useNativeDriver: true }),
      ])).start();

      starAnimations.forEach((star, i) => {
        const runStar = () => {
          star.scale.setValue(0); star.opacity.setValue(0); star.rotate.setValue(0);
          Animated.sequence([
            Animated.delay(i * 500),
            Animated.parallel([
              Animated.sequence([
                Animated.timing(star.scale, { toValue: 1.2, duration: 400, useNativeDriver: true }),
                Animated.timing(star.scale, { toValue: 0, duration: 400, useNativeDriver: true }),
              ]),
              Animated.sequence([
                Animated.timing(star.opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
                Animated.timing(star.opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
              ]),
              Animated.timing(star.rotate, { toValue: 1, duration: 800, useNativeDriver: true }),
            ]),
            Animated.delay(2000),
          ]).start(() => runStar());
        };
        runStar();
      });
    }
  }, [morningDone]);

  const wave1Rot = wave1Rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '120deg'] });
  const wave2Rot = wave2Rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-120deg'] });
  const checkinProgress = (morningDone ? 1 : 0) + (eveningDone ? 1 : 0);

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pressAnimation(scaleAnim, onPress);
  };

  if (!morningDone) {
    return (
      <Animated.View style={{ transform: [{ scale: pulseAnim }], marginBottom: 16 }}>
        <TouchableOpacity onPress={handlePress} activeOpacity={0.88}>
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <LinearGradient
              colors={['#F0B5A0', '#E8988A', '#D98BA0']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.checkinBanner}
            >
              <Animated.View style={[styles.bannerDecor1, { transform: [{ scale: wave1Scale }, { rotate: wave1Rot }] }]} />
              <Animated.View style={[styles.bannerDecor2, { transform: [{ scale: wave2Scale }, { rotate: wave2Rot }] }]} />

              {starAnimations.map((star, i) => {
                const starRot = star.rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
                return (
                  <Animated.View key={i} style={[styles.starDecor, starPositions[i], { opacity: star.opacity, transform: [{ scale: star.scale }, { rotate: starRot }] }]}>
                    <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.95)' }}>✦</Text>
                  </Animated.View>
                );
              })}

              {/* 软白光晕 */}
              <View style={styles.bannerSheen} pointerEvents="none" />
              {/* 右下角小心心 */}
              <Text style={styles.bannerHeart}>♡</Text>

              <View style={styles.checkinLeft}>
                <View style={styles.checkinIconBox}>
                  <Text style={{ fontSize: 24 }}>📋</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkinTitle}>开始今日记录</Text>
                  <Text style={styles.checkinSub}>轻松记录{elderNickname}的状态，约1分钟</Text>
                </View>
              </View>
              <View style={styles.chevronCircle}>
                <Text style={{ fontSize: 18, color: 'rgba(255,255,255,0.92)', fontWeight: '700' }}>›</Text>
              </View>
            </LinearGradient>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <TouchableOpacity style={styles.checkinDone} onPress={handlePress} activeOpacity={0.88}>
      <View style={styles.checkinLeft}>
        <View style={styles.checkinIconBoxDone}>
          <Text style={{ fontSize: 26 }}>✅</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.checkinTitleDone}>今日记录 {checkinProgress}/2 ✅</Text>
          <Text style={styles.checkinSubDone}>早间已完成{eveningDone ? ' · 晚间已完成' : ' · 晚间待完成'}</Text>
          {todayCheckIn?.sleepHours != null && (
            <View style={styles.careScoreBadge}>
              <Text style={{ fontSize: 11 }}>💤 {elderNickname}睡了 {todayCheckIn.sleepHours}h</Text>
              {todayCheckIn.caregiverMoodEmoji && (
                <Text style={{ fontSize: 11, marginLeft: 6 }}>{todayCheckIn.caregiverMoodEmoji} {caregiverName}的心情已记录</Text>
              )}
            </View>
          )}
        </View>
      </View>
      <View style={styles.chevronCircleDone}>
        <Text style={{ fontSize: 16, color: AppColors.green.strong, fontWeight: '700' }}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── 智能卡片：增强版 ────────────────────────────────────────────────
function EnhancedSmartCard({
  morningDone, encouragement, motivation, onPress, onCheckinPress,
}: {
  morningDone: boolean; encouragement: string; motivation: string;
  onPress: () => void; onCheckinPress: () => void;
}) {
  const iconScale = useRef(new Animated.Value(1)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(iconScale, { toValue: 1.15, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(iconScale, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();

    Animated.loop(Animated.timing(iconRotate, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true })).start();

  }, []);

  const iconRotation = iconRotate.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ['0deg', '8deg', '0deg', '-8deg', '0deg'],
  });

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (morningDone) pressAnimation(scaleAnim, onPress);
    else pressAnimation(scaleAnim, onCheckinPress);
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.88}>
      <Animated.View style={[styles.smartCard, { transform: [{ scale: scaleAnim }] }]}>
        <LinearGradient
          colors={['rgba(240,236,248,0.75)', 'rgba(232,226,244,0.45)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <LinearGradient
            colors={['rgba(255,255,255,0.5)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
          />
        </View>
        <View style={styles.aiRow}>
          <Animated.View style={{ transform: [{ scale: iconScale }] }}>
            <LinearGradient
              colors={[...Gradients.purple, AppColors.purple.strong]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.aiIconBox}
            >
              <Text style={{ fontSize: 16, lineHeight: 20 }}>📊</Text>
            </LinearGradient>
          </Animated.View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <Text style={styles.aiLabel}>今日状态分析</Text>
              <Text style={styles.aiSubLabel}>· 基于打卡数据</Text>
            </View>

            {!morningDone ? (
              <Text style={styles.aiMessage}>完成今日打卡后，自动整理状态摘要</Text>
            ) : (
              <Text style={styles.aiMessage} numberOfLines={2}>{encouragement}</Text>
            )}

            {morningDone ? (
              <TouchableOpacity onPress={onPress} style={styles.aiDetailLink}>
                <Text style={styles.aiDetailLinkText}>查看完整分析 ›</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={onCheckinPress} style={[styles.aiDetailLink, { backgroundColor: AppColors.coral.primary }]}>
                <Text style={styles.aiDetailLinkText}>去完成打卡 →</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── 快捷入口卡片 ────────────────────────────────────────────────────
function QuickActionCard({
  emoji, label, gradientStart, gradientEnd, bgColor, onPress, delay, pulse = false,
}: {
  emoji: string; label: string;
  gradientStart: string; gradientEnd: string; bgColor: string;
  onPress: () => void; delay: number; pulse?: boolean;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const emojiRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.loop(Animated.timing(emojiRotate, {
        toValue: 1, duration: 3200, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
      })).start();
    }, delay + 600);

    if (pulse) {
      setTimeout(() => {
        Animated.loop(Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.028, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])).start();
      }, delay + 1200);
    }
  }, []);

  const emojiRot = emojiRotate.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ['0deg', '8deg', '0deg', '-8deg', '0deg'],
  });

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pressAnimation(scaleAnim, onPress);
  };

  return (
    <Animated.View style={[styles.quickItem, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity style={[styles.quickCard, { backgroundColor: bgColor }]} onPress={handlePress} activeOpacity={0.85}>
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <LinearGradient
                colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
              />
            </View>
            <LinearGradient colors={[gradientStart, gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.quickIconBox}>
              <Animated.Text style={[styles.quickEmoji, { transform: [{ rotate: emojiRot }] }]}>{emoji}</Animated.Text>
            </LinearGradient>
            <View style={{ flex: 1 }} />
            <Text style={styles.quickLabel}>{label}</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

// ─── 标题 🚀 摇摆 Hook ───────────────────────────────────────────────
function useShakeAnim() {
  const shakeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(shakeAnim, {
      toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
    })).start();
  }, []);
  return shakeAnim.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: ['0deg', '10deg', '0deg', '-10deg', '0deg'] });
}

// ─── Helper ────────────────────────────────────────────────────────────────
function getMoodLabel(score: number): string {
  if (score >= 9) return '非常好';
  if (score >= 7) return '心情不错';
  if (score >= 5) return '平稳';
  if (score >= 3) return '有点低落';
  return '需要关注';
}

function getPersonalizedSmartSuggestion(checkIn: DailyCheckIn): string {
  const { moodScore, sleepHours, medicationTaken, nightWakings } = checkIn;
  const observations: string[] = [];

  if (sleepHours >= 8) {
    observations.push(`昨晚睡眠 ${sleepHours} 小时，夜间休息充足`);
  } else if (sleepHours >= 6) {
    observations.push(`昨晚睡眠 ${sleepHours} 小时，基本达标`);
  } else if (sleepHours >= 4) {
    observations.push(`昨晚睡眠 ${sleepHours} 小时，时间偏短，建议今日安排午休`);
  } else {
    observations.push(`昨晚睡眠仅 ${sleepHours} 小时，严重不足，请密切关注精神与行为状态`);
  }

  if (nightWakings && nightWakings >= 2) {
    observations.push(`夜间觉醒 ${nightWakings} 次，建议排查夜间不适或如厕需求`);
  }

  if (moodScore >= 8) {
    observations.push('情绪状态良好，无明显异常表现');
  } else if (moodScore >= 6) {
    observations.push('情绪平稳，可维持现有照护节奏');
  } else if (moodScore >= 4) {
    observations.push('情绪评分偏低，建议观察是否有触发因素');
  } else {
    observations.push('情绪评分较低，建议增加陪伴时间，必要时记录行为变化');
  }

  if (!medicationTaken) {
    observations.push('用药记录未完成，请核实当日服药情况');
  }

  return observations.join('；') + '。';
}

// ─── 主页面 ─────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { activeMembership, ready } = useFamilyContext();

  if (!ready) return null;

  if (activeMembership && activeMembership.role !== 'creator') {
    return <JoinerHomeScreen />;
  }

  return <CreatorHomeScreen />;
}

function CreatorHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { memberships, activeMembership, switchFamily, refresh: refreshFamily } = useFamilyContext();
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showJoinSheet, setShowJoinSheet] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [greeting, setGreeting] = useState('');
  const [todayCheckIn, setTodayCheckIn] = useState<DailyCheckIn | null>(null);
  const [allCheckIns, setAllCheckIns] = useState<DailyCheckIn[]>([]);
  const [allDiaryEntries, setAllDiaryEntries] = useState<DiaryEntry[]>([]);
  const [elderNickname, setElderNickname] = useState('家人');
  const [caregiverName, setCaregiverName] = useState('');
  const [memberPhotoUri, setMemberPhotoUri] = useState<string | null>(null);
  const [zodiacColor, setZodiacColor] = useState(AppColors.coral.primary);
  const [zodiacEmoji, setZodiacEmoji] = useState('🐎');
  const { weatherData, cityName, buildGreeting, refresh: refreshWeather } = useWeather();
  const [latestCheckIn, setLatestCheckIn] = useState<DailyCheckIn | null>(null);
  const lunarDate = getLunarDate();
  const todayLabel = getFormattedDate();

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-15)).current;
  const avatarScale = useRef(new Animated.Value(0)).current;
  const _unusedShake = useShakeAnim();

  const loadData = useCallback(async () => {
    const profile = await getProfile();
    if (!profile || !profile.setupComplete) { router.replace('/onboarding' as any); return; }
    setElderNickname(profile?.nickname || profile?.name || '家人');
    const cgName = profile?.caregiverName || '';
    if (profile?.caregiverAvatarType === 'photo' && profile?.caregiverPhotoUri) {
      setMemberPhotoUri(profile.caregiverPhotoUri);
    } else {
      const member = await getCurrentMember();
      if (member?.photoUri) setMemberPhotoUri(member.photoUri);
    }
    setCaregiverName(cgName);
    refreshWeather();
    setGreeting(buildGreeting(cgName || undefined));
    if (profile?.birthDate) {
      const zodiac = getZodiacFromDate(profile.birthDate);
      setZodiacColor(zodiac.color);
      setZodiacEmoji(zodiac.emoji);
    }
    const today = await getTodayCheckIn();
    setTodayCheckIn(today);
    const yesterday = await getYesterdayCheckIn();
    const latest = today ?? yesterday;
    setLatestCheckIn(latest);
    const all = await getAllCheckIns();
    setAllCheckIns(all);
    const diaries = await getDiaryEntries();
    setAllDiaryEntries(diaries);
  }, [activeMembership?.familyId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => {
    if (activeMembership?.familyId) loadData();
  }, [activeMembership?.familyId]);

  useEffect(() => {
    if (caregiverName || buildGreeting) {
      setGreeting(buildGreeting(caregiverName || undefined));
    }
  }, [buildGreeting, caregiverName]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(headerSlide, { toValue: 0, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    setTimeout(() => {
      Animated.spring(avatarScale, { toValue: 1, speed: 8, bounciness: 12, useNativeDriver: true }).start();
    }, 300);
  }, []);

  const morningDone = todayCheckIn?.morningDone ?? false;
  const eveningDone = todayCheckIn?.eveningDone ?? false;
  const todayDone = morningDone;

  const encouragement = morningDone
    ? getPersonalizedSmartSuggestion(todayCheckIn!)
    : '完成打卡后，自动整理今日照护数据';

  const quickActions = [
    { emoji: '💊', label: '用药记录', route: '/medication', gradientStart: Gradients.coral[0], gradientEnd: Gradients.coral[1], bgColor: AppColors.coral.soft, pulse: false },
    { emoji: '📔', label: '护理日记', route: '/diary',      gradientStart: Gradients.peach[0], gradientEnd: Gradients.peach[1], bgColor: AppColors.peach.soft, pulse: false },
    { emoji: '👥', label: '家庭同步', route: '/family',     gradientStart: Gradients.purple[0], gradientEnd: Gradients.purple[1], bgColor: AppColors.purple.soft, pulse: false },
    { emoji: '📊', label: '今日记录', route: '/share',      gradientStart: Gradients.green[0], gradientEnd: Gradients.green[1], bgColor: AppColors.green.soft, pulse: true },
  ];

  return (
    <View style={styles.root}>
      {/* 渐变背景延伸到全屏（包含状态栏区域） */}
      <LinearGradient
        colors={[...Gradients.appBg]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* SafeAreaView 确保内容在状态栏下方，不被遗挡 */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>

      {/* ── 背景装饰层（不干扰交互）── */}
      <View style={styles.bgDecorLayer} pointerEvents="none">
        {/* 云朵 */}
        <FloatingCloud top={62} left={-10} delay={0} />
        <FloatingCloud top={42} left={width * 0.38} delay={600} />
        <FloatingCloud top={78} left={width * 0.68} delay={1200} />
        {/* ✶ 闪光 */}
        <FloatingSparkle top={28} left={width * 0.18} delay={400} size={9} />
        <FloatingSparkle top={72} left={width * 0.54} delay={900} size={7} />
        <FloatingSparkle top={108} left={width * 0.82} delay={1600} size={8} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        {/* ── 顶部 Header ── */}
        <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
          <View style={{ flex: 1 }}>
            {/* 日期 + 天气栏 */}
            <View style={styles.dateWeatherRow}>
              <View style={styles.dateBlock}>
                <Text style={styles.dateText}>{todayLabel}</Text>
                <Text style={styles.lunarText}>{lunarDate.full}</Text>
              </View>
              {weatherData ? (
                <View style={styles.weatherChip}>
                  <Text style={styles.weatherIcon}>{weatherData.icon}</Text>
                  <View>
                    <Text style={styles.weatherTemp}>{weatherData.temp}°</Text>
                    <Text style={styles.weatherDesc}>{weatherData.description}</Text>
                  </View>
                </View>
              ) : cityName ? (
                <View style={styles.weatherChip}>
                  <Text style={styles.weatherIcon}>⛅</Text>
                  <Text style={styles.weatherDesc}>{cityName}</Text>
                </View>
              ) : null}
            </View>

            {/* 标题 + 问候 */}
            <View style={styles.appNameRow}>
              <Text style={styles.appName}>一起照顾好每一天</Text>
            </View>
            {memberships.length > 0 && (
              <TouchableOpacity
                onPress={() => setShowSwitcher(true)}
                activeOpacity={0.75}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6,
                  backgroundColor: AppColors.surface.glass,
                  borderWidth: 1, borderColor: AppColors.border.glass,
                  borderRadius: 14, paddingHorizontal: 9, paddingVertical: 4,
                  alignSelf: 'flex-start',
                }}
              >
                <Text style={{ fontSize: 12, color: AppColors.green.strong, fontWeight: '600' }}>
                  🏠 {activeMembership?.room.elderName || elderNickname}的家庭
                </Text>
                <Text style={{ fontSize: 11, color: AppColors.text.tertiary, fontWeight: '600' }}>⌄</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.greeting}>{greeting}</Text>
          </View>
          <Animated.View style={{ transform: [{ scale: avatarScale }] }}>
            <TouchableOpacity
              style={[styles.profileBtn, memberPhotoUri ? { backgroundColor: 'transparent', borderWidth: 0 } : {}]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/profile' as any);
              }}
            >
              {memberPhotoUri ? (
                <Image source={{ uri: memberPhotoUri }} style={styles.profilePhoto} />
              ) : (
                <LinearGradient colors={[...Gradients.coral]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.profileGradient}>
                  <Text style={{ fontSize: 24 }}>{zodiacEmoji}</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        {/* ── 打卡横幅 ── */}
        <EnhancedCheckinBanner
          morningDone={morningDone}
          eveningDone={eveningDone}
          todayCheckIn={todayCheckIn}
          elderNickname={elderNickname}
          caregiverName={caregiverName}
          onPress={() => router.push('/(tabs)/checkin' as any)}
        />

         {/* ── 智能卡片 ── */}
         <EnhancedSmartCard
          morningDone={morningDone}
          encouragement={encouragement}
          motivation={getDailyStatusHint(todayCheckIn)}
          onPress={() => router.push('/share' as any)}
          onCheckinPress={() => router.push('/(tabs)/checkin' as any)}
        />

        {/* ── 趋势图 ── */}
        {allCheckIns.length > 0 && <TrendChart checkIns={allCheckIns} diaryEntries={allDiaryEntries} patientNickname={elderNickname} caregiverName={caregiverName} />}

        {/* ── 快捷入口 ── */}
        <View style={{ marginBottom: 4 }}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionDot} />
            <Text style={styles.sectionTitle}>快捷入口</Text>
          </View>
          <View style={styles.quickGrid}>
            <View style={styles.quickRow}>
              {quickActions.slice(0, 2).map((item, i) => (
                <QuickActionCard key={item.route} emoji={item.emoji} label={item.label} gradientStart={item.gradientStart} gradientEnd={item.gradientEnd} bgColor={item.bgColor} pulse={item.pulse} onPress={() => router.push(item.route as any)} delay={50 + i * 80} />
              ))}
            </View>
            <View style={styles.quickRow}>
              {quickActions.slice(2, 4).map((item, i) => (
                <QuickActionCard key={item.route} emoji={item.emoji} label={item.label} gradientStart={item.gradientStart} gradientEnd={item.gradientEnd} bgColor={item.bgColor} pulse={item.pulse} onPress={() => router.push(item.route as any)} delay={210 + i * 80} />
              ))}
            </View>
          </View>
        </View>

        <WeeklyEcho caregiverName={caregiverName} elderNickname={elderNickname} />

        {/* ── 暖心底部签名 ── */}
        <View style={styles.warmFooter}>
          <Image source={require('@/assets/images/app-icon.png')} style={styles.warmFooterIcon} />
          <View style={{ flex: 1 }}>
            <Text style={styles.warmFooterText}>小马虎陪您一起，照顾好每一天</Text>
            <Text style={styles.warmFooterSub}>您的每一份用心，家人都感受得到 💗</Text>
          </View>
        </View>

      </ScrollView>

      </SafeAreaView>

      {/* Family Switcher Modal */}
      <Modal visible={showSwitcher} transparent animationType="fade" onRequestClose={() => setShowSwitcher(false)}>
        <TouchableOpacity style={switStyles.overlay} activeOpacity={1} onPress={() => setShowSwitcher(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={switStyles.sheet}>
            <Text style={switStyles.title}>切换家庭</Text>
            {memberships.map(m => {
              const isActive = activeMembership?.familyId === m.familyId;
              const roleLabel = m.role === 'creator' ? '主照顾者' : '家庭成员';
              const myMember = m.room.members.find(mem => mem.id === m.myMemberId);
              const avatarEmoji = myMember?.emoji || m.room.members[0]?.emoji || '🏠';
              return (
                <TouchableOpacity
                  key={m.familyId}
                  style={[switStyles.row, isActive && switStyles.rowActive]}
                  onPress={async () => { await switchFamily(m.familyId); setShowSwitcher(false); }}
                >
                  <Text style={{ fontSize: 22, marginRight: 12 }}>{avatarEmoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={switStyles.name}>{m.room.elderName}</Text>
                    <View style={[switStyles.rolePill, m.role === 'creator' ? switStyles.rolePillCreator : switStyles.rolePillJoiner]}>
                      <Text style={[switStyles.rolePillText, m.role === 'creator' ? switStyles.rolePillTextCreator : switStyles.rolePillTextJoiner]}>{roleLabel}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {isActive && <Text style={{ fontSize: 16, color: AppColors.green.strong }}>✓</Text>}
                    {isActive && (
                      <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => {
                          setShowSwitcher(false);
                          setTimeout(() => router.push({ pathname: '/(modals)/family-settings' as any, params: { familyId: m.familyId } }), 200);
                        }}
                      >
                        <Text style={{ fontSize: 16, color: AppColors.text.tertiary }}>⚙️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                style={[switStyles.addBtn, { flex: 1 }]}
                onPress={() => { setShowSwitcher(false); setTimeout(() => router.push('/(modals)/create-family' as any), 200); }}
              >
                <Text style={switStyles.addText}>＋ 创建新家庭</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[switStyles.addBtn, { flex: 1 }]}
                onPress={() => { setShowSwitcher(false); setJoinCode(''); setJoinName(''); setJoinError(''); setTimeout(() => setShowJoinSheet(true), 200); }}
              >
                <Text style={switStyles.addText}>🔗 加入已有家庭</Text>
              </TouchableOpacity>
            </View>
          </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Join Family Sheet */}
      <Modal visible={showJoinSheet} transparent animationType="slide" onRequestClose={() => setShowJoinSheet(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={switStyles.overlay} activeOpacity={1} onPress={() => { setShowJoinSheet(false); Keyboard.dismiss(); }}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}} style={[switStyles.sheet, { paddingBottom: 48 }]}>
            <Text style={switStyles.title}>加入已有家庭</Text>
            <Text style={{ fontSize: 13, color: AppColors.text.secondary, textAlign: 'center', marginBottom: 20, lineHeight: 20 }}>
              请输入家庭管理员分享的邀请码
            </Text>
            <View style={{ marginBottom: 14 }}>
              <Text style={switStyles.joinLabel}>邀请码</Text>
              <TextInput
                style={switStyles.joinInput}
                placeholder="输入6位邀请码"
                value={joinCode}
                onChangeText={t => { setJoinCode(t.toUpperCase()); setJoinError(''); }}
                maxLength={6}
                autoCapitalize="characters"
                placeholderTextColor={AppColors.text.tertiary}
              />
            </View>
            <View style={{ marginBottom: 14 }}>
              <Text style={switStyles.joinLabel}>您的昵称</Text>
              <TextInput
                style={switStyles.joinInput}
                placeholder="如：小红、大明..."
                value={joinName}
                onChangeText={t => { setJoinName(t); setJoinError(''); }}
                placeholderTextColor={AppColors.text.tertiary}
              />
            </View>
            {joinError ? <Text style={{ color: AppColors.coral.primary, fontSize: 13, textAlign: 'center', marginBottom: 10 }}>{joinError}</Text> : null}
            <TouchableOpacity
              style={[switStyles.joinSubmitBtn, (joinCode.length < 6 || !joinName.trim() || joinLoading) && { opacity: 0.5 }]}
              disabled={joinCode.length < 6 || !joinName.trim() || joinLoading}
              onPress={async () => {
                setJoinLoading(true);
                try {
                  const result = await joinFamilyRoom(joinCode, { name: joinName.trim(), role: 'family', roleLabel: '家庭成员', emoji: '👤', color: AppColors.purple.primary });
                  if (!result) { setJoinError('邀请码不正确，请检查后重试'); return; }
                  await refreshFamily();
                  setShowJoinSheet(false);
                } finally {
                  setJoinLoading(false);
                }
              }}
            >
              <Text style={switStyles.joinSubmitText}>{joinLoading ? '加入中...' : '确认加入'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowJoinSheet(false)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 14, color: AppColors.text.tertiary }}>取消</Text>
            </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const switStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: AppColors.surface.whiteStrong, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36, ...SHADOWS.lg },
  title: { fontSize: 17, fontWeight: '800', color: AppColors.text.primary, textAlign: 'center', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, marginBottom: 8, backgroundColor: AppColors.bg.secondary },
  rowActive: { backgroundColor: AppColors.green.soft, borderWidth: 1.5, borderColor: AppColors.green.muted },
  name: { fontSize: 15, fontWeight: '700', color: AppColors.text.primary, marginBottom: 4 },
  rolePill: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  rolePillCreator: { backgroundColor: AppColors.green.muted + '30' },
  rolePillJoiner: { backgroundColor: AppColors.purple.soft },
  rolePillText: { fontSize: 11, fontWeight: '600' },
  rolePillTextCreator: { color: AppColors.green.strong },
  rolePillTextJoiner: { color: AppColors.purple.strong },
  addBtn: { paddingVertical: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1.5, borderColor: AppColors.border.soft, borderStyle: 'dashed' },
  addText: { fontSize: 13, fontWeight: '600', color: AppColors.text.tertiary },
  joinLabel: { fontSize: 13, fontWeight: '600', color: AppColors.text.secondary, marginBottom: 6 },
  joinInput: { borderWidth: 1.5, borderColor: AppColors.border.soft, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: AppColors.text.primary, backgroundColor: AppColors.bg.secondary },
  joinSubmitBtn: { backgroundColor: AppColors.green.strong, paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginTop: 4 },
  joinSubmitText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 22, paddingBottom: 8 },

  bgDecorLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: 220, overflow: 'hidden' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 20, paddingBottom: 18 },
  dateWeatherRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingRight: 14 },
  dateBlock: { flexDirection: 'column', gap: 3 },
  dateText: { fontSize: 13, fontWeight: '600', color: AppColors.text.tertiary, letterSpacing: 0.2 },
  lunarText: { fontSize: 11, color: AppColors.peach.primary, fontWeight: '500' },
  weatherChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: AppColors.surface.glass,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1, borderColor: AppColors.border.glass,
  },
  weatherIcon: { fontSize: 17 },
  weatherTemp: { fontSize: 13, fontWeight: '700', color: AppColors.text.primary, lineHeight: 16 },
  weatherDesc: { fontSize: 10, color: AppColors.text.tertiary, lineHeight: 13 },
  appNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  appName: { fontSize: 24, fontWeight: '900', color: AppColors.coral.primary, letterSpacing: -0.5 },
  greeting: { fontSize: 13, color: AppColors.text.tertiary, fontWeight: '500', lineHeight: 20 },
  profileBtn: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.10, shadowRadius: 8, elevation: 3 },
  profileGradient: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  profilePhoto: { width: 50, height: 50, borderRadius: 25 },

  // 打卡横幅
  checkinBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 24, padding: 18, overflow: 'hidden', shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 4 },
  bannerDecor1: { position: 'absolute', top: -24, right: -24, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.12)' },
  bannerDecor2: { position: 'absolute', bottom: -18, left: 55, width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.07)' },
  bannerSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '55%', borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: 'rgba(255,255,255,0.10)' },
  bannerHeart: { position: 'absolute', bottom: 12, right: 50, fontSize: 14, color: 'rgba(255,255,255,0.30)' },
  starDecor: { position: 'absolute' },
  checkinLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  checkinIconBox: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.40)' },
  checkinIconBoxDone: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.green.soft },
  checkinTitle: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  checkinTitleDone: { fontSize: 15, fontWeight: '700', color: AppColors.text.primary },
  checkinSub: { fontSize: 12, color: 'rgba(255,255,255,0.82)', marginTop: 3, lineHeight: 17 },
  checkinSubDone: { fontSize: 12, color: AppColors.text.secondary, marginTop: 2 },
  checkinDone: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: AppColors.surface.card,
    borderWidth: 1, borderColor: AppColors.border.glass,
    borderRadius: 24, padding: 16, marginBottom: 16,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },
  chevronCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  chevronCircleDone: { width: 30, height: 30, borderRadius: 15, backgroundColor: AppColors.green.primary + '25', alignItems: 'center', justifyContent: 'center' },
  careScoreBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, backgroundColor: AppColors.green.primary + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' },

  // 智能卡片
  smartCard: {
    marginBottom: 18, backgroundColor: 'transparent', borderRadius: 22,
    padding: 16, borderWidth: 1, borderColor: AppColors.border.glass,
    overflow: 'hidden',
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },
  aiRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  aiIconBox: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  aiLabel: { fontSize: 14, fontWeight: '800', color: AppColors.purple.strong, letterSpacing: -0.2 },
  aiSubLabel: { fontSize: 10, color: AppColors.text.tertiary },
  aiMessage: { fontSize: 13, color: AppColors.text.secondary, lineHeight: 19, marginTop: 4 },
  aiDetailLink: {
    marginTop: 10, alignSelf: 'flex-start',
    backgroundColor: AppColors.purple.strong,
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6,
    flexDirection: 'row', alignItems: 'center',
  },
  aiDetailLinkText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.1 },

  // 快捷入口标题
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, marginTop: 4 },
  sectionDot: { width: 3, height: 16, borderRadius: 2, backgroundColor: AppColors.green.primary },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: AppColors.text.primary, letterSpacing: -0.2 },

  // 快捷入口网格
  quickGrid: { marginTop: 0 },
  quickRow: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  quickItem: { flex: 1 },
  quickCard: {
    borderRadius: 24, padding: 16, paddingBottom: 14, height: 112,
    flexDirection: 'column', alignItems: 'flex-start', overflow: 'hidden',
    borderWidth: 1, borderColor: AppColors.border.glass,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
  },
  quickIconBox: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickEmoji: { fontSize: 20, lineHeight: 24 },
  quickLabel: { fontSize: 14, fontWeight: '700', color: AppColors.text.primary, letterSpacing: -0.2, lineHeight: 19 },

  // 数据摘要卡片
  summaryCard: {
    backgroundColor: AppColors.surface.card, borderRadius: 24, padding: 18, marginBottom: 16,
    borderWidth: 1, borderColor: AppColors.border.glass,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 2,
  },
  summaryCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  summaryCardTitle: { fontSize: 15, fontWeight: '800', color: AppColors.text.primary },
  summaryCardEdit: { fontSize: 13, color: AppColors.purple.strong, fontWeight: '600' },
  summaryCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryCardItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryCardEmoji: { fontSize: 22 },
  summaryCardLabel: { fontSize: 10, color: AppColors.text.tertiary, fontWeight: '500' },
  summaryCardValue: { fontSize: 13, fontWeight: '700', color: AppColors.text.primary },
  summaryCardDivider: { width: 1, height: 36, backgroundColor: AppColors.border.soft },

  warmFooter: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: AppColors.surface.card, borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 14,
    marginTop: 10, marginBottom: 0,
    borderWidth: 1, borderColor: AppColors.border.glass,
    shadowColor: AppColors.shadow.soft, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8, elevation: 1,
  },
  warmFooterIcon: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 1.5, borderColor: AppColors.green.primary + '28',
  },
  warmFooterText: { fontSize: 13, fontWeight: '600', color: AppColors.text.secondary, lineHeight: 18 },
  warmFooterSub: { fontSize: 11, color: AppColors.text.tertiary, marginTop: 1 },
});
