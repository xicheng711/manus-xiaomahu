import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Platform, Animated, Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenContainer } from '@/components/screen-container';
import { PageHeader, PAGE_THEMES } from '@/components/page-header';
import { getMedications, saveMedications, Medication, getProfile, CareNeedType, CareNeedsProfile, getCurrentUserIsCreator } from '@/lib/storage';
import { JoinerLockedScreen } from '@/components/joiner-locked-screen';
import { COLORS, SHADOWS, RADIUS, fadeInUp, pressAnimation } from '@/lib/animations';
import * as Haptics from 'expo-haptics';
import { scheduleMedicationMorningEvening, scheduleMedicationReminder, cancelMedicationReminder } from '@/lib/notifications';

const TIMES = ['06:00','07:00','07:30','08:00','08:30','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];
const FREQUENCIES = ['每天一次', '每天两次', '每天三次', '每隔一天', '每周一次', '需要时服用'];
const FREQ_ICONS = ['1️⃣', '2️⃣', '3️⃣', '📅', '📆', '⚡'];
const MED_ICONS = ['💊', '💉', '🩺', '🌡️', '🧴', '🫁', '🧠', '❤️', '🦴', '👁️'];

// ─── Animated Med Card ───────────────────────────────────────────────────────
function MedCard({ med, onToggle, onDelete, onEdit, index }: { med: Medication; onToggle: () => void; onDelete: () => void; onEdit: () => void; index: number }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 60, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: index * 60, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: scaleAnim }] }}>
      <View style={[styles.medCard, med.active ? styles.medCardActive : styles.medCardInactive]}>
        <View style={styles.medCardTop}>
          <View style={[styles.medIconCircle, { backgroundColor: med.active ? COLORS.primaryBg : '#F3F4F6' }]}>
            <Text style={styles.medIcon}>{med.icon || '💊'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.medName, !med.active && { color: COLORS.textMuted }]}>{med.name}</Text>
            <Text style={styles.medDose}>{med.dosage} · {med.frequency}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: med.active ? '#DCFCE7' : '#FEE2E2' }]}>
            <View style={[styles.statusDot, { backgroundColor: med.active ? COLORS.successDark : COLORS.error }]} />
            <Text style={[styles.statusText, { color: med.active ? '#166534' : '#991B1B' }]}>{med.active ? '启用' : '停用'}</Text>
          </View>
        </View>

        <View style={styles.medTimes}>
          {med.times.map((t, i) => (
            <View key={i} style={styles.timeBadge}>
              <Text style={styles.timeBadgeText}>🕐 {t}</Text>
            </View>
          ))}
        </View>

        {med.notes ? <Text style={styles.medNotes}>📝 {med.notes}</Text> : null}

        {med.reminderEnabled && (
          <View style={styles.reminderBadge}>
            <Text style={styles.reminderBadgeText}>🔔 每日提醒已开启</Text>
          </View>
        )}

        <View style={styles.medCardActions}>
          <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
            <Text style={styles.editBtnText}>✏️ 修改</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: med.active ? '#FEE2E2' : '#DCFCE7' }]}
            onPress={() => pressAnimation(scaleAnim, onToggle)}
          >
            <Text style={[styles.actionBtnText, { color: med.active ? '#991B1B' : '#166534' }]}>
              {med.active ? '停用' : '启用'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
            <Text style={styles.deleteBtnText}>🗑️</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
function MedicationScreenContent() {
  const [meds, setMeds] = useState<Medication[]>([]);
  const [elderNickname, setElderNickname] = useState('家人');
  const [careNeeds, setCareNeeds] = useState<CareNeedType[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [freqIdx, setFreqIdx] = useState(0);
  const [selectedTimes, setSelectedTimes] = useState<string[]>(['08:00']);
  const [notes, setNotes] = useState('');
  const [icon, setIcon] = useState('💊');
  const [reminderEnabled, setReminderEnabled] = useState(false);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-20)).current;
  const formFade = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(30)).current;
  const addBtnScale = useRef(new Animated.Value(1)).current;
  const saveBtnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fadeInUp(headerFade, headerSlide, { duration: 500 });
  }, []);

  useEffect(() => {
    if (adding) {
      fadeInUp(formFade, formSlide, { duration: 400 });
    }
  }, [adding]);

  useFocusEffect(useCallback(() => {
    getMedications().then(setMeds);
    getProfile().then(p => {
      if (p) {
        setElderNickname(p.nickname || p.name || '家人');
        setCareNeeds(p.careNeeds?.selectedNeeds || []);
      }
    });
  }, []));

  function resetForm() {
    setAdding(false);
    setEditingMed(null);
    setName(''); setDosage(''); setFreqIdx(0); setSelectedTimes(['08:00']); setNotes(''); setIcon('💊'); setReminderEnabled(false);
  }

  function openEdit(med: Medication) {
    setEditingMed(med);
    setName(med.name);
    setDosage(med.dosage);
    setFreqIdx(FREQUENCIES.indexOf(med.frequency) >= 0 ? FREQUENCIES.indexOf(med.frequency) : 0);
    setSelectedTimes(med.times || ['08:00']);
    setNotes(med.notes || '');
    setIcon(med.icon || '💊');
    setReminderEnabled(!!med.reminderEnabled);
    setAdding(true);
    fadeInUp(formFade, formSlide, { duration: 400 });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('请输入药物名称');
      return;
    }
    const profile = await getProfile();
    const nickname = profile?.nickname || profile?.name || '家人';

    if (editingMed) {
      // ── Edit existing ──
      const updated = meds.map(m => m.id === editingMed.id ? {
        ...m, name: name.trim(), dosage: dosage.trim() || '按医嘱',
        frequency: FREQUENCIES[freqIdx], times: selectedTimes,
        notes: notes.trim(), icon, reminderEnabled,
      } : m);
      await saveMedications(updated);
      setMeds(updated);
      // handle reminders
      if (reminderEnabled) {
        for (const t of selectedTimes) {
          const [h, min] = t.split(':').map(Number);
          scheduleMedicationReminder(editingMed.id + '_' + t.replace(':', ''), editingMed.name, icon, nickname, h, min).catch(() => {});
        }
      } else {
        for (const t of (editingMed.times || [])) {
          cancelMedicationReminder(editingMed.id + '_' + t.replace(':', '')).catch(() => {});
        }
        cancelMedicationReminder(editingMed.id + '_morning').catch(() => {});
        cancelMedicationReminder(editingMed.id + '_evening').catch(() => {});
      }
    } else {
      // ── Add new ──
      const newMed: Medication = {
        id: Date.now().toString(),
        name: name.trim(),
        dosage: dosage.trim() || '按医嘱',
        frequency: FREQUENCIES[freqIdx],
        times: selectedTimes,
        notes: notes.trim(),
        icon,
        active: true,
        reminderEnabled,
      };
      const updated = [...meds, newMed];
      await saveMedications(updated);
      setMeds(updated);
      if (reminderEnabled) {
        for (const t of selectedTimes) {
          const [h, min] = t.split(':').map(Number);
          scheduleMedicationReminder(newMed.id + '_' + t.replace(':', ''), newMed.name, newMed.icon, nickname, h, min).catch(() => {});
        }
      }
    }

    resetForm();
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleToggle(id: string) {
    const updated = meds.map(m => m.id === id ? { ...m, active: !m.active } : m);
    await saveMedications(updated);
    setMeds(updated);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  async function handleDelete(id: string) {
    Alert.alert('删除药物', '确定要删除这个药物吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除', style: 'destructive', onPress: async () => {
          const updated = meds.filter(m => m.id !== id);
          await saveMedications(updated);
          setMeds(updated);
        }
      }
    ]);
  }

  function toggleTime(t: string) {
    setSelectedTimes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const activeCount = meds.filter(m => m.active).length;

  return (
    <ScreenContainer containerClassName="bg-[#FFF7ED]">
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <Animated.View style={{ opacity: headerFade, transform: [{ translateY: headerSlide }] }}>
          <PageHeader
            theme={PAGE_THEMES.medication}
            subtitle={`${activeCount} 种药物启用中`}
            right={
              <Animated.View style={{ transform: [{ scale: addBtnScale }] }}>
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => pressAnimation(addBtnScale, () => setAdding(true))}
                  activeOpacity={0.85}
                >
                  <Text style={styles.addBtnText}>+ 添加药物</Text>
                </TouchableOpacity>
              </Animated.View>
            }
          />
        </Animated.View>

        {/* Add Form */}
        {adding && (
          <Animated.View style={[styles.addForm, { opacity: formFade, transform: [{ translateY: formSlide }] }]}>
            <View style={styles.formTitleRow}>
              <Text style={styles.formEmoji}>{editingMed ? '✏️' : '💊'}</Text>
              <Text style={styles.formTitle}>{editingMed ? '修改药物信息' : '添加新药物'}</Text>
            </View>

            {/* Icon Picker */}
            <Text style={styles.label}>选择图标</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconRow}>
              {MED_ICONS.map(ic => (
                <TouchableOpacity
                  key={ic}
                  style={[styles.iconOption, icon === ic && styles.iconOptionSelected]}
                  onPress={() => { setIcon(ic); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Text style={styles.iconOptionText}>{ic}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>药物名称 *</Text>
            <TextInput style={styles.input} placeholder="例如：多奈哌齐、美金刚..." value={name} onChangeText={setName} placeholderTextColor="#B8BCC0" />

            <Text style={styles.label}>剂量</Text>
            <TextInput style={styles.input} placeholder="例如：5mg、1片..." value={dosage} onChangeText={setDosage} placeholderTextColor="#B8BCC0" />

            <Text style={styles.label}>服药频率</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.freqRow}>
              {FREQUENCIES.map((f, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.freqOption, freqIdx === i && styles.freqOptionSelected]}
                  onPress={() => { setFreqIdx(i); if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <Text style={styles.freqIcon}>{FREQ_ICONS[i]}</Text>
                  <Text style={[styles.freqText, freqIdx === i && styles.freqTextSelected]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.label}>服药时间（可多选）</Text>
            <View style={styles.timesGrid}>
              {TIMES.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.timeOption, selectedTimes.includes(t) && styles.timeOptionSelected]}
                  onPress={() => toggleTime(t)}
                >
                  <Text style={[styles.timeOptionText, selectedTimes.includes(t) && styles.timeOptionTextSelected]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>备注（可选）</Text>
            <TextInput style={styles.input} placeholder="例如：饭后服用、需要大量喝水..." value={notes} onChangeText={setNotes} placeholderTextColor="#B8BCC0" />

            {/* Reminder Toggle */}
            <TouchableOpacity
              style={[styles.reminderToggleRow, reminderEnabled && styles.reminderToggleRowActive]}
              onPress={() => {
                setReminderEnabled(v => !v);
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              activeOpacity={0.85}
            >
              <View style={styles.reminderToggleLeft}>
                <Text style={styles.reminderToggleEmoji}>{reminderEnabled ? '🔔' : '🔕'}</Text>
                <View>
                  <Text style={[styles.reminderToggleTitle, reminderEnabled && { color: '#D97706' }]}>
                    每日 App 提醒
                  </Text>
                  <Text style={styles.reminderToggleSub}>
                    {reminderEnabled ? `将在 ${selectedTimes.join('、')} 发送可爱提醒 ✨` : '点击开启用药时间提醒'}
                  </Text>
                </View>
              </View>
              <View style={[styles.toggleTrack, reminderEnabled && styles.toggleTrackActive]}>
                <View style={[styles.toggleThumb, reminderEnabled && styles.toggleThumbActive]} />
              </View>
            </TouchableOpacity>

            <View style={styles.formBtns}>
              <TouchableOpacity style={styles.cancelBtn} onPress={resetForm} activeOpacity={0.8}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <Animated.View style={{ flex: 2, transform: [{ scale: saveBtnScale }] }}>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={() => pressAnimation(saveBtnScale, handleSave)}
                  activeOpacity={0.85}
                >
                  <Text style={styles.saveBtnText}>{editingMed ? '保存修改 ✓' : '保存药物 ✓'}</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </Animated.View>
        )}

        {/* Medication List */}
        {meds.length === 0 && !adding ? (
          <EmptyMedState onAdd={() => setAdding(true)} elderNickname={elderNickname} />
        ) : meds.length > 0 ? (
          <View style={styles.medList}>
            <View style={styles.listTitleRow}>
              <Text style={styles.listTitle}>📋 用药计划</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{activeCount} 种启用</Text>
              </View>
            </View>
            {meds.map((med, i) => (
              <MedCard key={med.id} med={med} onToggle={() => handleToggle(med.id)} onDelete={() => handleDelete(med.id)} onEdit={() => openEdit(med)} index={i} />
            ))}
          </View>
        ) : null}

        {/* Tips Card */}
        <TipsCard careNeeds={careNeeds} elderNickname={elderNickname} />
      </ScrollView>
    </ScreenContainer>
  );
}

// ─── Empty State ─────────────────────────────────────────────────────────────
function EmptyMedState({ onAdd, elderNickname = '家人' }: { onAdd: () => void; elderNickname?: string }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fadeInUp(fadeAnim, slideAnim, { duration: 600 });
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[styles.emptyState, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <Animated.View style={[styles.emptyEmojiCircle, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={styles.emptyEmoji}>💊</Text>
      </Animated.View>
      <Text style={styles.emptyTitle}>还没有添加药物</Text>
      <Text style={styles.emptyText}>点击「添加药物」开始记录{'\n'}{elderNickname}的用药计划</Text>
      <Animated.View style={{ transform: [{ scale: btnScale }] }}>
        <TouchableOpacity style={styles.startBtn} onPress={() => pressAnimation(btnScale, onAdd)} activeOpacity={0.85}>
          <Text style={styles.startBtnText}>添加第一种药物 💊</Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Tips Data ────────────────────────────────────────────────────────────────
const TIPS_BY_NEED: Record<CareNeedType, string[]> = {
  memory: [
    '认知类药物需长期规律服用，不可因状态好转而自行停药',
    '如对方拒绝服药，可咨询医生调整剂型（如液体、贴片）',
    '使用分药盒按早中晚分装，避免漏服或重复',
    '定期复查，根据医生建议调整用药方案',
  ],
  hypertension: [
    '降压药请每天固定时间服用，切勿因血压恢复正常而自行停药',
    '漏服后不可加倍补服，按下次正常时间继续即可',
    '记录每次用药时间，方便就诊时与医生沟通',
    '服药期间定期监测血压，异常波动及时告知医生',
  ],
  diabetes: [
    '降糖药应严格按饭前/饭后时间服用，时间影响效果',
    '出现手抖、冒冷汗等低血糖症状，立即补充糖分并就医',
    '记录血糖与用药的对应关系，帮助医生调整剂量',
    '定期检查糖化血红蛋白（HbA1c），评估长期控制情况',
  ],
  cancer: [
    '靶向药/化疗药的服用时间要精确，请严格按医嘱执行',
    '漏服处理方式因药物而异，请直接咨询主治医生',
    '记录用药后的副作用（恶心、疲乏等），就诊时一并告知',
    '不可自行调整剂量，任何变化都应在医生指导下进行',
  ],
  mood: [
    '情绪类药物需稳定服用，突然停药可能引发严重不适',
    '建立固定的服药时间习惯，减少漏服风险',
    '记录情绪变化与用药的关系，帮助医生评估效果',
    '如感觉药物效果变化，告知医生，不要自行停药或换药',
  ],
  sleep: [
    '助眠药物应在睡前固定时间服用，过早服用影响效果',
    '不可自行增加剂量或频率，遵医嘱使用',
    '记录每晚睡眠质量，评估药物是否有效',
    '长期使用助眠药物请定期与医生复查，避免依赖',
  ],
  fall: [
    '某些药物（如降压药）可能引起头晕，服药后起身请缓慢',
    '告知医生所有正在服用的药物，避免药物相互作用增加跌倒风险',
    '记录服药后出现的头晕、乏力等不适，及时反馈',
    '定期复查用药清单，评估是否有可减少的药物',
  ],
  nutrition: [
    '多数营养补充剂随餐服用吸收效果更好',
    '记录进食情况与补充剂的关联，方便医生调整方案',
    '定期复查相关营养指标（如维生素D、B12），避免过量',
    '补充剂剂量请咨询医生，不宜自行增减',
  ],
  surgery: [
    '术后恢复期请严格按处方执行，不可提前停药',
    '止痛药应按时服用而非等到疼痛难忍再服，效果更佳',
    '记录伤口状态与用药后的感受，复诊时一并汇报',
    '定期复诊，由医生决定何时可以减量或停药',
  ],
};

const GENERAL_TIPS = [
  '使用分药盒按早中晚分装，避免漏服或重复服药',
  '建立固定的服药时间习惯，可配合吃饭、刷牙等日常动作',
  '所有在服药物（包括保健品）请告知医生，避免相互作用',
  '定期复查，根据医生建议调整用药方案，不可自行停药',
];

// ─── Tips Card ────────────────────────────────────────────────────────────────
function TipsCard({ careNeeds = [], elderNickname = '家人' }: { careNeeds?: CareNeedType[]; elderNickname?: string }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    fadeInUp(fadeAnim, slideAnim, { duration: 500, delay: 300 });
  }, []);

  // Build tips: for each care need, show its specific tips; if none selected, show general tips
  const tips: { label: string; items: string[] }[] = [];
  if (careNeeds.length === 0) {
    tips.push({ label: '用药小贴士', items: GENERAL_TIPS });
  } else {
    careNeeds.forEach(need => {
      const needLabels: Record<CareNeedType, string> = {
        memory: '认知/记忆用药',
        hypertension: '血压用药',
        diabetes: '血糖用药',
        cancer: '抗癌用药',
        mood: '情绪用药',
        sleep: '睡眠用药',
        fall: '跌倒风险用药',
        nutrition: '营养补充',
        surgery: '术后用药',
      };
      tips.push({ label: needLabels[need] || '用药小贴士', items: TIPS_BY_NEED[need] || GENERAL_TIPS });
    });
    // Always add a general tip at the end
    tips.push({ label: '通用提醒', items: [GENERAL_TIPS[2], GENERAL_TIPS[3]] });
  }

  return (
    <Animated.View style={[styles.tipsCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.tipsHeader}>
        <Text style={styles.tipsIcon}>💡</Text>
        <Text style={styles.tipsTitle}>用药小贴士</Text>
      </View>
      {tips.map((section, si) => (
        <View key={si} style={{ marginBottom: si < tips.length - 1 ? 14 : 0 }}>
          {tips.length > 1 && (
            <Text style={styles.tipsSectionLabel}>📌 {section.label}</Text>
          )}
          <View style={styles.tipsList}>
            {section.items.map((item, ii) => (
              <Text key={ii} style={styles.tipItem}>{item}</Text>
            ))}
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  addBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.pill,
    paddingHorizontal: 18, paddingVertical: 10,
    ...SHADOWS.glow(COLORS.primary),
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Form
  addForm: {
    backgroundColor: '#fff', borderRadius: RADIUS.xxl, padding: 22, marginBottom: 20,
    borderWidth: 1, borderColor: COLORS.border,
    ...SHADOWS.lg,
  },
  formTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  formEmoji: { fontSize: 24 },
  formTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8, marginTop: 14 },
  input: {
    backgroundColor: '#F8F9FA', borderRadius: RADIUS.md, padding: 14,
    fontSize: 15, color: COLORS.text, borderWidth: 1.5, borderColor: '#EBEBEB',
  },
  iconRow: { flexDirection: 'row', marginBottom: 4 },
  iconOption: {
    width: 46, height: 46, borderRadius: RADIUS.md,
    backgroundColor: '#F8F9FA', alignItems: 'center', justifyContent: 'center',
    marginRight: 8, borderWidth: 1.5, borderColor: '#EBEBEB',
  },
  iconOptionSelected: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  iconOptionText: { fontSize: 22 },
  freqRow: { flexDirection: 'row', marginBottom: 4 },
  freqOption: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.md,
    backgroundColor: '#F8F9FA', marginRight: 8, borderWidth: 1.5, borderColor: '#EBEBEB',
  },
  freqOptionSelected: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  freqIcon: { fontSize: 16 },
  freqText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  freqTextSelected: { color: COLORS.primary },
  timesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeOption: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.sm,
    backgroundColor: '#F8F9FA', borderWidth: 1.5, borderColor: '#EBEBEB',
  },
  timeOptionSelected: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  timeOptionText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  timeOptionTextSelected: { color: COLORS.primary },
  formBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: RADIUS.xl,
    backgroundColor: '#F8F9FA', alignItems: 'center',
    borderWidth: 1, borderColor: '#EBEBEB',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  saveBtn: {
    padding: 14, borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primary, alignItems: 'center',
    ...SHADOWS.glow(COLORS.primary),
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Med List
  medList: { gap: 12, marginBottom: 20 },
  listTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  listTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  countBadge: {
    backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill,
  },
  countBadgeText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },

  // Med Card
  medCard: {
    borderRadius: RADIUS.xxl, padding: 18,
    borderWidth: 1, marginBottom: 2,
    ...SHADOWS.sm,
  },
  medCardActive: { backgroundColor: '#fff', borderColor: COLORS.borderAccent },
  medCardInactive: { backgroundColor: '#FAFAFA', borderColor: '#EBEBEB', opacity: 0.75 },
  medCardTop: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 },
  medIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  medIcon: { fontSize: 24 },
  medName: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  medDose: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.pill,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },
  medTimes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  timeBadge: { backgroundColor: COLORS.primaryBg, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 5 },
  timeBadgeText: { fontSize: 12, color: COLORS.primary, fontWeight: '600' },
  medNotes: { fontSize: 12, color: COLORS.textMuted, marginBottom: 8 },
  reminderBadge: {
    backgroundColor: '#FEF3C7', borderRadius: RADIUS.sm,
    paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 8,
  },
  reminderBadgeText: { fontSize: 11, color: '#92400E', fontWeight: '600' },
  medCardActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 4, alignItems: 'center' },
  editBtn: {
    borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE',
  },
  editBtnText: { fontSize: 13, fontWeight: '600', color: '#1D4ED8' },
  actionBtn: { borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 8 },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  deleteBtn: { padding: 8 },
  deleteBtnText: { fontSize: 18 },

  // Reminder toggle (form)
  reminderToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F8F9FA', borderRadius: RADIUS.xl, padding: 16, marginTop: 18,
    borderWidth: 1.5, borderColor: '#EBEBEB',
  },
  reminderToggleRowActive: { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
  reminderToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  reminderToggleEmoji: { fontSize: 24 },
  reminderToggleTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  reminderToggleSub: { fontSize: 12, color: COLORS.textSecondary },
  toggleTrack: {
    width: 48, height: 28, borderRadius: 14,
    backgroundColor: '#D1D5DB', justifyContent: 'center', paddingHorizontal: 3,
  },
  toggleTrackActive: { backgroundColor: '#F59E0B' },
  toggleThumb: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  toggleThumbActive: { transform: [{ translateX: 20 }] },

  // Empty
  emptyState: { alignItems: 'center', padding: 40 },
  emptyEmojiCircle: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: COLORS.primaryBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
    ...SHADOWS.glow(COLORS.primary),
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  startBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.pill,
    paddingHorizontal: 28, paddingVertical: 14,
    ...SHADOWS.glow(COLORS.primary),
  },
  startBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Tips
  tipsCard: {
    backgroundColor: '#FFFBEB', borderRadius: RADIUS.xxl, padding: 20,
    borderWidth: 1, borderColor: '#FDE68A', marginTop: 8,
    ...SHADOWS.sm,
  },
  tipsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  tipsIcon: { fontSize: 20 },
  tipsTitle: { fontSize: 16, fontWeight: '700', color: '#92400E' },
  tipsSectionLabel: { fontSize: 12, fontWeight: '700', color: '#B45309', marginBottom: 8, letterSpacing: 0.3 },
  tipsList: { gap: 10 },
  tipItem: { fontSize: 13, color: '#78350F', lineHeight: 21, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: '#FDE68A' },
});

export default function MedicationScreen() {
  const [isCreator, setIsCreator] = useState<boolean | null>(null);
  useFocusEffect(useCallback(() => { getCurrentUserIsCreator().then(v => setIsCreator(v)); }, []));
  if (isCreator === null) return null;
  if (!isCreator) return (
    <JoinerLockedScreen
      icon="💊"
      title="用药管理"
      description="记录和管理家人的用药是主要照顾者的专属功能。"
    />
  );
  return <MedicationScreenContent />;
}
