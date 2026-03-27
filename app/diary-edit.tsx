/**
 * diary-edit.tsx — Unified diary session page (v4.0 Figma redesign)
 */

import { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Platform, Animated, ActivityIndicator,
  Easing, KeyboardAvoidingView, Dimensions,
} from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import {
  saveDiaryEntry, updateDiaryEntry, getDiaryEntryById, getDiaryEntries,
  todayStr, getProfile, generateId, DiaryEntry, ConversationMessage,
  getTodayCheckIn, DailyCheckIn,
} from '@/lib/storage';
import { VoiceInput } from '@/components/voice-input';
import { COLORS, RADIUS, fadeInUp, pressAnimation } from '@/lib/animations';
import { trpc } from '@/lib/trpc';
import * as Haptics from 'expo-haptics';
import { AppColors, Gradients } from '@/lib/design-tokens';

// ─── Constants ────────────────────────────────────────────────────────────────

const SW = Dimensions.get('window').width;

const MOOD_OPTIONS = [
  { emoji: '😄', label: '很开心', color: '#22C55E' },
  { emoji: '😊', label: '还不错', color: '#84CC16' },
  { emoji: '😌', label: '平静', color: COLORS.textSecondary },
  { emoji: '😕', label: '有点累', color: '#F59E0B' },
  { emoji: '😢', label: '不太好', color: '#EF4444' },
  { emoji: '😤', label: '烦躁', color: '#DC2626' },
];

const CAREGIVER_MOODS = [
  { emoji: '😊', label: '挺好的' },
  { emoji: '😌', label: '还行' },
  { emoji: '😕', label: '有点累' },
  { emoji: '😢', label: '不太好' },
  { emoji: '😤', label: '快撑不住了' },
];

const TAGS = [
  '散步', '吃饭好', '睡眠好', '认出家人', '情绪稳定',
  '有点混乱', '拒绝服药', '跌倒', '特别开心', '需要安慰',
];

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  const dot0 = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dots = [dot0, dot1, dot2];
  useEffect(() => {
    dots.forEach((dot, i) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dot, { toValue: -6, duration: 300, delay: i * 150, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    });
  }, []);
  return (
    <View style={styles.typingRow}>
      {dots.map((dot, i) => (
        <Animated.View key={i} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
      ))}
    </View>
  );
}

// ─── Chat Bubble Components ───────────────────────────────────────────────────

function UserBubble({ text }: { text: string }) {
  return (
    <View style={styles.bubbleRowRight}>
      <View style={styles.userBubbleWrap}>
        <Text style={styles.userBubbleDecor}>😊</Text>
        <LinearGradient
          colors={['#5DBD7A', '#3DA862']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.bubbleGreen}
        >
          <Text style={styles.bubbleGreenText}>{text}</Text>
        </LinearGradient>
      </View>
    </View>
  );
}

function AIBubble({ text, animate = false, isFirst = false }: { text: string; animate?: boolean; isFirst?: boolean }) {
  const fadeAnim = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(animate ? 16 : 0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (animate) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 16, stiffness: 120 }),
      ]).start();
    }
    Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: -1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const rotate = rotateAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-5deg', '5deg'] });

  return (
    <Animated.View style={[styles.aiBubbleWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      {isFirst && (
        <Animated.View style={[styles.stickerDecor, { transform: [{ rotate }] }]}>
          <Text style={styles.stickerText}>✨</Text>
        </Animated.View>
      )}
      <View style={[styles.bubbleBlue, isFirst ? styles.bubbleBlueFirst : styles.bubbleBluePink]}>
        <View style={styles.bubbleDots}>
          <View style={[styles.bubbleDot, { backgroundColor: '#D4C4B4' }]} />
          <View style={[styles.bubbleDot, { backgroundColor: '#C4B4A4' }]} />
          <View style={[styles.bubbleDot, { backgroundColor: '#B4A494' }]} />
        </View>
        <Text style={styles.bubbleBlueText}>{text}</Text>
      </View>
    </Animated.View>
  );
}

// ─── AI Name Row ──────────────────────────────────────────────────────────────

function AINameRow() {
  return (
    <View style={styles.aiNameRow}>
      <View style={styles.aiAvatarWrap}>
        <LinearGradient
          colors={['#8B6E5A', '#A07858', '#7A5C40']}
          style={styles.aiAvatarCircle}
        >
          <Text style={styles.aiAvatarEmoji}>🐴</Text>
        </LinearGradient>
        <View style={styles.aiOnlineDot} />
      </View>
      <View>
        <Text style={styles.aiName}>小马虎护理顾问</Text>
        <View style={styles.aiBadgeRow}>
          <LinearGradient colors={['#3B82F6', '#8B5CF6']} style={styles.aiBadge}>
            <Text style={styles.aiBadgeText}>✨ 数据分析</Text>
          </LinearGradient>
        </View>
      </View>
    </View>
  );
}

// ─── Mood Option ──────────────────────────────────────────────────────────────

function MoodOption({ mood, selected, onPress }: { mood: typeof MOOD_OPTIONS[0]; selected: boolean; onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const emojiScale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(emojiScale, { toValue: selected ? 1.15 : 1, useNativeDriver: true, damping: 12, stiffness: 200 }).start();
  }, [selected]);
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.moodOption, selected && { borderColor: mood.color, backgroundColor: mood.color + '18' }]}
        onPress={() => pressAnimation(scaleAnim, onPress)}
        activeOpacity={0.85}
      >
        <Animated.Text style={[styles.moodOptionEmoji, { transform: [{ scale: emojiScale }] }]}>{mood.emoji}</Animated.Text>
        <Text style={[styles.moodOptionLabel, selected && { color: mood.color, fontWeight: '700' }]}>{mood.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Tag Option ───────────────────────────────────────────────────────────────

function TagOption({ tag, selected, onPress }: { tag: string; selected: boolean; onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.tagOption, selected && styles.tagOptionSelected]}
        onPress={() => pressAnimation(scaleAnim, onPress)}
        activeOpacity={0.85}
      >
        <Text style={[styles.tagOptionText, selected && styles.tagOptionTextSelected]}>
          {selected ? '✓ ' : ''}{tag}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DiaryEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const existingId = params.id;
  const scrollRef = useRef<ScrollView>(null);

  const [selectedMood, setSelectedMood] = useState(0);
  const [caregiverMoodIdx, setCaregiverMoodIdx] = useState(-1);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [entryId, setEntryId] = useState<string | null>(existingId ?? null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [elderNickname, setElderNickname] = useState('家人');
  const [caregiverName, setCaregiverName] = useState('照顾者');
  const [loadingEntry, setLoadingEntry] = useState(!!existingId);
  const [diaryCount, setDiaryCount] = useState(0);
  const [todayCheckIn, setTodayCheckIn] = useState<DailyCheckIn | null>(null);

  const entryRef = useRef<DiaryEntry | null>(null);
  const formFade = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(30)).current;
  const shimmerAnim = useRef(new Animated.Value(-1)).current;

  const replyMutation = trpc.ai.replyToDiary.useMutation();
  const followUpMutation = trpc.ai.followUpDiary.useMutation();

  useEffect(() => {
    fadeInUp(formFade, formSlide, { duration: 400 });
    loadProfile();
    if (existingId) loadExistingEntry(existingId);
    Animated.loop(
      Animated.timing(shimmerAnim, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  async function loadProfile() {
    const [profile, entries, checkIn] = await Promise.all([getProfile(), getDiaryEntries(), getTodayCheckIn()]);
    if (profile) {
      setElderNickname(profile.nickname || profile.name || '家人');
      setCaregiverName(profile.caregiverName || '照顾者');
    }
    setDiaryCount(entries.length);
    if (checkIn) setTodayCheckIn(checkIn);
  }

  async function loadExistingEntry(id: string) {
    setLoadingEntry(true);
    const entry = await getDiaryEntryById(id);
    if (entry) {
      entryRef.current = entry;
      const moodIdx = MOOD_OPTIONS.findIndex(m => m.emoji === entry.moodEmoji);
      setSelectedMood(moodIdx >= 0 ? moodIdx : 0);
      if (entry.caregiverMoodEmoji) {
        const cgIdx = CAREGIVER_MOODS.findIndex(m => m.emoji === entry.caregiverMoodEmoji);
        if (cgIdx >= 0) setCaregiverMoodIdx(cgIdx);
      }
      setSelectedTags(entry.tags ?? []);
      setContent(entry.content ?? '');
      setSubmitted(true);
      setFinished(entry.conversationFinished ?? false);
      if (entry.conversation && entry.conversation.length > 0) {
        setConversation(entry.conversation);
      } else if (entry.aiReply) {
        const legacyConv: ConversationMessage[] = [
          { id: generateId(), role: 'user', text: entry.moodEmoji + (entry.content ? ' ' + entry.content.slice(0, 80) : ' 已记录今日护理情况 📖'), createdAt: entry.createdAt ?? new Date().toISOString() },
          { id: generateId(), role: 'ai', text: entry.aiReply + (entry.aiTip ? '\n\n💡 ' + entry.aiTip : ''), createdAt: entry.createdAt ?? new Date().toISOString() },
        ];
        setConversation(legacyConv);
      }
    }
    setLoadingEntry(false);
  }

  function toggleTag(tag: string) {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  function handleVoiceResult(text: string) {
    setContent(prev => prev ? prev + text : text);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function persistConversation(conv: ConversationMessage[]) {
    if (!entryId) return;
    await updateDiaryEntry(entryId, { conversation: conv });
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    const mood = MOOD_OPTIONS[selectedMood];
    const cgMood = caregiverMoodIdx >= 0 ? CAREGIVER_MOODS[caregiverMoodIdx] : undefined;
    const savedEntry = await saveDiaryEntry({
      date: todayStr(),
      moodEmoji: mood.emoji,
      moodLabel: mood.label,
      caregiverMoodEmoji: cgMood?.emoji,
      caregiverMoodLabel: cgMood?.label,
      tags: selectedTags,
      content: content.trim(),
      conversation: [],
    });
    setEntryId(savedEntry.id);
    entryRef.current = savedEntry;
    setSubmitted(true);
    setSubmitting(false);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const userText = mood.emoji + (content.trim() ? ' ' + content.trim() : ' 已记录今日护理情况 📖');
    const userMsg: ConversationMessage = { id: generateId(), role: 'user', text: userText, createdAt: new Date().toISOString() };
    const conv1 = [userMsg];
    setConversation(conv1);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);

    setAiLoading(true);
    let aiText = `${caregiverName}，辛苦了！您的每一份记录都是对${elderNickname}最好的关爱。照顾好自己，才能更好地照顾家人 💕`;
    let aiTip = '';
    try {
      const result = await replyMutation.mutateAsync({
        elderNickname, caregiverName,
        moodEmoji: mood.emoji, moodLabel: mood.label,
        tags: selectedTags, content: content.trim(),
        checkIn: todayCheckIn ? {
          morningDone: todayCheckIn.morningDone,
          eveningDone: todayCheckIn.eveningDone,
          sleepHours: todayCheckIn.sleepHours,
          sleepRange: todayCheckIn.sleepRange,
          sleepQuality: todayCheckIn.sleepQuality,
          nightAwakenings: todayCheckIn.nightAwakenings,
          napDuration: todayCheckIn.napDuration,
          moodScore: todayCheckIn.moodScore,
          medicationTaken: todayCheckIn.medicationTaken,
          mealNotes: todayCheckIn.mealNotes,
          morningNotes: todayCheckIn.morningNotes,
          eveningNotes: todayCheckIn.eveningNotes,
        } : undefined,
      });
      aiText = result.reply ?? aiText;
      aiTip = result.tip ?? '';
    } catch { }

    const aiMsg: ConversationMessage = { id: generateId(), role: 'ai', text: aiText + (aiTip ? '\n\n💡 ' + aiTip : ''), createdAt: new Date().toISOString() };
    const conv2 = [...conv1, aiMsg];
    setConversation(conv2);
    setAiLoading(false);
    await updateDiaryEntry(savedEntry.id, { aiReply: aiText, aiTip, conversation: conv2 });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
  }

  async function handleFollowUp() {
    const q = followUpInput.trim();
    if (!q || followUpLoading || !entryRef.current) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFollowUpInput('');
    setFollowUpLoading(true);
    const userMsg: ConversationMessage = { id: generateId(), role: 'user', text: q, createdAt: new Date().toISOString() };
    const conv1 = [...conversation, userMsg];
    setConversation(conv1);
    await persistConversation(conv1);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
    const historyForApi = conversation.slice(2).map(m => ({ role: m.role as 'user' | 'ai', text: m.text }));
    // Build a compact check-in summary string for context
    const checkInSummaryParts: string[] = [];
    if (todayCheckIn?.morningDone) {
      const sleep = todayCheckIn.sleepRange ?? (todayCheckIn.sleepHours ? `${todayCheckIn.sleepHours}小时` : null);
      if (sleep) checkInSummaryParts.push(`睡眠${sleep}`);
      if (todayCheckIn.medicationTaken !== undefined) checkInSummaryParts.push(todayCheckIn.medicationTaken ? '已服药' : '未服药');
    }
    if (todayCheckIn?.eveningDone && todayCheckIn.moodScore !== undefined) {
      checkInSummaryParts.push(`心情${todayCheckIn.moodScore}/10`);
    }
    const checkInSummary = checkInSummaryParts.length > 0 ? checkInSummaryParts.join('，') : undefined;
    try {
      const result = await followUpMutation.mutateAsync({ elderNickname, caregiverName, originalContent: entryRef.current.content ?? '', originalMood: entryRef.current.moodEmoji ?? '', originalAiReply: entryRef.current.aiReply ?? '', checkInSummary, history: historyForApi, question: q });
      const aiMsg: ConversationMessage = { id: generateId(), role: 'ai', text: result.reply, createdAt: new Date().toISOString() };
      const conv2 = [...conv1, aiMsg];
      setConversation(conv2);
      await persistConversation(conv2);
    } catch {
      const errMsg: ConversationMessage = { id: generateId(), role: 'ai', text: '抱歉，暂时无法回复，请稍后重试 🙏', createdAt: new Date().toISOString() };
      const conv2 = [...conv1, errMsg];
      setConversation(conv2);
      await persistConversation(conv2);
    } finally {
      setFollowUpLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
    }
  }

  async function handleEndAndSave() {
    if (entryId) await updateDiaryEntry(entryId, { conversationFinished: true });
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/(tabs)/diary' as any);
  }

  const shimmerTranslate = shimmerAnim.interpolate({ inputRange: [-1, 1], outputRange: [-300, 300] });

  if (loadingEntry) {
    return (
      <ScreenContainer containerClassName="bg-[#FFF1F2]">
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#F472B6" />
          <Text style={styles.loadingText}>加载日记...</Text>
        </View>
      </ScreenContainer>
    );
  }

  const todayLabel = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <ScreenContainer containerClassName="bg-[#FAF8F5]">
      <LinearGradient colors={['#FAF8F5', '#F7F4F0', '#F5F2EC']} style={{ flex: 1 }}>

        {/* Subtle decorative accent */}
        <View style={[styles.decor, { top: 80, right: 20, opacity: 0.06 }]} pointerEvents="none">
          <Text style={{ fontSize: 120 }}>📔</Text>
        </View>

        {/* ── Header ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBack} onPress={() => router.replace('/(tabs)/diary' as any)} activeOpacity={0.7}>
            <Text style={styles.headerBackText}>‹ 日记本</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.headerDot} />
            <Text style={styles.headerTitle}>{submitted ? '护理日记 📔' : '写日记 ✏️'}</Text>
          </View>
          {submitted && !finished ? (
            <TouchableOpacity onPress={handleEndAndSave} activeOpacity={0.85}>
              <LinearGradient colors={['#B07858', '#8B5E3C']} style={styles.headerSaveBtn}>
                <Text style={styles.headerSaveBtnText}>❤️ 保存</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.headerHomeBtn} onPress={() => router.replace('/(tabs)/diary' as any)} activeOpacity={0.7}>
              <Text style={styles.headerHomeBtnText}>✕ 取消</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Main content ── */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={90}
        >
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={styles.container}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Animated.View style={{ opacity: formFade, transform: [{ translateY: formSlide }] }}>

              {/* Date pill */}
              <View style={styles.datePillRow}>
                <View style={styles.datePill}>
                  <Text style={styles.datePillText}>📅 {todayLabel} ☀️</Text>
                </View>
              </View>

              {/* ── FORM (only before submission) ── */}
              {!submitted && (
                <>
                  {/* Motivational banner */}
                  <View style={styles.motiveBanner}>
                    <LinearGradient
                      colors={[...Gradients.appBg]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={styles.motiveBannerInner}
                    >
                      <Text style={styles.motiveEmoji}>📔</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.motiveTitle}>每一天都值得被记住</Text>
                        <Text style={styles.motiveSubtitle}>
                          {diaryCount > 0
                            ? `已记录 ${diaryCount} 篇日记`
                            : `今天写下第一篇护理日记，从现在开始 💛`}
                        </Text>
                      </View>
                      {diaryCount > 0 && (
                        <View style={styles.motiveCountBadge}>
                          <Text style={styles.motiveCountNum}>{diaryCount}</Text>
                          <Text style={styles.motiveCountLabel}>篇</Text>
                        </View>
                      )}
                    </LinearGradient>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.label}>
                      <Text style={{ color: '#A07858' }}>🌡 </Text>
                      {elderNickname}今天的状态如何？
                    </Text>
                    <View style={styles.moodRow}>
                      {MOOD_OPTIONS.map((m, i) => (
                        <MoodOption key={i} mood={m} selected={selectedMood === i} onPress={() => setSelectedMood(i)} />
                      ))}
                    </View>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.label}>
                      <Text style={{ color: '#A07858' }}>✨ </Text>
                      今天有哪些值得记录的事？
                    </Text>
                    <View style={styles.tagsGrid}>
                      {TAGS.map((tag, i) => (
                        <TagOption key={i} tag={tag} selected={selectedTags.includes(tag)} onPress={() => toggleTag(tag)} />
                      ))}
                    </View>
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.label}>
                      <Text style={{ color: '#A07858' }}>💜 </Text>
                      {caregiverName}，您今天感觉怎么样？
                    </Text>
                    <Text style={styles.caregiverMoodHint}>照顾好自己也很重要</Text>
                    <View style={styles.caregiverMoodRow}>
                      {CAREGIVER_MOODS.map((m, i) => (
                        <TouchableOpacity
                          key={i}
                          style={[styles.caregiverMoodChip, caregiverMoodIdx === i && styles.caregiverMoodChipSelected]}
                          onPress={() => {
                            setCaregiverMoodIdx(caregiverMoodIdx === i ? -1 : i);
                            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.caregiverMoodEmoji}>{m.emoji}</Text>
                          <Text style={[styles.caregiverMoodLabel, caregiverMoodIdx === i && styles.caregiverMoodLabelSelected]}>{m.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.section}>
                    <View style={styles.noteLabelRow}>
                      <Text style={styles.label}>
                        <Text style={{ color: '#A07858' }}>💬 </Text>
                        用文字记下今天（可选）
                      </Text>
                      <VoiceInput onResult={handleVoiceResult} />
                    </View>
                    <TextInput
                      style={styles.noteInput}
                      placeholder={`${elderNickname}今天有什么特别的时刻？\n您有什么感受或担心想记下来？\n哪怕只有一两句话，都很有意义 💛`}
                      value={content}
                      onChangeText={setContent}
                      multiline
                      numberOfLines={5}
                      placeholderTextColor="#C4A0B8"
                      textAlignVertical="top"
                    />
                    <Text style={styles.noteHint}>🎙️ 可以点右上角语音按钮说给小马虎听</Text>
                  </View>
                </>
              )}

              {/* ── SUBMITTED: diary summary card ── */}
              {submitted && (
                <View style={styles.summaryCard}>
                  <View style={styles.summaryHeader}>
                    <View style={[styles.moodBadge, { backgroundColor: (MOOD_OPTIONS[selectedMood]?.color ?? '#888') + '18' }]}>
                      <Text style={styles.moodBadgeEmoji}>{MOOD_OPTIONS[selectedMood]?.emoji}</Text>
                      <Text style={[styles.moodBadgeLabel, { color: MOOD_OPTIONS[selectedMood]?.color }]}>
                        {MOOD_OPTIONS[selectedMood]?.label}
                      </Text>
                    </View>
                    {selectedTags.length > 0 && (
                      <View style={styles.tagRow}>
                        {selectedTags.slice(0, 3).map((t, i) => (
                          <View key={i} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
                        ))}
                        {selectedTags.length > 3 && <View style={styles.tag}><Text style={styles.tagText}>+{selectedTags.length - 3}</Text></View>}
                      </View>
                    )}
                  </View>
                  {content.trim() ? (
                    <Text style={styles.summaryContent} numberOfLines={3}>{content.trim()}</Text>
                  ) : (
                    <Text style={styles.summaryNoContent}>（未写详细内容）</Text>
                  )}
                </View>
              )}

              {/* ── CONVERSATION ── */}
              {(conversation.length > 0 || aiLoading) && (
                <View style={styles.chatContainer}>
                  <Text style={styles.chatTitle}>💬 小马虎对话</Text>

                  {conversation.map((msg, i) =>
                    msg.role === 'user' ? (
                      <UserBubble key={msg.id} text={msg.text} />
                    ) : (
                      <View key={msg.id}>
                        <AINameRow />
                        <AIBubble text={msg.text} animate={i === conversation.length - 1 && !finished} isFirst={i === 1} />
                      </View>
                    )
                  )}

                  {aiLoading && (
                    <View>
                      <AINameRow />
                      <View style={styles.aiBubbleWrap}>
                        <View style={[styles.bubbleBlue, styles.bubbleBluePink, { paddingVertical: 14 }]}>
                          <TypingIndicator />
                        </View>
                      </View>
                    </View>
                  )}

                  {finished && (
                    <View style={styles.finishedBanner}>
                      <Text style={styles.finishedText}>✅ 对话已结束并保存</Text>
                    </View>
                  )}
                </View>
              )}

            </Animated.View>
          </ScrollView>

          {/* ── Bottom Bar ── */}
          <View style={styles.bottomBar}>
            {!submitted ? (
              /* Submit button */
              <TouchableOpacity
                style={[styles.submitBtnWrap, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting}
                activeOpacity={0.85}
              >
                <LinearGradient colors={['#B07858', '#8B5E3C', '#A07050']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitBtn}>
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.submitBtnText}>记录好了，听小马虎说说 💕</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            ) : !finished ? (
              <>
                {/* Input row */}
                <View style={styles.inputRow}>
                  <View style={styles.inputWrap}>
                    <TextInput
                      style={styles.chatInput}
                      placeholder="继续向小马虎提问...💭"
                      value={followUpInput}
                      onChangeText={setFollowUpInput}
                      placeholderTextColor="#C4A0B8"
                      returnKeyType="send"
                      onSubmitEditing={handleFollowUp}
                      editable={!followUpLoading}
                    />
                  </View>
                  <TouchableOpacity
                    style={[styles.sendBtnWrap, (!followUpInput.trim() || followUpLoading) && { opacity: 0.4 }]}
                    onPress={handleFollowUp}
                    disabled={!followUpInput.trim() || followUpLoading}
                    activeOpacity={0.85}
                  >
                    <LinearGradient colors={['#B07858', '#8B5E3C']} style={styles.sendBtn}>
                      {followUpLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={{ fontSize: 18, color: AppColors.surface.whiteStrong }}>➤</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>

                {/* End & Save button */}
                <TouchableOpacity onPress={handleEndAndSave} activeOpacity={0.9} style={styles.endBtnWrap}>
                  <LinearGradient colors={['#1E293B', '#0F172A', '#1E293B']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.endBtn}>
                    <Animated.View style={[styles.endBtnShimmer, { transform: [{ translateX: shimmerTranslate }] }]} />
                    <Text style={styles.endBtnText}>结束并保存，返回日记列表 →</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : (
              <View style={styles.finishedBottomBanner}>
                <Text style={styles.finishedBottomText}>✅ 日记已保存</Text>
                <TouchableOpacity onPress={() => router.replace('/(tabs)/diary' as any)}>
                  <Text style={styles.goBackText}>返回日记本 →</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  decor: { position: 'absolute', zIndex: 0 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: 'rgba(253,249,247,0.95)',
    borderBottomWidth: 1, borderBottomColor: AppColors.border.soft,
    zIndex: 10,
  },
  headerBack: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  headerBackText: { fontSize: 15, color: AppColors.text.secondary, fontWeight: '600' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: '#A07858',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: AppColors.text.primary },
  headerSaveBtn: {
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3,
  },
  headerSaveBtnText: { fontSize: 13, fontWeight: '700', color: AppColors.surface.whiteStrong },
  headerHomeBtn: {
    backgroundColor: AppColors.bg.secondary, borderRadius: 999,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  headerHomeBtnText: { fontSize: 13, color: AppColors.text.secondary, fontWeight: '600' },

  // Loading
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: AppColors.text.secondary },

  container: { padding: 16, paddingBottom: 20, zIndex: 1 },

  // Date pill
  datePillRow: { alignItems: 'center', marginBottom: 20 },
  datePill: {
    backgroundColor: 'rgba(253,249,247,0.90)',
    borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7,
    borderWidth: 1, borderColor: AppColors.border.soft,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  datePillText: { fontSize: 12, color: AppColors.text.secondary },

  // Motivational banner
  motiveBanner: { marginBottom: 24 },
  motiveBannerInner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 18, padding: 16,
    borderWidth: 1.5, borderColor: '#FDE68A',
    shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 2,
  },
  motiveEmoji: { fontSize: 32 },
  motiveTitle: { fontSize: 14, fontWeight: '800', color: '#92400E', marginBottom: 2 },
  motiveSubtitle: { fontSize: 12, color: '#B45309', lineHeight: 18 },
  motiveCountBadge: {
    alignItems: 'center', backgroundColor: '#FDE68A',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6,
    minWidth: 44,
  },
  motiveCountNum: { fontSize: 20, fontWeight: '900', color: '#92400E', lineHeight: 24 },
  motiveCountLabel: { fontSize: 10, color: '#B45309', fontWeight: '600' },

  // Form sections
  section: { marginBottom: 24 },
  label: { fontSize: 15, fontWeight: '700', color: AppColors.text.primary, marginBottom: 12 },
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  caregiverMoodHint: { fontSize: 12, color: AppColors.text.tertiary, marginTop: -6, marginBottom: 10 },
  caregiverMoodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  caregiverMoodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1.5, borderColor: AppColors.purple.primary,
    backgroundColor: 'rgba(253,249,247,0.95)',
  },
  caregiverMoodChipSelected: { borderColor: AppColors.purple.strong, backgroundColor: AppColors.purple.soft },
  caregiverMoodEmoji: { fontSize: 18 },
  caregiverMoodLabel: { fontSize: 13, color: AppColors.text.secondary, fontWeight: '500' },
  caregiverMoodLabelSelected: { color: AppColors.purple.strong, fontWeight: '700' },
  moodOption: {
    alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: AppColors.border.soft,
    backgroundColor: 'rgba(253,249,247,0.95)', minWidth: 56,
  },
  moodOptionEmoji: { fontSize: 22, marginBottom: 2 },
  moodOptionLabel: { fontSize: 11, color: AppColors.text.secondary, fontWeight: '500' },
  tagsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagOption: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1.5, borderColor: AppColors.border.soft,
    backgroundColor: 'rgba(253,249,247,0.95)',
  },
  tagOptionSelected: { borderColor: '#A07858', backgroundColor: '#F0EBE3' },
  tagOptionText: { fontSize: 13, color: AppColors.text.secondary, fontWeight: '500' },
  tagOptionTextSelected: { color: '#7A5C3E', fontWeight: '700' },
  noteLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  noteInput: {
    backgroundColor: 'rgba(253,249,247,0.95)', borderRadius: 16,
    borderWidth: 1.5, borderColor: AppColors.border.soft,
    padding: 14, fontSize: 15, color: AppColors.text.primary,
    minHeight: 130, lineHeight: 22,
  },
  noteHint: {
    fontSize: 11, color: AppColors.text.tertiary, marginTop: 6,
    textAlign: 'right', fontStyle: 'italic',
  },

  // Summary card
  summaryCard: {
    backgroundColor: 'rgba(253,249,247,0.98)', borderRadius: 20,
    padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: AppColors.border.soft,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  moodBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  moodBadgeEmoji: { fontSize: 14 },
  moodBadgeLabel: { fontSize: 12, fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: { backgroundColor: AppColors.bg.secondary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, color: AppColors.text.secondary, fontWeight: '500' },
  summaryContent: { fontSize: 14, color: AppColors.text.primary, lineHeight: 20 },
  summaryNoContent: { fontSize: 13, color: AppColors.text.secondary, fontStyle: 'italic' },

  // Chat
  chatContainer: { marginTop: 4, marginBottom: 8, gap: 4 },
  chatTitle: {
    fontSize: 12, fontWeight: '700', color: AppColors.text.tertiary,
    textAlign: 'center', marginBottom: 12, letterSpacing: 0.5,
  },

  // User bubble
  bubbleRowRight: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12, paddingLeft: 50 },
  userBubbleWrap: { position: 'relative' },
  userBubbleDecor: { position: 'absolute', top: -10, left: -14, fontSize: 18, zIndex: 2 },
  bubbleGreen: {
    borderRadius: 24, borderTopRightRadius: 6,
    paddingHorizontal: 18, paddingVertical: 12, maxWidth: SW * 0.72,
    shadowColor: '#34D399', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3,
  },
  bubbleGreenText: { fontSize: 15, color: AppColors.surface.whiteStrong, lineHeight: 22, fontWeight: '500', flexWrap: 'wrap' },

  // AI bubble
  aiBubbleWrap: { position: 'relative', marginBottom: 4 },
  stickerDecor: {
    position: 'absolute', top: -12, right: -8, zIndex: 10,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FDE047',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: AppColors.shadow.dark, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 3,
  },
  stickerText: { fontSize: 18 },
  bubbleBlue: {
    backgroundColor: AppColors.surface.whiteStrong, borderRadius: 24, borderTopLeftRadius: 6,
    paddingHorizontal: 18, paddingVertical: 16,
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 2,
  },
  bubbleBlueFirst: { borderWidth: 1.5, borderColor: AppColors.border.soft },
  bubbleBluePink: { borderWidth: 1.5, borderColor: AppColors.border.soft },
  bubbleDots: { flexDirection: 'row', gap: 3, position: 'absolute', top: 10, right: 12 },
  bubbleDot: { width: 5, height: 5, borderRadius: 2.5 },
  bubbleBlueText: { fontSize: 15, color: AppColors.text.primary, lineHeight: 24 },

  // AI name row
  aiNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, marginLeft: 2 },
  aiAvatarWrap: { position: 'relative' },
  aiAvatarCircle: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 5, elevation: 3,
  },
  aiAvatarEmoji: { fontSize: 18 },
  aiOnlineDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#4ADE80', borderWidth: 2, borderColor: AppColors.surface.whiteStrong,
  },
  aiName: { fontSize: 13, fontWeight: '800', color: AppColors.text.primary },
  aiBadgeRow: { flexDirection: 'row', marginTop: 2 },
  aiBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  aiBadgeText: { fontSize: 10, fontWeight: '700', color: AppColors.surface.whiteStrong },

  // Typing
  typingRow: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 4 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#C4A882' },

  // Finished banner inside chat
  finishedBanner: {
    backgroundColor: '#F0FDF4', borderRadius: 12, padding: 12, marginTop: 8,
    alignItems: 'center', borderWidth: 1, borderColor: '#BBF7D0',
  },
  finishedText: { fontSize: 13, color: '#16A34A', fontWeight: '600' },

  // Bottom bar
  bottomBar: {
    backgroundColor: 'rgba(253,249,247,0.97)',
    borderTopWidth: 1, borderTopColor: AppColors.border.soft,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    gap: 10,
  },

  // Submit button (pre-submit)
  submitBtnWrap: { borderRadius: 999 },
  submitBtn: {
    borderRadius: 999, paddingVertical: 16,
    alignItems: 'center',
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 10, elevation: 4,
  },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: AppColors.surface.whiteStrong },

  // Input row
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inputWrap: { flex: 1 },
  chatInput: {
    backgroundColor: 'rgba(250,248,245,0.95)',
    borderWidth: 1.5, borderColor: AppColors.border.soft,
    borderRadius: 999,
    paddingHorizontal: 20, paddingVertical: 12,
    fontSize: 15, color: AppColors.text.primary,
  },
  sendBtnWrap: {},
  sendBtn: {
    width: 50, height: 50, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: AppColors.shadow.default, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },

  // End & Save button
  endBtnWrap: { borderRadius: 999, overflow: 'hidden' },
  endBtn: {
    borderRadius: 999, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', overflow: 'hidden',
  },
  endBtnShimmer: {
    position: 'absolute',
    width: 80, height: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    transform: [{ skewX: '-20deg' }],
  },
  endBtnText: { fontSize: 15, fontWeight: '700', color: AppColors.surface.whiteStrong, zIndex: 1 },

  // Finished bottom state
  finishedBottomBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8,
  },
  finishedBottomText: { fontSize: 14, color: '#16A34A', fontWeight: '600' },
  goBackText: { fontSize: 14, color: AppColors.coral.primary, fontWeight: '700' },
});
