import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity,
  StyleSheet, Dimensions, Animated, Easing, Platform, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { getRandomTip } from '@/lib/care-knowledge';
import { getWeatherByGPS, buildGreetingWithWeather, fetchWeather, GpsWeatherInfo, WeatherData } from '@/lib/weather';
import { getLunarDate, getFormattedDate } from '@/lib/lunar';
import { getTodayCheckIn, getProfile, getAllCheckIns, DailyCheckIn } from '@/lib/storage';
import { TrendChart } from '@/components/trend-chart';
import { COLORS, SHADOWS, fadeInUp, pressAnimation } from '@/lib/animations';
import * as Haptics from 'expo-haptics';
import { WeeklyEcho } from '@/components/weekly-echo';

const { width } = Dimensions.get('window');

const DAILY_MOTIVATIONS = [
  '今天也是充满爱的一天，你的用心大家都看得到 🌸',
  '照顾家人是一件了不起的事，谢谢你每天的坚持 ✨',
  '小进步也是进步，今天的你已经很棒了 🌟',
  '爱是最好的药，你每天的陪伴就是最大的治愈 💜',
  '不必完美，只需在场。你的存在就是最大的安慰 🌼',
  '每一天的记录，都是对家人最深的爱 📝',
  '你的笑容是家人最大的力量，记得也照顾好自己 😊',
  '今天的天气适合出门散步，带着家人多晒晒太阳 ☀️',
  '你不是一个人在战斗，我们都在这里 🤝',
  '每一天都是新的开始，加油！ 🚀',
];

function getDailyMotivation(): string {
  const dayOfYear = Math.floor(Date.now() / 86400000);
  return DAILY_MOTIVATIONS[dayOfYear % DAILY_MOTIVATIONS.length];
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
              colors={['#FFB347', '#FF8E7F', '#FF6B9D']}
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
                  <Text style={styles.checkinTitle}>开始今日打卡</Text>
                  <Text style={styles.checkinSub}>记录{elderNickname}的状态，解锁今日小马虎分析 ✨</Text>
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
              colors={['#A78BFA', '#8B5CF6', '#7C3AED']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.aiIconBox}
            >
              <Text style={{ fontSize: 20, lineHeight: 24 }}>✨</Text>
            </LinearGradient>
          </Animated.View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiLabel}>小马虎 今日记录分析</Text>
            <Text style={styles.aiSubLabel}>{motivation}</Text>
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
                  <Text style={{ fontSize: 20 }}>🔒</Text>
                  <Text style={styles.aiSkeletonLockText}>完成早间打卡后解锁</Text>
                  <Text style={styles.aiSkeletonLockSub}>打卡后即可查看今日分析摘要 ✨</Text>
                </View>
              </View>
            </View>
          ) : (
            <Text style={styles.aiMessage}>{encouragement}</Text>
          )}
        </View>

        {morningDone && (
          <View style={styles.aiBadgeRow}>
            {[{ emoji: '🧠', text: '护理指数' }, { emoji: '💬', text: '营养建议' }, { emoji: '☀️', text: '天气组合' }].map((b, i) => (
              <View key={i} style={styles.aiBadge}>
                <Text style={styles.aiBadgeEmoji}>{b.emoji}</Text>
                <Text style={styles.aiBadgeText}>{b.text}</Text>
              </View>
            ))}
          </View>
        )}

        {morningDone ? (
          <TouchableOpacity onPress={onPress} style={styles.aiDetailLink}>
            <Text style={styles.aiDetailLinkText}>查看详细建议 ›</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={onCheckinPress} style={styles.aiDetailLink}>
            <Text style={[styles.aiDetailLinkText, { color: '#FF8E7F' }]}>开始早间打卡 →</Text>
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
  const { moodScore, sleepHours, medicationTaken, moodEmoji } = checkIn;
  if (moodScore >= 8 && sleepHours >= 7)
    return `今天状态很棒！${moodEmoji || '😊'} 心情好、睡眠充足，适合带家人出门散步或做点轻松的活动 🌳`;
  if (moodScore >= 6 && sleepHours >= 6)
    return `今天整体状态不错，保持轻松的心情是最好的护理 🌸 记得多喝水、多休息哦`;
  if (sleepHours < 6)
    return `昨晚睡眠时间较短，今天可以安排小憩 💤 充足的休息是最好的护理基础`;
  if (moodScore < 5)
    return `今天心情有些低落，没关系，这很正常 💜 可以听听音乐或和家人聊聊天，心情会好起来的`;
  if (!medicationTaken)
    return `今天用药还没记录，记得按时服药哦 💊 规律用药是护理的重要一环`;
  return `今天的护理记录已完成 ${moodEmoji || '😊'} 你的用心大家都看得到，加油！`;
}

// ─── 主页面 ─────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [greeting, setGreeting] = useState('');
  const [tip, setTip] = useState<{ category: string; icon: string; tip: string } | null>(null);
  const [todayCheckIn, setTodayCheckIn] = useState<DailyCheckIn | null>(null);
  const [allCheckIns, setAllCheckIns] = useState<DailyCheckIn[]>([]);
  const [elderNickname, setElderNickname] = useState('老宝');
  const [caregiverName, setCaregiverName] = useState('');
  const [memberPhotoUri, setMemberPhotoUri] = useState<string | null>(null);
  const [zodiacColor, setZodiacColor] = useState('#FF6B6B');
  const [zodiacEmoji, setZodiacEmoji] = useState('🐎');
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [cityName, setCityName] = useState('');
  const lunarDate = getLunarDate();
  const todayLabel = getFormattedDate();

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-15)).current;
  const avatarScale = useRef(new Animated.Value(0)).current;
  // 标题 🚀 摇摆 — 在 hook 顶层调用
  const rocketRot = useShakeAnim();

  const loadData = useCallback(async () => {
    const profile = await getProfile();
    if (!profile || !profile.setupComplete) { router.replace('/onboarding' as any); return; }
    setElderNickname(profile?.nickname || profile?.name || '老宝');
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
    setTip(getRandomTip());
    if (profile?.birthDate) {
      const { getZodiacFromDate } = require('@/lib/zodiac');
      const zodiac = getZodiacFromDate(profile.birthDate);
      setZodiacColor(zodiac.color);
      setZodiacEmoji(zodiac.emoji);
    }
    const today = await getTodayCheckIn();
    setTodayCheckIn(today);
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
    : '先完成今天的早间打卡，我再为你生成更贴合今天情况的建议 🌸';

  const quickActions = [
    { emoji: '💊', decorEmoji: '✨', label: '用药提醒', route: '/medication', gradientStart: '#F472B6', gradientEnd: '#EC4899', bgColor: '#FFF0F6' },
    { emoji: '📔', decorEmoji: '🌸', label: '护理日记', route: '/diary',      gradientStart: '#60A5FA', gradientEnd: '#3B82F6', bgColor: '#EFF6FF' },
    { emoji: '👥', decorEmoji: '💜', label: '家庭共享', route: '/family',     gradientStart: '#C084FC', gradientEnd: '#A855F7', bgColor: '#F5F0FF' },
    { emoji: '🤖', decorEmoji: '🧠', label: '小马虎',  route: '/assistant',  gradientStart: '#34D399', gradientEnd: '#10B981', bgColor: '#EFFDF5' },
  ];

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#FFF7ED', '#FDF2F8', '#FAF5FF']}
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
              <Text style={styles.appName}>我们一起照顾好今天</Text>
              <Text style={styles.headerSparkle}>✨</Text>
            </View>
            <Text style={styles.greeting}>{greeting}</Text>
          </View>
          <Animated.View style={{ transform: [{ scale: avatarScale }] }}>
            <TouchableOpacity
              style={[styles.profileBtn, memberPhotoUri ? { backgroundColor: 'transparent', borderWidth: 2.5, borderColor: zodiacColor + '80' } : {}]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/profile' as any);
              }}
            >
              {memberPhotoUri ? (
                <Image source={{ uri: memberPhotoUri }} style={styles.profilePhoto} />
              ) : (
                <LinearGradient colors={['#FFAB9B', '#FF8C7A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.profileGradient}>
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
          motivation={getDailyMotivation()}
          onPress={() => router.push('/assistant' as any)}
          onCheckinPress={() => router.push('/checkin' as any)}
        />

        {/* ── 趋势图 ── */}
        {allCheckIns.length > 0 && <TrendChart checkIns={allCheckIns} patientNickname={elderNickname} caregiverName={caregiverName} />}

        {/* ── 护理贴士 ── */}
        {tip && (
          <View style={styles.tipCard}>
            <View style={styles.tipHeader}>
              <View style={styles.tipIconCircle}>
                <Text style={{ fontSize: 14 }}>💡</Text>
              </View>
              <Text style={styles.tipCategory}>{tip.category}</Text>
            </View>
            <Text style={styles.tipText}>{tip.tip}</Text>
          </View>
        )}

        {/* ── 快捷入口 ── */}
        <View style={{ marginBottom: 4 }}>
          <View style={styles.sectionHeader}>
            <Animated.Text style={[styles.sectionTitleEmoji, { transform: [{ rotate: rocketRot }] }]}>🚀</Animated.Text>
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
        {todayDone && todayCheckIn && (
          <View style={styles.summaryCard}>
            <View style={styles.summaryCardHeader}>
              <Text style={styles.summaryCardTitle}>✨ 今日数据摘要</Text>
              <TouchableOpacity onPress={() => router.push('/checkin' as any)}>
                <Text style={styles.summaryCardEdit}>查看详情</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.summaryCardRow}>
              <View style={styles.summaryCardItem}>
                <Text style={styles.summaryCardEmoji}>{todayCheckIn.moodEmoji || '😊'}</Text>
                <Text style={styles.summaryCardLabel}>心情</Text>
                <Text style={styles.summaryCardValue}>{getMoodLabel(todayCheckIn.moodScore)}</Text>
              </View>
              <View style={styles.summaryCardDivider} />
              <View style={styles.summaryCardItem}>
                <Text style={styles.summaryCardEmoji}>💤</Text>
                <Text style={styles.summaryCardLabel}>睡眠</Text>
                <Text style={styles.summaryCardValue}>{todayCheckIn.sleepHours}h</Text>
              </View>
              <View style={styles.summaryCardDivider} />
              <View style={styles.summaryCardItem}>
                <Text style={styles.summaryCardEmoji}>💊</Text>
                <Text style={styles.summaryCardLabel}>用药</Text>
                <Text style={styles.summaryCardValue}>{todayCheckIn.medicationTaken ? '已服用' : '未记录'}</Text>
              </View>
              {todayCheckIn.careScore != null && (
                <>
                  <View style={styles.summaryCardDivider} />
                  <View style={styles.summaryCardItem}>
                    <Text style={styles.summaryCardEmoji}>⭐</Text>
                    <Text style={styles.summaryCardLabel}>护理指数</Text>
                    <Text style={[styles.summaryCardValue, { color: '#F59E0B' }]}>{todayCheckIn.careScore}分</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        )}

        <WeeklyEcho caregiverName={caregiverName} elderNickname={elderNickname} />
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 20, paddingBottom: 24 },

  bgDecorLayer: { position: 'absolute', top: 0, left: 0, right: 0, height: 220, overflow: 'hidden' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 14, paddingBottom: 12 },
  // 日期天气行
  dateWeatherRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingRight: 14 },
  dateBlock: { flexDirection: 'column', gap: 1 },
  dateText: { fontSize: 13, fontWeight: '700', color: '#555', letterSpacing: 0.2 },
  lunarText: { fontSize: 11, color: '#A0855B', fontWeight: '500', marginTop: 1 },
  weatherChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.82)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  weatherIcon: { fontSize: 18 },
  weatherTemp: { fontSize: 13, fontWeight: '800', color: '#333', lineHeight: 16 },
  weatherDesc: { fontSize: 10, color: '#888', lineHeight: 13 },
  // 标题行
  appNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  appName: { fontSize: 22, fontWeight: '900', color: '#FF4D4D', letterSpacing: -0.5 },
  headerSparkle: { fontSize: 18 },
  greeting: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, fontWeight: '500' },
  profileBtn: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...SHADOWS.md },
  profileGradient: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  profilePhoto: { width: 52, height: 52, borderRadius: 14 },

  // 打卡横幅
  checkinBanner: { flexDirection: 'row', alignItems: 'center', borderRadius: 24, padding: 18, overflow: 'hidden', ...SHADOWS.md },
  bannerDecor1: { position: 'absolute', top: -20, right: -20, width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.15)' },
  bannerDecor2: { position: 'absolute', bottom: -20, left: 60, width: 70, height: 70, borderRadius: 35, backgroundColor: 'rgba(255,255,255,0.10)' },
  starDecor: { position: 'absolute' },
  checkinLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  checkinIconBox: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.25)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  checkinIconBoxDone: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#DCFCE7' },
  checkinTitle: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  checkinTitleDone: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  checkinSub: { fontSize: 13, color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  checkinSubDone: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  checkinDone: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#BBF7D0', borderRadius: 24, padding: 18, marginBottom: 16, ...SHADOWS.sm },
  chevronCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.28)', alignItems: 'center', justifyContent: 'center' },
  chevronCircleDone: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  careScoreBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start' },

  // AI 卡片
  aiCard: { marginBottom: 16, backgroundColor: '#F3EEFF', borderRadius: 24, padding: 18, borderWidth: 1, borderColor: '#DDD6FE', overflow: 'hidden', ...SHADOWS.sm },
  aiGlow1: { position: 'absolute', top: 0, right: 0, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(167,139,250,0.15)', transform: [{ translateX: 60 }, { translateY: -60 }] },
  aiGlow2: { position: 'absolute', bottom: 0, left: 0, width: 150, height: 150, borderRadius: 75, backgroundColor: 'rgba(139,92,246,0.12)', transform: [{ translateX: -50 }, { translateY: 50 }] },
  aiDecorFigure: { position: 'absolute', top: 8, right: 12, fontSize: 44, opacity: 0.18, transform: [{ scaleX: -1 }] },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  aiIconBox: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  aiLabel: { fontSize: 16, fontWeight: '800', color: '#5B21B6', letterSpacing: -0.3 },
  aiSubLabel: { fontSize: 12, color: '#7C3AED', marginTop: 2 },
  aiContentBox: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 12 },
  aiMessage: { fontSize: 14, color: '#374151', lineHeight: 22 },
  aiSkeletonWrap: { position: 'relative', overflow: 'hidden', gap: 8, paddingBottom: 4 },
  aiSkeletonLine: { width: '100%', height: 13, borderRadius: 6, backgroundColor: '#E5E7EB', opacity: 0.7 },
  aiSkeletonBadgeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  aiSkeletonBadge: { width: 56, height: 24, borderRadius: 12, backgroundColor: '#EDE9FE', opacity: 0.6 },
  aiSkeletonOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.82)', justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  aiSkeletonLockBox: { alignItems: 'center', gap: 6, backgroundColor: '#F5F3FF', borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14, borderWidth: 1, borderColor: '#DDD6FE' },
  aiSkeletonLockText: { fontSize: 13, fontWeight: '700', color: '#5B21B6' },
  aiSkeletonLockSub: { fontSize: 11, color: '#7C3AED', textAlign: 'center' },
  aiBadgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  aiBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EDE9FE', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  aiBadgeEmoji: { fontSize: 12 },
  aiBadgeText: { fontSize: 12, color: '#5B21B6', fontWeight: '600' },
  aiDetailLink: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 10 },
  aiDetailLinkText: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },

  // 护理贴士
  tipCard: { backgroundColor: '#FFFBEB', borderRadius: 24, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#FDE68A', ...SHADOWS.sm },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  tipIconCircle: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  tipCategory: { fontSize: 12, fontWeight: '700', color: '#D4883E', textTransform: 'uppercase', letterSpacing: 0.5 },
  tipText: { fontSize: 14, color: '#555', lineHeight: 22 },

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
  quickLabel: { fontSize: 16, fontWeight: '800', color: '#1C1C1E', letterSpacing: -0.3, lineHeight: 22 },
  quickDecorEmoji: { fontSize: 22, opacity: 0.65, marginTop: 2 },

  // 数据摘要卡片
  summaryCard: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#F0F0F0', ...SHADOWS.sm },
  summaryCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  summaryCardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  summaryCardEdit: { fontSize: 13, color: '#7C3AED', fontWeight: '600' },
  summaryCardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryCardItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryCardEmoji: { fontSize: 24 },
  summaryCardLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  summaryCardValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  summaryCardDivider: { width: 1, height: 40, backgroundColor: '#F0F0F0' },
});
