import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Animated, Platform, Alert, Share, Modal, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  getFamilyRoom, getFamilyAnnouncements, saveFamilyAnnouncement,
  deleteFamilyAnnouncement, getCurrentMember, createFamilyRoom,
  joinFamilyRoom, setCurrentMember, getTodayCheckIn, getYesterdayCheckIn,
  getAllCheckIns, getDiaryEntries,
  getProfile, FamilyAnnouncement, AnnouncementReaction, FamilyMember, FamilyRoom, DailyCheckIn,
  updateFamilyMemberPhoto, getCurrentUserIsCreator, toggleAnnouncementReaction,
} from '@/lib/storage';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/lib/animations';
import { AppColors, Gradients, Shadows } from '@/lib/design-tokens';
import { PageHeader, PAGE_THEMES } from '@/components/page-header';
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
const MEMBER_COLORS = [AppColors.coral.primary, '#4ADE80', '#60A5FA', '#FBBF24', AppColors.purple.primary, '#F472B6', '#34D399', '#FB923C'];
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
  const [memberColor, setMemberColor] = useState(AppColors.coral.primary);
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
      await createFamilyRoom(profile?.name || '家人', {
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
            placeholderTextColor={AppColors.text.tertiary}
          />
        </View>
      )}

      <View style={setup.inputGroup}>
        <Text style={setup.label}>您的名字</Text>
        <TextInput
          style={setup.input}
          placeholder="如：小红、大明..."
          value={memberName}
          onChangeText={setMemberName}
          placeholderTextColor={AppColors.text.tertiary}
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
  const [briefingHistory, setBriefingHistory] = useState<{ date: string; label: string; checkIn: DailyCheckIn | null; diary: any; announcements: any[] }[]>([]);
  const [elderNickname, setElderNickname] = useState('家人');
  const [elderEmoji, setElderEmoji] = useState('🐯');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const fabBreath = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<any>(null);
  const [newAnnouncementId, setNewAnnouncementId] = useState<string | null>(null);
  const briefingCardRef = useRef<View>(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [isCreator, setIsCreator] = useState(true);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fabBreath, { toValue: 1.07, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(fabBreath, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  async function loadData() {
    setLoading(true);
    const [r, m, a, creatorFlag] = await Promise.all([
      getFamilyRoom(),
      getCurrentMember(),
      getFamilyAnnouncements(),
      getCurrentUserIsCreator(),
    ]);
    setRoom(r);
    setCurrentMemberState(m);
    setAnnouncements(a);
    setIsCreator(creatorFlag);

    // Load briefing data
    const [todayCheckIn, allCheckIns, diaryEntries, profile] = await Promise.all([
      getTodayCheckIn(),
      getAllCheckIns(),
      getDiaryEntries(),
      getProfile(),
    ]);
    const todayStr = new Date().toISOString().split('T')[0];
    setBriefingData({ checkIn: todayCheckIn, profile, todayAnnouncements: a.filter(ann => ann.date === todayStr) });
    setElderNickname(profile?.nickname || profile?.name || '家人');
    setElderEmoji(profile?.zodiacEmoji || '🐯');

    // Build briefing history (today + past 6 days) — use actual check-in data for each day
    const checkInMap = new Map<string, DailyCheckIn>();
    for (const ci of allCheckIns) { checkInMap.set(ci.date, ci); }

    const history: { date: string; label: string; checkIn: DailyCheckIn | null; diary: any; announcements: any[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const label = i === 0 ? '今日' : i === 1 ? '昨日' : d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
      const dayCheckIn = checkInMap.get(dateKey) || null;
      const dayDiary = diaryEntries.find(e => e.date === dateKey);
      const dayAnnouncements = a.filter(ann => ann.date === dateKey);
      if (dayCheckIn || dayDiary || dayAnnouncements.length > 0 || i === 0) {
        history.push({ date: dateKey, label, checkIn: dayCheckIn, diary: dayDiary, announcements: dayAnnouncements });
      }
    }
    setBriefingHistory(history);

    // Auto-select the most recent day with data
    const latestWithData = history.find(item => item.checkIn);
    if (latestWithData) setSelectedBriefingDate(latestWithData.date);

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

      {/* ── Header (与用药记录/日记保持一致风格) ── */}
      <View style={[styles.pageHeaderWrap, { paddingTop: insets.top + 8 }]}>
        <PageHeader
          theme={PAGE_THEMES.family}
          subtitle={`${room.elderName} 的家庭空间`}
          right={
            <TouchableOpacity onPress={() => setShowInviteModal(true)} activeOpacity={0.8} style={styles.heroCodeWrap}>
              <Text style={styles.heroCodeLabel}>邀请码</Text>
              <View style={styles.heroCodePill}>
                <Text style={styles.heroCodeIcon}>🔗</Text>
                <Text style={styles.heroCodeText}>{room.roomCode}</Text>
              </View>
            </TouchableOpacity>
          }
        />
      </View>

      {/* ── Members row ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.membersScroll} contentContainerStyle={styles.membersContent}>
        {room.members.map(m => (
          <TouchableOpacity
            key={m.id}
            style={styles.memberChip}
            onPress={async () => {
              if (!currentMember || currentMember.id !== m.id) return;
              const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (status !== 'granted') { Alert.alert('需要权限', '请允许访问相册以上传头像'); return; }
              const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.8 });
              if (!result.canceled && result.assets[0]) { await updateFamilyMemberPhoto(m.id, result.assets[0].uri); loadData(); }
            }}
            activeOpacity={currentMember?.id === m.id ? 0.7 : 1}
          >
            <View style={[styles.memberAvatar, { backgroundColor: m.color + '22', borderColor: m.color + '99' }]}>
              {m.photoUri ? (
                <Image source={{ uri: m.photoUri }} style={styles.memberAvatarImg} />
              ) : (
                <Text style={styles.memberAvatarText}>{m.emoji}</Text>
              )}
              {currentMember?.id === m.id && (
                <View style={styles.memberAvatarEdit}>
                  <Text style={{ fontSize: 8, color: AppColors.surface.whiteStrong }}>编辑</Text>
                </View>
              )}
            </View>
            <Text style={styles.memberName}>{m.name}</Text>
            <Text style={styles.memberRole}>{m.roleLabel}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.addMemberChip} onPress={() => setShowInviteModal(true)}>
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
          activeOpacity={0.85}
        >
          {activeSection === 'broadcast' ? (
            <LinearGradient colors={[Gradients.purple[0], Gradients.purple[1], AppColors.purple.strong]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sectionTabGradient}>
              <Text style={styles.sectionTabTextActive}>📢 公告</Text>
            </LinearGradient>
          ) : (
            <Text style={styles.sectionTabText}>📢 公告</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sectionTab, activeSection === 'briefing' && styles.sectionTabActive]}
          onPress={() => setActiveSection('briefing')}
          activeOpacity={0.85}
        >
          {activeSection === 'briefing' ? (
            <LinearGradient colors={[Gradients.purple[0], Gradients.purple[1], AppColors.purple.strong]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.sectionTabGradient}>
              <Text style={styles.sectionTabTextActive}>📋 简报</Text>
            </LinearGradient>
          ) : (
            <Text style={styles.sectionTabText}>📋 简报</Text>
          )}
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
                  currentMember={currentMember}
                  onReactionToggle={async (emoji) => {
                    await toggleAnnouncementReaction(ann.id, emoji, {
                      memberId: currentMember.id,
                      memberName: currentMember.name,
                      memberEmoji: currentMember.emoji,
                    });
                    await loadData();
                  }}
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
                    currentMember={currentMember}
                    onReactionToggle={async (emoji) => {
                      await toggleAnnouncementReaction(ann.id, emoji, {
                        memberId: currentMember.id,
                        memberName: currentMember.name,
                        memberEmoji: currentMember.emoji,
                      });
                      await loadData();
                    }}
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
            {briefingHistory.filter(item => item.date === selectedBriefingDate).map(item => {
              const todayStr = new Date().toISOString().split('T')[0];
              const isToday = item.date === todayStr;
              const score = item.checkIn?.careScore ?? 0;
              const scoreColor = score >= 80 ? '#16A34A' : score >= 60 ? '#3B82F6' : score >= 40 ? '#F59E0B' : '#EF4444';
              const scoreBg = score >= 80 ? '#F0FDF4' : score >= 60 ? '#EFF6FF' : score >= 40 ? '#FFFBEB' : '#FEF2F2';
              const scoreLabel = score >= 80 ? '状态极佳' : score >= 60 ? '状态良好' : score >= 40 ? '需要关注' : '需要照顾';
              return (
              <View key={item.date} style={styles.briefingCard}>
                {/* ── Card Header ── */}
                <View style={styles.briefingCardHeader}>
                  <View>
                    <Text style={styles.briefingAppName}>🐴🐯 小马虎 · 护理简报</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Text style={styles.briefingCardDate}>
                        {isToday
                          ? new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
                          : item.date}
                      </Text>
                      {!isToday && (
                        <View style={styles.latestBadge}>
                          <Text style={styles.latestBadgeText}>最新记录</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={{ fontSize: 32 }}>{elderEmoji}</Text>
                </View>

                {item.checkIn ? (
                  <>
                    {/* ── Elder + Score ── */}
                    <View style={styles.briefingElderRow}>
                      <View>
                        <Text style={styles.briefingElderName}>{elderNickname}</Text>
                        <Text style={styles.briefingElderSub}>{item.label}护理记录</Text>
                      </View>
                      <View style={[styles.scoreCircle, { borderColor: scoreColor, backgroundColor: scoreBg }]}>
                        <Text style={[styles.scoreNum, { color: scoreColor }]}>{score}</Text>
                        <Text style={[styles.scoreUnit, { color: scoreColor }]}>分</Text>
                        <Text style={[styles.scoreLabel, { color: scoreColor }]}>{scoreLabel}</Text>
                      </View>
                    </View>

                    {/* ── Data Grid ── */}
                    <View style={styles.briefingDataGrid}>
                      <View style={styles.briefingDataBadge}>
                        <Text style={styles.briefingDataEmoji}>😴</Text>
                        <Text style={styles.briefingDataValue}>{item.checkIn.sleepHours}h</Text>
                        <Text style={styles.briefingDataLabel}>睡眠</Text>
                      </View>
                      <View style={styles.briefingDataBadge}>
                        <Text style={styles.briefingDataEmoji}>{item.checkIn.moodEmoji || '😊'}</Text>
                        <Text style={styles.briefingDataValue}>{item.checkIn.moodScore}/10</Text>
                        <Text style={styles.briefingDataLabel}>心情</Text>
                      </View>
                      <View style={styles.briefingDataBadge}>
                        <Text style={styles.briefingDataEmoji}>💊</Text>
                        <Text style={styles.briefingDataValue}>{item.checkIn.medicationTaken ? '✅' : '❌'}</Text>
                        <Text style={styles.briefingDataLabel}>用药</Text>
                      </View>
                      <View style={styles.briefingDataBadge}>
                        <Text style={styles.briefingDataEmoji}>🍽️</Text>
                        <Text style={styles.briefingDataValue} numberOfLines={1}>{item.checkIn.mealNotes ? item.checkIn.mealNotes.slice(0,4) : '已记'}</Text>
                        <Text style={styles.briefingDataLabel}>饮食</Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.briefingEmpty}>
                    <Text style={styles.emptyEmoji}>📝</Text>
                    <Text style={styles.emptyText}>{isToday ? '今日尚未打卡' : '该日无打卡记录'}</Text>
                    {isToday && (
                      <>
                        <Text style={styles.emptySubText}>完成今日打卡后，简报将自动生成</Text>
                        <TouchableOpacity style={styles.goCheckinBtn} onPress={() => router.push('/(tabs)/checkin')}>
                          <Text style={styles.goCheckinBtnText}>去打卡 →</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}

                {/* ── Diary & Announcements ── */}
                {item.diary && (
                  <View style={styles.briefingExtraRow}>
                    <Text style={styles.briefingExtraIcon}>📔</Text>
                    <Text style={styles.briefingExtraText} numberOfLines={2}>
                      {item.diary.moodEmoji} {item.diary.content || '无详细内容'}
                    </Text>
                  </View>
                )}
                {item.announcements.length > 0 && (
                  <View style={styles.briefingExtraRow}>
                    <Text style={styles.briefingExtraIcon}>📢</Text>
                    <Text style={styles.briefingExtraText} numberOfLines={2}>
                      {item.announcements.map((ann: any) => `${ann.authorEmoji} ${ann.content}`).join('  ')}
                    </Text>
                  </View>
                )}

                {/* ── Footer ── */}
                <View style={styles.briefingCardFooter}>
                  <Text style={styles.briefingFooterLeft}>记录人：{briefingData?.profile?.caregiverName || '照顾者'}</Text>
                  <Text style={styles.briefingFooterRight}>✨ 小马虎</Text>
                </View>

                {/* ── Actions ── */}
                <View style={styles.briefingActions}>
                  <TouchableOpacity style={styles.exportBtn} onPress={() => router.push('/share' as any)}>
                    <Text style={styles.exportBtnText}>📋 查看简报</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.shareBtn, isGeneratingShare && { opacity: 0.6 }]} onPress={handleShareBriefing} disabled={isGeneratingShare}>
                    <Text style={styles.shareBtnText}>{isGeneratingShare ? '⏳ 生成中...' : '📤 一键分享'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Compose FAB — round circle, bottom-right, anyone can post */}
      {activeSection === 'broadcast' && (
        <Animated.View style={[styles.fabWrap, { bottom: insets.bottom + 90, transform: [{ scale: fabBreath }] }]}>
          <TouchableOpacity
            style={styles.fabBtn}
            onPress={() => setShowCompose(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.fabIcon}>📢</Text>
          </TouchableOpacity>
        </Animated.View>
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
            placeholderTextColor={AppColors.text.tertiary}
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
              backgroundColor: AppColors.bg.warmCream,
              padding: 24,
            }}
          >
            {/* Header */}
            <View style={{ backgroundColor: AppColors.coral.primary, borderRadius: 20, padding: 20, marginBottom: 16, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: AppColors.surface.whiteStrong, marginBottom: 4 }}>🐴 小马虎 · 护理简报</Text>
              <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>{dateLabel}</Text>
              {profile && (
                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
                  {profile.nickname || profile.name || '家人'} 的护理记录
                </Text>
              )}
            </View>

            {/* Check-in data */}
            {selectedItem.checkIn ? (
              <View style={{ backgroundColor: AppColors.surface.whiteStrong, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: AppColors.coral.soft }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: AppColors.text.primary, marginBottom: 12 }}>📋 今日打卡</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 140, backgroundColor: AppColors.coral.soft, borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontSize: 12, color: AppColors.text.tertiary, marginBottom: 2 }}>💤 睡眠</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: AppColors.text.primary }}>{selectedItem.checkIn.sleepHours} 小时</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 140, backgroundColor: AppColors.coral.soft, borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontSize: 12, color: AppColors.text.tertiary, marginBottom: 2 }}>{selectedItem.checkIn.moodEmoji} 心情</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: AppColors.text.primary }}>{selectedItem.checkIn.moodScore} / 10</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 140, backgroundColor: AppColors.coral.soft, borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontSize: 12, color: AppColors.text.tertiary, marginBottom: 2 }}>💊 用药</Text>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: selectedItem.checkIn.medicationTaken ? '#16A34A' : '#DC2626' }}>
                      {selectedItem.checkIn.medicationTaken ? '✅ 按时' : '⚠️ 未服'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 140, backgroundColor: AppColors.coral.soft, borderRadius: 12, padding: 12 }}>
                    <Text style={{ fontSize: 12, color: AppColors.text.tertiary, marginBottom: 2 }}>⭐ 护理指数</Text>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: AppColors.coral.primary }}>{selectedItem.checkIn.careScore} 分</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={{ backgroundColor: AppColors.surface.whiteStrong, borderRadius: 16, padding: 16, marginBottom: 12, alignItems: 'center' }}>
                <Text style={{ fontSize: 14, color: AppColors.text.tertiary }}>📝 当日暂无打卡记录</Text>
              </View>
            )}

            {/* Diary */}
            {selectedItem.diary && (
              <View style={{ backgroundColor: AppColors.surface.whiteStrong, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: AppColors.purple.soft }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: AppColors.text.primary, marginBottom: 8 }}>📔 护理日记</Text>
                <Text style={{ fontSize: 13, color: AppColors.text.secondary, lineHeight: 20 }}>
                  {selectedItem.diary.moodEmoji ? selectedItem.diary.moodEmoji + ' ' : ''}{selectedItem.diary.content || '无内容'}
                </Text>
              </View>
            )}

            {/* Announcements */}
            {selectedItem.announcements.length > 0 && (
              <View style={{ backgroundColor: AppColors.surface.whiteStrong, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: AppColors.green.soft }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: AppColors.text.primary, marginBottom: 8 }}>📢 家庭公告</Text>
                {selectedItem.announcements.map((ann: any, idx: number) => (
                  <View key={idx} style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 14 }}>{ann.authorEmoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: AppColors.text.tertiary, marginBottom: 2 }}>{ann.authorName}</Text>
                      <Text style={{ fontSize: 13, color: AppColors.text.primary }}>{ann.content}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Footer */}
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <Text style={{ fontSize: 12, color: AppColors.text.tertiary }}>💕 由小马虎护理助手生成</Text>
            </View>
          </View>
        );
      })()}

      {/* ── 邀请家人 Modal ── */}
      <Modal
        visible={showInviteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <TouchableOpacity
          style={styles.inviteOverlay}
          activeOpacity={1}
          onPress={() => setShowInviteModal(false)}
        >
          <View style={styles.inviteCard}>
            <Text style={styles.inviteTitle}>👨‍👩‍👧 邀请家人加入</Text>
            <Text style={styles.inviteDesc}>将下方邀请码分享给家人，让他们在小马虎里输入加入家庭空间</Text>
            <View style={styles.inviteCodeBox}>
              <Text style={styles.inviteCode}>{room.roomCode}</Text>
            </View>
            <Text style={styles.inviteHint}>家人打开小马虎 → 家庭共享 → 输入邀请码 → 加入</Text>
            <TouchableOpacity style={styles.inviteCloseBtn} onPress={() => setShowInviteModal(false)}>
              <Text style={styles.inviteCloseBtnText}>知道了</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </Animated.View>
  );
}

// ─── Announcement Card ────────────────────────────────────────────────────────

const REACTION_EMOJIS = ['👍', '❤️', '👏', '🙏', '😢', '✨'];

function AnnouncementCard({
  ann, typeInfo, isOwn, onDelete, isNew, currentMember, onReactionToggle,
}: {
  ann: FamilyAnnouncement;
  typeInfo: typeof ANNOUNCEMENT_TYPES[0];
  isOwn: boolean;
  onDelete: () => void;
  isNew?: boolean;
  currentMember?: FamilyMember;
  onReactionToggle?: (emoji: string) => Promise<void>;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [showReactorsFor, setShowReactorsFor] = useState<string | null>(null);

  const time = new Date(ann.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const date = ann.date !== new Date().toISOString().split('T')[0]
    ? new Date(ann.date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) + ' '
    : '';

  const reactions = ann.reactions ?? [];
  const myId = currentMember?.id ?? '';

  async function handleReact(emoji: string) {
    if (!onReactionToggle) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPicker(false);
    setShowReactorsFor(null);
    await onReactionToggle(emoji);
  }

  return (
    <View style={[card.container, isNew && card.containerNew]}>
      <View style={[card.colorStrip, { backgroundColor: typeInfo.color }]} />
      <View style={card.cardInner}>
        <View style={[card.typeBadge, { backgroundColor: typeInfo.color + '22' }]}>
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

          {/* ── Reactions row ── */}
          <View style={card.reactionsRow}>
            {reactions.map(r => {
              const iMine = r.members.some(m => m.memberId === myId);
              return (
                <TouchableOpacity
                  key={r.emoji}
                  style={[card.reactionPill, iMine && card.reactionPillMine]}
                  onPress={() => setShowReactorsFor(showReactorsFor === r.emoji ? null : r.emoji)}
                  activeOpacity={0.75}
                >
                  <Text style={card.reactionEmoji}>{r.emoji}</Text>
                  <Text style={[card.reactionCount, iMine && card.reactionCountMine]}>{r.members.length}</Text>
                </TouchableOpacity>
              );
            })}
            {/* "+ 反应" button */}
            <TouchableOpacity
              style={card.addReactionBtn}
              onPress={() => { setShowPicker(p => !p); setShowReactorsFor(null); }}
              activeOpacity={0.75}
            >
              <Text style={card.addReactionText}>{showPicker ? '✕' : '＋'}</Text>
            </TouchableOpacity>
          </View>

          {/* ── Emoji picker ── */}
          {showPicker && (
            <View style={card.pickerRow}>
              {REACTION_EMOJIS.map(e => {
                const alreadyMine = reactions.find(r => r.emoji === e)?.members.some(m => m.memberId === myId);
                return (
                  <TouchableOpacity
                    key={e}
                    style={[card.pickerBtn, alreadyMine && card.pickerBtnActive]}
                    onPress={() => handleReact(e)}
                    activeOpacity={0.7}
                  >
                    <Text style={card.pickerEmoji}>{e}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ── Reactors list (who reacted) ── */}
          {showReactorsFor && (() => {
            const group = reactions.find(r => r.emoji === showReactorsFor);
            if (!group) return null;
            return (
              <View style={card.reactorsList}>
                <Text style={card.reactorsTitle}>{group.emoji} 的成员</Text>
                {group.members.map(m => (
                  <View key={m.memberId} style={card.reactorRow}>
                    <Text style={card.reactorEmoji}>{m.memberEmoji}</Text>
                    <Text style={card.reactorName}>{m.memberName}</Text>
                    {m.memberId === myId && <Text style={card.reactorMe}>（我）</Text>}
                  </View>
                ))}
              </View>
            );
          })()}
        </View>
        {isOwn && (
          <TouchableOpacity onPress={onDelete} style={card.deleteBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={card.deleteText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F1F3' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 18, color: AppColors.text.secondary },

  // ── Header (与用药记录/日记保持一致) ──
  pageHeaderWrap: { paddingHorizontal: 20, paddingBottom: 4, backgroundColor: '#F7F1F3' },

  // ── 邀请码徽章 ──
  heroCodeWrap: { alignItems: 'flex-end', gap: 3 },
  heroCodeLabel: { fontSize: 10, fontWeight: '600', color: AppColors.purple.strong, opacity: 0.6, letterSpacing: 0.3 },
  heroCodePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: AppColors.purple.soft, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1.5, borderColor: AppColors.purple.primary + '60',
  },
  heroCodeIcon: { fontSize: 13 },
  heroCodeText: { fontSize: 14, fontWeight: '900', color: AppColors.purple.strong, letterSpacing: 1.5 },

  // ── Members ──
  membersScroll: { maxHeight: 116 },
  membersContent: { paddingHorizontal: 20, gap: 14, paddingVertical: 8 },
  memberChip: { alignItems: 'center', gap: 5, width: 62 },
  memberAvatar: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 2, overflow: 'hidden', position: 'relative' },
  memberAvatarText: { fontSize: 28 },
  memberAvatarImg: { width: 56, height: 56, borderRadius: 20 },
  memberAvatarEdit: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.42)', paddingVertical: 2, alignItems: 'center',
  },
  memberName: { fontSize: 11, fontWeight: '700', color: AppColors.text.primary, textAlign: 'center' },
  memberRole: { fontSize: 10, color: AppColors.purple.primary, textAlign: 'center', fontWeight: '600', opacity: 0.8 },
  addMemberChip: { alignItems: 'center', gap: 5, width: 62 },
  addMemberBtn: {
    width: 56, height: 56, borderRadius: 20,
    backgroundColor: AppColors.purple.soft,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: AppColors.purple.primary, borderStyle: 'dashed',
  },
  addMemberBtnText: { fontSize: 22, color: AppColors.purple.strong },

  sectionTabs: { flexDirection: 'row', marginHorizontal: 20, marginBottom: 10, backgroundColor: AppColors.purple.soft, borderRadius: 18, padding: 5, gap: 4 },
  sectionTab: { flex: 1, alignItems: 'center', borderRadius: 14, overflow: 'hidden' },
  sectionTabActive: {},
  sectionTabGradient: { width: '100%', paddingVertical: 11, alignItems: 'center', borderRadius: 14 },
  sectionTabText: { fontSize: 14, fontWeight: '600', color: AppColors.purple.strong, paddingVertical: 11 },
  sectionTabTextActive: { fontSize: 14, fontWeight: '700', color: AppColors.surface.whiteStrong },
  content: { flex: 1 },
  section: { paddingHorizontal: 20, paddingTop: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: AppColors.text.primary },
  sectionCount: { fontSize: 13, color: AppColors.text.secondary, backgroundColor: AppColors.bg.secondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  emptyCard: { alignItems: 'center', padding: 36, backgroundColor: AppColors.purple.soft, borderRadius: 24, gap: 8, borderWidth: 1.5, borderColor: AppColors.purple.primary },
  emptyEmoji: { fontSize: 44 },
  emptyText: { fontSize: 16, fontWeight: '800', color: AppColors.purple.strong },
  emptySubText: { fontSize: 13, color: AppColors.purple.primary, textAlign: 'center', lineHeight: 20 },
  briefingCard: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 24, padding: 20, marginBottom: 16,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 5,
    borderWidth: 1, borderColor: AppColors.border.soft,
  },
  briefingCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  briefingAppName: { fontSize: 13, fontWeight: '800', color: AppColors.green.muted, letterSpacing: -0.2 },
  briefingCardDate: { fontSize: 12, color: AppColors.text.tertiary, marginTop: 2 },
  latestBadge: { backgroundColor: AppColors.peach.soft, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  latestBadgeText: { fontSize: 10, fontWeight: '700', color: AppColors.peach.primary },
  briefingElderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  briefingElderName: { fontSize: 18, fontWeight: '800', color: AppColors.text.primary },
  briefingElderSub: { fontSize: 12, color: AppColors.text.tertiary, marginTop: 2 },
  scoreCircle: {
    width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 3,
  },
  scoreNum: { fontSize: 22, fontWeight: '900' },
  scoreUnit: { fontSize: 10, fontWeight: '700', marginTop: -2 },
  scoreLabel: { fontSize: 9, fontWeight: '600', marginTop: 1 },
  briefingDataGrid: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  briefingDataBadge: { flex: 1, backgroundColor: AppColors.bg.secondary, borderRadius: 14, padding: 10, alignItems: 'center', gap: 3 },
  briefingDataEmoji: { fontSize: 18 },
  briefingDataValue: { fontSize: 12, fontWeight: '800', color: AppColors.text.primary },
  briefingDataLabel: { fontSize: 10, color: AppColors.text.tertiary, fontWeight: '500' },
  briefingExtraRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 8, borderTopWidth: 1, borderTopColor: AppColors.border.light },
  briefingExtraIcon: { fontSize: 14, marginTop: 1 },
  briefingExtraText: { flex: 1, fontSize: 13, color: AppColors.text.secondary, lineHeight: 20 },
  briefingCardFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: AppColors.bg.secondary, paddingTop: 12, marginTop: 12, marginBottom: 14 },
  briefingFooterLeft: { fontSize: 11, color: AppColors.text.tertiary },
  briefingFooterRight: { fontSize: 11, color: AppColors.green.muted, fontWeight: '600' },
  briefingTitle: { fontSize: 18, fontWeight: '800', color: AppColors.text.primary, marginBottom: 4 },
  briefingSubtitle: { fontSize: 13, color: AppColors.text.secondary, lineHeight: 20, marginBottom: 16 },
  briefingPreview: { backgroundColor: AppColors.bg.warmCream, borderRadius: 16, padding: 16, gap: 10, marginBottom: 16 },
  briefingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  briefingLabel: { fontSize: 14, color: AppColors.text.secondary },
  briefingValue: { fontSize: 14, fontWeight: '600', color: AppColors.text.primary },
  briefingDiaryRow: { gap: 4 },
  briefingDiaryText: { fontSize: 13, color: AppColors.text.secondary, lineHeight: 20 },
  briefingEmpty: { alignItems: 'center', padding: 24, gap: 8 },
  briefingActions: { flexDirection: 'row', gap: 12 },
  shareBtn: { flex: 1, backgroundColor: AppColors.purple.strong, borderRadius: 16, padding: 14, alignItems: 'center', shadowColor: AppColors.purple.strong, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  shareBtnText: { fontSize: 14, fontWeight: '700', color: AppColors.surface.whiteStrong },
  exportBtn: { flex: 1, backgroundColor: AppColors.purple.soft, borderRadius: 16, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: AppColors.purple.primary },
  exportBtnText: { fontSize: 14, fontWeight: '700', color: AppColors.purple.strong },
  goCheckinBtn: { backgroundColor: AppColors.purple.strong, borderRadius: 14, paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  goCheckinBtnText: { fontSize: 14, fontWeight: '700', color: AppColors.surface.whiteStrong },
  fabWrap: { position: 'absolute', right: 24 },
  fabBtn: {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: AppColors.purple.strong,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: AppColors.purple.strong, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  fabIcon: { fontSize: 26 },
  modal: { flex: 1, backgroundColor: AppColors.bg.warmCream, paddingHorizontal: 20, paddingTop: 16 },
  modalCancelBtn: { alignSelf: 'flex-start', paddingVertical: 4, paddingRight: 12, marginBottom: 8 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalCancel: { fontSize: 16, color: AppColors.text.secondary },
  modalTitle: { fontSize: 17, fontWeight: '700', color: AppColors.text.primary },
  modalPost: { fontSize: 16, fontWeight: '700', color: AppColors.coral.primary },
  composeAuthorCenter: { alignItems: 'center', gap: 4, marginBottom: 20 },
  composeAvatarLarge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, marginBottom: 4 },
  composeAvatarLargeText: { fontSize: 32 },
  composeAuthor: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  composeAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  composeAvatarText: { fontSize: 22 },
  composeAuthorName: { fontSize: 16, fontWeight: '700', color: AppColors.text.primary },
  composeAuthorRole: { fontSize: 13, color: AppColors.text.secondary },
  typeScroll: { maxHeight: 52, marginBottom: 16 },
  typeScrollContent: { gap: 8, paddingRight: 8 },
  typeScrollContentCenter: { gap: 8, paddingHorizontal: 4 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: AppColors.bg.secondary, borderWidth: 1.5, borderColor: AppColors.border.soft },
  typeChipEmoji: { fontSize: 16 },
  typeChipLabel: { fontSize: 13, fontWeight: '600', color: AppColors.text.secondary },
  composeInput: { backgroundColor: AppColors.surface.whiteStrong, borderRadius: 16, padding: 16, fontSize: 16, color: AppColors.text.primary, minHeight: 120, borderWidth: 2, borderColor: AppColors.purple.primary, marginBottom: 16 },
  emojiDecRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  emojiDecBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: AppColors.bg.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: AppColors.border.soft },
  emojiDecBtnSelected: { borderColor: AppColors.coral.primary, backgroundColor: AppColors.coral.soft },
  emojiDecText: { fontSize: 22 },
  modalPublishBtn: {
    backgroundColor: AppColors.coral.primary, borderRadius: 20, padding: 16,
    alignItems: 'center', marginTop: 20,
    shadowColor: AppColors.coral.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  modalPublishBtnText: { fontSize: 16, fontWeight: '700', color: AppColors.surface.whiteStrong },
  briefingDateScroll: { marginBottom: 12 },
  briefingDateScrollContent: { gap: 8, paddingHorizontal: 0 },
  briefingDateTab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: AppColors.bg.secondary, borderWidth: 1.5, borderColor: AppColors.border.soft,
  },
  briefingDateTabActive: { backgroundColor: AppColors.purple.strong, borderColor: AppColors.purple.strong },
  briefingDateTabText: { fontSize: 13, fontWeight: '600', color: AppColors.text.secondary },
  briefingDateTabTextActive: { color: AppColors.surface.whiteStrong },
  inviteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  inviteCard: { width: '100%', backgroundColor: AppColors.surface.whiteStrong, borderRadius: 24, padding: 28, alignItems: 'center', shadowColor: AppColors.shadow.dark, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 16 },
  inviteTitle: { fontSize: 18, fontWeight: '800', color: AppColors.text.primary, marginBottom: 10, textAlign: 'center' },
  inviteDesc: { fontSize: 13, color: AppColors.text.secondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  inviteCodeBox: { backgroundColor: AppColors.purple.soft, borderRadius: 16, borderWidth: 2, borderColor: AppColors.purple.primary, borderStyle: 'dashed', paddingHorizontal: 32, paddingVertical: 18, marginBottom: 16, alignItems: 'center' },
  inviteCode: { fontSize: 32, fontWeight: '900', color: AppColors.purple.strong, letterSpacing: 8 },
  inviteHint: { fontSize: 12, color: AppColors.text.tertiary, textAlign: 'center', marginBottom: 24, lineHeight: 18 },
  inviteCloseBtn: { backgroundColor: AppColors.purple.strong, borderRadius: 20, paddingHorizontal: 40, paddingVertical: 14, alignItems: 'center' },
  inviteCloseBtnText: { fontSize: 15, fontWeight: '700', color: AppColors.surface.whiteStrong },
});

const card = StyleSheet.create({
  container: { flexDirection: 'row', backgroundColor: AppColors.surface.whiteStrong, borderRadius: 20, marginBottom: 10, gap: 0, shadowColor: AppColors.purple.strong, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3, overflow: 'hidden' },
  containerNew: { borderWidth: 2, borderColor: AppColors.purple.primary, backgroundColor: AppColors.purple.soft },
  colorStrip: { width: 5, flexShrink: 0, borderTopLeftRadius: 20, borderBottomLeftRadius: 20 },
  cardInner: { flex: 1, flexDirection: 'row', padding: 14, gap: 12 },
  typeBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  typeEmoji: { fontSize: 20 },
  body: { flex: 1 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' },
  authorEmoji: { fontSize: 15 },
  authorName: { fontSize: 13, fontWeight: '700' },
  roleLabel: { fontSize: 10, color: AppColors.purple.strong, backgroundColor: AppColors.purple.soft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, fontWeight: '600' },
  time: { fontSize: 10, color: AppColors.text.tertiary, marginLeft: 'auto' },
  content: { fontSize: 15, color: AppColors.text.primary, lineHeight: 22, marginBottom: 8 },
  deleteBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: AppColors.coral.soft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  deleteText: { fontSize: 12, color: AppColors.coral.primary, fontWeight: '700' },

  // ── Reactions ──
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  reactionPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: AppColors.bg.secondary, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: AppColors.border.soft,
  },
  reactionPillMine: {
    backgroundColor: AppColors.purple.soft,
    borderColor: AppColors.purple.primary,
  },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 12, fontWeight: '700', color: AppColors.text.secondary },
  reactionCountMine: { color: AppColors.purple.strong },
  addReactionBtn: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
    backgroundColor: AppColors.bg.secondary,
    borderWidth: 1, borderColor: AppColors.border.soft,
    alignItems: 'center', justifyContent: 'center',
  },
  addReactionText: { fontSize: 14, color: AppColors.text.tertiary, fontWeight: '600' },
  pickerRow: {
    flexDirection: 'row', gap: 6, marginTop: 8,
    backgroundColor: AppColors.surface.whiteStrong,
    borderRadius: 16, padding: 8,
    borderWidth: 1, borderColor: AppColors.border.soft,
    flexWrap: 'wrap',
  },
  pickerBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: AppColors.bg.secondary,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  pickerBtnActive: { borderColor: AppColors.purple.primary, backgroundColor: AppColors.purple.soft },
  pickerEmoji: { fontSize: 20 },
  reactorsList: {
    marginTop: 8, backgroundColor: AppColors.bg.secondary,
    borderRadius: 12, padding: 10, gap: 6,
  },
  reactorsTitle: { fontSize: 11, fontWeight: '700', color: AppColors.text.tertiary, marginBottom: 2 },
  reactorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  reactorEmoji: { fontSize: 14 },
  reactorName: { fontSize: 13, fontWeight: '600', color: AppColors.text.primary },
  reactorMe: { fontSize: 11, color: AppColors.purple.primary, fontWeight: '500' },
});

const setup = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  formContainer: { padding: 24, paddingBottom: 40 },
  emoji: { fontSize: 64, marginBottom: 16, textAlign: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: AppColors.text.primary, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, color: AppColors.text.secondary, textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  primaryBtn: { width: '100%', backgroundColor: AppColors.coral.primary, borderRadius: 20, padding: 16, alignItems: 'center', marginBottom: 12 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: AppColors.surface.whiteStrong },
  secondaryBtn: { width: '100%', backgroundColor: AppColors.bg.secondary, borderRadius: 20, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: AppColors.border.soft },
  secondaryBtnText: { fontSize: 16, fontWeight: '600', color: AppColors.text.secondary },
  inputGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: AppColors.text.secondary, marginBottom: 8 },
  input: { backgroundColor: AppColors.bg.secondary, borderRadius: 16, padding: 16, fontSize: 16, color: AppColors.text.primary, borderWidth: 1.5, borderColor: AppColors.border.soft },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn: { width: 48, height: 48, borderRadius: 14, backgroundColor: AppColors.bg.secondary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: AppColors.border.soft },
  emojiBtnText: { fontSize: 24 },
  colorRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  colorBtn: { width: 36, height: 36, borderRadius: 18 },
  colorBtnSelected: { borderWidth: 3, borderColor: AppColors.surface.whiteStrong, shadowColor: AppColors.shadow.dark, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleBtn: { flex: 1, paddingVertical: 10, borderRadius: 14, backgroundColor: AppColors.bg.secondary, alignItems: 'center', borderWidth: 1.5, borderColor: AppColors.border.soft },
  roleBtnText: { fontSize: 13, color: AppColors.text.secondary },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 20, backgroundColor: AppColors.bg.secondary, alignItems: 'center' },
  cancelBtnText: { fontSize: 16, fontWeight: '600', color: AppColors.text.secondary },
  disabledBtn: { opacity: 0.5 },
});
