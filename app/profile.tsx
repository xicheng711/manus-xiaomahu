import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Switch, StyleSheet,
  Platform, TextInput, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/screen-container';
import { getProfile, saveProfile, ElderProfile } from '@/lib/storage';
import { getZodiac } from '@/lib/zodiac';
import {
  areRemindersScheduled,
  scheduleAllReminders,
  cancelAllReminders,
  requestNotificationPermissions,
} from '@/lib/notifications';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<ElderProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);

  // Inline edit state
  const [editingCaregiverName, setEditingCaregiverName] = useState(false);
  const [caregiverNameDraft, setCaregiverNameDraft] = useState('');
  const [editingElderNickname, setEditingElderNickname] = useState(false);
  const [elderNicknameDraft, setElderNicknameDraft] = useState('');

  useFocusEffect(useCallback(() => {
    getProfile().then(p => {
      setProfile(p);
      setCaregiverNameDraft(p?.caregiverName || '');
      setElderNicknameDraft(p?.nickname || p?.name || '');
      setLoading(false);
    });
    if (Platform.OS !== 'web') {
      areRemindersScheduled().then(setNotifEnabled);
    }
  }, []));

  const saveCaregiverName = async () => {
    if (!profile || !caregiverNameDraft.trim()) return;
    const updated = await saveProfile({ ...profile, caregiverName: caregiverNameDraft.trim() });
    setProfile(updated);
    setEditingCaregiverName(false);
  };

  const saveElderNickname = async () => {
    if (!profile || !elderNicknameDraft.trim()) return;
    const updated = await saveProfile({ ...profile, nickname: elderNicknameDraft.trim() });
    setProfile(updated);
    setEditingElderNickname(false);
  };

  const toggleNotifications = async (value: boolean) => {
    setNotifLoading(true);
    try {
      if (value) {
        const granted = await requestNotificationPermissions();
        if (granted) {
          await scheduleAllReminders(profile?.nickname || profile?.name || undefined);
          setNotifEnabled(true);
        } else {
          setNotifEnabled(false);
        }
      } else {
        await cancelAllReminders();
        setNotifEnabled(false);
      }
    } catch {
      // silently fail
    }
    setNotifLoading(false);
  };

  if (loading) {
    return (
      <ScreenContainer className="items-center justify-center">
        <Text style={styles.loading}>加载中...</Text>
      </ScreenContainer>
    );
  }

  if (!profile) {
    return (
      <ScreenContainer className="items-center justify-center p-6">
        <Text style={styles.noProfile}>还没有设置个人信息</Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/onboarding' as any)}>
          <Text style={styles.btnText}>前往设置</Text>
        </TouchableOpacity>
      </ScreenContainer>
    );
  }

  const elderZodiac = getZodiac(new Date(profile.birthDate).getFullYear());
  const caregiverZodiac = getZodiac(parseInt(profile.caregiverBirthYear));

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color="#FF6B6B" />
            <Text style={styles.backBtnText}>返回</Text>
          </TouchableOpacity>
          <Text style={styles.title}>个人信息</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* ── 照顾者信息 ── */}
        <Text style={styles.sectionLabel}>👤 照顾者</Text>
        <View style={[styles.card, { backgroundColor: caregiverZodiac.bgColor }]}>
          <Text style={styles.cardEmoji}>{caregiverZodiac.emoji}</Text>
          <View style={styles.cardInfo}>
            {editingCaregiverName ? (
              <View style={styles.inlineEditRow}>
                <TextInput
                  style={styles.inlineInput}
                  value={caregiverNameDraft}
                  onChangeText={setCaregiverNameDraft}
                  autoFocus
                  placeholder="输入你的名字"
                  placeholderTextColor="#9BA1A6"
                  returnKeyType="done"
                  onSubmitEditing={saveCaregiverName}
                />
                <TouchableOpacity style={styles.saveBtn} onPress={saveCaregiverName}>
                  <Text style={styles.saveBtnText}>保存</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => {
                  setCaregiverNameDraft(profile.caregiverName);
                  setEditingCaregiverName(false);
                }}>
                  <Ionicons name="close" size={18} color="#9BA1A6" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.nameRow}>
                <Text style={styles.cardName}>{profile.caregiverName}</Text>
                <TouchableOpacity
                  style={styles.editIconBtn}
                  onPress={() => {
                    setCaregiverNameDraft(profile.caregiverName);
                    setEditingCaregiverName(true);
                  }}
                >
                  <Ionicons name="pencil-outline" size={16} color="#9BA1A6" />
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.cardSub}>属{caregiverZodiac.name} · {profile.caregiverBirthYear}年</Text>
            <Text style={styles.cardSub2}>照顾者</Text>
          </View>
        </View>

        {/* ── 老人信息 ── */}
        <Text style={styles.sectionLabel}>🧡 被照顾者</Text>
        <View style={[styles.card, { backgroundColor: elderZodiac.bgColor }]}>
          <Text style={styles.cardEmoji}>{elderZodiac.emoji}</Text>
          <View style={styles.cardInfo}>
            {editingElderNickname ? (
              <View style={styles.inlineEditRow}>
                <TextInput
                  style={styles.inlineInput}
                  value={elderNicknameDraft}
                  onChangeText={setElderNicknameDraft}
                  autoFocus
                  placeholder="输入昵称（如：姥姥）"
                  placeholderTextColor="#9BA1A6"
                  returnKeyType="done"
                  onSubmitEditing={saveElderNickname}
                />
                <TouchableOpacity style={styles.saveBtn} onPress={saveElderNickname}>
                  <Text style={styles.saveBtnText}>保存</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => {
                  setElderNicknameDraft(profile.nickname || profile.name);
                  setEditingElderNickname(false);
                }}>
                  <Ionicons name="close" size={18} color="#9BA1A6" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.nameRow}>
                <Text style={styles.cardName}>{profile.nickname || profile.name}</Text>
                <TouchableOpacity
                  style={styles.editIconBtn}
                  onPress={() => {
                    setElderNicknameDraft(profile.nickname || profile.name);
                    setEditingElderNickname(true);
                  }}
                >
                  <Ionicons name="pencil-outline" size={16} color="#9BA1A6" />
                </TouchableOpacity>
              </View>
            )}
            <Text style={styles.cardSub}>属{elderZodiac.name} · {new Date(profile.birthDate).getFullYear()}年</Text>
            <Text style={styles.cardSub2}>{profile.name}</Text>
          </View>
        </View>

        {/* City */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>📍 所在城市</Text>
          <Text style={styles.infoValue}>{profile.city}</Text>
        </View>

        {/* Notification settings section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🔔 提醒设置</Text>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>每日打卡提醒</Text>
            <Text style={styles.settingDesc}>
              {Platform.OS === 'web' ? '仅在手机端可用' : '早上 8:00 · 晚上 21:00'}
            </Text>
          </View>
          <Switch
            value={notifEnabled}
            onValueChange={toggleNotifications}
            disabled={notifLoading || Platform.OS === 'web'}
            trackColor={{ false: '#E5E7EB', true: '#FF6B6B' }}
            thumbColor={notifEnabled ? '#fff' : '#f4f3f4'}
          />
        </View>

        {notifEnabled && Platform.OS !== 'web' && (
          <View style={styles.notifInfo}>
            <Text style={styles.notifInfoText}>☀️ 早上 {profile.reminderMorning || '08:00'} — 记录昨晚睡眠情况</Text>
            <Text style={styles.notifInfoText}>🌙 晚上 {profile.reminderEvening || '21:00'} — 记录今日饮食和心情</Text>
          </View>
        )}

        {/* Reminder time customization */}
        <View style={styles.reminderEditCard}>
          <Text style={styles.reminderEditTitle}>⏰ 自定义提醒时间</Text>
          <View style={styles.reminderEditRow}>
            <Text style={styles.reminderEditLabel}>🌅 早上打卡</Text>
            <View style={styles.timeChipRow}>
              {['06:00', '07:00', '08:00', '09:00', '10:00'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.timeChipSmall, (profile.reminderMorning || '08:00') === t && styles.timeChipSmallActive]}
                  onPress={async () => {
                    const updated = await saveProfile({ ...profile, reminderMorning: t });
                    setProfile(updated);
                  }}
                >
                  <Text style={[styles.timeChipSmallText, (profile.reminderMorning || '08:00') === t && styles.timeChipSmallTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={[styles.reminderEditRow, { marginTop: 12 }]}>
            <Text style={styles.reminderEditLabel}>🌙 晚上打卡</Text>
            <View style={styles.timeChipRow}>
              {['19:00', '20:00', '21:00', '22:00', '23:00'].map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.timeChipSmall, (profile.reminderEvening || '21:00') === t && styles.timeChipSmallActive]}
                  onPress={async () => {
                    const updated = await saveProfile({ ...profile, reminderEvening: t });
                    setProfile(updated);
                  }}
                >
                  <Text style={[styles.timeChipSmallText, (profile.reminderEvening || '21:00') === t && styles.timeChipSmallTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Edit button */}
        <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/onboarding' as any)}>
          <Text style={styles.editBtnText}>✏️ 重新设置所有信息</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingBottom: 40 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 20,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  backBtnText: { fontSize: 16, color: '#FF6B6B', fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: '#11181C' },
  loading: { fontSize: 16, color: '#687076' },
  noProfile: { fontSize: 18, color: '#687076', marginBottom: 24, textAlign: 'center' },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#9BA1A6', marginBottom: 8, letterSpacing: 0.5 },

  card: {
    borderRadius: 20, padding: 20,
    flexDirection: 'row', alignItems: 'center', gap: 16,
    marginBottom: 16,
  },
  cardEmoji: { fontSize: 48 },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardName: { fontSize: 20, fontWeight: '700', color: '#11181C' },
  editIconBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  inlineEditRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  inlineInput: {
    flex: 1, fontSize: 17, fontWeight: '700', color: '#11181C',
    borderBottomWidth: 2, borderBottomColor: '#FF6B6B',
    paddingVertical: 2, paddingHorizontal: 0,
  },
  saveBtn: {
    backgroundColor: '#FF6B6B', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  saveBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  cancelBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardSub: { fontSize: 14, color: '#687076', marginBottom: 2 },
  cardSub2: { fontSize: 13, color: '#9BA1A6' },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#F8F9FA', borderRadius: 16, padding: 16, marginBottom: 16,
  },
  infoLabel: { fontSize: 15, color: '#687076' },
  infoValue: { fontSize: 15, fontWeight: '600', color: '#11181C' },
  sectionHeader: { marginTop: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#11181C' },
  settingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#F8F9FA', borderRadius: 16, padding: 16, marginBottom: 8,
  },
  settingInfo: { flex: 1, marginRight: 12 },
  settingLabel: { fontSize: 15, fontWeight: '600', color: '#11181C', marginBottom: 2 },
  settingDesc: { fontSize: 13, color: '#9BA1A6' },
  notifInfo: {
    backgroundColor: '#FFF5F5', borderRadius: 12, padding: 14, marginBottom: 16, gap: 6,
  },
  notifInfoText: { fontSize: 14, color: '#687076', lineHeight: 20 },
  editBtn: {
    backgroundColor: '#FF6B6B', borderRadius: 20, padding: 16,
    alignItems: 'center', marginTop: 8,
  },
  editBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  btn: { backgroundColor: '#FF6B6B', borderRadius: 20, paddingHorizontal: 32, paddingVertical: 14 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Reminder time customization
  reminderEditCard: {
    backgroundColor: '#F8F4FF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E9D5FF',
  },
  reminderEditTitle: { fontSize: 15, fontWeight: '800', color: '#5B21B6', marginBottom: 14 },
  reminderEditRow: { gap: 8 },
  reminderEditLabel: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 6 },
  timeChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timeChipSmall: {
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#EDE9FE',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  timeChipSmallActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#5B21B6',
  },
  timeChipSmallText: { fontSize: 13, fontWeight: '600', color: '#5B21B6' },
  timeChipSmallTextActive: { color: '#fff' },
});
