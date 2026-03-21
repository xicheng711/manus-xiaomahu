import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Animated, Dimensions, Platform, Image,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Rect, Ellipse } from 'react-native-svg';
import { ScreenContainer } from '@/components/screen-container';
import { saveProfile, saveMedication, generateId, createFamilyRoom, joinFamilyRoom, lookupFamilyByCode, generateRoomCode } from '@/lib/storage';
import { scheduleAllReminders } from '@/lib/notifications';
import { getZodiac } from '@/lib/zodiac';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

// Steps depend on userType:
// Creator: 欢迎 → 角色 → 被照顾者 → 照顾者 → 城市 → 用药 → 护理需求 → 邀请码 (8 steps, 0-7)
// Joiner:  欢迎 → 角色 → 共享码 → 确认 → 身份 (5 steps, 0-4)
const CREATOR_STEPS = ['欢迎', '角色', '被照顾者', '照顾者', '城市', '用药', '护理需求', '邀请码'];
const JOINER_STEPS  = ['欢迎', '角色', '共享码', '确认', '身份'];

const FAMILY_EMOJIS = ['👩', '👨', '👵', '👴', '👧', '👦', '🧑', '👩‍⚕️', '👨‍⚕️'];
const FAMILY_ROLES = [
  { role: 'caregiver' as const, label: '主要照顾者' },
  { role: 'family' as const, label: '家庭成员' },
  { role: 'nurse' as const, label: '护理人员' },
];
const RELATIONSHIPS = ['女儿', '儿子', '孙女', '孙子', '外孙女', '外孙', '媳妇', '女婿', '兄弟姐妹', '朋友', '护理员', '其他'];

const CARE_NEED_OPTIONS: { id: string; emoji: string; label: string; desc: string }[] = [
  { id: 'memory', emoji: '🧠', label: '记忆/认知', desc: '阿尔茨海默病、失智、记忆力减退' },
  { id: 'hypertension', emoji: '🫀', label: '高血压', desc: '血压管理、心血管健康' },
  { id: 'diabetes', emoji: '🍬', label: '糖尿病', desc: '血糖管理、饮食控制' },
  { id: 'sleep', emoji: '💤', label: '睡眠问题', desc: '失眠、夜间多醒、睡眠质量差' },
  { id: 'mood', emoji: '🌼', label: '情绪支持', desc: '抑郁、焦虑、情绪波动' },
  { id: 'fall', emoji: '🦵', label: '跌倒风险', desc: '行动不便、骨质疏松、平衡问题' },
  { id: 'nutrition', emoji: '🍽️', label: '饮食营养', desc: '食欲不振、吴咖、体重管理' },
  { id: 'surgery', emoji: '🩹', label: '术后康复', desc: '手术后护理、伤口护理' },
];

const CITIES = [
  '北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '西安',
  '南京', '重庆', '天津', '苏州', '郑州', '长沙', '沈阳', '哈尔滨',
  '昆明', '福州', '厦门', '青岛', '济南', '合肥', '南昌', '石家庄',
  '太原', '兰州', '乌鲁木齐', '呼和浩特', '南宁', '海口', '贵阳',
  '香港', '台北', '其他',
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 80 }, (_, i) => `${CURRENT_YEAR - 10 - i}年`);
const CAREGIVER_YEARS = Array.from({ length: 60 }, (_, i) => `${CURRENT_YEAR - 18 - i}年`);
const MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
const DAYS = Array.from({ length: 31 }, (_, i) => `${i + 1}日`);

const MED_ICONS = ['💊', '💉', '🩺', '🌿', '🫀', '🧠', '👁️', '🦷', '🩹', '🧪'];
const MED_FREQUENCIES = ['每天一次', '每天两次', '每天三次', '每两天一次', '每周一次', '按需服用'];

interface MedDraft {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  icon: string;
  notes: string;
}

function ScrollPickerSimple({
  items, selectedIndex, onSelect, itemHeight = 48,
}: {
  items: string[]; selectedIndex: number; onSelect: (i: number) => void; itemHeight?: number;
}) {
  const VISIBLE = 5;
  const containerHeight = itemHeight * VISIBLE;
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = (e: any) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / itemHeight);
    if (idx >= 0 && idx < items.length) onSelect(idx);
  };

  return (
    <View style={[styles.pickerContainer, { height: containerHeight }]}>
      <View style={[styles.pickerHighlight, { top: itemHeight * 2, height: itemHeight }]} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={itemHeight}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScroll}
        contentOffset={{ x: 0, y: selectedIndex * itemHeight }}
        contentContainerStyle={{ paddingTop: itemHeight * 2, paddingBottom: itemHeight * 2 }}
      >
        {items.map((item, index) => (
          <View key={index} style={[styles.pickerItem, { height: itemHeight }]}>
            <Text style={[styles.pickerItemText, index === selectedIndex && styles.pickerItemSelected]}>
              {item}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const sparkle1 = useRef(new Animated.Value(1)).current;
  const sparkle2 = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop1 = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle1, { toValue: 1.35, duration: 1000, useNativeDriver: true }),
        Animated.timing(sparkle1, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkle2, { toValue: 1.5, duration: 1250, useNativeDriver: true }),
        Animated.timing(sparkle2, { toValue: 1, duration: 1250, useNativeDriver: true }),
      ])
    );
    loop1.start();
    setTimeout(() => loop2.start(), 500);
    return () => { loop1.stop(); loop2.stop(); };
  }, []);

  // Elder info
  const [elderName, setElderName] = useState('');
  const [elderNickname, setElderNickname] = useState('');
  const [birthYearIdx, setBirthYearIdx] = useState(20);
  const [birthMonthIdx, setBirthMonthIdx] = useState(0);
  const [birthDayIdx, setBirthDayIdx] = useState(0);

  // Caregiver info
  const [caregiverName, setCaregiverName] = useState('');
  const [caregiverYearIdx, setCaregiverYearIdx] = useState(10);
  const [caregiverPhotoUri, setCaregiverPhotoUri] = useState<string | undefined>(undefined);
  const [caregiverAvatarType, setCaregiverAvatarType] = useState<'photo' | 'zodiac'>('zodiac');

  async function pickCaregiverPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setCaregiverPhotoUri(result.assets[0].uri);
      setCaregiverAvatarType('photo');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  // City
  const [city, setCity] = useState('');
  const [citySearch, setCitySearch] = useState('');

  // Reminder times
  const [reminderMorning, setReminderMorning] = useState('08:00');
  const [reminderEvening, setReminderEvening] = useState('21:00');

  // ── Path selection ──────────────────────────────────────────
  const [userType, setUserType] = useState<'creator' | 'joiner' | null>(null);

  // ── Creator: pre-generated room code shown at step 7 ──────────
  const [previewRoomCode] = useState<string>(() => generateRoomCode());

  // ── Joiner path states ────────────────────────────────────────
  const [joinerCode, setJoinerCode] = useState('');
  const [joinerFoundRoom, setJoinerFoundRoom] = useState<{ elderName: string } | null>(null);
  const [joinerCodeChecked, setJoinerCodeChecked] = useState(false);
  const [joinerCodeError, setJoinerCodeError] = useState('');
  const [joinerName, setJoinerName] = useState('');
  const [joinerEmoji, setJoinerEmoji] = useState('👩');
  const [joinerPhotoUri, setJoinerPhotoUri] = useState<string | undefined>(undefined);
  const [joinerAvatarType, setJoinerAvatarType] = useState<'photo' | 'emoji'>('emoji');
  const [joinerRelationship, setJoinerRelationship] = useState('');
  const [joinerCustomRelationship, setJoinerCustomRelationship] = useState('');

  async function pickJoinerPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setJoinerPhotoUri(result.assets[0].uri);
      setJoinerAvatarType('photo');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }

  // ── Legacy family step states (kept for compatibility) ────────
  const [familyMode, setFamilyMode] = useState<'choose' | 'join' | 'create' | 'skip'>('choose');
  const [familyRoomCode, setFamilyRoomCode] = useState('');
  const [familyMemberName, setFamilyMemberName] = useState('');
  const [familyMemberEmoji, setFamilyMemberEmoji] = useState('👩');
  const [familyMemberRole, setFamilyMemberRole] = useState<'caregiver' | 'family' | 'nurse'>('caregiver');
  const [familyMemberRoleLabel, setFamilyMemberRoleLabel] = useState('主要照顾者');
  const [familyJoinError, setFamilyJoinError] = useState('');

  // Care needs
  const [selectedCareNeeds, setSelectedCareNeeds] = useState<string[]>([]);

  function toggleCareNeed(id: string) {
    setSelectedCareNeeds(prev =>
      prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id]
    );
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  // Medications
  const [medications, setMedications] = useState<MedDraft[]>([]);
  const [showAddMed, setShowAddMed] = useState(false);
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medFrequency, setMedFrequency] = useState('每天一次');
  const [medIcon, setMedIcon] = useState('💊');
  const [medNotes, setMedNotes] = useState('');

  const elderBirthYear = CURRENT_YEAR - 10 - birthYearIdx;
  const elderZodiac = getZodiac(elderBirthYear);
  const caregiverBirthYear = CURRENT_YEAR - 18 - caregiverYearIdx;
  const caregiverZodiac = getZodiac(caregiverBirthYear);

  const filteredCities = citySearch ? CITIES.filter(c => c.includes(citySearch)) : CITIES;

  function animateTransition(next: () => void) {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      next();
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }

  function nextStep() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateTransition(() => setStep(s => s + 1));
  }

  function prevStep() {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    animateTransition(() => setStep(s => s - 1));
  }

  function addMedication() {
    if (!medName.trim()) return;
    const med: MedDraft = {
      id: generateId(),
      name: medName.trim(),
      dosage: medDosage.trim() || '遵医嘱',
      frequency: medFrequency,
      icon: medIcon,
      notes: medNotes.trim(),
    };
    setMedications(prev => [...prev, med]);
    setMedName('');
    setMedDosage('');
    setMedFrequency('每天一次');
    setMedIcon('💊');
    setMedNotes('');
    setShowAddMed(false);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function removeMedication(id: string) {
    setMedications(prev => prev.filter(m => m.id !== id));
  }

  async function handleFinish() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const birthDate = `${elderBirthYear}-${String(birthMonthIdx + 1).padStart(2, '0')}-${String(birthDayIdx + 1).padStart(2, '0')}`;
    await saveProfile({
      name: elderName || '宝贝',
      nickname: elderNickname || elderName || '宝贝',
      birthDate,
      zodiacEmoji: elderZodiac.emoji,
      zodiacName: elderZodiac.name,
      caregiverName: caregiverName || '家人',
      caregiverBirthYear: String(caregiverBirthYear),
      caregiverZodiacEmoji: caregiverZodiac.emoji,
      caregiverZodiacName: caregiverZodiac.name,
      caregiverPhotoUri,
      caregiverAvatarType,
      city: city || '北京',
      reminderMorning,
      reminderEvening,
      setupComplete: true,
      careNeeds: selectedCareNeeds.length > 0
        ? { selectedNeeds: selectedCareNeeds as any[] }
        : undefined,
    });
    // Schedule daily check-in reminders
    scheduleAllReminders(elderNickname || elderName || undefined).catch(() => {});

    // Save medications
    for (const med of medications) {
      await saveMedication({
        name: med.name,
        dosage: med.dosage,
        frequency: med.frequency,
        times: ['08:00'],
        notes: med.notes,
        icon: med.icon,
        active: true,
        reminderEnabled: true,
        color: '#FF6B6B',
      });
    }
    // Creator always creates a family room with the pre-generated code
    await createFamilyRoom(elderNickname || elderName || '家人', {
      name: caregiverName || '家人',
      role: 'caregiver',
      roleLabel: '主要照顾者',
      emoji: '👩',
      color: '#FF6B6B',
    }, previewRoomCode).catch(() => {});
    router.replace('/(tabs)');
  }

  async function handleJoinerFinish() {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const rel = joinerRelationship === '其他' ? joinerCustomRelationship : joinerRelationship;
    const result = await joinFamilyRoom(joinerCode.trim(), {
      name: joinerName.trim() || '家人',
      role: 'family',
      roleLabel: rel || '家庭成员',
      emoji: joinerEmoji,
      color: '#A855F7',
      relationship: rel || undefined,
    });
    if (!result) {
      // Room not found on this device — create a minimal placeholder so the family tab shows something
      // In a real app, this would sync from server
    }
    router.replace('/(tabs)/family');
  }

  async function checkJoinerCode() {
    if (joinerCode.trim().length < 6) return;
    const found = await lookupFamilyByCode(joinerCode.trim());
    setJoinerFoundRoom(found ? { elderName: found.elderName } : null);
    setJoinerCodeChecked(true);
    setJoinerCodeError('');
  }

  const STEPS = userType === 'joiner' ? JOINER_STEPS : CREATOR_STEPS;

  // ── canNext: step 1 is role selection (done via card click, hide next) ──────
  function getCanNext(): boolean {
    if (step === 0) return true;
    if (step === 1) return !!userType; // role selected
    if (userType === 'joiner') {
      if (step === 2) return joinerCode.trim().length >= 6;
      if (step === 3) return true; // confirm step
      if (step === 4) return joinerName.trim().length > 0;
    }
    // Creator path (step 2-7)
    if (step === 2) return elderName.trim().length > 0;
    if (step === 3) return caregiverName.trim().length > 0;
    if (step === 4) return city.length > 0;
    return true;
  }
  const canNext = getCanNext();

  return (
    <ScreenContainer containerClassName={(step === 1 || step === 4) ? 'bg-transparent' : 'bg-background'}>
      {/* Full-screen gradient background for step 1 & joiner step 4 (Figma design) */}
      {(step === 1 || (step === 4 && userType === 'joiner')) && (
        <LinearGradient
          colors={['#FFF0F5', '#FFE4EC', '#FFF5F7', '#FFF0F5']}
          locations={[0, 0.3, 0.7, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      )}
      {/* Progress bar — gradient horizontal segments (Figma design) */}
      <View style={styles.progressBarRow}>
        {STEPS.map((_, i) => (
          <View key={i} style={styles.progressSegmentTrack}>
            {i < step ? (
              <LinearGradient colors={['#FB7185', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.progressSegmentFill} />
            ) : i === step ? (
              <LinearGradient colors={['#FB7185', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.progressSegmentFill, { width: '50%' }]} />
            ) : null}
          </View>
        ))}
      </View>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>

        {/* STEP 0: Welcome */}
        {step === 0 && (
          <View style={styles.stepContainer}>
            <Image source={require('../assets/images/icon.png')} style={styles.mascotImg} />
            <Text style={styles.title}>你好，我是小马虎！</Text>
            <Text style={styles.subtitle}>
              我是你的专业护理记录小助手{'\n'}
              记录每一天的护理时光{'\n\n'}
              让我们先认识一下吧 😊
            </Text>
            <View style={styles.featureList}>
              {[
                { icon: '🌅', text: 'AI 每日\n护理建议' },
                { icon: '💊', text: '用药\n提醒管理' },
                { icon: '📖', text: '护理日记\nAI 陪伴' },
                { icon: '🤝', text: '家庭共享\n简报' },
              ].map(f => (
                <View key={f.icon} style={styles.featureItem}>
                  <Text style={styles.featureIcon}>{f.icon}</Text>
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* STEP 1: Role Selection — Figma design */}
        {step === 1 && (
          <View style={styles.stepContainer}>
            {/* ── Heart mascot with sparkles ── */}
            <View style={{ alignItems: 'center', marginBottom: 28, marginTop: 8 }}>
              <View style={styles.heartCircle}>
                <LinearGradient
                  colors={['#F472B6', '#FB7185', '#FB923C']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={styles.heartGradient}
                >
                  <Svg viewBox="0 0 100 100" width={64} height={64} fill="none">
                    <Path
                      d="M50 85C50 85 20 65 20 40C20 25 28 15 40 15C45 15 50 20 50 20C50 20 55 15 60 15C72 15 80 25 80 40C80 65 50 85 50 85Z"
                      fill="white" opacity={0.95}
                    />
                    <Circle cx="40" cy="40" r="3" fill="#ff6b9d" />
                    <Circle cx="60" cy="40" r="3" fill="#ff6b9d" />
                    <Ellipse cx="32" cy="48" rx="4" ry="2.5" fill="#ffb3d0" opacity={0.5} />
                    <Ellipse cx="68" cy="48" rx="4" ry="2.5" fill="#ffb3d0" opacity={0.5} />
                    <Path d="M42 52C42 52 46 56 50 56C54 56 58 52 58 52" stroke="#ff6b9d" strokeWidth="2" strokeLinecap="round" fill="none" />
                    <Circle cx="25" cy="25" r="2" fill="white" opacity={0.8} />
                    <Circle cx="75" cy="30" r="1.5" fill="white" opacity={0.8} />
                    <Circle cx="70" cy="20" r="1" fill="white" opacity={0.8} />
                  </Svg>
                </LinearGradient>
                {/* Sparkle 1 – top-right */}
                <Animated.View style={[styles.sparkle, styles.sparkleTopRight, { transform: [{ scale: sparkle1 }] }]} />
                {/* Sparkle 2 – bottom-left */}
                <Animated.View style={[styles.sparkle, styles.sparkleBottomLeft, styles.sparklePink, { transform: [{ scale: sparkle2 }] }]} />
              </View>
            </View>

            {/* ── Title + subtitle ── */}
            <Text style={styles.title}>你是哪种用户？</Text>
            <Text style={[styles.subtitle, { marginBottom: 32 }]}>请选择你的身份，{'\n'}我们会为你提供合适的功能</Text>

            {/* ── Cards ── */}
            <View style={{ width: '100%', gap: 16 }}>
              {/* Card 1: Primary caregiver */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setUserType('creator');
                  animateTransition(() => setStep(s => s + 1));
                }}
              >
                <LinearGradient
                  colors={['#FFF1F3', '#FFF5F7']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={[styles.roleCard, styles.roleCardCreator]}
                >
                  <View style={styles.roleIconBox}>
                    <Svg viewBox="0 0 24 24" width={28} height={28} fill="none">
                      <Rect x="5" y="5" width="14" height="14" rx="2" stroke="#f43f5e" strokeWidth="1.5" />
                      <Path d="M12 8V16" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" />
                      <Path d="M8 12H16" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" />
                    </Svg>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roleCardTitle, { color: '#E11D48' }]}>我是主要照顾者</Text>
                    <Text style={styles.roleCardDesc}>负责记录用药、护理日常，并邀请家人协助</Text>
                  </View>
                  <Text style={[styles.roleCardArrow, { color: '#FDA4AF' }]}>›</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Card 2: Family member */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setUserType('joiner');
                  animateTransition(() => setStep(s => s + 1));
                }}
              >
                <LinearGradient
                  colors={['#F8FAFC', '#F1F5F9']}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={[styles.roleCard, styles.roleCardJoiner]}
                >
                  <View style={[styles.roleIconBox]}>
                    <Svg viewBox="0 0 24 24" width={28} height={28} fill="none">
                      <Path d="M13.5 7.5L16.5 4.5C17.88 3.12 20.12 3.12 21.5 4.5C22.88 5.88 22.88 8.12 21.5 9.5L18.5 12.5" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
                      <Path d="M10.5 16.5L7.5 19.5C6.12 20.88 3.88 20.88 2.5 19.5C1.12 18.12 1.12 15.88 2.5 14.5L5.5 11.5" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
                      <Path d="M14 10L10 14" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
                    </Svg>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roleCardTitle, { color: '#334155' }]}>我是家庭成员</Text>
                    <Text style={styles.roleCardDesc}>已有邀请码，我想查看家人的健康动态</Text>
                  </View>
                  <Text style={[styles.roleCardArrow, { color: '#94A3B8' }]}>›</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 2: Elder info (Creator only) */}
        {step === 2 && userType === 'creator' && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.stepContainer}>
              <Text style={styles.zodiacBig}>{elderZodiac.emoji}</Text>
               <Text style={styles.title}>被照顾者信息</Text>
              <Text style={styles.subtitle}>让小马虎了解你照顾的家人</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>姓名</Text>
                <TextInput
                  style={styles.input}
                  placeholder="请输入姓名"
                  value={elderName}
                  onChangeText={setElderName}
                  placeholderTextColor="#9BA1A6"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>昵称（可选）</Text>
                <TextInput
                  style={styles.input}
                  placeholder="如：姥姥、奶奶、爸爸、妈妈..."
                  value={elderNickname}
                  onChangeText={setElderNickname}
                  placeholderTextColor="#9BA1A6"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>出生年份</Text>
                <Text style={styles.zodiacHint}>
                  {elderZodiac.emoji} 属{elderZodiac.name} · {elderBirthYear}年
                </Text>
                <ScrollPickerSimple items={YEARS} selectedIndex={birthYearIdx} onSelect={setBirthYearIdx} />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>出生月日（可选）</Text>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <ScrollPickerSimple items={MONTHS} selectedIndex={birthMonthIdx} onSelect={setBirthMonthIdx} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ScrollPickerSimple items={DAYS} selectedIndex={birthDayIdx} onSelect={setBirthDayIdx} />
                  </View>
                </View>
              </View>

              <View style={[styles.zodiacCard, { backgroundColor: elderZodiac.bgColor }]}>
                <Text style={styles.zodiacCardEmoji}>{elderZodiac.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.zodiacCardName, { color: elderZodiac.color }]}>属{elderZodiac.name}</Text>
                  <Text style={styles.zodiacCardDesc}>{elderZodiac.description}</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        )}

        {/* STEP 3: Caregiver info (Creator only) */}
        {step === 3 && userType === 'creator' && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.stepContainer}>
              {/* Avatar selection */}
              <View style={styles.avatarSection}>
                <TouchableOpacity style={styles.avatarCircle} onPress={pickCaregiverPhoto}>
                  {caregiverAvatarType === 'photo' && caregiverPhotoUri ? (
                    <Image source={{ uri: caregiverPhotoUri }} style={styles.avatarPhoto} />
                  ) : (
                    <Text style={styles.avatarZodiacEmoji}>{caregiverZodiac.emoji}</Text>
                  )}
                  <View style={styles.avatarEditBadge}>
                    <Text style={styles.avatarEditIcon}>📷</Text>
                  </View>
                </TouchableOpacity>
                <Text style={styles.avatarHint}>点击上传头像照片</Text>
                <View style={styles.avatarToggleRow}>
                  <TouchableOpacity
                    style={[styles.avatarToggleBtn, caregiverAvatarType === 'zodiac' && styles.avatarToggleBtnActive]}
                    onPress={() => setCaregiverAvatarType('zodiac')}
                  >
                    <Text style={[styles.avatarToggleText, caregiverAvatarType === 'zodiac' && styles.avatarToggleTextActive]}>十二生肖</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.avatarToggleBtn, caregiverAvatarType === 'photo' && styles.avatarToggleBtnActive]}
                    onPress={pickCaregiverPhoto}
                  >
                    <Text style={[styles.avatarToggleText, caregiverAvatarType === 'photo' && styles.avatarToggleTextActive]}>上传照片</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.title}>你的信息</Text>
              <Text style={styles.subtitle}>照顾者的信息</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>姓名</Text>
                <TextInput
                  style={styles.input}
                  placeholder="请输入姓名"                  value={caregiverName}
                  onChangeText={setCaregiverName}
                  placeholderTextColor="#9BA1A6"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>你的出生年份</Text>
                <Text style={styles.zodiacHint}>
                  {caregiverZodiac.emoji} 属{caregiverZodiac.name} · {caregiverBirthYear}年
                </Text>
                <ScrollPickerSimple items={CAREGIVER_YEARS} selectedIndex={caregiverYearIdx} onSelect={setCaregiverYearIdx} />
              </View>

              <View style={[styles.zodiacCard, { backgroundColor: caregiverZodiac.bgColor }]}>
                <Text style={styles.zodiacCardEmoji}>{caregiverZodiac.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.zodiacCardName, { color: caregiverZodiac.color }]}>属{caregiverZodiac.name}</Text>
                  <Text style={styles.zodiacCardDesc}>{caregiverZodiac.description}</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        )}

        {/* STEP 4: City (Creator only) */}
        {step === 4 && userType === 'creator' && (
          <View style={styles.stepContainer}>
            <Text style={styles.mascot}>🌤️</Text>
            <Text style={styles.title}>所在城市</Text>
            <Text style={styles.subtitle}>用于获取天气，提供更准确的护理建议</Text>

            <TextInput
              style={[styles.input, { marginBottom: 12, width: '100%' }]}
              placeholder="搜索城市..."
              value={citySearch}
              onChangeText={setCitySearch}
              placeholderTextColor="#9BA1A6"
            />

            <ScrollView style={styles.cityList} showsVerticalScrollIndicator={false}>
              {filteredCities.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.cityItem, city === c && styles.cityItemSelected]}
                  onPress={() => {
                    setCity(c);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[styles.cityItemText, city === c && styles.cityItemTextSelected]}>{c}</Text>
                  {city === c && <Text style={{ color: '#FF6B6B' }}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* STEP 5: Medications (Creator only) */}
        {step === 5 && userType === 'creator' && (
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.stepContainer}>
              <Text style={styles.mascot}>💊</Text>
              <Text style={styles.title}>添加常用药物</Text>
              <Text style={styles.subtitle}>
                记录日常用药{'\n'}
                小马虎会帮你设置提醒（可跳过）            </Text>

              {/* Medication list */}
              {medications.length > 0 && (
                <View style={styles.medList}>
                  {medications.map(med => (
                    <View key={med.id} style={styles.medCard}>
                      <Text style={styles.medCardIcon}>{med.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.medCardName}>{med.name}</Text>
                        <Text style={styles.medCardSub}>{med.dosage} · {med.frequency}</Text>
                      </View>
                      <TouchableOpacity onPress={() => removeMedication(med.id)} style={styles.medDeleteBtn}>
                        <Text style={styles.medDeleteText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Add medication form */}
              {showAddMed ? (
                <View style={styles.addMedForm}>
                  <Text style={styles.addMedTitle}>添加药物</Text>

                  {/* Icon picker */}
                  <Text style={styles.label}>选择图标</Text>
                  <View style={styles.iconRow}>
                    {MED_ICONS.map(icon => (
                      <TouchableOpacity
                        key={icon}
                        style={[styles.iconBtn, medIcon === icon && styles.iconBtnSelected]}
                        onPress={() => setMedIcon(icon)}
                      >
                        <Text style={styles.iconBtnText}>{icon}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.label}>药物名称 *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="如：阿司匹林、降压药..."
                    value={medName}
                    onChangeText={setMedName}
                    placeholderTextColor="#9BA1A6"
                  />

                  <Text style={[styles.label, { marginTop: 12 }]}>剂量</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="如：100mg、1片..."
                    value={medDosage}
                    onChangeText={setMedDosage}
                    placeholderTextColor="#9BA1A6"
                  />

                  <Text style={[styles.label, { marginTop: 12 }]}>服用频率</Text>
                  <View style={styles.freqRow}>
                    {MED_FREQUENCIES.map(freq => (
                      <TouchableOpacity
                        key={freq}
                        style={[styles.freqBtn, medFrequency === freq && styles.freqBtnSelected]}
                        onPress={() => setMedFrequency(freq)}
                      >
                        <Text style={[styles.freqBtnText, medFrequency === freq && styles.freqBtnTextSelected]}>
                          {freq}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={[styles.label, { marginTop: 12 }]}>备注（可选）</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="如：饭后服用..."
                    value={medNotes}
                    onChangeText={setMedNotes}
                    placeholderTextColor="#9BA1A6"
                  />

                  <View style={[styles.row, { marginTop: 16 }]}>
                    <TouchableOpacity
                      style={[styles.backBtn, { flex: 1 }]}
                      onPress={() => setShowAddMed(false)}
                    >
                      <Text style={styles.backBtnText}>取消</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.nextBtn, { flex: 2 }, !medName.trim() && styles.nextBtnDisabled]}
                      onPress={addMedication}
                      disabled={!medName.trim()}
                    >
                      <Text style={styles.nextBtnText}>添加 ✓</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={styles.addMedBtn} onPress={() => setShowAddMed(true)}>
                  <Text style={styles.addMedBtnText}>＋ 添加药物</Text>
                </TouchableOpacity>
              )}

              {medications.length === 0 && !showAddMed && (
                <Text style={styles.skipHint}>也可以跳过，之后在用药页面添加</Text>
              )}
            </View>
          </ScrollView>
        )}

        {/* STEP 6: Care Needs (Creator only) */}
        {step === 6 && userType === 'creator' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            <View style={styles.stepContainer}>
              <Text style={styles.title}>🌿 主要护理需求</Text>
              <Text style={styles.subtitle}>{`选择与${elderNickname || elderName || '宝贝'}相关的护理需求\n可多选，AI 将根据这些给出更准确的建议`}</Text>
              <View style={styles.careNeedsGrid}>
                {CARE_NEED_OPTIONS.map(opt => {
                  const selected = selectedCareNeeds.includes(opt.id);
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={[styles.careNeedCard, selected && styles.careNeedCardSelected]}
                      onPress={() => toggleCareNeed(opt.id)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.careNeedEmoji}>{opt.emoji}</Text>
                      <Text style={[styles.careNeedLabel, selected && styles.careNeedLabelSelected]}>{opt.label}</Text>
                      <Text style={styles.careNeedDesc}>{opt.desc}</Text>
                      {selected && (
                        <View style={styles.careNeedCheck}>
                          <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
              {selectedCareNeeds.length === 0 && (
                <Text style={styles.careNeedsSkipHint}>不确定可以跳过，后续在设置中添加</Text>
              )}
            </View>
          </ScrollView>
        )}

        {/* ══════════════════════════════════════════════
            JOINER PATH: Step 2 – Enter shared room code
            ══════════════════════════════════════════════ */}
        {step === 2 && userType === 'joiner' && (
          <View style={styles.stepContainer}>
            <Text style={styles.mascot}>🔗</Text>
            <Text style={styles.title}>输入共享码</Text>
            <Text style={styles.subtitle}>请输入主要照顾者分享给你的{'\n'}6位共享码</Text>

            <View style={[styles.inputGroup, { width: '100%', marginTop: 16 }]}>
              <Text style={styles.label}>共享码</Text>
              <TextInput
                style={[styles.input, { letterSpacing: 6, fontSize: 22, textAlign: 'center', fontWeight: '700' }]}
                placeholder="XXXXXX"
                value={joinerCode}
                onChangeText={t => { setJoinerCode(t.toUpperCase()); setJoinerCodeChecked(false); setJoinerCodeError(''); }}
                maxLength={6}
                autoCapitalize="characters"
                placeholderTextColor="#D1D5DB"
                returnKeyType="done"
                onSubmitEditing={checkJoinerCode}
              />
              {joinerCodeError ? <Text style={{ color: '#EF4444', fontSize: 13, marginTop: 6, textAlign: 'center' }}>{joinerCodeError}</Text> : null}
            </View>

            <TouchableOpacity
              style={[styles.btn, { marginTop: 8, opacity: joinerCode.length >= 6 ? 1 : 0.4 }]}
              onPress={checkJoinerCode}
              disabled={joinerCode.length < 6}
              activeOpacity={0.85}
            >
              <Text style={styles.btnText}>验证共享码</Text>
            </TouchableOpacity>

            {joinerCodeChecked && joinerFoundRoom && (
              <View style={{ width: '100%', marginTop: 12, padding: 16, backgroundColor: '#F0FDF4', borderRadius: 14, borderWidth: 1, borderColor: '#86EFAC', alignItems: 'center' }}>
                <Text style={{ fontSize: 20 }}>✅</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#15803D', marginTop: 4 }}>找到家庭档案！</Text>
                <Text style={{ fontSize: 13, color: '#166534', marginTop: 4 }}>被照顾者：{joinerFoundRoom.elderName}</Text>
              </View>
            )}
            {joinerCodeChecked && !joinerFoundRoom && (
              <View style={{ width: '100%', marginTop: 12, padding: 16, backgroundColor: '#FFF1F2', borderRadius: 14, borderWidth: 1, borderColor: '#FECDD3', alignItems: 'center' }}>
                <Text style={{ fontSize: 20 }}>❌</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#BE123C', marginTop: 4 }}>未找到此共享码</Text>
                <Text style={{ fontSize: 13, color: '#9F1239', marginTop: 4 }}>请确认码是否正确</Text>
              </View>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════
            JOINER PATH: Step 3 – Confirm family
            ══════════════════════════════════════════════ */}
        {step === 3 && userType === 'joiner' && (
          <View style={styles.stepContainer}>
            <Text style={styles.mascot}>🏡</Text>
            <Text style={styles.title}>确认加入</Text>
            <Text style={styles.subtitle}>请确认你要加入的家庭</Text>

            <View style={{ width: '100%', padding: 20, backgroundColor: '#FFF7ED', borderRadius: 16, borderWidth: 1, borderColor: '#FED7AA', marginTop: 16, alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 32 }}>👨‍👩‍👧‍👦</Text>
              {joinerFoundRoom ? (
                <>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#92400E' }}>
                    {joinerFoundRoom.elderName} 的照护家庭
                  </Text>
                  <Text style={{ fontSize: 13, color: '#B45309', textAlign: 'center', lineHeight: 20 }}>
                    加入后你可以查看家庭公告{'\n'}和每日护理简报
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 14, color: '#B45309', textAlign: 'center' }}>
                  共享码：{joinerCode}{'\n'}加入后可查看家庭公告和护理简报
                </Text>
              )}
            </View>

            <View style={{ width: '100%', marginTop: 16, gap: 8 }}>
              {['✅ 查看家庭公告', '✅ 阅读每日护理简报', '✅ 关注被照顾者状态'].map(item => (
                <View key={item} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, color: '#374151' }}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════
            JOINER PATH: Step 4 – Identity (name + avatar + photo)
            ══════════════════════════════════════════════ */}
        {step === 4 && userType === 'joiner' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
            <View style={styles.stepContainer}>
              {/* Avatar preview circle with upload tap */}
              <TouchableOpacity onPress={pickJoinerPhoto} activeOpacity={0.82} style={styles.joinerAvatarWrap}>
                <LinearGradient colors={['#F9A8D4', '#FB7185']} style={styles.joinerAvatarCircle}>
                  {joinerPhotoUri ? (
                    <Image source={{ uri: joinerPhotoUri }} style={styles.joinerAvatarPhoto} />
                  ) : (
                    <Text style={{ fontSize: 44 }}>{joinerEmoji}</Text>
                  )}
                </LinearGradient>
                {/* Camera badge */}
                <View style={styles.joinerCameraBadge}>
                  <Text style={{ fontSize: 14 }}>📷</Text>
                </View>
              </TouchableOpacity>
              <Text style={[styles.avatarHint, { marginTop: 8, marginBottom: 24 }]}>点击上传你的照片</Text>

              <Text style={styles.title}>告诉我们你是谁</Text>
              <Text style={[styles.subtitle, { marginBottom: 24 }]}>方便家庭成员认识你</Text>

              {/* Name */}
              <View style={[styles.inputGroup, { width: '100%' }]}>
                <Text style={styles.label}>你的昵称</Text>
                <TextInput
                  style={styles.input}
                  placeholder="如：小红、大明..."
                  value={joinerName}
                  onChangeText={setJoinerName}
                  placeholderTextColor="#9BA1A6"
                />
              </View>

              {/* Emoji avatar grid (secondary option when no photo) */}
              {!joinerPhotoUri && (
                <View style={[styles.inputGroup, { width: '100%' }]}>
                  <Text style={styles.label}>或选择一个表情头像</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    {FAMILY_EMOJIS.map(e => (
                      <TouchableOpacity
                        key={e}
                        style={[styles.familyEmojiBtn, joinerEmoji === e && joinerAvatarType === 'emoji' && styles.familyEmojiBtnActive]}
                        onPress={() => { setJoinerEmoji(e); setJoinerAvatarType('emoji'); }}
                      >
                        <Text style={{ fontSize: 22 }}>{e}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Clear photo button if photo selected */}
              {joinerPhotoUri && (
                <TouchableOpacity
                  onPress={() => { setJoinerPhotoUri(undefined); setJoinerAvatarType('emoji'); }}
                  style={{ marginTop: 4, paddingVertical: 8 }}
                >
                  <Text style={{ color: '#FB7185', fontSize: 14, textAlign: 'center' }}>重新选择表情头像</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        )}

        {/* STEP 7: Invite Code + Done (Creator only) */}
        {step === 7 && userType === 'creator' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
          <View style={styles.stepContainer}>
            <Image source={require('../assets/images/icon.png')} style={styles.mascotImgSm} />
            <Text style={styles.title}>一切准备就绪！</Text>
            <Text style={styles.subtitle}>
              小马虎已经了解了{'\n'}
              {elderNickname || elderName || '宝贝'} {elderZodiac.emoji} 和 {caregiverName} {caregiverZodiac.emoji}{'\n\n'}
              每天只需几分钟打卡{'\n'}
              小马虎为你提供专业护理建议 💕
            </Text>

            {/* Invite Code Banner */}
            <View style={styles.inviteCodeBanner}>
              <Text style={styles.inviteCodeLabel}>家庭共享码</Text>
              <Text style={styles.inviteCodeValue}>{previewRoomCode}</Text>
              <Text style={styles.inviteCodeHint}>把这串码发给家人{'\n'}他们可以在设置时选择"加入家庭"直接加入</Text>
            </View>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>被照顾者</Text>
                <Text style={styles.summaryValue}>
                  {elderZodiac.emoji} {elderName || '家人'} {elderNickname ? `(${elderNickname})` : ''}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>生肖</Text>
                <Text style={styles.summaryValue}>属{elderZodiac.name} · {elderBirthYear}年</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>照顾者</Text>
                <Text style={styles.summaryValue}>{caregiverZodiac.emoji} {caregiverName}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>城市</Text>
                <Text style={styles.summaryValue}>📍 {city}</Text>
              </View>
              {medications.length > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>被照顾者</Text>
                  <Text style={styles.summaryValue}>
                    {medications.map(m => m.icon + m.name).join('、')}
                  </Text>
                </View>
              )}
            </View>

            {/* Reminder time picker */}
            <View style={styles.reminderCard}>
              <Text style={styles.reminderTitle}>⏰ 每日打卡提醒时间</Text>
              <Text style={styles.reminderSubtitle}>可以根据你们的作息调整</Text>
              <View style={styles.reminderRow}>
                <View style={styles.reminderItem}>
                  <Text style={styles.reminderLabel}>🌅 早上打卡</Text>
                  <View style={styles.timePickerRow}>
                    {['06:00', '07:00', '08:00', '09:00', '10:00'].map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.timeChip, reminderMorning === t && styles.timeChipActive]}
                        onPress={() => setReminderMorning(t)}
                      >
                        <Text style={[styles.timeChipText, reminderMorning === t && styles.timeChipTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={styles.reminderItem}>
                  <Text style={styles.reminderLabel}>🌙 晚上打卡</Text>
                  <View style={styles.timePickerRow}>
                    {['19:00', '20:00', '21:00', '22:00', '23:00'].map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.timeChip, reminderEvening === t && styles.timeChipActive]}
                        onPress={() => setReminderEvening(t)}
                      >
                        <Text style={[styles.timeChipText, reminderEvening === t && styles.timeChipTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          </View>
          </ScrollView>
        )}
      </Animated.View>

      {/* Navigation buttons */}
      <View style={[styles.navButtons, { paddingBottom: insets.bottom + 8 }]}>
        {step > 0 && (
          <TouchableOpacity style={styles.backBtn} onPress={prevStep}>
            <Text style={styles.backBtnText}>← 上一步</Text>
          </TouchableOpacity>
        )}
        {/* Step 1 = role selection: no next button, user taps cards */}
        {step !== 1 && (() => {
          const isCreatorDone = step === 7 && userType === 'creator';
          const isJoinerDone  = step === 4 && userType === 'joiner';
          const onPress = isCreatorDone ? handleFinish
                        : isJoinerDone  ? handleJoinerFinish
                        : nextStep;
          const label   = step === 0          ? '开始设置 →'
                        : isCreatorDone       ? '开始使用小马虎 🐴'
                        : isJoinerDone        ? '完成，进入家庭 →'
                        : '下一步 →';
          return (
            <TouchableOpacity
              style={[styles.nextBtn, !canNext && styles.nextBtnDisabled]}
              onPress={onPress}
              disabled={!canNext}
            >
              <Text style={styles.nextBtnText}>{label}</Text>
            </TouchableOpacity>
          );
        })()}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  // ── Progress bar: horizontal gradient segments (Figma) ──────
  progressBarRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 10 },
  progressSegmentTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  progressSegmentFill: { height: '100%', width: '100%', borderRadius: 3 },

  // ── Heart mascot (step 1) ────────────────────────────────────
  heartCircle: { position: 'relative', width: 96, height: 96 },
  heartGradient: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FB7185', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 },
  sparkle: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#FDE68A' },
  sparklePink: { backgroundColor: '#FCA5A5', width: 8, height: 8, borderRadius: 4 },
  sparkleTopRight: { top: -4, right: -4 },
  sparkleBottomLeft: { bottom: -8, left: -8 },
  content: { flex: 1, paddingHorizontal: 24 },
  stepContainer: { alignItems: 'center', paddingBottom: 24 },
  mascot: { fontSize: 64, marginBottom: 16, marginTop: 8 },
  mascotImg: { width: 120, height: 120, borderRadius: 28, marginBottom: 16, marginTop: 8 },
  mascotImgSm: { width: 90, height: 90, borderRadius: 22, marginBottom: 16, marginTop: 8 },
  zodiacBig: { fontSize: 72, marginBottom: 12, marginTop: 8 },
  title: { fontSize: 26, fontWeight: '700', color: '#11181C', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#687076', textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  featureList: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16, width: '100%' },
  featureItem: { width: '47%', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FA', borderRadius: 20, paddingVertical: 20, paddingHorizontal: 12, gap: 10 },
  featureIcon: { fontSize: 38 },
  featureText: { fontSize: 16, fontWeight: '700', color: '#11181C', textAlign: 'center', lineHeight: 22 },
  inputGroup: { width: '100%', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#687076', marginBottom: 8 },
  zodiacHint: { fontSize: 16, fontWeight: '700', color: '#FF6B6B', marginBottom: 8, textAlign: 'center' },
  input: {
    backgroundColor: '#F8F9FA', borderRadius: 16, padding: 16,
    fontSize: 16, color: '#11181C', borderWidth: 1.5, borderColor: '#E5E7EB', width: '100%',
  },
  row: { flexDirection: 'row', gap: 12 },
  pickerContainer: { backgroundColor: '#F8F9FA', borderRadius: 16, overflow: 'hidden', position: 'relative' },
  pickerHighlight: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(255,107,107,0.1)', borderRadius: 8, zIndex: 1, pointerEvents: 'none' },
  pickerItem: { justifyContent: 'center', alignItems: 'center' },
  pickerItemText: { fontSize: 16, color: '#9BA1A6' },
  pickerItemSelected: { fontSize: 18, fontWeight: '700', color: '#11181C' },
  zodiacCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 20, padding: 16, gap: 12, width: '100%', marginTop: 8 },
  zodiacCardEmoji: { fontSize: 40 },
  zodiacCardName: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  zodiacCardDesc: { fontSize: 13, color: '#687076' },
  cityList: { width: '100%', maxHeight: 280 },
  cityItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, marginBottom: 6, backgroundColor: '#F8F9FA' },
  cityItemSelected: { backgroundColor: '#FFF0F0', borderWidth: 1.5, borderColor: '#FF6B6B' },
  cityItemText: { fontSize: 16, color: '#11181C' },
  cityItemTextSelected: { color: '#FF6B6B', fontWeight: '700' },
  // Medication styles
  medList: { width: '100%', gap: 10, marginBottom: 16 },
  medCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8F0', borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: '#FFE0CC' },
  medCardIcon: { fontSize: 28 },
  medCardName: { fontSize: 15, fontWeight: '700', color: '#11181C' },
  medCardSub: { fontSize: 13, color: '#687076', marginTop: 2 },
  medDeleteBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFE0CC', alignItems: 'center', justifyContent: 'center' },
  medDeleteText: { fontSize: 12, color: '#FF6B6B', fontWeight: '700' },
  addMedBtn: { width: '100%', padding: 16, borderRadius: 16, borderWidth: 2, borderColor: '#FF6B6B', borderStyle: 'dashed', alignItems: 'center', marginBottom: 12 },
  addMedBtnText: { fontSize: 16, fontWeight: '700', color: '#FF6B6B' },
  addMedForm: { width: '100%', backgroundColor: '#FFF8F0', borderRadius: 20, padding: 20, gap: 4, borderWidth: 1, borderColor: '#FFE0CC' },
  addMedTitle: { fontSize: 18, fontWeight: '700', color: '#11181C', marginBottom: 12, textAlign: 'center' },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F8F9FA', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#E5E7EB' },
  iconBtnSelected: { borderColor: '#FF6B6B', backgroundColor: '#FFF0F0' },
  iconBtnText: { fontSize: 22 },
  freqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  freqBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F8F9FA', borderWidth: 1.5, borderColor: '#E5E7EB' },
  freqBtnSelected: { borderColor: '#FF6B6B', backgroundColor: '#FFF0F0' },
  freqBtnText: { fontSize: 13, color: '#687076', fontWeight: '600' },
  freqBtnTextSelected: { color: '#FF6B6B' },
  skipHint: { fontSize: 13, color: '#9BA1A6', textAlign: 'center', marginTop: 8 },
  summaryCard: { width: '100%', backgroundColor: '#F8F9FA', borderRadius: 20, padding: 20, gap: 12, marginTop: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 14, color: '#687076' },
  summaryValue: { fontSize: 15, fontWeight: '600', color: '#11181C', flex: 1, textAlign: 'right' },
  navButtons: { flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingBottom: 16 },
  backBtn: { flex: 1, padding: 16, borderRadius: 20, backgroundColor: '#F8F9FA', alignItems: 'center' },
  backBtnText: { fontSize: 16, fontWeight: '600', color: '#687076' },
  nextBtn: { flex: 2, padding: 16, borderRadius: 20, backgroundColor: '#FF6B6B', alignItems: 'center' },
  nextBtnDisabled: { backgroundColor: '#E5E7EB' },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Reminder time picker
  reminderCard: {
    width: '100%',
    backgroundColor: '#F8F4FF',
    borderRadius: 20,
    padding: 18,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  reminderTitle: { fontSize: 16, fontWeight: '800', color: '#5B21B6', marginBottom: 4 },
  reminderSubtitle: { fontSize: 13, color: '#7C3AED', marginBottom: 14 },
  reminderRow: { gap: 16 },
  reminderItem: { gap: 8 },
  reminderLabel: { fontSize: 14, fontWeight: '700', color: '#374151' },
  timePickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChip: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#EDE9FE',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  timeChipActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#5B21B6',
  },
  timeChipText: { fontSize: 14, fontWeight: '600', color: '#5B21B6' },
  timeChipTextActive: { color: '#fff' },

  // Avatar selection styles
  avatarSection: { alignItems: 'center', marginBottom: 20 },
  avatarCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#F3EEFF',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#C4B5FD',
    position: 'relative',
    overflow: 'hidden',
  },
  avatarPhoto: { width: 100, height: 100, borderRadius: 50 },
  avatarZodiacEmoji: { fontSize: 52 },
  avatarEditBadge: {
    position: 'absolute', bottom: 4, right: 4,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#7C3AED',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEditIcon: { fontSize: 13 },
  avatarHint: { fontSize: 13, color: '#9BA1A6', marginTop: 8, marginBottom: 12 },
  avatarToggleRow: { flexDirection: 'row', gap: 10 },
  avatarToggleBtn: {
    paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1.5, borderColor: 'transparent',
  },
  avatarToggleBtnActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#7C3AED',
  },
  avatarToggleText: { fontSize: 14, fontWeight: '600', color: '#687076' },
  avatarToggleTextActive: { color: '#7C3AED' },

  // Care needs
  careNeedsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginTop: 8 },
  careNeedCard: {
    width: '46%', backgroundColor: '#F8F9FA', borderRadius: 14,
    padding: 14, alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: '#EBEBEB', position: 'relative',
  },
  careNeedCardSelected: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  careNeedEmoji: { fontSize: 28, marginBottom: 2 },
  careNeedLabel: { fontSize: 14, fontWeight: '700', color: '#374151', textAlign: 'center' },
  careNeedLabelSelected: { color: '#2563EB' },
  careNeedDesc: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', lineHeight: 16 },
  careNeedCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center',
  },
  careNeedsSkipHint: { fontSize: 12, color: '#9CA3AF', marginTop: 12, textAlign: 'center' },
  // Family step
  familyChoiceCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#fff', borderRadius: 18, padding: 18,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  familyChoiceIcon: { fontSize: 30 },
  familyChoiceTitle: { fontSize: 16, fontWeight: '700', color: '#11181C', marginBottom: 2 },
  familyChoiceDesc: { fontSize: 13, color: '#687076' },
  familySkipBtn: { alignItems: 'center', paddingVertical: 14 },
  familySkipText: { fontSize: 14, color: '#9BA1A6', fontWeight: '500' },
  familyBackBtn: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 4 },
  familyBackText: { fontSize: 14, color: '#687076' },
  familyEmojiBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: '#F8F9FA',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  familyEmojiBtnActive: { borderColor: '#FF6B6B', backgroundColor: '#FFF0F0' },
  familyRoleBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#F8F9FA', borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  familyRoleBtnActive: { backgroundColor: '#FFF0F0', borderColor: '#FF6B6B' },
  familyRoleBtnText: { fontSize: 13, fontWeight: '600', color: '#687076' },
  familyRoleBtnTextActive: { color: '#FF6B6B' },
  familyCreateConfirm: {
    width: '100%', backgroundColor: '#F8F9FA', borderRadius: 20,
    padding: 24, alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB',
  },

  // Generic primary button
  btn: {
    backgroundColor: '#FF6B6B', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 24,
    alignItems: 'center', width: '100%',
  },
  btnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // ── Joiner avatar upload (step 4) ────────────────────────────
  joinerAvatarWrap: { position: 'relative', marginTop: 8, marginBottom: 4 },
  joinerAvatarCircle: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FB7185', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  joinerAvatarPhoto: { width: 100, height: 100, borderRadius: 50 },
  joinerCameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#FECDD3',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },

  // ── Role Selection (step 1) — Figma design ────────────────────
  // Card now wraps a LinearGradient — only layout/border/shadow here
  roleCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderRadius: 20, padding: 18, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3,
  },
  roleCardCreator: {
    borderWidth: 1.5, borderColor: '#FECDD3',
  },
  roleCardJoiner: {
    borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  // iOS app-icon–style icon box — white background
  roleIconBox: {
    width: 52, height: 52, borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  roleCardTitle: { fontSize: 16, fontWeight: '700', color: '#11181C', marginBottom: 3 },
  roleCardDesc: { fontSize: 13, color: '#687076', lineHeight: 19 },
  roleCardArrow: { fontSize: 22, color: '#C8CDD2', marginLeft: 4 },

  // Invite code banner (step 7 creator)
  inviteCodeBanner: {
    width: '100%', backgroundColor: '#EFF6FF', borderRadius: 20,
    padding: 20, alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: '#BFDBFE', marginBottom: 16,
  },
  inviteCodeLabel: { fontSize: 12, fontWeight: '600', color: '#2563EB', letterSpacing: 1.5, textTransform: 'uppercase' },
  inviteCodeValue: {
    fontSize: 34, fontWeight: '900', color: '#1D4ED8', letterSpacing: 8,
    fontVariant: ['tabular-nums'],
  },
  inviteCodeHint: { fontSize: 13, color: '#3B82F6', textAlign: 'center', lineHeight: 20, marginTop: 4 },
});
