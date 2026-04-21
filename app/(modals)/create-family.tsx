import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Animated, Easing, Platform, Image, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import {
  createFamilyRoom, getProfile, getUserProfile, generateId,
  addOrUpdateMembership, setActiveFamilyId, FamilyMembership,
} from '@/lib/storage';
import { useFamilyContext } from '@/lib/family-context';
import { COLORS, SHADOWS, RADIUS } from '@/lib/animations';
import { AppColors, Gradients } from '@/lib/design-tokens';
import * as Haptics from 'expo-haptics';

const ELDER_EMOJIS = ['👵', '👴', '🧓', '👩', '👨', '🌸', '🌟', '🍀', '🐉', '🦁'];
const MY_EMOJIS = ['👩', '👨', '👧', '👦', '🧑', '👩‍⚕️', '👨‍⚕️', '🧑‍🤝‍🧑'];
const ROLES = [
  { role: 'caregiver' as const, label: '主要照顾者', desc: '负责日常护理记录' },
  { role: 'family' as const, label: '家庭成员', desc: '关注家人动态' },
];
const MEMBER_COLORS = ['#6C9E6C', '#E07B4A', '#7B7EC8', '#E07B9A', '#4A9EC8', '#C89A4A'];

export default function CreateFamilyModal() {
  const insets = useSafeAreaInsets();
  const { refresh } = useFamilyContext();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [elderName, setElderName] = useState('');
  const [elderEmoji, setElderEmoji] = useState('👵');
  const [elderPhotoUri, setElderPhotoUri] = useState('');

  const [myName, setMyName] = useState('');
  const [myRole, setMyRole] = useState<'caregiver' | 'family' | 'nurse'>('caregiver');
  const [myRoleLabel, setMyRoleLabel] = useState('主要照顾者');
  const [myEmoji, setMyEmoji] = useState('👩');
  const [myPhotoUri, setMyPhotoUri] = useState('');
  const [myColor, setMyColor] = useState(MEMBER_COLORS[0]);

  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 优先读取 UserProfile，fallback 到 legacy getProfile
    getUserProfile().then(up => {
      if (up?.caregiverName) { setMyName(up.caregiverName); return; }
      getProfile().then(p => { if (p?.caregiverName) setMyName(p.caregiverName); });
    });
  }, []);

  async function pickPhoto(target: 'elder' | 'my') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      if (target === 'elder') {
        setElderPhotoUri(result.assets[0].uri);
      } else {
        setMyPhotoUri(result.assets[0].uri);
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  function animateNext() {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setStep(s => s + 1);
      slideAnim.setValue(30);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    });
  }

  async function handleFinish() {
    if (saving) return;
    setSaving(true);
    try {
      if (Platform.OS !== 'web') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const room = await createFamilyRoom(elderName.trim(), {
        name: myName.trim() || '我',
        role: myRole,
        roleLabel: myRoleLabel,
        emoji: myEmoji,
        photoUri: myPhotoUri || undefined,
        color: myColor,
        isCreator: true,
        isCurrentUser: true,
      }, undefined, { emoji: elderEmoji, photoUri: elderPhotoUri || undefined }, {
        name: elderName.trim(),
        nickname: elderName.trim(),
      });
      await refresh();
      if (router.canDismiss()) router.dismiss();
      else router.replace('/(tabs)/' as any);
    } catch (e) {
      console.error('[CreateFamily]', e);
      Alert.alert('创建失败', '创建家庭时出错，请检查网络后重试。');
    } finally {
      setSaving(false);
    }
  }

  const canGoNext0 = elderName.trim().length >= 1;
  const canGoNext1 = myName.trim().length >= 1;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient
        colors={[...Gradients.appBg]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕ 取消</Text>
        </TouchableOpacity>
        <Text style={styles.topTitle}>创建新家庭</Text>
        <View style={{ width: 64 }} />
      </View>

      <View style={styles.stepRow}>
        {[0, 1].map(i => (
          <View key={i} style={[styles.stepDot, i <= step && styles.stepDotActive]} />
        ))}
      </View>

      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 0 && (
            <View>
              <Text style={styles.stepLabel}>Step 1</Text>
              <Text style={styles.stepTitle}>被照顾者是谁？</Text>
              <Text style={styles.stepDesc}>您将为哪位家人创建护理档案？</Text>

              <Text style={styles.fieldLabel}>他 / 她的称呼</Text>
              <TextInput
                style={styles.input}
                placeholder="例如：奶奶、外公、妈妈…"
                value={elderName}
                onChangeText={setElderName}
                placeholderTextColor="#B0B8C1"
                maxLength={20}
                autoFocus
              />

              <Text style={styles.fieldLabel}>头像</Text>
              <View style={styles.avatarSection}>
                <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto('elder')} activeOpacity={0.7}>
                  {elderPhotoUri ? (
                    <Image source={{ uri: elderPhotoUri }} style={styles.photoPreview} />
                  ) : (
                    <View style={styles.photoBtnInner}>
                      <Text style={{ fontSize: 28 }}>📷</Text>
                      <Text style={styles.photoBtnLabel}>上传照片</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {elderPhotoUri ? (
                  <TouchableOpacity onPress={() => setElderPhotoUri('')} style={styles.clearPhotoBtn}>
                    <Text style={styles.clearPhotoText}>✕ 移除照片</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {!elderPhotoUri && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>或选择一个表情头像</Text>
                  <View style={styles.emojiRow}>
                    {ELDER_EMOJIS.map(e => (
                      <TouchableOpacity
                        key={e}
                        style={[styles.emojiBtn, elderEmoji === e && styles.emojiBtnActive]}
                        onPress={() => setElderEmoji(e)}
                      >
                        <Text style={{ fontSize: 26 }}>{e}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}

          {step === 1 && (
            <View>
              <Text style={styles.stepLabel}>Step 2</Text>
              <Text style={styles.stepTitle}>您是谁？</Text>
              <Text style={styles.stepDesc}>设置您的个人信息</Text>

              <Text style={styles.fieldLabel}>您的名字</Text>
              <TextInput
                style={styles.input}
                placeholder="您的名字"
                value={myName}
                onChangeText={setMyName}
                placeholderTextColor="#B0B8C1"
                maxLength={20}
                autoFocus
              />

              <Text style={styles.fieldLabel}>身份</Text>
              {ROLES.map(r => (
                <TouchableOpacity
                  key={r.role}
                  style={[styles.roleCard, myRole === r.role && styles.roleCardActive]}
                  onPress={() => { setMyRole(r.role); setMyRoleLabel(r.label); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roleTitle, myRole === r.role && { color: COLORS.primary }]}>{r.label}</Text>
                    <Text style={styles.roleDesc}>{r.desc}</Text>
                  </View>
                  <View style={[styles.radioOuter, myRole === r.role && { borderColor: COLORS.primary }]}>
                    {myRole === r.role && <View style={styles.radioInner} />}
                  </View>
                </TouchableOpacity>
              ))}

              <Text style={styles.fieldLabel}>头像</Text>
              <View style={styles.avatarSection}>
                <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto('my')} activeOpacity={0.7}>
                  {myPhotoUri ? (
                    <Image source={{ uri: myPhotoUri }} style={styles.photoPreview} />
                  ) : (
                    <View style={styles.photoBtnInner}>
                      <Text style={{ fontSize: 28 }}>📷</Text>
                      <Text style={styles.photoBtnLabel}>上传照片</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {myPhotoUri ? (
                  <TouchableOpacity onPress={() => setMyPhotoUri('')} style={styles.clearPhotoBtn}>
                    <Text style={styles.clearPhotoText}>✕ 移除照片</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {!myPhotoUri && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: 12 }]}>或选择表情头像</Text>
                  <View style={styles.emojiRow}>
                    {MY_EMOJIS.map(e => (
                      <TouchableOpacity
                        key={e}
                        style={[styles.emojiBtn, myEmoji === e && styles.emojiBtnActive]}
                        onPress={() => setMyEmoji(e)}
                      >
                        <Text style={{ fontSize: 26 }}>{e}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Text style={styles.fieldLabel}>主题颜色</Text>
              <View style={styles.colorRow}>
                {MEMBER_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorBtn, { backgroundColor: c }, myColor === c && styles.colorBtnActive]}
                    onPress={() => setMyColor(c)}
                  />
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      </Animated.View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {step === 0 && (
          <TouchableOpacity
            style={[styles.nextBtn, !canGoNext0 && styles.nextBtnDisabled]}
            onPress={() => canGoNext0 && animateNext()}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={canGoNext0 ? [...Gradients.coral] : [AppColors.border.soft, AppColors.border.soft]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.nextBtnGradient}
            >
              <Text style={[styles.nextBtnText, !canGoNext0 && { color: AppColors.text.tertiary }]}>继续 →</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
        {step === 1 && (
          <TouchableOpacity
            style={[styles.nextBtn, (!canGoNext1 || saving) && styles.nextBtnDisabled]}
            onPress={handleFinish}
            activeOpacity={0.85}
            disabled={!canGoNext1 || saving}
          >
            <LinearGradient
              colors={canGoNext1 ? [...Gradients.coral] : [AppColors.border.soft, AppColors.border.soft]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.nextBtnGradient}
            >
              <Text style={[styles.nextBtnText, !canGoNext1 && { color: AppColors.text.tertiary }]}>
                {saving ? '创建中…' : '✨ 创建家庭档案'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  closeBtn: { paddingVertical: 6, paddingRight: 8 },
  closeText: { fontSize: 14, color: AppColors.text.tertiary, fontWeight: '600' },
  topTitle: { fontSize: 17, fontWeight: '800', color: AppColors.text.primary, letterSpacing: -0.3 },

  stepRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 8 },
  stepDot: { width: 24, height: 4, borderRadius: 2, backgroundColor: AppColors.border.soft },
  stepDotActive: { backgroundColor: AppColors.coral.primary },

  content: { flex: 1 },
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24 },

  stepLabel: { fontSize: 11, fontWeight: '700', color: AppColors.coral.primary, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  stepTitle: { fontSize: 26, fontWeight: '900', color: AppColors.text.primary, marginBottom: 6, letterSpacing: -0.5 },
  stepDesc: { fontSize: 14, color: AppColors.text.secondary, marginBottom: 24, lineHeight: 20 },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: AppColors.text.primary, marginBottom: 8, marginTop: 16, letterSpacing: 0.3 },
  input: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: AppColors.text.primary, borderWidth: 1.5, borderColor: AppColors.border.soft,
    ...SHADOWS.sm,
  },

  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  emojiBtn: { width: 52, height: 52, borderRadius: 16, backgroundColor: AppColors.bg.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  emojiBtnActive: { borderColor: AppColors.coral.primary, backgroundColor: AppColors.coral.soft },

  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: AppColors.bg.secondary, borderWidth: 1.5, borderColor: 'transparent' },
  tagActive: { backgroundColor: AppColors.coral.soft, borderColor: AppColors.coral.primary },
  tagText: { fontSize: 13, color: AppColors.text.secondary, fontWeight: '600' },
  tagTextActive: { color: AppColors.coral.primary, fontWeight: '700' },

  roleCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: AppColors.surface.whiteStrong, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: AppColors.border.soft, ...SHADOWS.sm },
  roleCardActive: { borderColor: COLORS.primary, backgroundColor: '#F0FFF0' },
  roleTitle: { fontSize: 15, fontWeight: '700', color: AppColors.text.primary, marginBottom: 2 },
  roleDesc: { fontSize: 12, color: AppColors.text.secondary },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },

  colorRow: { flexDirection: 'row', gap: 10 },
  colorBtn: { width: 32, height: 32, borderRadius: 16 },
  colorBtnActive: { borderWidth: 3, borderColor: AppColors.surface.whiteStrong, ...SHADOWS.md },

  avatarSection: { alignItems: 'center', marginBottom: 4 },
  photoBtn: { width: 100, height: 100, borderRadius: 50, backgroundColor: AppColors.bg.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: AppColors.border.soft, borderStyle: 'dashed', overflow: 'hidden' },
  photoBtnInner: { alignItems: 'center', justifyContent: 'center' },
  photoBtnLabel: { fontSize: 11, color: AppColors.text.tertiary, fontWeight: '600', marginTop: 4 },
  photoPreview: { width: 100, height: 100, borderRadius: 50 },
  clearPhotoBtn: { marginTop: 8, paddingVertical: 4, paddingHorizontal: 12 },
  clearPhotoText: { fontSize: 12, color: '#EF4444', fontWeight: '600' },

  footer: { paddingHorizontal: 24, paddingTop: 12 },
  nextBtn: { borderRadius: 16, overflow: 'hidden' },
  nextBtnDisabled: { opacity: 0.6 },
  nextBtnGradient: { paddingVertical: 16, alignItems: 'center' },
  nextBtnText: { fontSize: 16, fontWeight: '800', color: AppColors.surface.whiteStrong, letterSpacing: 0.2 },
});
