import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Animated, Platform, Alert, Share, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  getFamilyRoom, getFamilyAnnouncements, saveFamilyAnnouncement,
  deleteFamilyAnnouncement, getCurrentMember, createFamilyRoom,
  joinFamilyRoom, setCurrentMember, getTodayCheckIn, getDiaryEntries,
  getProfile, FamilyAnnouncement, FamilyMember, FamilyRoom,
  updateFamilyMemberPhoto,
} from '@/lib/storage';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { COLORS } from '@/lib/animations';
import { ScreenContainer } from '@/components/screen-container';
import { sendFamilyAnnouncementNotification } from '@/lib/notifications';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

// ─── Constants ────────────────────────────────────────────────────────────────

const ANNOUNCEMENT_TYPES = [
  { type: 'daily' as const, emoji: '📢', label: '日常', color: '#60A5FA' },
  { type: 'visit' as const, emoji: '🏠', label: '探望', color: '#4ADE80' },
  { type: 'medical' as const, emoji: '🏥', label: '医疗', color: '#F87171' },
  { type: 'news' as const, emoji: '📰', label: '新闻', color: '#FBBF24' },
  { type: 'reminder' as const, emoji: '⏰', label: '提醒', color: '#A78BFA' },
];

const MEMBER_EMOJIS = ['👩', '👨', '👧', '👦', '👴', '👵', '🧑', '👩‍⚕️', '👨‍⚕️', '🧓'];
const MEMBER_COLORS = ['#FF6B6B', '#4ADE80', '#60A5FA', '#FBBF24', '#A78BFA', '#F472B6', '#34D399', '#FB923C'];
const MEMBER_ROLES = [
  { role: 'caregiver' as const, label: '主要照顾者' },
  { role: 'family' as const, label: '家庭成员' },
  { role: 'nurse' as const, label: '护工/护士' },
];

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function FamilySetupScreen({ onSetupComplete }: { onSetupComplete: () => void }) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [memberName, setMemberName] = useState('');
  const [memberEmoji, setMemberEmoji] = useState('👩');
  const [memberColor, setMemberColor] = useState('#FF6B6B');
  const [memberRole, setMemberRole] = useState<'caregiver' | 'family' | 'nurse'>('caregiver');
  const [memberRoleLabel, setMemberRoleLabel] = useState('主要照顾者');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [patientNickname, setPatientNickname] = useState('家人');

  useEffect(() => {
    getProfile().then(p => {
      if (p) setPatientNickname(p.nickname || p.name || '家人');
    });
  }, []);

  async function handleCreate() {
    if (!memberName.trim()) return;
    setLoading(true);
    try {
      const profile = await getProfile();
      await createFamilyRoom(profile?.name || '老宝', {
        name: memberName.trim(),
        role: memberRole,
        roleLabel: memberRoleLabel,
        emoji: memberEmoji,
        color: memberColor,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSetupComplete();
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!memberName.trim() || roomCode.length < 6) return;
    setLoading(true);
    try {
      const result = await joinFamilyRoom(roomCode, {
        name: memberName.trim(),
        role: memberRole,
        roleLabel: memberRoleLabel,
        emoji: memberEmoji,
        color: memberColor,
      });
      if (!result) {
        Alert.alert('加入失败', '邀请码不正确，请检查后重试');
        return;
      }
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSetupComplete();
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'choose') {
    return (
      <View style={setup.container}>
        <Text style={setup.emoji}>🏡</Text>
        <Text style={setup.title}>家人共享</Text>
        <Text style={setup.subtitle}>
          创建家庭空间，邀请家人一起{'\n'}
          共同关爱{patientNickname}，分享护理日常
        </Text>
        <TouchableOpacity style={setup.primaryBtn} onPress={() => setMode('create')}>
          <Text style={setup.primaryBtnText}>✨ 创建家庭空间</Text>
        </TouchableOpacity>
        <TouchableOpacity style={setup.secondaryBtn} onPress={() => setMode('join')}>
          <Text style={setup.secondaryBtnText}>🔗 加入已有空间</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={setup.formContainer} showsVerticalScrollIndicator={false}>
      <Text style={setup.emoji}>{mode === 'create' ? '✨' : '🔗'}</Text>
      <Text style={setup.title}>{mode === 'create' ? '创建家庭空间' : '加入家庭空间'}</Text>

      {mode === 'join' && (
        <View style={setup.inputGroup}>
          <Text style={setup.label}>邀请码</Text>
          <TextInput
            style={setup.input}
            placeholder="输入6位邀请码"
            value={roomCode}
            onChangeText={t => setRoomCode(t.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
            placeholderTextColor="#9BA1A6"
          />
        </View>
      )}

      <View style={setup.inputGroup}>
        <Text style={setup.label}>你的名字</Text>
        <TextInput
          style={setup.input}
          placeholder="如：小红、大明..."
          value={memberName}
          onChangeText={setMemberName}
          placeholderTextColor="#9BA1A6"
        />
      </View>

      <View style={setup.inputGroup}>
        <Text style={setup.label}>选择头像</Text>
        <View style={setup.emojiRow}>
          {MEMBER_EMOJIS.map(e => (
            <TouchableOpacity
              key={e}
              style={[setup.emojiBtn, memberEmoji === e && { borderColor: memberColor, backgroundColor: memberColor + '20' }]}
              onPress={() => setMemberEmoji(e)}
            >
              <Text style={setup.emojiBtnText}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={setup.inputGroup}>
        <Text style={setup.label}>主题色</Text>
        <View style={setup.colorRow}>
          {MEMBER_COLORS.map(c => (
            <TouchableOpacity
              key={c}
              style={[setup.colorBtn, { backgroundColor: c }, memberColor === c && setup.colorBtnSelected]}
              onPress={() => setMemberColor(c)}
            />
          ))}
        </View>
      </View>

      <View style={setup.inputGroup}>
        <Text style={setup.label}>身份</Text>
        <View style={setup.roleRow}>
          {MEMBER_ROLES.map(r => (
            <TouchableOpacity
              key={r.role}
              style={[setup.roleBtn, memberRole === r.role && { borderColor: memberColor, backgroundColor: memberColor + '15' }]}
              onPress={() => { setMemberRole(r.role); setMemberRoleLabel(r.label); }}
            >
              <Text style={[setup.roleBtnText, memberRole === r.role && { color: memberColor, fontWeight: '700' }]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
        <TouchableOpacity style={setup.cancelBtn} onPress={() => setMode('choose')}>
          <Text style={setup.cancelBtnText}>← 返回</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[setup.primaryBtn, { flex: 2 }, (!memberName.trim() || (mode === 'join' && roomCode.length < 6)) && setup.disabledBtn]}
          onPress={mode === 'create' ? handleCreate : handleJoin}
          disabled={loading || !memberName.trim() || (mode === 'join' && roomCode.length < 6)}
        >
          <Text style={setup.primaryBtnText}>
            {loading ? '请稍候...' : mode === 'create' ? '创建 🎉' : '加入 🔗'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Main Family Screen ────────────────────────────────────────────────────────

export default function FamilyScreen() {
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState<FamilyRoom | null>(null);
  const [currentMember, setCurrentMemberState] = useState<FamilyMember | null>(null);
  const [announcements, setAnnouncements] = useState<FamilyAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'broadcast' | 'briefing'>('broadcast');

  // Compose state
  const [showCompose, setShowCompose] = useState(false);
  const [composeText, setComposeText] = useState('');
  const [composeType, setComposeType] = useState<FamilyAnnouncement['type']>('daily');
  const [composeEmoji, setComposeEmoji] = useState('');

  // Briefing state
  const [briefingData, setBriefingData] = useState<any>(null);
  const [selectedBriefingDate, setSelectedBriefingDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [briefingHistory, setBriefingHistory] = useState<{ date: string; label: string; checkIn: any; diary: any; announcements: any[] }[]>([]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<any>(null);
  const [newAnnouncementId, setNewAnnouncementId] = useState<string | null>(null);
  const briefingCardRef = useRef<View>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    setLoading(true);
    const [r, m, a] = await Promise.all([
      getFamilyRoom(),
      getCurrentMember(),
      getFamilyAnnouncements(),
    ]);
    setRoom(r);
    setCurrentMemberState(m);
    setAnnouncements(a);

    // Load briefing data
    const [checkIn, diaryEntries, profile] = await Promise.all([
      getTodayCheckIn(),
      getDiaryEntries(),
      getProfile(),
    ]);
    const yesterdayDiary = diaryEntries.find(e => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return e.date === yesterday.toISOString().split('T')[0];
    });
    const todayStr = new Date().toISOString().split('T')[0];
    setBriefingData({ checkIn, yesterdayDiary, profile, todayAnnouncements: a.filter(ann => ann.date === todayStr) });

    // Build briefing history (today + past 6 days)
    const history: { date: string; label: string; checkIn: any; diary: any; announcements: any[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const label = i === 0 ? '今日' : i === 1 ? '昨日' : d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
      const dayDiary = diaryEntries.find(e => e.date === dateKey);
      const dayAnnouncements = a.filter(ann => ann.date === dateKey);
      if (dayDiary || dayAnnouncements.length > 0 || i === 0) {
        history.push({ date: dateKey, label, checkIn: i === 0 ? checkIn : null, diary: dayDiary, announcements: dayAnnouncements });
      }
    }
    setBriefingHistory(history);

    setLoading(false);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }

  async function handlePostAnnouncement() {
    if (!composeText.trim() || !currentMember) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newAnn = await saveFamilyAnnouncement({
      authorId: currentMember.id,
      authorName: currentMember.name,
      authorEmoji: currentMember.emoji,
      authorColor: currentMember.color,
      content: composeText.trim(),
      emoji: composeEmoji,
      type: composeType,
    });
    const postedText = composeText.trim();
    setComposeText('');
    setComposeEmoji('');
    setComposeType('daily');
    setShowCompose(false);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setNewAnnouncementId(newAnn.id);
    // Send push notification to family members
    await sendFamilyAnnouncementNotification(
      currentMember.name,
      currentMember.emoji,
      postedText,
    );
    await loadData();
    // Scroll to top to show new announcement
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => setNewAnnouncementId(null), 2000);
    }, 300);
  }

  async function handleDeleteAnnouncement(id: string) {
    Alert.alert(
      '删除公告',
      '要删除这条公告吗？删除后无法恢复。',
      [
        { text: '再想想', style: 'cancel' },
        {
          text: '确认删除', style: 'destructive',
          onPress: async () => {
            await deleteFamilyAnnouncement(id);
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await loadData();
          },
        },
      ],
      { cancelable: true }
    );
  }

  async function handleShareBriefing() {
    // Get the selected date's briefing item
    const selectedItem = briefingHistory.find(item => item.date === selectedBriefingDate);
    if (!selectedItem) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsGeneratingShare(true);
    try {
      // Wait a frame for the hidden card to render
      await new Promise(resolve => setTimeout(resolve, 300));
      if (Platform.OS === 'web') {
        // Web fallback: share text
        const date = new Date(selectedItem.date).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
        let text = `🌸 护理简报 · ${date}\n\n`;
        if (selectedItem.checkIn) {
          text += `💤 睡眠：${selectedItem.checkIn.sleepHours}小时\n`;
          text += `${selectedItem.checkIn.moodEmoji} 心情：${selectedItem.checkIn.moodScore}/10分\n`;
          text += `💊 用药：${selectedItem.checkIn.medicationTaken ? '✅ 按时服药' : '⚠️ 未服药'}\n`;
          text += `⭐ 护理指数：${selectedItem.checkIn.careScore}分\n\n`;
        }
        if (selectedItem.diary) text += `📔 日记：${selectedItem.diary.content}\n\n`;
        if (selectedItem.announcements.length > 0) {
          text += `📢 家庭公告：\n`;
          selectedItem.announcements.forEach((a: FamilyAnnouncement) => { text += `${a.authorEmoji} ${a.authorName}：${a.content}\n`; });
        }
        text += `\n💕 由小马虎护理助手生成`;
        await Share.share({ message: text, title: '护理简报' });
      } else {
        // Native: capture the hidden briefing card as image
        const uri = await captureRef(briefingCardRef, {
          format: 'png',
          quality: 1,
          result: 'tmpfile',
        });
        const isAvailable = await Sharing.isAvailableAsync();
        if (isAvailable) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: '分享护理简报',
          });
        } else {
          Alert.alert('分享不可用', '请截图分享');
        }
      }
    } catch (e) {
      console.warn('Share error:', e);
      Alert.alert('分享失败', '请重试');
    } finally {
      setIsGeneratingShare(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 60 }]}>
        <Text style={styles.loadingText}>🏡 加载中...</Text>
      </View>
    );
  }

  if (!room || !currentMember) {
    return (
      <ScreenContainer containerClassName="bg-background">
        <View style={{ paddingTop: insets.top + 20, flex: 1 }}>
          <FamilySetupScreen onSetupComplete={loadData} />
        </View>
      </ScreenContainer>
    );
  }

  const typeInfo = (type: FamilyAnnouncement['type']) =>
    ANNOUNCEMENT_TYPES.find(t => t.type === type) ?? ANNOUNCEMENT_TYPES[0];

  const todayAnnouncements = announcements.filter(a => a.date === new Date().toISOString().split('T')[0]);
  const olderAnnouncements = announcements.filter(a => a.date !== new Date().toISOString().split('T')[0]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>🏡 家人共享</Text>
          <Text style={styles.headerSub}>{room.elderName} 的家庭空间</Text>
        </View>
        <View style={styles.headerRight}>
          {/* Room code badge */}
          <TouchableOpacity
            style={styles.roomCodeBadge}
            onPress={() => Alert.alert('邀请家人', `邀请码：${room.roomCode}\n\n将此码分享给家人，让他们加入你的家庭空间！`)}
          >
            <Text style={styles.roomCodeText}>🔗 {room.roomCode}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Members row */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.membersScroll} contentContainerStyle={styles.membersContent}>
        {room.members.map(m => (
          <TouchableOpacity
            key={m.id}
            style={styles.memberChip}
            onPress={async () => {
              if (!currentMember || currentMember.id !== m.id) return;
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') {
                Alert.alert('需要权限', '请允许访问相册以上传头像');
                return;
              }
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: 'images',
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
              });
              if (!result.canceled && result.assets[0]) {
                await updateFamilyMemberPhoto(m.id, result.assets[0].uri);
                loadData();
              }
            }}
            activeOpacity={currentMember?.id === m.id ? 0.7 : 1}
          >
            <View style={[styles.memberAvatar, { backgroundColor: m.color + '20', borderColor: m.color }]}>
              {m.photoUri ? (
                <Image source={{ uri: m.photoUri }} style={styles.memberAvatarImg} />
              ) : (
                <Text style={styles.memberAvatarText}>{m.emoji}</Text>
              )}
              {currentMember?.id === m.id && (
                <View style={styles.memberAvatarEdit}>
                  <Text style={{ fontSize: 8, color: '#fff' }}>编辑</Text>
                </View>
              )}
            </View>
            <Text style={styles.memberName}>{m.name}</Text>
            <Text style={styles.memberRole}>{m.roleLabel}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.addMemberChip}
          onPress={() => Alert.alert('邀请家人', `邀请码：${room.roomCode}\n\n将此码分享给家人，让他们下载小马虎并输入邀请码加入！`)}
        >
          <View style={styles.addMemberBtn}>
            <Text style={styles.addMemberBtnText}>＋</Text>
          </View>
          <Text style={styles.memberName}>邀请</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Section tabs */}
      <View style={styles.sectionTabs}>
        <TouchableOpacity
          style={[styles.sectionTab, activeSection === 'broadcast' && styles.sectionTabActive]}
          onPress={() => setActiveSection('broadcast')}
        >
          <Text style={[styles.sectionTabText, activeSection === 'broadcast' && styles.sectionTabTextActive]}>
            📢 家庭公告
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sectionTab, activeSection === 'briefing' && styles.sectionTabActive]}
          onPress={() => setActiveSection('briefing')}
        >
          <Text style={[styles.sectionTabText, activeSection === 'briefing' && styles.sectionTabTextActive]}>
            📋 简报分享
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView ref={scrollRef} style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

        {/* ── BROADCAST SECTION ── */}
        {activeSection === 'broadcast' && (
          <View style={styles.section}>
            {/* Today's announcements */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>今日公告</Text>
              <Text style={styles.sectionCount}>{todayAnnouncements.length} 条</Text>
            </View>

            {todayAnnouncements.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>📭</Text>
                <Text style={styles.emptyText}>今天还没有公告</Text>
                <Text style={styles.emptySubText}>点击下方按钮发布第一条公告吧！</Text>
              </View>
            ) : (
              todayAnnouncements.map(ann => (
                <AnnouncementCard
                  key={ann.id}
                  ann={ann}
                  typeInfo={typeInfo(ann.type)}
                  isOwn={ann.authorId === currentMember.id}
                  onDelete={() => handleDeleteAnnouncement(ann.id)}
                  isNew={ann.id === newAnnouncementId}
                />
              ))
            )}

            {/* Older announcements */}
            {olderAnnouncements.length > 0 && (
              <>
                <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                  <Text style={styles.sectionTitle}>历史公告</Text>
                </View>
                {olderAnnouncements.slice(0, 10).map(ann => (
                  <AnnouncementCard
                    key={ann.id}
                    ann={ann}
                    typeInfo={typeInfo(ann.type)}
                    isOwn={ann.authorId === currentMember.id}
                    onDelete={() => handleDeleteAnnouncement(ann.id)}
                  />
                ))}
              </>
            )}
          </View>
        )}

        {/* ── BRIEFING SECTION ── */}
        {activeSection === 'briefing' && (
          <View style={styles.section}>
            {/* Date tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.briefingDateScroll}
              contentContainerStyle={styles.briefingDateScrollContent}
            >
              {briefingHistory.map(item => (
                <TouchableOpacity
                  key={item.date}
                  style={[
                    styles.briefingDateTab,
                    selectedBriefingDate === item.date && styles.briefingDateTabActive,
                  ]}
                  onPress={() => setSelectedBriefingDate(item.date)}
                >
                  <Text style={[
                    styles.briefingDateTabText,
                    selectedBriefingDate === item.date && styles.briefingDateTabTextActive,
                  ]}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Selected date briefing card */}
            {briefingHistory.filter(item => item.date === selectedBriefingDate).map(item => (
              <View key={item.date} style={styles.briefingCard}>
                <Text style={styles.briefingTitle}>📋 {item.label}护理简报</Text>
                <Text style={styles.briefingSubtitle}>
                  {item.date === new Date().toISOString().split('T')[0]
                    ? '包含今日打卡、日记、家庭公告'
                    : `${item.date} 的护理记录`
                  }
                </Text>

                {item.checkIn ? (
                  <View style={styles.briefingPreview}>
                    <View style={styles.briefingRow}>
                      <Text style={styles.briefingLabel}>💤 睡眠</Text>
                      <Text style={styles.briefingValue}>{item.checkIn.sleepHours}小时</Text>
                    </View>
                    <View style={styles.briefingRow}>
                      <Text style={styles.briefingLabel}>{item.checkIn.moodEmoji} 心情</Text>
                      <Text style={styles.briefingValue}>{item.checkIn.moodScore}/10</Text>
                    </View>
                    <View style={styles.briefingRow}>
                      <Text style={styles.briefingLabel}>💊 用药</Text>
                      <Text style={styles.briefingValue}>
                        {item.checkIn.medicationTaken ? '✅ 按时' : '⚠️ 未服'}
                      </Text>
                    </View>
                    <View style={styles.briefingRow}>
                      <Text style={styles.briefingLabel}>⭐ 护理指数</Text>
                      <Text style={[styles.briefingValue, { color: '#FF6B6B', fontWeight: '700' }]}>
                        {item.checkIn.careScore}分
                      </Text>
                    </View>
                  </View>
                ) : (
                  item.date === new Date().toISOString().split('T')[0] ? (
                    <View style={styles.briefingEmpty}>
                      <Text style={styles.emptyEmoji}>📝</Text>
                      <Text style={styles.emptyText}>今日尚未打卡</Text>
                      <Text style={styles.emptySubText}>完成今日打卡后，简报将自动生成</Text>
                      <TouchableOpacity style={styles.goCheckinBtn} onPress={() => router.push('/(tabs)/checkin')}>
                        <Text style={styles.goCheckinBtnText}>去打卡 →</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.briefingEmpty}>
                      <Text style={styles.emptyEmoji}>📅</Text>
                      <Text style={styles.emptyText}>该日无打卡记录</Text>
                    </View>
                  )
                )}

                {item.diary && (
                  <View style={[styles.briefingPreview, { marginTop: 8 }]}>
                    <View style={styles.briefingDiaryRow}>
                      <Text style={styles.briefingLabel}>📔 日记</Text>
                      <Text style={styles.briefingDiaryText} numberOfLines={3}>
                        {item.diary.moodEmoji} {item.diary.content || '无详细内容'}
                      </Text>
                    </View>
                  </View>
                )}

                {item.announcements.length > 0 && (
                  <View style={[styles.briefingPreview, { marginTop: 8 }]}>
                    <View style={styles.briefingDiaryRow}>
                      <Text style={styles.briefingLabel}>📢 家庭公告</Text>
                      <Text style={styles.briefingDiaryText} numberOfLines={3}>
                        {item.announcements.map((ann: any) => `${ann.authorEmoji} ${ann.content}`).join('\n')}
                      </Text>
                    </View>
                  </View>
                )}

                <View style={styles.briefingActions}>
                  <TouchableOpacity style={styles.exportBtn} onPress={() => router.push('/export-image')}>
                    <Text style={styles.exportBtnText}>📸 查看简报</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.shareBtn, isGeneratingShare && { opacity: 0.6 }]} onPress={handleShareBriefing} disabled={isGeneratingShare}>
                    <Text style={styles.shareBtnText}>{isGeneratingShare ? '⏳ 生成中...' : '📤 一键分享'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Compose button (broadcast section only) */}
      {activeSection === 'broadcast' && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 90 }]}
          onPress={() => setShowCompose(true)}
        >
          <Text style={styles.fabText}>📢 发布公告</Text>
        </TouchableOpacity>
      )}

      {/* Compose Modal */}
      <Modal visible={showCompose} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCompose(false)}>
        <View style={styles.modal}>
          {/* Cancel button top-left */}
          <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowCompose(false)}>
            <Text style={styles.modalCancel}>取消</Text>
          </TouchableOpacity>

          {/* Author info — centered */}
          <View style={styles.composeAuthorCenter}>
            <View style={[styles.composeAvatarLarge, { backgroundColor: currentMember.color + '20', borderColor: currentMember.color }]}>
              <Text style={styles.composeAvatarLargeText}>{currentMember.emoji}</Text>
            </View>
            <Text style={styles.composeAuthorName}>{currentMember.name}</Text>
            <Text style={styles.composeAuthorRole}>{currentMember.roleLabel}</Text>
          </View>

          {/* Type selector — centered */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll} contentContainerStyle={styles.typeScrollContentCenter}>
            {ANNOUNCEMENT_TYPES.map(t => (
              <TouchableOpacity
                key={t.type}
                style={[styles.typeChip, composeType === t.type && { backgroundColor: t.color + '20', borderColor: t.color }]}
                onPress={() => setComposeType(t.type)}
              >
                <Text style={styles.typeChipEmoji}>{t.emoji}</Text>
                <Text style={[styles.typeChipLabel, composeType === t.type && { color: t.color, fontWeight: '700' }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Text input — full width with blue border */}
          <TextInput
            style={styles.composeInput}
            placeholder="分享今天的家庭动态、探望消息、医疗信息..."
            value={composeText}
            onChangeText={setComposeText}
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            placeholderTextColor="#9BA1A6"
            autoFocus
          />

          {/* Emoji decoration */}
          <View style={styles.emojiDecRow}>
            {['🌸', '❤️', '🎉', '🙏', '💪', '🌟', '🍀', '🌈'].map(e => (
              <TouchableOpacity
                key={e}
                style={[styles.emojiDecBtn, composeEmoji === e && styles.emojiDecBtnSelected]}
                onPress={() => setComposeEmoji(composeEmoji === e ? '' : e)}
              >
                <Text style={styles.emojiDecText}>{e}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Publish button -- bottom of modal */}
          <TouchableOpacity
            style={[styles.modalPublishBtn, !composeText.trim() && { opacity: 0.4 }]}
            onPress={handlePostAnnouncement}
            disabled={!composeText.trim()}
            activeOpacity={0.85}
          >
            <Text style={styles.modalPublishBtnText}>📢 发布公告</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Hidden briefing card for screenshot capture */}
      {(() => {
        const selectedItem = briefingHistory.find(item => item.date === selectedBriefingDate);
        if (!selectedItem) return null;
        const profile = briefingData?.profile;
        const dateLabel = new Date(selectedItem.date).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        return (
          <View
            ref={briefingCardRef}
            collapsable={false}
            style={{
              position: 'absolute',
              left: -9999,
              top: 0,
              width: 375,
              backgroundColor: '#FFF8F5',
              padding: 24,
            }}
          >
            {/* Header */}
            <View style={{ backgroundColor: '#FF6B6B', borderRadius: 20, padding: 20, marginBottom: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#fff', marginBottom: 4 }}>🐴 小马虎 · 护理简报</Text>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{dateLabel}</Text>
              {profile && (
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
                  {profile.nickname || profile.name || '家人'} 的护理记录
                </Text>
              )}
            </View>

            {/* Check-in data */}
            {selectedItem.checkIn ? (
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#FFE4E1' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 12 }}>📋 今日打卡</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 140, backgroundColor: '#FFF5F5', borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>💤 睡眠</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#333' }}>{selectedItem.checkIn.sleepHours} 小时</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 140, backgroundColor: '#FFF5F5', borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>{selectedItem.checkIn.moodEmoji} 心情</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#333' }}>{selectedItem.checkIn.moodScore} / 10</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 140, backgroundColor: '#FFF5F5', borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>💊 用药</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: selectedItem.checkIn.medicationTaken ? '#16A34A' : '#DC2626' }}>
                      {selectedItem.checkIn.medicationTaken ? '✅ 按时' : '⚠️ 未服'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 140, backgroundColor: '#FFF5F5', borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>⭐ 护理指数</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#FF6B6B' }}>{selectedItem.checkIn.careScore} 分</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: '#999' }}>📝 当日暂无打卡记录</Text>
              </View>
            )}

            {/* Diary */}
            {selectedItem.diary && (
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E0E7FF' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 8 }}>📔 护理日记</Text>
                <Text style={{ fontSize: 13, color: '#555', lineHeight: 20 }}>
                  {selectedItem.diary.moodEmoji ? selectedItem.diary.moodEmoji + ' ' : ''}{selectedItem.diary.content || '无内容'}
                </Text>
              </View>
            )}

            {/* Announcements */}
            {selectedItem.announcements.length > 0 && (
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#D1FAE5' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 8 }}>📢 家庭公告</Text>
                {selectedItem.announcements.map((ann: any, idx: number) => (
                  <View key={idx} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 14 }}>{ann.authorEmoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>{ann.authorName}</Text>
                      <Text style={{ fontSize: 13, color: '#333' }}>{ann.content}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Footer */}
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <Text style={{ fontSize: 12, color: '#ccc' }}>💕 由小马虎护理助手生成</Text>
            </View>
          </View>
        );
      })()}
    </Animated.View>
  );
}

// ─── Announcement Card ────────────────────────────────────────────────────────

function AnnouncementCard({
  ann, typeInfo, isOwn, onDelete, isNew,
}: {
  ann: FamilyAnnouncement;
  typeInfo: typeof ANNOUNCEMENT_TYPES[0];
  isOwn: boolean;
  onDelete: () => void;
  isNew?: boolean;
}) {
  const time = new Date(ann.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const date = ann.date !== new Date().toISOString().split('T')[0]
    ? new Date(ann.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' '
    : '';

  return (
    <View style={[card.container, isNew && card.containerNew]}>
      <View style={[card.typeBadge, { backgroundColor: typeInfo.color + '20' }]}>
        <Text style={card.typeEmoji}>{typeInfo.emoji}</Text>
      </View>
      <View style={card.body}>
        <View style={card.authorRow}>
          <Text style={card.authorEmoji}>{ann.authorEmoji}</Text>
          <Text style={[card.authorName, { color: ann.authorColor }]}>{ann.authorName}</Text>
          <Text style={card.roleLabel}>{typeInfo.label}</Text>
          <Text style={card.time}>{date}{time}</Text>
        </View>
        <Text style={card.content}>
          {ann.emoji ? ann.emoji + ' ' : ''}{ann.content}
        </Text>
      </View>
      {isOwn && (
        <TouchableOpacity onPress={onDelete} style={card.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={card.deleteText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFCF8' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 18, color: '#687076' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingBottom: 12,
    backgroundColor: '#FFFCF8',
  },
  headerLeft: {},
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#11181C' },
  headerSub: { fontSize: 13, color: '#687076', marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  roomCodeBadge: {
    backgroundColor: '#F0FDF4', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#4ADE80',
  },
  roomCodeText: { fontSize: 13, fontWeight: '700', color: '#16A34A' },
  membersScroll: { maxHeight: 90 },
  membersContent: { paddingHorizontal: 20, gap: 12, paddingVertical: 8 },
  memberChip: { alignItems: 'center', gap: 4, width: 56 },
  memberAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2, overflow: 'hidden', position: 'relative' },
  memberAvatarText: { fontSize: 26 },
  memberAvatarImg: { width: 52, height: 52, borderRadius: 26 },
  memberAvatarEdit: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 2, alignItems: 'center',
  },
  memberName: { fontSize: 11, fontWeight: '600', color: '#11181C', textAlign: 'center' },
  memberRole: { fontSize: 10, color: '#687076', textAlign: 'center' },
  addMemberChip: { alignItems: 'center', gap: 4, width: 56 },
  addMemberBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F8F9FA', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed' },
  addMemberBtnText: { fontSize: 20, color: '#9BA1A6' },
  sectionTabs: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 8, backgroundColor: '#F8F9FA', borderRadius: 16, padding: 4 },
  sectionTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
  sectionTabActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  sectionTabText: { fontSize: 13, fontWeight: '600', color: '#9BA1A6' },
  sectionTabTextActive: { color: '#11181C' },
  content: { flex: 1 },
  section: { paddingHorizontal: 20, paddingTop: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#11181C' },
  sectionCount: { fontSize: 13, color: '#687076', backgroundColor: '#F8F9FA', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  emptyCard: { alignItems: 'center', padding: 32, backgroundColor: '#F8F9FA', borderRadius: 20, gap: 8 },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#11181C' },
  emptySubText: { fontSize: 13, color: '#687076', textAlign: 'center' },
  // Briefing
  briefingCard: { backgroundColor: '#fff', borderRadius: 24, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  briefingTitle: { fontSize: 18, fontWeight: '800', color: '#11181C', marginBottom: 4 },
  briefingSubtitle: { fontSize: 13, color: '#687076', lineHeight: 20, marginBottom: 16 },
  briefingPreview: { backgroundColor: '#FFFCF8', borderRadius: 16, padding: 16, gap: 10, marginBottom: 16 },
  briefingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  briefingLabel: { fontSize: 14, color: '#687076' },
  briefingValue: { fontSize: 14, fontWeight: '600', color: '#11181C' },
  briefingDiaryRow: { gap: 4 },
  briefingDiaryText: { fontSize: 13, color: '#687076', lineHeight: 20 },
  briefingEmpty: { alignItems: 'center', padding: 24, gap: 8 },
  briefingActions: { flexDirection: 'row', gap: 12 },
  shareBtn: { flex: 1, backgroundColor: '#07C160', borderRadius: 16, padding: 14, alignItems: 'center' },
  shareBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  exportBtn: { flex: 1, backgroundColor: '#F8F9FA', borderRadius: 16, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB' },
  exportBtnText: { fontSize: 14, fontWeight: '700', color: '#11181C' },
  goCheckinBtn: { backgroundColor: '#FF6B6B', borderRadius: 14, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  goCheckinBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  // FAB
  fab: { position: 'absolute', left: 20, right: 20, backgroundColor: '#FF6B6B', borderRadius: 20, padding: 16, alignItems: 'center', shadowColor: '#FF6B6B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  fabText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  // Modal
  modal: { flex: 1, backgroundColor: '#FFFCF8', paddingHorizontal: 20, paddingTop: 16 },
  modalCancelBtn: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 12, marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalCancel: { fontSize: 16, color: '#687076' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#11181C' },
  modalPost: { fontSize: 16, fontWeight: '700', color: '#FF6B6B' },
  // Centered author
  composeAuthorCenter: { alignItems: 'center', gap: 4, marginBottom: 20 },
  composeAvatarLarge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, marginBottom: 4 },
  composeAvatarLargeText: { fontSize: 32 },
  composeAuthor: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  composeAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  composeAvatarText: { fontSize: 22 },
  composeAuthorName: { fontSize: 16, fontWeight: '700', color: '#11181C' },
  composeAuthorRole: { fontSize: 13, color: '#687076' },
  typeScroll: { maxHeight: 52, marginBottom: 16 },
  typeScrollContent: { gap: 8, paddingRight: 8 },
  typeScrollContentCenter: { gap: 8, paddingHorizontal: 4 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F8F9FA', borderWidth: 1.5, borderColor: '#E5E7EB' },
  typeChipEmoji: { fontSize: 16 },
  typeChipLabel: { fontSize: 13, fontWeight: '600', color: '#687076' },
  composeInput: { backgroundColor: '#fff', borderRadius: 16, padding: 16, fontSize: 16, color: '#11181C', minHeight: 120, borderWidth: 2, borderColor: '#60A5FA', marginBottom: 16 },
  emojiDecRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  emojiDecBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F8F9FA', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#E5E7EB' },
  emojiDecBtnSelected: { borderColor: '#FF6B6B', backgroundColor: '#FFF0F0' },
  emojiDecText: { fontSize: 22 },
  // Modal publish button (bottom)
  modalPublishBtn: {
    backgroundColor: '#FF6B6B', borderRadius: 20, padding: 16,
    alignItems: 'center', marginTop: 20,
    shadowColor: '#FF6B6B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  modalPublishBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  // Briefing date tabs
  briefingDateScroll: { marginBottom: 12 },
  briefingDateScrollContent: { gap: 8, paddingHorizontal: 0 },
  briefingDateTab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F8F9FA', borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  briefingDateTabActive: { backgroundColor: '#FF6B6B', borderColor: '#FF6B6B' },
  briefingDateTabText: { fontSize: 13, fontWeight: '600', color: '#687076' },
  briefingDateTabTextActive: { color: '#fff' },
});

const card = StyleSheet.create({
  container: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 20, padding: 14, marginBottom: 10, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  containerNew: { borderWidth: 2, borderColor: '#FF6B6B', backgroundColor: '#FFF8F8' },
  typeBadge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  typeEmoji: { fontSize: 20 },
  body: { flex: 1 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  authorEmoji: { fontSize: 16 },
  authorName: { fontSize: 13, fontWeight: '700' },
  roleLabel: { fontSize: 11, color: '#9BA1A6', backgroundColor: '#F8F9FA', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  time: { fontSize: 11, color: '#9BA1A6', marginLeft: 'auto' },
  content: { fontSize: 15, color: '#11181C', lineHeight: 22 },
  deleteBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFF0F0', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  deleteText: { fontSize: 11, color: '#FF6B6B', fontWeight: '700' },
});

const setup = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  formContainer: { padding: 24, paddingBottom: 40 },
  emoji: { fontSize: 64, marginBottom: 16, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: '#11181C', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#687076', textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  primaryBtn: { width: '100%', backgroundColor: '#FF6B6B', borderRadius: 20, padding: 16, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondaryBtn: { width: '100%', backgroundColor: '#F8F9FA', borderRadius: 20, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB' },
  secondaryBtnText: { fontSize: 16, fontWeight: '600', color: '#687076' },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#687076', marginBottom: 8 },
  input: { backgroundColor: '#F8F9FA', borderRadius: 16, padding: 16, fontSize: 16, color: '#11181C', borderWidth: 1.5, borderColor: '#E5E7EB' },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#F8F9FA', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#E5E7EB' },
  emojiBtnText: { fontSize: 24 },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorBtn: { width: 36, height: 36, borderRadius: 18 },
  colorBtnSelected: { borderWidth: 3, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleBtn: { flex: 1, paddingVertical: 10, borderRadius: 14, backgroundColor: '#F8F9FA', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB' },
  roleBtnText: { fontSize: 13, color: '#687076' },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 20, backgroundColor: '#F8F9FA', alignItems: 'center' },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: '#687076' },
  disabledBtn: { opacity: 0.5 },
});
