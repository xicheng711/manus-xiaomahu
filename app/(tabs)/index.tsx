import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ScrollView, View, Text, TouchableOpacity,
  StyleSheet, Dimensions, Animated, Easing, Platform, ViewStyle, Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getRandomTip, getEncouragement } from '@/lib/care-knowledge';
import { getWeatherByGPS, buildGreetingWithWeather, GpsWeatherInfo } from '@/lib/weather';
import { getTodayCheckIn, getRecentCheckIns, getProfile, getAllCheckIns, DailyCheckIn } from '@/lib/storage';
import { TrendChart } from '@/components/trend-chart';
import { COLORS, SHADOWS, RADIUS, fadeInUp, pulseLoop, pressAnimation } from '@/lib/animations';
import * as Haptics from 'expo-haptics';
import { WeeklyEcho } from '@/components/weekly-echo';

const { width } = Dimensions.get('window');

// 每日打气语库
const DAILY_MOTIVATIONS = [
  '今天也是充满爱的一天，你的用心大家都看得到 🌸',
  '照顾家人是一件了不起的事，谢谢你每天的堅持 ✨',
  '小进步也是进步，今天的你已经很棒了 🌟',
  '爱是最好的药，你每天的陨伴就是最大的治愈 💜',
  '不必完美，只需在场。你的存在就是最大的安慰 🌼',
  '每一天的记录，都是对家人最深的爱 📝',
  '你的笑容是家人最大的力量，记得也照顾好自己 😊',
  '今天的天气适合出门散步，带着家人多晒晓太阳 ☀️',
  '你不是一个人在战斗，我们都在这里 🤝',
  '每一天都是新的开始，加油！ 🚀',
];

function getDailyMotivation(): string {
  const dayOfYear = Math.floor(Date.now() / 86400000);
  return DAILY_MOTIVATIONS[dayOfYear % DAILY_MOTIVATIONS.length];
}

// ─── Floating Heart Decoration ────────────────────────────────────────────────
function FloatingHeart({ delay = 0, x = 0 }: { delay?: number; x?: number }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = () => {
      translateY.setValue(0);
      opacity.setValue(0);
      translateX.setValue(0);
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.45, duration: 600, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.45, duration: 2800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 600, useNativeDriver: true }),
        ]),
        Animated.timing(translateY, { toValue: -80, duration: 4000, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(translateX, { toValue: 10, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(translateX, { toValue: -10, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ]),
      ]).start(() => setTimeout(run, 1000 + Math.random() * 2000));
    };
    setTimeout(run, delay);
  }, []);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        bottom: 0,
        left: x,
        fontSize: 16,
        transform: [{ translateY }, { translateX }],
        opacity,
      }}
    >
      🩷
    </Animated.Text>
  );
}

// ─── Cloud Decoration ─────────────────────────────────────────────────────────
function CloudDecoration({ top = 0, left = 0, size = 1, delay = 0 }: { top?: number; left?: number; size?: number; delay?: number }) {
  const floatY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setTimeout(() => {
      Animated.timing(opacity, { toValue: 0.6, duration: 1000, useNativeDriver: true }).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatY, { toValue: -8, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(floatY, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    }, delay);
  }, []);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        top,
        left,
        fontSize: 28 * size,
        opacity,
        transform: [{ translateY: floatY }],
      }}
    >
      ☁️
    </Animated.Text>
  );
}

// ─── Mini Sun Decoration ──────────────────────────────────────────────────────
function MiniSun({ top = 0, right = 0, color = '🌟' }: { top?: number; right?: number; color?: string }) {
  const rotate = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, speed: 4, bounciness: 8, useNativeDriver: true }).start();
    Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 30000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        top,
        right,
        fontSize: 22,
        opacity: 0.7,
        transform: [{ scale }, { rotate: spin }],
      }}
    >
      {color}
    </Animated.Text>
  );
}

// ─── Animated Card ────────────────────────────────────────────────────────────
function AnimatedCard({ children, style, onPress, delay = 0 }: {
  children: React.ReactNode; style?: ViewStyle; onPress?: () => void; delay?: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fadeInUp(fadeAnim, slideAnim, { delay, duration: 500 });
  }, []);

  const handlePress = () => {
    if (!onPress) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    pressAnimation(scaleAnim, onPress);
  };

  return (
    <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }, style]}>
      {onPress ? (
        <TouchableOpacity onPress={handlePress} activeOpacity={0.92}>
          {children}
        </TouchableOpacity>
      ) : children}
    </Animated.View>
  );
}// ─── Quick Action Card ──────────────────────────────────────────────────────────────────────────────
function QuickAction({
  iconName, label, gradientStart, gradientEnd, bgColor, onPress, delay,
}: {
  iconName: string;
  label: string;
  gradientStart: string;
  gradientEnd: string;
  bgColor: string;
  onPress: () => void;
  delay: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fadeInUp(fadeAnim, slideAnim, { delay, duration: 400 });
  }, []);

  return (
    <Animated.View style={[styles.quickItem, { opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }]}>
      <TouchableOpacity
        style={[styles.quickCard, { backgroundColor: bgColor }]}
        onPress={() => pressAnimation(scaleAnim, onPress)}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={[gradientStart, gradientEnd]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.quickIconBox}
        >
          <MaterialCommunityIcons name={iconName as any} size={32} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1 }} />
        <Text style={styles.quickLabel}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Helper functions ────────────────────────────────────────────────────────
function getMoodLabel(score: number): string {
  if (score >= 9) return '非常好';
  if (score >= 7) return '心情不错';
  if (score >= 5) return '平稳';
  if (score >= 3) return '有点低落';
  return '需要关注';
}

function getPersonalizedAISuggestion(checkIn: DailyCheckIn): string {
  const { moodScore, sleepHours, medicationTaken, moodEmoji } = checkIn;
  if (moodScore >= 8 && sleepHours >= 7) {
    return `今天状态很棒！${moodEmoji || '😊'} 心情好、睡眠充足，适合带家人出门散步或做点轻松的活动 🌳`;
  }
  if (moodScore >= 6 && sleepHours >= 6) {
    return `今天整体状态不错，保持轻松的心情是最好的护理 🌸 记得多喝水、多休息哦`;
  }
  if (sleepHours < 6) {
    return `昨晚睡眠时间较短，今天可以安排小憩小睡 💤 充足的休息是最好的护理基础`;
  }
  if (moodScore < 5) {
    return `今天心情有些低落，没关系，这很正常 💜 可以听听音乐或和家人聊聊天，心情会好起来的`;
  }
  if (!medicationTaken) {
    return `今天用药还没记录，记得按时服药哦 💊 规律用药是护理的重要一环`;
  }
  return `今天的护理记录已完成 ${moodEmoji || '😊'} 你的用心大家都看得到，加油！`;
}

// --- Home Screen ---
export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [greeting, setGreeting] = useState('');
  const [tip, setTip] = useState<{ category: string; icon: string; tip: string } | null>(null);
  const [todayDone, setTodayDone] = useState(false);
  const [todayCheckIn, setTodayCheckIn] = useState<DailyCheckIn | null>(null);
  const [allCheckIns, setAllCheckIns] = useState<DailyCheckIn[]>([]);
  const [zodiacEmoji, setZodiacEmoji] = useState('👤');
  const [zodiacColor, setZodiacColor] = useState('#FF6B6B');
  const [zodiacBgColor, setZodiacBgColor] = useState('#FFF0F0');
  const [elderNickname, setElderNickname] = useState('老宝');
  const [caregiverName, setCaregiverName] = useState('');
  const [memberPhotoUri, setMemberPhotoUri] = useState<string | null>(null);
  const [gpsWeather, setGpsWeather] = useState<GpsWeatherInfo | null>(null);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-15)).current;
  const avatarScale = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const loadData = useCallback(async () => {
    const profile = await getProfile();
    if (!profile || !profile.setupComplete) {
      router.replace('/onboarding' as any);
      return;
    }
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
    getWeatherByGPS().then(weather => {
      setGpsWeather(weather);
      setGreeting(buildGreetingWithWeather(cgName || undefined, weather));
    });
    setGreeting(buildGreetingWithWeather(cgName || undefined, null));
    setTip(getRandomTip());
    if (profile?.zodiacEmoji) {
      setZodiacEmoji(profile.zodiacEmoji);
      const { getZodiacFromDate } = require('@/lib/zodiac');
      if (profile.birthDate) {
        const zodiac = getZodiacFromDate(profile.birthDate);
        setZodiacColor(zodiac.color);
        setZodiacBgColor(zodiac.bgColor);
      }
    }
    const today = await getTodayCheckIn();
    setTodayCheckIn(today);
    setTodayDone(!!today);
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
    pulseLoop(pulseAnim, { min: 0.98, max: 1.02, duration: 2000 });
  }, []);

  const morningDone = todayCheckIn?.morningDone ?? false;
  const eveningDone = todayCheckIn?.eveningDone ?? false;
  const checkinProgress = (morningDone ? 1 : 0) + (eveningDone ? 1 : 0);

  const encouragement = morningDone
    ? getPersonalizedAISuggestion(todayCheckIn!)
    : '先完成今天的早间打卡，我再为你生成更贴合今天情况的建议 🌸';

  const quickActions = [
    { iconName: 'pill',          label: '用药提醒', route: '/medication', gradientStart: '#F472B6', gradientEnd: '#EC4899', bgColor: '#FFF0F6' },
    { iconName: 'book-heart',    label: '护理日记', route: '/diary',      gradientStart: '#60A5FA', gradientEnd: '#3B82F6', bgColor: '#EFF6FF' },
    { iconName: 'account-group', label: '家庭共享', route: '/family',     gradientStart: '#C084FC', gradientEnd: '#A855F7', bgColor: '#F5F0FF' },
    { iconName: 'brain',         label: 'AI 助手',  route: '/assistant',  gradientStart: '#34D399', gradientEnd: '#10B981', bgColor: '#EFFDF5' },
  ];

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Background Decorations ── */}
      <View style={styles.bgDecorLayer} pointerEvents="none">
        {/* Clouds */}
        <CloudDecoration top={60} left={-10} size={0.9} delay={200} />
        <CloudDecoration top={40} left={width * 0.35} size={0.7} delay={800} />
        <CloudDecoration top={80} left={width * 0.65} size={1.0} delay={1400} />
        {/* Mini suns */}
        <MiniSun top={20} right={80} color="✨" />
        <MiniSun top={100} right={20} color="🌟" />
        {/* Floating hearts */}
        <FloatingHeart delay={500} x={width * 0.15} />
        <FloatingHeart delay={1200} x={width * 0.35} />
        <FloatingHeart delay={2000} x={width * 0.55} />
        <FloatingHeart delay={800} x={width * 0.72} />
        <FloatingHeart delay={1600} x={width * 0.88} />
        <FloatingHeart delay={300} x={width * 0.05} />
      </View>

      {/* ── Header ── */}
      <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
        <View style={{ flex: 1 }}>
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
              <LinearGradient
                colors={['#FFAB9B', '#FF8C7A']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.profileGradient}
              >
                <Ionicons name="person-outline" size={22} color="#fff" />
              </LinearGradient>
            )}
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      {/* ── Check-in Banner ── */}
      <AnimatedCard delay={100}>
        <Animated.View style={!morningDone ? { transform: [{ scale: pulseAnim }] } : undefined}>
          {!morningDone ? (
            <TouchableOpacity
              onPress={() => router.push('/checkin' as any)}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={['#4ADE80', '#10B981']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.checkinBanner}
              >
                <View style={styles.bannerDecor1} />
                <View style={styles.bannerDecor2} />
                <View style={styles.checkinLeft}>
                  <View style={styles.checkinIconBox}>
                    <Ionicons name="clipboard-outline" size={28} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.checkinTitle}>开始早间打卡</Text>
                    <Text style={styles.checkinSub}>记录{elderNickname}的状态，解锁今日 AI 建议 ✨</Text>
                  </View>
                </View>
                <View style={styles.chevronCircle}>
                  <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.9)" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.checkinDone}
              onPress={() => router.push('/checkin' as any)}
              activeOpacity={0.88}
            >
              <View style={styles.checkinLeft}>
                <View style={styles.checkinIconBoxDone}>
                  <Ionicons name="checkmark-circle" size={28} color="#16A34A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkinTitleDone}>今日记录 {checkinProgress}/2 ✅</Text>
                  <Text style={styles.checkinSubDone}>
                    早间已完成{eveningDone ? ' · 晚间已完成' : ' · 晚间待完成'}
                  </Text>
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
                <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
              </View>
            </TouchableOpacity>
          )}
        </Animated.View>
      </AnimatedCard>

      {/* ── AI Card ── */}
      <AnimatedCard delay={200} onPress={morningDone ? () => router.push('/assistant' as any) : undefined}>
        <View style={styles.aiCard}>
          {/* Decorative figure — top right (doctor/care icon) */}
          <Text style={styles.aiDecorFigure}>🦹‍♀️</Text>

          {/* Header row: gradient icon + title + subtitle */}
          <View style={styles.aiHeader}>
            <LinearGradient
              colors={['#A78BFA', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.aiIconBox}
            >
              <Ionicons name="sparkles" size={22} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.aiLabel}>AI 今日护理建议</Text>
              <Text style={styles.aiSubLabel}>{getDailyMotivation()}</Text>
            </View>
          </View>

          {/* White content box — locked: 骨架屏 / unlocked: real advice */}
          <View style={styles.aiContentBox}>
            {!morningDone ? (
              /* ── 骨架屏：打卡前预览 ── */
              <View style={styles.aiSkeletonWrap}>
                {/* 假文字行（模拟AI建议文本） */}
                <View style={styles.aiSkeletonLine} />
                <View style={[styles.aiSkeletonLine, { width: '78%' }]} />
                <View style={[styles.aiSkeletonLine, { width: '90%', marginTop: 8 }]} />
                <View style={[styles.aiSkeletonLine, { width: '65%' }]} />
                {/* 假标签行 */}
                <View style={styles.aiSkeletonBadgeRow}>
                  <View style={styles.aiSkeletonBadge} />
                  <View style={[styles.aiSkeletonBadge, { width: 72 }]} />
                  <View style={[styles.aiSkeletonBadge, { width: 64 }]} />
                </View>
                {/* 遮罩层 + 锁 */}
                <View style={styles.aiSkeletonOverlay}>
                  <View style={styles.aiSkeletonLockBox}>
                    <Ionicons name="lock-closed" size={20} color="#7C3AED" />
                    <Text style={styles.aiSkeletonLockText}>完成早间打卡后解锁</Text>
                    <Text style={styles.aiSkeletonLockSub}>打卡后即可查看今日护理建议 ✨</Text>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={styles.aiMessage}>{encouragement}</Text>
            )}
          </View>

          {/* Tag pills */}
          {morningDone && (
            <View style={styles.aiBadgeRow}>
              {[
                { emoji: '🧠', text: '护理指数' },
                { emoji: '💬', text: '营养建议' },
                { emoji: '☀️', text: '天气组合' },
              ].map((b, i) => (
                <View key={i} style={styles.aiBadge}>
                  <Text style={styles.aiBadgeEmoji}>{b.emoji}</Text>
                  <Text style={styles.aiBadgeText}>{b.text}</Text>
                </View>
              ))}
            </View>
          )}

          {/* View detail link or start checkin CTA */}
          {morningDone ? (
            <TouchableOpacity onPress={() => router.push('/assistant' as any)} style={styles.aiDetailLink}>
              <Text style={styles.aiDetailLinkText}>查看详细建议</Text>
              <Ionicons name="chevron-forward" size={14} color="#7C3AED" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => router.push('/checkin' as any)} style={styles.aiDetailLink}>
              <Text style={[styles.aiDetailLinkText, { color: '#10B981' }]}>开始早间打卡 →</Text>
            </TouchableOpacity>
          )}
        </View>
      </AnimatedCard>

      {/* ── Trend Chart ── */}
      {allCheckIns.length > 0 && (
        <AnimatedCard delay={300}>
          <TrendChart checkIns={allCheckIns} />
        </AnimatedCard>
      )}

      {/* ── Tip Card ── */}
      {tip && (
        <AnimatedCard delay={400}>
          <View style={styles.tipCard}>
            <View style={styles.tipHeader}>
              <View style={styles.tipIconCircle}>
                <Ionicons name="heart" size={16} color="#D4883E" />
              </View>
              <Text style={styles.tipCategory}>{tip.category}</Text>
            </View>
            <Text style={styles.tipText}>{tip.tip}</Text>
          </View>
        </AnimatedCard>
      )}

      {/* ── Quick Actions ── */}
      <AnimatedCard delay={500}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitleEmoji}>🚀</Text>
          <Text style={styles.sectionTitle}>快捷入口</Text>
        </View>
      </AnimatedCard>
      {/* 2×2 grid */}
      <View style={styles.quickGrid}>
        <View style={styles.quickRow}>
          {quickActions.slice(0, 2).map((item, i) => (
            <QuickAction
              key={item.route}
              iconName={item.iconName}
              label={item.label}
              gradientStart={item.gradientStart}
              gradientEnd={item.gradientEnd}
              bgColor={item.bgColor}
              onPress={() => router.push(item.route as any)}
              delay={550 + i * 80}
            />
          ))}
        </View>
        <View style={styles.quickRow}>
          {quickActions.slice(2, 4).map((item, i) => (
            <QuickAction
              key={item.route}
              iconName={item.iconName}
              label={item.label}
              gradientStart={item.gradientStart}
              gradientEnd={item.gradientEnd}
              bgColor={item.bgColor}
              onPress={() => router.push(item.route as any)}
              delay={710 + i * 80}
            />
          ))}
        </View>
      </View>

      {/* Today's check-in data summary (shown after check-in) */}
      {todayDone && todayCheckIn && (
        <AnimatedCard delay={600}>
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
        </AnimatedCard>
      )}

      {/* ── Weekly Echo (Sunday evenings) ── */}
      <WeeklyEcho
        caregiverName={caregiverName}
        elderNickname={elderNickname}
      />

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  content: { paddingHorizontal: 20, paddingBottom: 24 },

  // Background decoration layer
  bgDecorLayer: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 200,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', paddingTop: 20, paddingBottom: 16,
  },
  appNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  appName: { fontSize: 22, fontWeight: '900', color: '#FF4D4D', letterSpacing: -0.5 },
  headerSparkle: { fontSize: 18 },
  greeting: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4, fontWeight: '500' },
  profileBtn: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  profileGradient: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  profileEmoji: { fontSize: 24 },
  profilePhoto: { width: 52, height: 52, borderRadius: 14 },

  // Check-in banner — green gradient (Figma style)
  checkinBanner: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 24, padding: 18, marginBottom: 16,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  bannerDecor1: {
    position: 'absolute', top: -20, right: -20,
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  bannerDecor2: {
    position: 'absolute', bottom: -20, left: 60,
    width: 70, height: 70, borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  checkinLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  checkinIconBox: {
    width: 56, height: 56, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    // Frosted glass effect
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  checkinIconBoxDone: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#DCFCE7',
  },
  checkinTitle: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  checkinTitleDone: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  checkinSub: { fontSize: 13, color: 'rgba(255,255,255,0.88)', marginTop: 2 },
  checkinSubDone: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  checkinDone: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#BBF7D0',
    borderRadius: 24, padding: 18, marginBottom: 16,
    ...SHADOWS.sm,
  },
  chevronCircle: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center', justifyContent: 'center',
  },
  chevronCircleDone: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  careScoreBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4,
    backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8, alignSelf: 'flex-start',
  },
  careScoreText: { fontSize: 12, fontWeight: '700', color: '#D97706' },

  // AI card — Figma node-id=4-252
  aiCard: {
    marginBottom: 16, backgroundColor: '#F3EEFF', borderRadius: 24, padding: 18,
    borderWidth: 1, borderColor: '#DDD6FE',
    overflow: 'hidden',
    ...SHADOWS.sm,
  },
  aiDecorFigure: {
    position: 'absolute', top: 8, right: 12,
    fontSize: 44, opacity: 0.18,
    transform: [{ scaleX: -1 }],
  },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  aiIconBox: {
    width: 48, height: 48, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  aiLabel: { fontSize: 16, fontWeight: '800', color: '#5B21B6', letterSpacing: -0.3 },
  aiSubLabel: { fontSize: 12, color: '#7C3AED', marginTop: 2 },
  aiContentBox: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, marginBottom: 12,
  },
  aiMessage: { fontSize: 14, color: '#374151', lineHeight: 22 },
  aiMessageLocked: { color: '#6B7280' },
  aiLockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  aiLockText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },

  // ── 骨架屏样式 ──
  aiSkeletonWrap: { position: 'relative', overflow: 'hidden', gap: 8, paddingBottom: 4 },
  aiSkeletonLine: {
    width: '100%', height: 13, borderRadius: 6,
    backgroundColor: '#E5E7EB', opacity: 0.7,
  },
  aiSkeletonBadgeRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  aiSkeletonBadge: {
    width: 56, height: 24, borderRadius: 12,
    backgroundColor: '#EDE9FE', opacity: 0.6,
  },
  aiSkeletonOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  aiSkeletonLockBox: {
    alignItems: 'center', gap: 6,
    backgroundColor: '#F5F3FF',
    borderRadius: 16, paddingHorizontal: 20, paddingVertical: 14,
    borderWidth: 1, borderColor: '#DDD6FE',
  },
  aiSkeletonLockText: {
    fontSize: 13, fontWeight: '700', color: '#5B21B6',
  },
  aiSkeletonLockSub: {
    fontSize: 11, color: '#7C3AED', textAlign: 'center',
  },

  aiBadgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  aiBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#EDE9FE', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  aiBadgeEmoji: { fontSize: 12 },
  aiBadgeText: { fontSize: 12, color: '#5B21B6', fontWeight: '600' },
  aiDetailLink: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 10 },
  aiDetailLinkText: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },

  // Tip card
  tipCard: {
    backgroundColor: '#FFFBEB', borderRadius: 24, padding: 18,
    marginBottom: 16, borderWidth: 1, borderColor: '#FDE68A',
    ...SHADOWS.sm,
  },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  tipIconCircle: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center', justifyContent: 'center',
  },
  tipCategory: {
    fontSize: 12, fontWeight: '700', color: '#D4883E',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  tipText: { fontSize: 14, color: '#555', lineHeight: 22 },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  sectionTitleEmoji: { fontSize: 18 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },

  // Quick grid — 2×2
  quickGrid: { gap: 0, marginTop: 4 },
  quickRow: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  quickItem: { flex: 1 },
  quickCard: {
    borderRadius: 28,
    padding: 18,
    height: 190,
    flexDirection: 'column',
    alignItems: 'flex-start',
    ...SHADOWS.sm,
  },
  quickIconBox: {
    width: 72, height: 72,
    borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  quickLabel: { fontSize: 17, fontWeight: '800', color: '#1C1C1E', letterSpacing: -0.3, lineHeight: 22 },

  // Today's check-in summary card
  summaryCard: {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18,
    marginBottom: 16, borderWidth: 1, borderColor: '#F0F0F0',
    ...SHADOWS.sm,
  },
  summaryCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
  },
  summaryCardTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  summaryCardEdit: { fontSize: 13, color: '#7C3AED', fontWeight: '600' },
  summaryCardRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
  },
  summaryCardItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryCardEmoji: { fontSize: 24 },
  summaryCardLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  summaryCardValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  summaryCardDivider: { width: 1, height: 40, backgroundColor: '#F0F0F0' },
});
