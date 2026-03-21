import { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { COLORS, SHADOWS, RADIUS } from '@/lib/animations';

interface Props {
  icon: string;
  title: string;
  description: string;
}

export function JoinerLockedScreen({ icon, title, description }: Props) {
  const router = useRouter();
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(24)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#FFF7ED', '#FDF2F8', '#FAF5FF']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[styles.content, { opacity: fade, transform: [{ translateY: slide }] }]}>
        <Animated.View style={[styles.iconWrap, { transform: [{ scale: pulse }] }]}>
          <View style={styles.iconCircleOuter}>
            <View style={styles.iconCircle}>
              <Text style={{ fontSize: 42, opacity: 0.4 }}>{icon}</Text>
            </View>
            <View style={styles.lockBadge}>
              <Text style={{ fontSize: 16 }}>🔒</Text>
            </View>
          </View>
        </Animated.View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.desc}>{description}</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>💡 这是怎么回事？</Text>
          <Text style={styles.infoText}>
            你目前是以「家庭成员」身份加入的。打卡、用药记录和日记是主要照顾者（创建者）的专属功能。
          </Text>
        </View>

        <TouchableOpacity
          style={styles.upgradeBtn}
          onPress={() => router.push('/onboarding' as any)}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#FF8904', '#FF637E', '#F6339A']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.upgradeBtnGradient}
          >
            <Text style={styles.upgradeBtnText}>＋ 创建我的家庭档案</Text>
          </LinearGradient>
        </TouchableOpacity>

        <Text style={styles.hint}>创建后你将成为新家庭的主要照顾者，{'\n'}同时仍可查看原来家庭的动态。</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', paddingHorizontal: 36, width: '100%' },

  iconWrap: { marginBottom: 24 },
  iconCircleOuter: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  iconCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#E5E7EB',
  },
  lockBadge: {
    position: 'absolute', bottom: -4, right: -4,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#E5E7EB',
    ...SHADOWS.sm,
  },

  title: { fontSize: 22, fontWeight: '800', color: '#1A1A2E', textAlign: 'center', marginBottom: 10, letterSpacing: -0.3 },
  desc: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 24 },

  infoBox: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, width: '100%',
    borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 24,
    ...SHADOWS.sm,
  },
  infoTitle: { fontSize: 13, fontWeight: '700', color: '#1A1A2E', marginBottom: 6 },
  infoText: { fontSize: 13, color: '#6B7280', lineHeight: 20 },

  upgradeBtn: { width: '100%', borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
  upgradeBtnGradient: { paddingVertical: 15, alignItems: 'center' },
  upgradeBtnText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.2 },

  hint: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 18 },
});
