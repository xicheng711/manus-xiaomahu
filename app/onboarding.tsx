import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Animated, Dimensions, Platform, Image,
} from 'react-native';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { saveProfile, saveMedication, generateId } from '@/lib/storage';
import { scheduleAllReminders } from '@/lib/notifications';
import { getZodiac } from '@/lib/zodiac';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

const STEPS = ['欢迎', '被照顾者', '照顾者', '城市', '用药', '护理需求', '完成'];

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
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

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
    router.replace('/(tabs)');
  }

  const canNext = [
    true,                              // 0: welcome
    elderName.trim().length > 0,       // 1: elder info
    caregiverName.trim().length > 0,   // 2: caregiver info
    city.length > 0,                   // 3: city
    true,                              // 4: medications (optional)
    true,                              // 5: care needs (optional)
  ][step] ?? true;

  return (
    <ScreenContainer containerClassName="bg-background">
      {/* Progress bar */}
      <View style={styles.progressBar}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.progressDot, i <= step && styles.progressDotActive]} />
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
                { icon: '🌅', text: 'AI 每日护理建议' },
                { icon: '💊', text: '用药提醒管理' },
                { icon: '📖', text: '护理日记 & AI 陪伴' },
                { icon: '🤝', text: '家庭共享 & 简报' },
              ].map(f => (
                <View key={f.icon} style={styles.featureItem}>
                  <Text style={styles.featureIcon}>{f.icon}</Text>
                  <Text style={styles.featureText}>{f.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* STEP 1: Elder info */}
        {step === 1 && (
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

        {/* STEP 2: Caregiver info */}
        {step === 2 && (
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

        {/* STEP 3: City */}
        {step === 3 && (
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

        {/* STEP 4: Medications */}
        {step === 4 && (
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

        {/* STEP 5: Care Needs */}
        {step === 5 && (
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
        )}

        {/* STEP 6: Done */}
        {step === 6 && (
          <View style={styles.stepContainer}>
            <Image source={require('../assets/images/icon.png')} style={styles.mascotImgSm} />
            <Text style={styles.title}>一切准备就绪！</Text>
            <Text style={styles.subtitle}>
              小马虎已经了解了{'\n'}
              {elderNickname || elderName || '宝贝'} {elderZodiac.emoji} 和 {caregiverName} {caregiverZodiac.emoji}{'\n\n'}
              每天只需几分钟打卡{'\n'}
              小马虎为你提供专业护理建议 💕
            </Text>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>被照顾者</Text>
                <Text style={styles.summaryValue}>
                  {elderZodiac.emoji} {elderName || '老宝'} {elderNickname ? `(${elderNickname})` : ''}
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
        )}
      </Animated.View>

      {/* Navigation buttons */}
      <View style={styles.navButtons}>
        {step > 0 && step < 6 && (
          <TouchableOpacity style={styles.backBtn} onPress={prevStep}>
            <Text style={styles.backBtnText}>← 上一步</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextBtn, !canNext && styles.nextBtnDisabled]}
          onPress={step === 6 ? handleFinish : nextStep}
          disabled={!canNext}
        >
          <Text style={styles.nextBtnText}>
            {step === 0 ? '开始设置 →' : step === 6 ? '开始使用小马虎 🐴' : '下一步 →'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  progressBar: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 16 },
  progressDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E5E7EB' },
  progressDotActive: { backgroundColor: '#FF6B6B', width: 20 },
  content: { flex: 1, paddingHorizontal: 24 },
  stepContainer: { alignItems: 'center', paddingBottom: 24 },
  mascot: { fontSize: 64, marginBottom: 16, marginTop: 8 },
  mascotImg: { width: 120, height: 120, borderRadius: 28, marginBottom: 16, marginTop: 8 },
  mascotImgSm: { width: 90, height: 90, borderRadius: 22, marginBottom: 16, marginTop: 8 },
  zodiacBig: { fontSize: 72, marginBottom: 12, marginTop: 8 },
  title: { fontSize: 26, fontWeight: '700', color: '#11181C', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#687076', textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  featureList: { width: '100%', gap: 12, marginTop: 8 },
  featureItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 16, padding: 16, gap: 12 },
  featureIcon: { fontSize: 28 },
  featureText: { fontSize: 16, fontWeight: '600', color: '#11181C' },
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
});
