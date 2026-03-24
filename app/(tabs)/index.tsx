import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity, Modal,
  StyleSheet, Dimensions, Animated, Easing, Platform, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { getWeatherByGPS, buildGreetingWithWeather, fetchWeather, GpsWeatherInfo, WeatherData } from '@/lib/weather';
import { getLunarDate, getFormattedDate } from '@/lib/lunar';
import { getTodayCheckIn, getYesterdayCheckIn, getProfile, getAllCheckIns, DailyCheckIn, getCurrentUserIsCreator } from '@/lib/storage';
import { TrendChart } from '@/components/trend-chart';
import { COLORS, SHADOWS, fadeInUp, pressAnimation } from '@/lib/animations';
import { AppColors, Gradients } from '@/lib/design-tokens';
import * as Haptics from 'expo-haptics';
import { WeeklyEcho } from '@/components/weekly-echo';
import { JoinerHomeScreen } from '@/components/joiner-home';
import { useFamilyContext } from '@/lib/family-context';

const { width } = Dimensions.get('window');

function getDailyStatusHint(checkIn: DailyCheckIn | null): string {
  if (!checkIn) return '今日尚未打卡，完成记录后为您整理情况';
  const parts: string[] = [];
  if (checkIn.sleepHours != null) {
    if (checkIn.sleepHours >= 7) parts.push('睡眠时长正常');
    else if (checkIn.sleepHours >= 5) parts.push('睡眠时长偏短');
    else parts.push('睡眠严重不足，建议安排补觉');
  }
  if (checkIn.moodScore != null) {
    if (checkIn.moodScore >= 7) parts.push('心情状态稳定');
    else if (checkIn.moodScore >= 4) parts.push('心情一般');
    else parts.push('情绪需要关注');
  }
  if (checkIn.medicationTaken === false) parts.push('用药未完成');
  if (parts.length === 0) return '今日记录已整理完毕';
  return parts.join('，');
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


// ─── 背景装饰：闪烁星星 ─────────────────────────────────────────────

// ─── 背景装饰：上升气球 ─────────────────────────────────────────────

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
    Array.from({ length: 6 }, () => ({
      scale: new Animated.Value(0),
      opacity: new Animated.Value(0),
      rotate: new Animated.Value(0),
    }))
  ).current;

  // 星星位置固定（不在渲染时用 Math.random）
  const starPositions = useMemo(() => [
    { top: '25%', left: '15%' }, { top: '55%', left: '60%' },
    { top: '30%', left: '80%' }, { top: '70%', left: '30%' },
    { top: '20%', left: '45%' }, { top: '65%', left: '75%' },
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
              colors={[...Gradients.coral, '#F47D96']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.checkinBanner}
            >
              <Animated.View style={[styles.bannerDecor1, { transform: [{ scale: wave1Scale }, { rotate: wave1Rot }] }]} />
              <Animated.View style={[styles.bannerDecor2, { transform: [{ scale: wave2Scale }, { rotate: wave2Rot }] }]} />

              {starAnimations.map((star, i) => {
                const starRot = star.rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
                return (
                  <Animated.View key={i} style={[styles.starDecor, starPositions[i], { opacity: star.opacity, transform: [{ scale: star.scale }, { rotate: starRot }] }]}>
                    <Text style={{ fontSize: 12, color: 'white' }}>✨</Text>
                  </Animated.View>
                );
              })}

              <View style={styles.checkinLeft}>
                <View style={styles.checkinIconBox}>
                  <Text style={{ fontSize: 26 }}>📋</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkinTitle}>开始今日记录</Text>
                  <Text style={styles.checkinSub}>记录{elderNickname}的状态，1分钟即可完成</Text>
                </View>
              </View>
              <View style={styles.chevronCircle}>
                <Text style={{ fontSize: 18, color: 'rgba(255,255,255,0.9)', fontWeight: '600' }}>›</Text>
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
        <Text style={{ fontSize: 16, color: COLORS.textMuted, fontWeight: '600' }}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── AI 卡片：增强版 ────────────────────────────────────────────────
function EnhancedAICard({
  morningDone, encouragement, motivation, onPress, onCheckinPress,
}: {
  morningDone: boolean; encouragement: string; motivation: string;
  onPress: () => void; onCheckinPress: () => void;
}) {
  const iconScale = useRef(new Animated.Value(1)).current;
  const iconRotate = useRef(new Animated.Value(0)).current;
  const glowAnim1 = useRef(new Animated.Value(1)).current;
  const glowAnim2 = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(iconScale, { toValue: 1.15, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(iconScale, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();

    Animated.loop(Animated.timing(iconRotate, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true })).start();

    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim1, { toValue: 1.3, duration: 10000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(glowAnim1, { toValue: 1, duration: 10000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();

    Animated.loop(Animated.sequence([
      Animated.timing(glowAnim2, { toValue: 1.4, duration: 8000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(glowAnim2, { toValue: 1, duration: 8000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
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
      <Animated.View style={[styles.aiCard, { transform: [{ scale: scaleAnim }] }]}>
        <Animated.View style={[styles.aiGlow1, { transform: [{ scale: glowAnim1 }] }]} />
        <Animated.View style={[styles.aiGlow2, { transform: [{ scale: glowAnim2 }] }]} />

        <Text style={styles.aiDecorFigure}>🩺</Text>

        <View style={styles.aiHeader}>
          <Animated.View style={{ transform: [{ scale: iconScale }, { rotate: iconRotation }] }}>
            <LinearGradient
              colors={[...Gradients.purple, AppColors.purple.strong]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.aiIconBox}
            >
              <Text style={{ fontSize: 20, lineHeight: 24 }}>✨</Text>
            </LinearGradient>
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiLabel}>今日状态分析</Text>
            <Text style={styles.aiSubLabel} numberOfLines={1}>基于打卡数据自动生成</Text>
          </View>
        </View>

        <View style={styles.aiContentBox}>
          {!morningDone ? (
            <View style={styles.aiSkeletonWrap}>
              <View style={styles.aiSkeletonLine} />
              <View style={[styles.aiSkeletonLine, { width: '78%' }]} />
              <View style={[styles.aiSkeletonLine, { width: '90%', marginTop: 8 }]} />
              <View style={[styles.aiSkeletonLine, { width: '65%' }]} />
              <View style={styles.aiSkeletonBadgeRow}>
                <View style={styles.aiSkeletonBadge} />
                <View style={[styles.aiSkeletonBadge, { width: 72 }]} />
                <View style={[styles.aiSkeletonBadge, { width: 64 }]} />
              </View>
              <View style={styles.aiSkeletonOverlay}>
                <View style={styles.aiSkeletonLockBox}>
                  <Text style={{ fontSize: 20 }}>📋</Text>
                  <Text style={styles.aiSkeletonLockText}>完成打卡后生成分析</Text>
                  <Text style={styles.aiSkeletonLockSub}>记录今日状态，自动整理变化趋势</Text>
                </View>
              </View>
            </View>
          ) : (
            <Text style={styles.aiMessage}>{encouragement}</Text>
          )}
        </View>

        {morningDone && (
          <View style={styles.aiBadgeRow}>
            {[{ emoji: '📋', text: '状态总结' }, { emoji: '📈', text: '趋势变化' }, { emoji: '⚠️', text: '异常提醒' }].map((b, i) => (
              <View key={i} style={styles.aiBadge}>
                <Text style={styles.aiBadgeEmoji}>{b.emoji}</Text>
                <Text style={styles.aiBadgeText}>{b.text}</Text>
              </View>
            ))}
          </View>
        )}

        {morningDone ? (
          <TouchableOpacity onPress={onPress} style={styles.aiDetailLink}>
            <Text style={styles.aiDetailLinkText}>查看完整分析 ›</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onCheckinPress} style={styles.aiDetailLink}>
            <Text style={[styles.aiDetailLinkText, { color: AppColors.coral.primary }]}>去完成打卡 →</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── 快捷入口卡片 ────────────────────────────────────────────────────
function QuickActionCard({
  emoji, decorEmoji, label, gradientStart, gradientEnd, bgColor, onPress, delay,
}: {
  emoji: string; decorEmoji: string; label: string;
  gradientStart: string; gradientEnd: string; bgColor: string;
  onPress: () => void; delay: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const emojiRotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.loop(Animated.timing(emojiRotate, {
        toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
      })).start();
    }, delay + 600);
  }, []);

  const emojiRot = emojiRotate.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: ['0deg', '10deg', '0deg', '-10deg', '0deg'],
  });

  const handlePress = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pressAnimation(scaleAnim, onPress);
  };

  return (
    <Animated.View style={[styles.quickItem, { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }]}>
      <TouchableOpacity style={[styles.quickCard, { backgroundColor: bgColor }]} onPress={handlePress} activeOpacity={0.85}>
        <LinearGradient colors={[gradientStart, gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.quickIconBox}>
          <Text style={styles.quickEmoji}>{emoji}</Text>
        </LinearGradient>
        <View style={{ flex: 1 }} />
        <Text style={styles.quickLabel}>{label}</Text>
        <Animated.Text style={[styles.quickDecorEmoji, { transform: [{ rotate: emojiRot }] }]}>
          {decorEmoji}
        </Animated.Text>
      </TouchableOpacity>
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

function getPersonalizedAISuggestion(checkIn: DailyCheckIn): string {
  const { moodScore, sleepHours, medicationTaken, nightWakings } = checkIn;
  const observations: string[] = [];

  if (sleepHours >= 7) {
    observations.push('睡眠时长正常');
  } else if (sleepHours >= 5) {
    observations.push(`睡眠${sleepHours}小时，略偏短`);
  } else {
    observations.push(`睡眠仅${sleepHours}小时，建议今天安排午休补充`);
  }

  if (nightWakings && nightWakings >= 2) {
    observations.push(`夜间中断${nightWakings}次，建议今晚继续观察是否重复出现`);
  }

  if (moodScore >= 7) {
    observations.push('心情状态稳定');
  } else if (moodScore >= 4) {
    observations.push('情绪一般，可留意是否有诱因');
  } else {
    observations.push('情绪偏低，建议安排轻松活动或陪伴聊天');
  }

  if (!medicationTaken) {
    observations.push('用药尚未完成，请确认是否已服用');
  }

  return observations.join('。') + '。';
}

// ─── 主页面 ─────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const [isCreator, setIsCreator] = useState<boolean | null>(null);

  useFocusEffect(useCallback(() => {
    getCurrentUserIsCreator().then(v => setIsCreator(v));
  }, []));

  // 未知角色时不渲染（避免闪烁）
  if (isCreator === null) return null;
  // Joiner → 显示观察者首页
  if (!isCreator) return <JoinerHomeScreen />;

  return <CreatorHomeScreen />;
}

function CreatorHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { memberships, activeMembership, switchFamily } = useFamilyContext();
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [greeting, setGreeting] = useState('');
  const [todayCheckIn, setTodayCheckIn] = useState<DailyCheckIn | null>(null);
  const [allCheckIns, setAllCheckIns] = useState<DailyCheckIn[]>([]);
  const [elderNickname, setElderNickname] = useState('家人');
  const [caregiverName, setCaregiverName] = useState('');
  const [memberPhotoUri, setMemberPhotoUri] = useState<string | null>(null);
  const [zodiacColor, setZodiacColor] = useState(AppColors.coral.primary);
  const [zodiacEmoji, setZodiacEmoji] = useState('🐎');
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [cityName, setCityName] = useState('');
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
      const { getCurrentMember } = require('@/lib/storage');
      const member = await getCurrentMember();
      if (member?.photoUri) setMemberPhotoUri(member.photoUri);
    }
    setCaregiverName(cgName);
    const profileCity = profile?.city || '';
    setCityName(profileCity);
    getWeatherByGPS().then(weather => setGreeting(buildGreetingWithWeather(cgName || undefined, weather)));
    setGreeting(buildGreetingWithWeather(cgName || undefined, null));
    if (profileCity) {
      fetchWeather(profileCity).then(w => { if (w) setWeatherData(w); });
    }
    if (profile?.birthDate) {
      const { getZodiacFromDate } = require('@/lib/zodiac');
      const zodiac = getZodiacFromDate(profile.birthDate);
      setZodiacColor(zodiac.color);
      setZodiacEmoji(zodiac.emoji);
    }
    const today = await getTodayCheckIn();
    setTodayCheckIn(today);
    const yesterday = await getYesterdayCheckIn();
    setLatestCheckIn(today ?? yesterday);
    const all = await getAllCheckIns();
    setAllCheckIns(all);
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

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
    ? getPersonalizedAISuggestion(todayCheckIn!)
    : '完成打卡后，为您整理今日照护情况';

  const quickActions = [
    { emoji: '💊', decorEmoji: '', label: '用药记录', route: '/medication', gradientStart: Gradients.coral[0], gradientEnd: Gradients.coral[1], bgColor: AppColors.coral.soft },
    { emoji: '📔', decorEmoji: '', label: '护理日记', route: '/diary',      gradientStart: Gradients.peach[0], gradientEnd: Gradients.peach[1], bgColor: AppColors.peach.soft },
    { emoji: '👥', decorEmoji: '', label: '家庭同步', route: '/family',     gradientStart: Gradients.purple[0], gradientEnd: Gradients.purple[1], bgColor: AppColors.purple.soft },
    { emoji: '📊', decorEmoji: '', label: '数据分析',  route: '/share',  gradientStart: Gradients.green[0], gradientEnd: Gradients.green[1], bgColor: AppColors.green.soft },
  ];

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[...Gradients.appBg]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* ── 背景装饰层（不干扰交互）── */}
      <View style={styles.bgDecorLayer} pointerEvents="none">
        {/* 3朵云 */}
        <FloatingCloud top={60} left={-10} delay={0} />
        <FloatingCloud top={40} left={width * 0.38} delay={600} />
        <FloatingCloud top={80} left={width * 0.68} delay={1200} />

      </View>

      <ScrollView
        style={[styles.container, { paddingTop: insets.top }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
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
                onPress={() => memberships.length > 1 && setShowSwitcher(true)}
                activeOpacity={memberships.length > 1 ? 0.7 : 1}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}
              >
                <Text style={{ fontSize: 12, color: AppColors.text.secondary, fontWeight: '600' }}>
                  🏠 {activeMembership?.room.elderName || elderNickname}的家庭
                </Text>
                {memberships.length > 1 && <Text style={{ fontSize: 10, color: AppColors.text.tertiary }}>▼</Text>}
              </TouchableOpacity>
            )}
            <Text style={styles.greeting}>{greeting}</Text>
          </View>
          <Animated.View style={{ transform: [{ scale: avatarScale }] }}>
            <TouchableOpacity
              style={[styles.profileBtn, memberPhotoUri ? { backgroundColor: 'transparent', borderWidth: 2.5, borderColor: zodiacColor + '60' } : {}]}
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
          onPress={() => router.push('/checkin' as any)}
        />

        {/* ── AI 卡片 ── */}
        <EnhancedAICard
          morningDone={morningDone}
          encouragement={encouragement}
          motivation={getDailyStatusHint(todayCheckIn)}
          onPress={() => router.push('/share' as any)}
          onCheckinPress={() => router.push('/checkin' as any)}
        />

        {/* ── 趋势图 ── */}
        {allCheckIns.length > 0 && <TrendChart checkIns={allCheckIns} patientNickname={elderNickname} caregiverName={caregiverName} />}

        {/* ── 快捷入口 ── */}
        <View style={{ marginBottom: 4 }}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>快捷入口</Text>
          </View>
          <View style={styles.quickGrid}>
            <View style={styles.quickRow}>
              {quickActions.slice(0, 2).map((item, i) => (
                <QuickActionCard key={item.route} {...item} onPress={() => router.push(item.route as any)} delay={50 + i * 80} />
              ))}
            </View>
            <View style={styles.quickRow}>
              {quickActions.slice(2, 4).map((item, i) => (
                <QuickActionCard key={item.route} {...item} onPress={() => router.push(item.route as any)} delay={210 + i * 80} />
              ))}
            </View>
          </View>
        </View>

        {/* ── 今日数据摘要 ── */}
        {latestCheckIn && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryCardHeader}>
              <Text style={styles.summaryCardTitle}>
                {todayCheckIn ? '今日' : '昨日'}数据摘要
              </Text>
              <TouchableOpacity onPress={() => router.push('/share' as any)}>
                <Text style={styles.summaryCardEdit}>查看分析 →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.summaryCardRow}>
              <View style={styles.summaryCardItem}>
                <Text style={styles.summaryCardEmoji}>{latestCheckIn.moodEmoji || '😊'}</Text>
                <Text style={styles.summaryCardLabel}>心情</Text>
                <Text style={styles.summaryCardValue}>{getMoodLabel(latestCheckIn.moodScore)}</Text>
              </View>
              <View style={styles.summaryCardDivider} />
              <View style={styles.summaryCardItem}>
                <Text style={styles.summaryCardEmoji}>💤</Text>
                <Text style={styles.summaryCardLabel}>睡眠</Text>
                <Text style={styles.summaryCardValue}>{latestCheckIn.sleepHours}h</Text>
              </View>
              <View style={styles.summaryCardDivider} />
              <View style={styles.summaryCardItem}>
                <Text style={styles.summaryCardEmoji}>💊</Text>
                <Text style={styles.summaryCardLabel}>用药</Text>
                <Text style={styles.summaryCardValue}>{latestCheckIn.medicationTaken ? '已服用' : '未记录'}</Text>
              </View>
              {latestCheckIn.careScore != null && (
                <>
                  <View style={styles.summaryCardDivider} />
                  <View style={styles.summaryCardItem}>
                    <Text style={styles.summaryCardEmoji}>⭐</Text>
                    <Text style={styles.summaryCardLabel}>护理指数</Text>
                    <Text style={[styles.summaryCardValue, { color: '#F59E0B' }]}>{latestCheckIn.careScore}分</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        <WeeklyEcho caregiverName={caregiverName} elderNickname={elderNickname} />
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Family Switcher Modal */}
      <Modal visible={showSwitcher} transparent animationType="fade" onRequestClose={() => setShowSwitcher(false)}>
        <TouchableOpacity style={switStyles.overlay} activeOpacity={1} onPress={() => setShowSwitcher(false)}>
          <View style={switStyles.sheet}>
            <Text style={switStyles.title}>切换家庭</Text>
            {memberships.map(m => (
              <TouchableOpacity
                key={m.familyId}
                style={[switStyles.row, activeMembership?.familyId === m.familyId && switStyles.rowActive]}
                onPress={async () => {
                  await switchFamily(m.familyId);
                  setShowSwitcher(false);
                }}
              >
                <Text style={{ fontSize: 22, marginRight: 12 }}>{m.room.members[0]?.emoji || '🏠'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={switStyles.name}>{m.room.elderName}</Text>
                  <Text style={switStyles.role}>{m.role === 'creator' ? '📋 主要照顾者' : '👁️ 家庭成员'}</Text>
                </View>
                {activeMembership?.familyId === m.familyId && <Text style={{ fontSize: 16, color: AppColors.green.muted }}>✓</Text>}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={switStyles.addBtn}
              onPress={() => { setShowSwitcher(false); setTimeout(() => router.push('/(modals)/create-family' as any), 200); }}
            >
              <Text style={switStyles.addText}>＋ 创建新家庭</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const switStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: AppColors.surface.whiteStrong, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36, ...SHADOWS.lg },
  title: { fontSize: 17, fontWeight: '800', color: AppColors.text.primary, textAlign: 'center', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, marginBottom: 8, backgroundColor: AppColors.bg.secondary },
  rowActive: { backgroundColor: AppColors.green.soft, borderWidth: 1.5, borderColor: AppColors.green.muted },
  name: { fontSize: 15, fontWeight: '700', color: AppColors.text.primary, marginBottom: 2 },
  role: { fontSize: 12, color: AppColors.text.secondary },
  addBtn: { marginTop: 8, paddingVertical: 14, alignItems: 'center', borderRadius: 14, borderWidth: 1.5, borderColor: AppColors.border.soft, borderStyle: 'dashed' },
  addText: { fontSize: 14, fontWeight: '700', color: AppColors.text.tertiary },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20, paddingBottom: 24 },

  bgDecorLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: 220, overflow: 'hidden' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 24, paddingBottom: 20 },
  // 日期天气行
  dateWeatherRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingRight: 14 },
  dateBlock: { flexDirection: 'column', gap: 4 },
  dateText: { fontSize: 14, fontWeight: '600', color: AppColors.text.secondary, letterSpacing: 0.3 },
  lunarText: { fontSize: 12, color: AppColors.peach.primary, fontWeight: '500' },
  weatherChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.90)',
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.07)',
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 3,
  },
  weatherIcon: { fontSize: 20 },
  weatherTemp: { fontSize: 14, fontWeight: '800', color: AppColors.text.primary, lineHeight: 17 },
  weatherDesc: { fontSize: 11, color: AppColors.text.tertiary, lineHeight: 14 },
  // 标题行
  appNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  appName: { fontSize: 24, fontWeight: '800', color: AppColors.text.primary, letterSpacing: -0.5 },
  greeting: { fontSize: 15, color: AppColors.text.tertiary, fontWeight: '500', lineHeight: 22 },
  profileBtn: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...SHADOWS.md },
  profileGradient: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  profilePhoto: { width: 56, height: 56, borderRadius: 16 },

  // 打卡横幅
  checkinBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 24, padding: 18, overflow: 'hidden', ...SHADOWS.md },
  bannerDecor1: { position: 'absolute', top: -20, right: -20, width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.15)' },
  bannerDecor2: { position: 'absolute', bottom: -20, left: 60, width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.10)' },
  starDecor: { position: 'absolute' },
  checkinLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  checkinIconBox: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  checkinIconBoxDone: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: AppColors.green.soft },
  checkinTitle: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  checkinTitleDone: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  checkinSub: { fontSize: 13, color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  checkinSubDone: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  checkinDone: { flexDirection: 'row', alignItems: 'center', backgroundColor: AppColors.green.soft, borderWidth: 1.5, borderColor: AppColors.green.primary, borderRadius: 24, padding: 18, marginBottom: 16, ...SHADOWS.sm },
  chevronCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  chevronCircleDone: { width: 32, height: 32, borderRadius: 16, backgroundColor: AppColors.bg.secondary, alignItems: 'center', justifyContent: 'center' },
  careScoreBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, backgroundColor: AppColors.peach.soft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },

  // AI 卡片
  aiCard: { marginBottom: 16, backgroundColor: AppColors.purple.soft, borderRadius: 24, padding: 18, borderWidth: 1, borderColor: AppColors.purple.primary, overflow: 'hidden', ...SHADOWS.sm },
  aiGlow1: { position: 'absolute', top: 0, right: 0, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(167,139,250,0.15)', transform: [{ translateX: 60 }, { translateY: -60 }] },
  aiGlow2: { position: 'absolute', bottom: 0, left: 0, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(139,92,246,0.12)', transform: [{ translateX: -50 }, { translateY: 50 }] },
  aiDecorFigure: { position: 'absolute', top: 8, right: 12, fontSize: 44, opacity: 0.18, transform: [{ scaleX: -1 }] },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  aiIconBox: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  aiLabel: { fontSize: 16, fontWeight: '800', color: AppColors.purple.strong, letterSpacing: -0.3 },
  aiSubLabel: { fontSize: 12, color: AppColors.purple.strong, marginTop: 2 },
  aiContentBox: { backgroundColor: AppColors.surface.whiteStrong, borderRadius: 16, padding: 14, marginBottom: 12 },
  aiMessage: { fontSize: 14, color: AppColors.text.primary, lineHeight: 22 },
  aiSkeletonWrap: { position: 'relative', overflow: 'hidden', gap: 8, paddingBottom: 4 },
  aiSkeletonLine: { width: '100%', height: 13, borderRadius: 6, backgroundColor: AppColors.border.soft, opacity: 0.7 },
  aiSkeletonBadgeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  aiSkeletonBadge: { width: 56, height: 24, borderRadius: 12, backgroundColor: AppColors.purple.soft, opacity: 0.6 },
  aiSkeletonOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.82)', justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  aiSkeletonLockBox: { alignItems: 'center', gap: 6, backgroundColor: AppColors.purple.soft, borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, borderWidth: 1, borderColor: AppColors.purple.primary },
  aiSkeletonLockText: { fontSize: 13, fontWeight: '700', color: AppColors.purple.strong },
  aiSkeletonLockSub: { fontSize: 11, color: AppColors.purple.strong, textAlign: 'center' },
  aiBadgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: AppColors.purple.soft, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  aiBadgeEmoji: { fontSize: 12 },
  aiBadgeText: { fontSize: 12, color: AppColors.purple.strong, fontWeight: '600' },
  aiDetailLink: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 10 },
  aiDetailLinkText: { fontSize: 13, fontWeight: '700', color: AppColors.purple.strong },

  // 护理贴士

  // 快捷入口标题
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitleEmoji: { fontSize: 18 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text, letterSpacing: -0.5 },

  // 快捷入口网格
  quickGrid: { marginTop: 4 },
  quickRow: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  quickItem: { flex: 1 },
  quickCard: { borderRadius: 24, padding: 16, height: 160, flexDirection: 'column', alignItems: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)', ...SHADOWS.sm },
  quickIconBox: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  quickEmoji: { fontSize: 28, lineHeight: 34 },
  quickLabel: { fontSize: 16, fontWeight: '800', color: AppColors.text.primary, letterSpacing: -0.3, lineHeight: 22 },
  quickDecorEmoji: { fontSize: 22, opacity: 0.65, marginTop: 2 },

  // 数据摘要卡片
  summaryCard: { backgroundColor: AppColors.surface.whiteStrong, borderRadius: 24, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: AppColors.border.soft, ...SHADOWS.sm },
  summaryCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  summaryCardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  summaryCardEdit: { fontSize: 13, color: AppColors.purple.strong, fontWeight: '600' },
  summaryCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryCardItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryCardEmoji: { fontSize: 24 },
  summaryCardLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  summaryCardValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  summaryCardDivider: { width: 1, height: 40, backgroundColor: AppColors.border.soft },
});
