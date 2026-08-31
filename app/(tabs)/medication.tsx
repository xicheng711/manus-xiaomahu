import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Platform, Animated, Easing, RefreshControl,
  KeyboardAvoidingView, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { PageHeader, PAGE_THEMES } from '@/components/page-header';
import {
  getMedications, saveMedication, updateMedication, deleteMedication,
  syncPendingMedications, mergeCloudMedicationsIntoLocal, Medication, MedicationChangeEvent, getMedicationChanges,
  mergeCloudMedicationChanges, createMedicationChangeEvent, medicationSnapshot,
  getProfile, getFamilyProfile,
} from '@/lib/storage';
import { cloudGetMedications, cloudGetMedicationChanges } from '@/lib/cloud-sync';
import { MedicationHistory } from '@/components/medication-history';
import { useFamilyContext } from '@/lib/family-context';
import { COLORS, SHADOWS, RADIUS, fadeInUp, pressAnimation } from '@/lib/animations';
import { AppColors } from '@/lib/design-tokens';
import * as Haptics from 'expo-haptics';
import { scheduleMedicationReminder, cancelMedicationReminder } from '@/lib/notifications';

const TIMES = ['06:00','07:00','07:30','08:00','08:30','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];
const FREQUENCIES = ['每天一次', '每天两次', '每天三次', '每隔一天', '每周一次', '需要时服用'];
const FREQ_ICONS = ['1️⃣', '2️⃣', '3️⃣', '📅', '📆', '⚡'];
const MED_ICONS = ['💊', '💉', '🩺', '🌡️', '🧴', '🫁', '🧠', '❤️', '🦴', '👁️'];

// ─── Animated Med Card ───────────────────────────────────────────────────────
function MedCard({ med, onToggle, onDelete, onEdit, index, isCreator }: { med: Medication; onToggle: () => void; onDelete: () => void; onEdit: () => void; index: number; isCreator: boolean }) {
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
          <View style={[styles.medIconCircle, { backgroundColor: med.active ? AppColors.coral.soft : AppColors.bg.secondary }]}>
            <Text style={styles.medIcon}>{med.icon || '💊'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.medName, !med.active && { color: AppColors.text.secondary }]}>{med.name}</Text>
            <Text style={styles.medDose}>{med.dosage} · {med.frequency}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: med.active ? AppColors.green.soft : AppColors.coral.soft }]}>
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

        {isCreator && (
          <View style={styles.medCardActions}>
            <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
              <Text style={styles.editBtnText}>✏️ 修改</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: med.active ? AppColors.coral.soft : AppColors.green.soft }]}
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
        )}
      </View>
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
function MedicationScreenContent() {
  const params = useLocalSearchParams<{ refresh?: string }>();
  const { memberships, activeMembership, ready: familyReady } = useFamilyContext();
  const familyId = activeMembership?.familyId;
  const activeFamilyRef = useRef<string | undefined>(familyId);
  activeFamilyRef.current = familyId;
  const isCreator = activeMembership?.role === 'creator';
  const currentMemberName = activeMembership?.room.members.find(member => member.id === activeMembership.myMemberId)?.name || '主照顾者';
  const [meds, setMeds] = useState<Medication[]>([]);
  const [medicationChanges, setMedicationChanges] = useState<MedicationChangeEvent[]>([]);
  const [elderNickname, setElderNickname] = useState('家人');
  const [adding, setAdding] = useState(false);
  const [editingMed, setEditingMed] = useState<Medication | null>(null);
  const [name, setName] = useState('');
  const [dosage, setDosage] = useState('');
  const [freqIdx, setFreqIdx] = useState(0);
  const [selectedTimes, setSelectedTimes] = useState<string[]>(['08:00']);
  const [notes, setNotes] = useState('');
  const [changeReason, setChangeReason] = useState('');
  const [pendingAction, setPendingAction] = useState<{ type: 'toggle' | 'delete'; med: Medication } | null>(null);
  const [pendingActionReason, setPendingActionReason] = useState('');
  const [actionSaving, setActionSaving] = useState(false);
  const [savingMedication, setSavingMedication] = useState(false);
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

  const [refreshing, setRefreshing] = useState(false);

  const loadMeds = useCallback(async () => {
    const requestedFamilyId = familyId;
    if (!familyReady || !requestedFamilyId) {
      setMeds([]);
      setMedicationChanges([]);
      return;
    }

    // 先显示当前家庭本地缓存，网络更新在后台完成。
    let local = await getMedications(requestedFamilyId);
    let localChanges = await getMedicationChanges(requestedFamilyId);
    if (activeFamilyRef.current !== requestedFamilyId) return;
    setMeds(local);
    setMedicationChanges(localChanges);
    if (isCreator) {
      await syncPendingMedications(requestedFamilyId).catch(() => {});
      local = await getMedications(requestedFamilyId);
      localChanges = await getMedicationChanges(requestedFamilyId);
      if (activeFamilyRef.current !== requestedFamilyId) return;
      setMeds(local);
      setMedicationChanges(localChanges);
    }

    const [cloudMeds, cloudChanges, fp, lp] = await Promise.all([
      cloudGetMedications(Number(requestedFamilyId)),
      cloudGetMedicationChanges(Number(requestedFamilyId)),
      getFamilyProfile(requestedFamilyId),
      getProfile(),
    ]);
    if (activeFamilyRef.current !== requestedFamilyId) return;

    if (Array.isArray(cloudChanges)) {
      const mergedChanges = await mergeCloudMedicationChanges(cloudChanges, requestedFamilyId);
      if (activeFamilyRef.current === requestedFamilyId) setMedicationChanges(mergedChanges);
    }

    if (Array.isArray(cloudMeds)) {
      const merged = await mergeCloudMedicationsIntoLocal(cloudMeds, requestedFamilyId);
      if (activeFamilyRef.current === requestedFamilyId) setMeds(merged);
    }

    const allowLegacyFallback = memberships.length === 1;
    setElderNickname(fp?.nickname || fp?.name || activeMembership?.room.elderName || (allowLegacyFallback ? lp?.nickname || lp?.name : undefined) || '家人');
  }, [familyId, familyReady, memberships.length, activeMembership?.room.elderName, isCreator]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadMeds(); } finally { setRefreshing(false); }
  }, [loadMeds]);

  useFocusEffect(useCallback(() => {
    loadMeds();
  }, [loadMeds]));

  // 点击通知时强制刷新
  useEffect(() => {
    if (params.refresh) loadMeds();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.refresh]);

  function resetForm() {
    setAdding(false);
    setEditingMed(null);
    setName(''); setDosage(''); setFreqIdx(0); setSelectedTimes(['08:00']); setNotes(''); setChangeReason(''); setIcon('💊'); setReminderEnabled(false);
  }

  function openEdit(med: Medication) {
    if (!isCreator) return; // joiner 无权限编辑
    setEditingMed(med);
    setName(med.name);
    setDosage(med.dosage);
    setFreqIdx(FREQUENCIES.indexOf(med.frequency) >= 0 ? FREQUENCIES.indexOf(med.frequency) : 0);
    setSelectedTimes(med.times || ['08:00']);
    setNotes(med.notes || '');
    setChangeReason('');
    setIcon(med.icon || '💊');
    setReminderEnabled(!!med.reminderEnabled);
    setAdding(true);
    fadeInUp(formFade, formSlide, { duration: 400 });
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  async function handleSave() {
    if (savingMedication) return;
    if (!isCreator) {
      Alert.alert('无权限', '只有主照顾者可以新增或修改用药计划');
      return;
    }
    if (!name.trim()) {
      Alert.alert('请输入药物名称');
      return;
    }
    const requestedFamilyId = familyId;
    if (!requestedFamilyId) {
      Alert.alert('家庭信息尚未准备好', '请稍后重试。');
      return;
    }
    const [fp, lp] = await Promise.all([getFamilyProfile(requestedFamilyId), getProfile()]);
    if (activeFamilyRef.current !== requestedFamilyId) return;
    const nickname = fp?.nickname || fp?.name || activeMembership?.room.elderName || (memberships.length === 1 ? lp?.nickname || lp?.name : undefined) || '家人';

    if (editingMed && !changeReason.trim()) {
      Alert.alert('请填写调整原因', '简单记录医生建议、身体反应或其他原因，方便家人以后回顾。');
      return;
    }

    setSavingMedication(true);
    try {
    if (editingMed) {
      // ── Edit existing ── (updateMedication 自带云端同步)
      const patch = {
        name: name.trim(),
        dosage: dosage.trim() || '按医嘱',
        frequency: FREQUENCIES[freqIdx],
        times: selectedTimes,
        notes: notes.trim(),
        icon,
        reminderEnabled,
      };
      const nextMedication = { ...editingMed, ...patch };
      const changeEvent = createMedicationChangeEvent({
        changeType: 'updated',
        reason: changeReason,
        previousSnapshot: medicationSnapshot(editingMed),
        nextSnapshot: medicationSnapshot(nextMedication),
        changedByName: currentMemberName,
      });
      await updateMedication(editingMed.id, patch, requestedFamilyId, changeEvent);
      setMedicationChanges(previous => [changeEvent, ...previous.filter(item => item.eventId !== changeEvent.eventId)]);
      const updated = meds.map(m => m.id === editingMed.id ? { ...m, ...patch } : m);
      setMeds(updated);
      // handle reminders—差集算法：取消已删除的时间点，新增新时间点
      const oldTimes = editingMed.times || [];
      if (reminderEnabled) {
        // 取消被删除的时间（oldTimes - selectedTimes）
        for (const t of oldTimes) {
          if (!selectedTimes.includes(t)) {
            cancelMedicationReminder(editingMed.id + '_' + t.replace(':', '')).catch(() => {});
          }
        }
        // 新增或保留的时间（selectedTimes）
        for (const t of selectedTimes) {
          const [h, min] = t.split(':').map(Number);
          scheduleMedicationReminder(editingMed.id + '_' + t.replace(':', ''), name.trim(), icon, nickname, h, min).catch(() => {});
        }
      } else {
        // 关闭提醒：取消所有旧时间
        for (const t of oldTimes) {
          cancelMedicationReminder(editingMed.id + '_' + t.replace(':', '')).catch(() => {});
        }
        cancelMedicationReminder(editingMed.id + '_morning').catch(() => {});
        cancelMedicationReminder(editingMed.id + '_evening').catch(() => {});
      }
    } else {
      // ── Add new ── (saveMedication 自带云端同步)
      const newMedicationData = {
        name: name.trim(),
        dosage: dosage.trim() || '按医嘱',
        frequency: FREQUENCIES[freqIdx],
        times: selectedTimes,
        notes: notes.trim(),
        icon,
        active: true,
        reminderEnabled,
      };
      const changeEvent = createMedicationChangeEvent({
        changeType: 'added',
        reason: changeReason,
        nextSnapshot: medicationSnapshot(newMedicationData),
        changedByName: currentMemberName,
      });
      const newMed = await saveMedication(newMedicationData, requestedFamilyId, changeEvent);
      setMedicationChanges(previous => [changeEvent, ...previous.filter(item => item.eventId !== changeEvent.eventId)]);
      setMeds(prev => [...prev, newMed]);
      if (reminderEnabled) {
        for (const t of selectedTimes) {
          const [h, min] = t.split(':').map(Number);
          scheduleMedicationReminder(newMed.id + '_' + t.replace(':', ''), newMed.name, newMed.icon, nickname, h, min).catch(() => {});
        }
      }
    }

    resetForm();
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Alert.alert('用药记录没有保存成功', error?.message || '请稍后重试，刚才输入的内容仍为你保留。');
    } finally {
      setSavingMedication(false);
    }
  }

  function handleToggle(id: string) {
    if (!isCreator) return;
    const target = meds.find(m => m.id === id);
    if (!target) return;
    setPendingAction({ type: 'toggle', med: target });
    setPendingActionReason('');
  }

  function handleDelete(id: string) {
    if (!isCreator) return;
    const target = meds.find(m => m.id === id);
    if (!target) return;
    setPendingAction({ type: 'delete', med: target });
    setPendingActionReason('');
  }

  async function confirmMedicationAction() {
    const action = pendingAction;
    const requestedFamilyId = familyId;
    if (!action || !requestedFamilyId || actionSaving) return;
    if (!pendingActionReason.trim()) {
      Alert.alert('请填写原因', '这条说明会保存在用药调整记录里，帮助家人了解为什么发生变化。');
      return;
    }
    setActionSaving(true);
    try {
      if (action.type === 'toggle') {
        const nextMedication = { ...action.med, active: !action.med.active };
        const changeEvent = createMedicationChangeEvent({
          changeType: nextMedication.active ? 'resumed' : 'paused',
          reason: pendingActionReason,
          previousSnapshot: medicationSnapshot(action.med),
          nextSnapshot: medicationSnapshot(nextMedication),
          changedByName: currentMemberName,
        });
        await updateMedication(action.med.id, { active: nextMedication.active }, requestedFamilyId, changeEvent);
        setMeds(previous => previous.map(item => item.id === action.med.id ? { ...item, active: nextMedication.active } : item));
        setMedicationChanges(previous => [changeEvent, ...previous.filter(item => item.eventId !== changeEvent.eventId)]);
      } else {
        const changeEvent = createMedicationChangeEvent({
          changeType: 'deleted',
          reason: pendingActionReason,
          previousSnapshot: medicationSnapshot(action.med),
          nextSnapshot: null,
          changedByName: currentMemberName,
        });
        await deleteMedication(action.med.id, requestedFamilyId, changeEvent);
        setMeds(previous => previous.filter(item => item.id !== action.med.id));
        const refreshedChanges = await getMedicationChanges(requestedFamilyId);
        setMedicationChanges(refreshedChanges);
      }
      setPendingAction(null);
      setPendingActionReason('');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      Alert.alert('操作没有完成', error?.message || '请检查网络后重试，原用药记录仍然保留。');
    } finally {
      setActionSaving(false);
    }
  }

  function toggleTime(t: string) {
    setSelectedTimes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  const activeCount = meds.filter(m => m.active).length;

  return (
    <ScreenContainer containerClassName="bg-[#F7F1F3]">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={0}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#B07858" colors={['#B07858']} />}>
        {/* Header */}
        <Animated.View style={{ opacity: headerFade, transform: [{ translateY: headerSlide }] }}>
          <PageHeader
            theme={PAGE_THEMES.medication}
            subtitle={`${activeCount} 种药物启用中`}
            right={isCreator ? (
              <Animated.View style={{ transform: [{ scale: addBtnScale }] }}>
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => {
                    setAdding(true);
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                >
                  <Text style={styles.addBtnText}>＋ 添加</Text>
                </TouchableOpacity>
              </Animated.View>
            ) : null}
          />
        </Animated.View>

        {!isCreator && (
          <View style={{ paddingHorizontal: 20, marginBottom: 8 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(0,0,0,0.04)' }}>
              <Text style={{ fontSize: 13 }}>👁️</Text>
              <Text style={{ fontSize: 12, color: AppColors.text.secondary, flex: 1 }}>
                仅查看模式，如需修改请联系主照顾者
              </Text>
            </View>
          </View>
        )}

        {(medicationChanges.length > 0 || meds.length > 0) && (
          <MedicationHistory changes={medicationChanges} />
        )}

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
            <TextInput style={styles.input} placeholder="例如：多奈哌齐、美金刚..." value={name} onChangeText={setName} placeholderTextColor={AppColors.text.tertiary} />

            <Text style={styles.label}>剂量</Text>
            <TextInput style={styles.input} placeholder="例如：5mg、1片..." value={dosage} onChangeText={setDosage} placeholderTextColor={AppColors.text.tertiary} />

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
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="例如：饭后服用、需要大量喝水..."
              value={notes}
              onChangeText={setNotes}
              placeholderTextColor={AppColors.text.tertiary}
              multiline
              returnKeyType="default"
              submitBehavior="newline"
              blurOnSubmit={false}
              textAlignVertical="top"
            />

            <Text style={styles.label}>{editingMed ? '本次调整原因 *' : '开始用药原因（可选）'}</Text>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder={editingMed ? '例如：医生复诊后调整剂量、出现不适反应…' : '例如：医生新开药、出院后的新方案…'}
              value={changeReason}
              onChangeText={setChangeReason}
              placeholderTextColor={AppColors.text.tertiary}
              multiline
              returnKeyType="default"
              submitBehavior="newline"
              blurOnSubmit={false}
              textAlignVertical="top"
            />
            <Text style={styles.fieldHint}>保存后会进入家庭共享的用药调整记录，方便以后回顾。</Text>

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
                  <Text style={[styles.reminderToggleTitle, reminderEnabled && { color: AppColors.peach.primary }]}>
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
              <TouchableOpacity style={styles.cancelBtn} onPress={resetForm} activeOpacity={0.8} disabled={savingMedication}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <Animated.View style={{ flex: 2, transform: [{ scale: saveBtnScale }] }}>
                <TouchableOpacity
                  style={[styles.saveBtn, savingMedication && { opacity: 0.55 }]}
                  onPress={() => pressAnimation(saveBtnScale, handleSave)}
                  activeOpacity={0.85}
                  disabled={savingMedication}
                >
                  <Text style={styles.saveBtnText}>{savingMedication ? '保存中…' : editingMed ? '保存修改 ✓' : '保存药物 ✓'}</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </Animated.View>
        )}

        {/* Medication List */}
        {meds.length === 0 && !adding ? (
          isCreator ? (
            <EmptyMedState onAdd={() => setAdding(true)} elderNickname={elderNickname} />
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyEmojiCircle}>
                <Text style={styles.emptyEmoji}>💊</Text>
              </View>
              <Text style={styles.emptyTitle}>还没有用药记录</Text>
              <Text style={styles.emptyText}>当前您是家庭成员身份，只能查看，不能新增或修改用药计划。</Text>
            </View>
          )
        ) : meds.length > 0 ? (
          <View style={styles.medList}>
            <View style={styles.listTitleRow}>
              <Text style={styles.listTitle}>📋 用药计划</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{activeCount} 种启用</Text>
              </View>
            </View>
            {meds.map((med, i) => (
              <MedCard key={med.id} med={med} onToggle={() => handleToggle(med.id)} onDelete={() => handleDelete(med.id)} onEdit={() => openEdit(med)} index={i} isCreator={isCreator} />
            ))}
          </View>
        ) : null}

      </ScrollView>
      </KeyboardAvoidingView>

      <Modal transparent visible={!!pendingAction} animationType="fade" onRequestClose={() => !actionSaving && setPendingAction(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBackdrop}>
          <View style={styles.reasonModal}>
            <Text style={styles.reasonModalEmoji}>{pendingAction?.type === 'delete' ? '🗂️' : pendingAction?.med.active ? '⏸️' : '▶️'}</Text>
            <Text style={styles.reasonModalTitle}>
              {pendingAction?.type === 'delete' ? '停止并移除这项用药？' : pendingAction?.med.active ? '暂停这项用药？' : '恢复这项用药？'}
            </Text>
            <Text style={styles.reasonModalSubtitle}>
              请记录原因。家人以后可以在用药调整记录中看到这次变化。
            </Text>
            <TextInput
              style={[styles.input, styles.actionReasonInput]}
              value={pendingActionReason}
              onChangeText={setPendingActionReason}
              placeholder="例如：医生复诊后停药、暂时观察身体反应…"
              placeholderTextColor={AppColors.text.tertiary}
              multiline
              returnKeyType="default"
              submitBehavior="newline"
              blurOnSubmit={false}
              textAlignVertical="top"
              autoFocus
            />
            <View style={styles.reasonModalButtons}>
              <TouchableOpacity style={styles.reasonCancelButton} disabled={actionSaving} onPress={() => { setPendingAction(null); setPendingActionReason(''); }}>
                <Text style={styles.reasonCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.reasonConfirmButton, actionSaving && { opacity: 0.55 }]} disabled={actionSaving} onPress={confirmMedicationAction}>
                <Text style={styles.reasonConfirmText}>{actionSaving ? '保存中…' : '记录并确认'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  addBtnText: { fontSize: 14, fontWeight: '700', color: AppColors.surface.whiteStrong },

  // Form
  addForm: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: RADIUS.xxl, padding: 22, marginBottom: 20,
    borderWidth: 1, borderColor: COLORS.border,
    ...SHADOWS.lg,
  },
  formTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  formEmoji: { fontSize: 24 },
  formTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8, marginTop: 14 },
  input: {
    backgroundColor: AppColors.bg.secondary, borderRadius: RADIUS.md, padding: 14,
    fontSize: 15, color: COLORS.text, borderWidth: 1.5, borderColor: AppColors.border.soft,
  },
  multilineInput: { minHeight: 76, maxHeight: 150 },
  fieldHint: { marginTop: 7, fontSize: 11, lineHeight: 17, color: AppColors.text.tertiary },
  iconRow: { flexDirection: 'row', marginBottom: 4 },
  iconOption: {
    width: 46, height: 46, borderRadius: RADIUS.md,
    backgroundColor: AppColors.bg.secondary, alignItems: 'center', justifyContent: 'center',
    marginRight: 8, borderWidth: 1.5, borderColor: AppColors.border.soft,
  },
  iconOptionSelected: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  iconOptionText: { fontSize: 22 },
  freqRow: { flexDirection: 'row', marginBottom: 4 },
  freqOption: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.md,
    backgroundColor: AppColors.bg.secondary, marginRight: 8, borderWidth: 1.5, borderColor: AppColors.border.soft,
  },
  freqOptionSelected: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  freqIcon: { fontSize: 16 },
  freqText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  freqTextSelected: { color: COLORS.primary },
  timesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeOption: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.sm,
    backgroundColor: AppColors.bg.secondary, borderWidth: 1.5, borderColor: AppColors.border.soft,
  },
  timeOptionSelected: { backgroundColor: COLORS.primaryBg, borderColor: COLORS.primary },
  timeOptionText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  timeOptionTextSelected: { color: COLORS.primary },
  formBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelBtn: {
    flex: 1, padding: 14, borderRadius: RADIUS.xl,
    backgroundColor: AppColors.bg.secondary, alignItems: 'center',
    borderWidth: 1, borderColor: AppColors.border.soft,
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  saveBtn: {
    padding: 14, borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primary, alignItems: 'center',
    ...SHADOWS.glow(COLORS.primary),
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: AppColors.surface.whiteStrong },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(45,35,38,0.38)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  reasonModal: { width: '100%', maxWidth: 440, borderRadius: 24, padding: 22, backgroundColor: '#FFFCFB', ...SHADOWS.lg },
  reasonModalEmoji: { fontSize: 32, textAlign: 'center', marginBottom: 8 },
  reasonModalTitle: { fontSize: 19, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  reasonModalSubtitle: { marginTop: 8, marginBottom: 16, fontSize: 13, lineHeight: 20, color: COLORS.textSecondary, textAlign: 'center' },
  actionReasonInput: { minHeight: 100, maxHeight: 180 },
  reasonModalButtons: { flexDirection: 'row', gap: 10, marginTop: 18 },
  reasonCancelButton: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 14, backgroundColor: AppColors.bg.secondary },
  reasonCancelText: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary },
  reasonConfirmButton: { flex: 1.7, paddingVertical: 13, alignItems: 'center', borderRadius: 14, backgroundColor: COLORS.primary },
  reasonConfirmText: { fontSize: 14, fontWeight: '800', color: AppColors.surface.whiteStrong },

  // Med List
  medList: { gap: 12, marginBottom: 20 },
  listTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  listTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  countBadge: {
    backgroundColor: AppColors.bg.secondary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill,
  },
  countBadgeText: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },

  // Med Card
  medCard: {
    borderRadius: RADIUS.xxl, padding: 18,
    borderWidth: 1, marginBottom: 2,
    ...SHADOWS.sm,
  },
  medCardActive: { backgroundColor: AppColors.surface.whiteStrong, borderColor: AppColors.coral.soft },
  medCardInactive: { backgroundColor: AppColors.bg.secondary, borderColor: AppColors.border.soft, opacity: 0.75 },
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
    backgroundColor: AppColors.peach.soft, borderRadius: RADIUS.sm,
    paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start', marginBottom: 8,
  },
  reminderBadgeText: { fontSize: 11, color: AppColors.text.primary, fontWeight: '600' },
  medCardActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', marginTop: 4, alignItems: 'center' },
  editBtn: {
    borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: AppColors.purple.soft, borderWidth: 1, borderColor: AppColors.purple.primary,
  },
  editBtnText: { fontSize: 13, fontWeight: '600', color: AppColors.purple.strong },
  actionBtn: { borderRadius: RADIUS.sm, paddingHorizontal: 14, paddingVertical: 8 },
  actionBtnText: { fontSize: 13, fontWeight: '600' },
  deleteBtn: { padding: 8 },
  deleteBtnText: { fontSize: 18 },

  // Reminder toggle (form)
  reminderToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: AppColors.bg.secondary, borderRadius: RADIUS.xl, padding: 16, marginTop: 18,
    borderWidth: 1.5, borderColor: AppColors.border.soft,
  },
  reminderToggleRowActive: { backgroundColor: AppColors.peach.soft, borderColor: AppColors.peach.primary },
  reminderToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  reminderToggleEmoji: { fontSize: 24 },
  reminderToggleTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  reminderToggleSub: { fontSize: 12, color: COLORS.textSecondary },
  toggleTrack: {
    width: 48, height: 28, borderRadius: 14,
    backgroundColor: AppColors.border.soft, justifyContent: 'center', paddingHorizontal: 3,
  },
  toggleTrackActive: { backgroundColor: '#F59E0B' },
  toggleThumb: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: AppColors.surface.whiteStrong,
    shadowColor: AppColors.shadow.default, shadowOpacity: 0.15, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
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
  startBtnText: { fontSize: 15, fontWeight: '700', color: AppColors.surface.whiteStrong },

});

export default function MedicationScreen() {
  return <MedicationScreenContent />;
}
