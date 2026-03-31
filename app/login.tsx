import { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Animated, Easing, Platform, Modal, Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppColors, Gradients } from '@/lib/design-tokens';
import * as Haptics from 'expo-haptics';

const WECHAT_GREEN = '#07C160';
const WECHAT_GREEN_DARK = '#06AD56';
const APPLE_BLACK = '#000000';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [agreed, setAgreed] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [alertMsg, setAlertMsg] = useState('');
  const [loading, setLoading] = useState<'wechat' | 'apple' | null>(null);

  const isWeb = Platform.OS === 'web';
  const logoScale = useRef(new Animated.Value(isWeb ? 1 : 0.8)).current;
  const logoFade = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const contentFade = useRef(new Animated.Value(isWeb ? 1 : 0)).current;
  const contentSlide = useRef(new Animated.Value(isWeb ? 0 : 30)).current;
  const breathe = useRef(new Animated.Value(1)).current;
  const checkScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!isWeb) {
      Animated.sequence([
        Animated.parallel([
          Animated.timing(logoFade, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.spring(logoScale, { toValue: 1, friction: 8, tension: 40, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(contentFade, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(contentSlide, { toValue: 0, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 1.04, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    }
  }, []);

  function showTip(msg: string) {
    setAlertMsg(msg);
    setShowAlert(true);
    setTimeout(() => setShowAlert(false), 2500);
  }

  function handleCheckToggle() {
    setAgreed(v => !v);
    Animated.sequence([
      Animated.timing(checkScale, { toValue: 1.2, duration: 100, useNativeDriver: true }),
      Animated.timing(checkScale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function handleWeChatLogin() {
    if (!agreed) {
      showTip('请先阅读并勾选下方协议');
      return;
    }
    if (loading) return;
    setLoading('wechat');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (Platform.OS === 'web') {
        showTip('微信登录需要在手机 App 中使用');
        return;
      }
      const { loginWithWeChat } = await import('@/lib/auth-providers');
      await loginWithWeChat(router);
    } catch (e: any) {
      console.error('[Login] WeChat error:', e);
      showTip(e?.message || '微信登录失败，请稍后重试');
    } finally {
      setLoading(null);
    }
  }

  async function handleAppleLogin() {
    if (!agreed) {
      showTip('请先阅读并勾选下方协议');
      return;
    }
    if (loading) return;
    setLoading('apple');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (Platform.OS !== 'ios') {
        showTip('Apple 登录仅支持 iOS 设备');
        return;
      }
      const { loginWithApple } = await import('@/lib/auth-providers');
      await loginWithApple(router);
    } catch (e: any) {
      console.error('[Login] Apple error:', e);
      showTip(e?.message || 'Apple 登录失败，请稍后重试');
    } finally {
      setLoading(null);
    }
  }

  function handleGuestMode() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.replace('/(tabs)' as any);
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <LinearGradient
        colors={['#FBF7F4', '#F7F1F3', '#F3EEFF', '#FBF7F4']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.decorTopRight} pointerEvents="none">
        <Text style={{ fontSize: 100, opacity: 0.04 }}>🌸</Text>
      </View>
      <View style={styles.decorBottomLeft} pointerEvents="none">
        <Text style={{ fontSize: 80, opacity: 0.04 }}>🍃</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View style={[styles.logoSection, { opacity: logoFade, transform: [{ scale: logoScale }] }]}>
          <Animated.View style={[styles.logoCircle, { transform: [{ scale: breathe }] }]}>
            <LinearGradient
              colors={['#F3EEFF', '#E8D5F5', '#F0E6FF']}
              style={styles.logoGradient}
            >
              <Text style={styles.logoEmoji}>👵</Text>
            </LinearGradient>
          </Animated.View>
          <Text style={styles.appName}>小马虎</Text>
          <Text style={styles.appSlogan}>您的专业护理记录小助手</Text>
          <Text style={styles.appDesc}>记录每一天的护理时光</Text>
        </Animated.View>

        <Animated.View style={[styles.buttonSection, { opacity: contentFade, transform: [{ translateY: contentSlide }] }]}>
          <TouchableOpacity
            style={[styles.wechatBtn, loading === 'wechat' && styles.btnLoading]}
            onPress={handleWeChatLogin}
            activeOpacity={0.85}
            disabled={!!loading}
          >
            <LinearGradient
              colors={[WECHAT_GREEN, WECHAT_GREEN_DARK]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.btnGradient}
            >
              <Text style={styles.wechatIcon}>💬</Text>
              <Text style={styles.wechatText}>
                {loading === 'wechat' ? '登录中...' : '微信一键登录'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.appleBtn, loading === 'apple' && styles.btnLoading]}
            onPress={handleAppleLogin}
            activeOpacity={0.85}
            disabled={!!loading}
          >
            <Text style={styles.appleIcon}>🍎</Text>
            <Text style={styles.appleText}>
              {loading === 'apple' ? '登录中...' : '通过 Apple 继续'}
            </Text>
          </TouchableOpacity>

          <View style={styles.agreementRow}>
            <Animated.View style={{ transform: [{ scale: checkScale }] }}>
              <TouchableOpacity
                style={[styles.checkbox, agreed && styles.checkboxChecked]}
                onPress={handleCheckToggle}
                activeOpacity={0.7}
              >
                {agreed && <Text style={styles.checkMark}>✓</Text>}
              </TouchableOpacity>
            </Animated.View>
            <Text style={styles.agreementText}>
              我已阅读并同意
              <Text style={styles.agreementLink} onPress={() => Linking.openURL('https://example.com/terms')}>《用户协议》</Text>
              和
              <Text style={styles.agreementLink} onPress={() => Linking.openURL('https://example.com/privacy')}>《隐私政策》</Text>
            </Text>
          </View>
        </Animated.View>

        <Animated.View style={[styles.guestSection, { opacity: contentFade }]}>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>或</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.guestBtn}
            onPress={handleGuestMode}
            activeOpacity={0.8}
          >
            <Text style={styles.guestText}>暂不登录，先看看</Text>
            <Text style={styles.guestArrow}>→</Text>
          </TouchableOpacity>

          <Text style={styles.guestHint}>
            游客模式可浏览基础功能，登录后解锁全部体验
          </Text>
        </Animated.View>
      </ScrollView>

      <Modal visible={showAlert} transparent animationType="fade" onRequestClose={() => setShowAlert(false)}>
        <View style={styles.toastOverlay}>
          <View style={styles.toastBox}>
            <Text style={styles.toastIcon}>⚠️</Text>
            <Text style={styles.toastText}>{alertMsg}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FBF7F4' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 60, paddingBottom: 40 },

  decorTopRight: { position: 'absolute', top: 60, right: -20 },
  decorBottomLeft: { position: 'absolute', bottom: 100, left: -10 },

  logoSection: { alignItems: 'center', marginBottom: 36 },
  logoCircle: {
    width: 96, height: 96, borderRadius: 48,
    marginBottom: 16,
    shadowColor: '#C4A0B8', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 8,
  },
  logoGradient: {
    width: 96, height: 96, borderRadius: 48,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.7)',
  },
  logoEmoji: { fontSize: 44 },
  appName: { fontSize: 28, fontWeight: '900', color: AppColors.text.primary, letterSpacing: 2, marginBottom: 6 },
  appSlogan: { fontSize: 15, color: AppColors.text.secondary, fontWeight: '500' },
  appDesc: { fontSize: 13, color: AppColors.text.tertiary, marginTop: 4 },

  buttonSection: { marginBottom: 24 },

  wechatBtn: { borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
  btnGradient: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, paddingHorizontal: 24,
  },
  wechatIcon: { fontSize: 22, marginRight: 10 },
  wechatText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },

  appleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: APPLE_BLACK, borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 24, marginBottom: 20,
  },
  appleIcon: { fontSize: 20, marginRight: 10 },
  appleText: { fontSize: 17, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  btnLoading: { opacity: 0.6 },

  agreementRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 4 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6,
    borderWidth: 1.5, borderColor: AppColors.border.soft,
    backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 8, marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: AppColors.purple.primary,
    borderColor: AppColors.purple.primary,
  },
  checkMark: { fontSize: 12, color: '#fff', fontWeight: '800' },
  agreementText: { flex: 1, fontSize: 12, color: AppColors.text.tertiary, lineHeight: 20 },
  agreementLink: { color: AppColors.purple.strong, fontWeight: '600' },

  guestSection: { alignItems: 'center' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, width: '100%' },
  dividerLine: { flex: 1, height: 1, backgroundColor: AppColors.border.soft },
  dividerText: { marginHorizontal: 16, fontSize: 12, color: AppColors.text.tertiary },

  guestBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 12, paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1, borderColor: AppColors.border.soft,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  guestText: { fontSize: 14, color: AppColors.text.secondary, fontWeight: '500' },
  guestArrow: { fontSize: 14, color: AppColors.text.tertiary },
  guestHint: { fontSize: 11, color: AppColors.text.tertiary, marginTop: 10, textAlign: 'center' },

  toastOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)' },
  toastBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 16,
    paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 6,
  },
  toastIcon: { fontSize: 20 },
  toastText: { fontSize: 14, color: AppColors.text.primary, fontWeight: '500' },
});
