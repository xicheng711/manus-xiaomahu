/**
 * diary-edit.tsx — Unified diary session page (v3.0)
 *
 * Flow:
 *   1. User fills in mood / tags / content
 *   2. Taps "Submit" → entry saved, first AI reply generated, appended to conversation
 *   3. User can continue chatting with AI (follow-up questions)
 *   4. Each message is persisted to storage in real-time
 *   5. "End and Save" returns to diary list
 *   6. Re-opening an existing entry restores the full thread
 */

import { useRef, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Platform, Animated, ActivityIndicator,
  Easing, KeyboardAvoidingView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import {
  saveDiaryEntry, updateDiaryEntry, getDiaryEntryById,
  todayStr, getProfile, generateId, DiaryEntry, ConversationMessage,
} from '@/lib/storage';
import { VoiceInput } from '@/components/voice-input';
import { COLORS, SHADOWS, RADIUS, fadeInUp, pressAnimation } from '@/lib/animations';
import { trpc } from '@/lib/trpc';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

// ─── Constants ────────────────────────────────────────────────────────────────

const MOOD_OPTIONS = [
  { emoji: '😄', label: '很开心', color: '#22C55E' },
  { emoji: '😊', label: '还不错', color: '#84CC16' },
  { emoji: '😌', label: '平静', color: COLORS.textSecondary },
  { emoji: '😕', label: '有点累', color: '#F59E0B' },
  { emoji: '😢', label: '不太好', color: '#EF4444' },
  { emoji: '😤', label: '烦躁', color: '#DC2626' },
];

const TAGS = [
  '散步', '吃饭好', '睡眠好', '认出家人', '情绪稳定',
  '有点混乱', '拒绝服药', '跌倒', '特别开心', '需要安慰',
];

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];
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
      <View style={styles.bubbleGreen}>
        <Text style={styles.bubbleGreenText}>{text}</Text>
      </View>
    </View>
  );
}

function AIBubble({ text, animate = false }: { text: string; animate?: boolean }) {
  const fadeAnim = useRef(new Animated.Value(animate ? 0 : 1)).current;
  const slideAnim = useRef(new Animated.Value(animate ? 16 : 0)).current;
  useEffect(() => {
    if (animate) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 16, stiffness: 120 }),
      ]).start();
    }
  }, []);
  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <View style={styles.aiNameRow}>
        <View style={styles.aiAvatarCircle}>
          <Text style={styles.aiAvatarEmoji}>🩺</Text>
        </View>
        <Text style={styles.aiName}>小马虎护理顾问</Text>
        <Text style={styles.aiBadge}>Gemini AI</Text>
      </View>
      <View style={styles.bubbleRowLeft}>
        <View style={styles.bubbleBlue}>
          <Text style={styles.bubbleBlueText}>{text}</Text>
        </View>
      </View>
    </Animated.View>
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
        style={[styles.moodOption, selected && { borderColor: mood.color, backgroundColor: mood.color + '12' }]}
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

  // Form state
  const [selectedMood, setSelectedMood] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [content, setContent] = useState('');

  // Session state
  const [entryId, setEntryId] = useState<string | null>(existingId ?? null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);

  // Conversation state
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);

  // Profile
  const [elderNickname, setElderNickname] = useState('老宝');
  const [caregiverName, setCaregiverName] = useState('照顾者');
  const [loadingEntry, setLoadingEntry] = useState(!!existingId);

  const entryRef = useRef<DiaryEntry | null>(null);

  const formFade = useRef(new Animated.Value(0)).current;
  const formSlide = useRef(new Animated.Value(30)).current;

  const replyMutation = trpc.ai.replyToDiary.useMutation();
  const followUpMutation = trpc.ai.followUpDiary.useMutation();

  useEffect(() => {
    fadeInUp(formFade, formSlide, { duration: 400 });
    loadProfile();
    if (existingId) loadExistingEntry(existingId);
  }, []);

  async function loadProfile() {
    const profile = await getProfile();
    if (profile) {
      setElderNickname(profile.nickname || profile.name || '老宝');
      setCaregiverName(profile.caregiverName || '照顾者');
    }
  }

  async function loadExistingEntry(id: string) {
    setLoadingEntry(true);
    const entry = await getDiaryEntryById(id);
    if (entry) {
      entryRef.current = entry;
      const moodIdx = MOOD_OPTIONS.findIndex(m => m.emoji === entry.moodEmoji);
      setSelectedMood(moodIdx >= 0 ? moodIdx : 0);
      setSelectedTags(entry.tags ?? []);
      setContent(entry.content ?? '');
      setSubmitted(true);
      setFinished(entry.conversationFinished ?? false);

      if (entry.conversation && entry.conversation.length > 0) {
        setConversation(entry.conversation);
      } else if (entry.aiReply) {
        // Migrate legacy entry
        const legacyConv: ConversationMessage[] = [
          {
            id: generateId(),
            role: 'user',
            text: entry.moodEmoji + (entry.content ? ' ' + entry.content.slice(0, 80) : ' 已记录今日护理情况 📖'),
            createdAt: entry.createdAt ?? new Date().toISOString(),
          },
          {
            id: generateId(),
            role: 'ai',
            text: entry.aiReply + (entry.aiTip ? '\n\n💡 ' + entry.aiTip : ''),
            createdAt: entry.createdAt ?? new Date().toISOString(),
          },
        ];
        setConversation(legacyConv);
      }
    }
    setLoadingEntry(false);
  }

  function toggleTag(tag: string) {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
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

    const savedEntry = await saveDiaryEntry({
      date: todayStr(),
      moodEmoji: mood.emoji,
      moodLabel: mood.label,
      tags: selectedTags,
      content: content.trim(),
      conversation: [],
    });
    setEntryId(savedEntry.id);
    entryRef.current = savedEntry;
    setSubmitted(true);
    setSubmitting(false);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const userText = mood.emoji + (content.trim() ? ' ' + content.trim().slice(0, 80) + (content.length > 80 ? '…' : '') : ' 已记录今日护理情况 📖');
    const userMsg: ConversationMessage = {
      id: generateId(), role: 'user', text: userText, createdAt: new Date().toISOString(),
    };
    const conv1 = [userMsg];
    setConversation(conv1);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);

    setAiLoading(true);
    let aiText = `${caregiverName}，辛苦了！你的每一份记录都是对${elderNickname}最好的关爱。照顾好自己，才能更好地照顾家人 💕`;
    let aiTip = '';
    try {
      const result = await replyMutation.mutateAsync({
        elderNickname, caregiverName,
        moodEmoji: mood.emoji, moodLabel: mood.label,
        tags: selectedTags, content: content.trim(),
      });
      aiText = result.reply ?? aiText;
      aiTip = result.tip ?? '';
    } catch { /* use fallback */ }

    const aiMsg: ConversationMessage = {
      id: generateId(), role: 'ai',
      text: aiText + (aiTip ? '\n\n💡 ' + aiTip : ''),
      createdAt: new Date().toISOString(),
    };
    const conv2 = [...conv1, aiMsg];
    setConversation(conv2);
    setAiLoading(false);

    await updateDiaryEntry(savedEntry.id, {
      aiReply: aiText, aiTip, conversation: conv2,
    });
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
  }

  async function handleFollowUp() {
    const q = followUpInput.trim();
    if (!q || followUpLoading || !entryRef.current) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFollowUpInput('');
    setFollowUpLoading(true);

    const userMsg: ConversationMessage = {
      id: generateId(), role: 'user', text: q, createdAt: new Date().toISOString(),
    };
    const conv1 = [...conversation, userMsg];
    setConversation(conv1);
    await persistConversation(conv1);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);

    const historyForApi = conversation
      .slice(2)
      .map(m => ({ role: m.role as 'user' | 'ai', text: m.text }));

    try {
      const result = await followUpMutation.mutateAsync({
        elderNickname, caregiverName,
        originalContent: entryRef.current.content ?? '',
        originalMood: entryRef.current.moodEmoji ?? '',
        originalAiReply: entryRef.current.aiReply ?? '',
        history: historyForApi,
        question: q,
      });
      const aiMsg: ConversationMessage = {
        id: generateId(), role: 'ai', text: result.reply, createdAt: new Date().toISOString(),
      };
      const conv2 = [...conv1, aiMsg];
      setConversation(conv2);
      await persistConversation(conv2);
    } catch {
      const errMsg: ConversationMessage = {
        id: generateId(), role: 'ai', text: '抱歉，暂时无法回复，请稍后重试 🙏', createdAt: new Date().toISOString(),
      };
      const conv2 = [...conv1, errMsg];
      setConversation(conv2);
      await persistConversation(conv2);
    } finally {
      setFollowUpLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
    }
  }

  async function handleEndAndSave() {
    if (entryId) {
      await updateDiaryEntry(entryId, { conversationFinished: true });
    }
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  // ─── Loading state ───────────────────────────────────────────────────────

  if (loadingEntry) {
    return (
      <ScreenContainer>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>加载日记...</Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={90}
      >
        {/* Nav bar */}
        <View style={styles.navBar}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={22} color={COLORS.text} />
            <Text style={styles.backText}>日记列表</Text>
          </TouchableOpacity>
          <Text style={styles.navTitle}>{submitted ? '护理日记' : '写日记'}</Text>
          {submitted && !finished ? (
            <TouchableOpacity style={styles.endBtn} onPress={handleEndAndSave} activeOpacity={0.85}>
              <Text style={styles.endBtnText}>结束并保存</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 80 }} />
          )}
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: formFade, transform: [{ translateY: formSlide }] }}>
            {/* Date */}
            <View style={styles.dateRow}>
              <Text style={styles.dateText}>
                {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
              </Text>
            </View>

            {/* ── FORM (only shown before submission) ── */}
            {!submitted && (
              <>
                <View style={styles.section}>
                  <Text style={styles.label}>{elderNickname}今天的心情</Text>
                  <View style={styles.moodRow}>
                    {MOOD_OPTIONS.map((m, i) => (
                      <MoodOption key={i} mood={m} selected={selectedMood === i} onPress={() => setSelectedMood(i)} />
                    ))}
                  </View>
                </View>

                <View style={styles.section}>
                  <Text style={styles.label}>今天发生了什么？（可多选）</Text>
                  <View style={styles.tagsGrid}>
                    {TAGS.map((tag, i) => (
                      <TagOption key={i} tag={tag} selected={selectedTags.includes(tag)} onPress={() => toggleTag(tag)} />
                    ))}
                  </View>
                </View>

                <View style={styles.section}>
                  <View style={styles.noteLabelRow}>
                    <Text style={styles.label}>详细记录（可选）</Text>
                    <VoiceInput onResult={handleVoiceResult} />
                  </View>
                  <TextInput
                    style={styles.noteInput}
                    placeholder={`写下今天的护理情况、${elderNickname}的特别反应、你的感受...\n💡 点击右上角🎙️可语音输入`}
                    value={content}
                    onChangeText={setContent}
                    multiline
                    numberOfLines={5}
                    placeholderTextColor="#B8BCC0"
                    textAlignVertical="top"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                  onPress={handleSubmit}
                  disabled={submitting}
                  activeOpacity={0.85}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.submitBtnText}>提交日记，获取 AI 回复 💕</Text>
                  )}
                </TouchableOpacity>
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
                <Text style={styles.chatTitle}>💬 AI 护理对话</Text>

                {conversation.map((msg, i) => (
                  msg.role === 'user' ? (
                    <UserBubble key={msg.id} text={msg.text} />
                  ) : (
                    <AIBubble key={msg.id} text={msg.text} animate={i === conversation.length - 1 && !finished} />
                  )
                ))}

                {aiLoading && (
                  <View>
                    <View style={styles.aiNameRow}>
                      <View style={styles.aiAvatarCircle}>
                        <Text style={styles.aiAvatarEmoji}>🩺</Text>
                      </View>
                      <Text style={styles.aiName}>小马虎护理顾问</Text>
                    </View>
                    <View style={styles.bubbleRowLeft}>
                      <View style={[styles.bubbleBlue, { paddingVertical: 14 }]}>
                        <TypingIndicator />
                      </View>
                    </View>
                  </View>
                )}

                {/* Follow-up input */}
                {submitted && !finished && !aiLoading && (
                  <View style={styles.followUpRow}>
                    <TextInput
                      style={styles.followUpInput}
                      placeholder="继续向 AI 提问..."
                      value={followUpInput}
                      onChangeText={setFollowUpInput}
                      placeholderTextColor="#B8BCC0"
                      returnKeyType="send"
                      onSubmitEditing={handleFollowUp}
                      editable={!followUpLoading}
                    />
                    <TouchableOpacity
                      style={[styles.followUpSendBtn, (!followUpInput.trim() || followUpLoading) && { opacity: 0.4 }]}
                      onPress={handleFollowUp}
                      disabled={!followUpInput.trim() || followUpLoading}
                      activeOpacity={0.85}
                    >
                      {followUpLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="send" size={18} color="#fff" />
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {finished && (
                  <View style={styles.finishedBanner}>
                    <Text style={styles.finishedText}>✅ 对话已结束并保存</Text>
                  </View>
                )}
              </View>
            )}

            {/* ── END AND SAVE button ── */}
            {submitted && !finished && !aiLoading && (
              <TouchableOpacity style={styles.endAndSaveBtn} onPress={handleEndAndSave} activeOpacity={0.85}>
                <Text style={styles.endAndSaveBtnText}>结束并保存，返回日记列表 →</Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, width: 80 },
  backText: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  navTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  endBtn: {
    backgroundColor: COLORS.primary + '18', borderRadius: RADIUS.pill,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  endBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 15, color: COLORS.textSecondary },

  container: { padding: 20, paddingBottom: 60 },

  dateRow: { marginBottom: 20 },
  dateText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '500' },

  section: { marginBottom: 24 },
  label: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 12 },

  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moodOption: {
    alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA', minWidth: 56,
  },
  moodOptionEmoji: { fontSize: 22, marginBottom: 2 },
  moodOptionLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },

  tagsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagOption: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: RADIUS.pill, borderWidth: 1.5, borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
  },
  tagOptionSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '12' },
  tagOptionText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  tagOptionTextSelected: { color: COLORS.primary, fontWeight: '700' },

  noteLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  noteInput: {
    backgroundColor: '#FAFAFA', borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    padding: 14, fontSize: 15, color: COLORS.text,
    minHeight: 120, lineHeight: 22,
  },

  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.pill,
    paddingVertical: 16, alignItems: 'center',
    marginTop: 8, marginBottom: 24,
    ...SHADOWS.md,
  },
  submitBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  summaryCard: {
    backgroundColor: '#FAFAFA', borderRadius: RADIUS.lg,
    padding: 16, marginBottom: 20,
    borderWidth: 1.5, borderColor: '#E5E7EB',
  },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  moodBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill },
  moodBadgeEmoji: { fontSize: 14 },
  moodBadgeLabel: { fontSize: 12, fontWeight: '600' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: { backgroundColor: '#F3F4F6', borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  summaryContent: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  summaryNoContent: { fontSize: 13, color: COLORS.textSecondary, fontStyle: 'italic' },

  chatContainer: {
    backgroundColor: '#F7F8FA', borderRadius: 20, padding: 16, marginTop: 4,
    borderWidth: 1, borderColor: '#E8EBF0', marginBottom: 16,
  },
  chatTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 12 },

  bubbleRowRight: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 10, paddingLeft: 50 },
  bubbleRowLeft: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 10, paddingRight: 50 },
  bubbleGreen: {
    backgroundColor: '#95EC69', borderRadius: 18, borderTopRightRadius: 4,
    paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%',
  },
  bubbleGreenText: { fontSize: 15, color: '#1A1A1A', lineHeight: 22 },
  bubbleBlue: {
    backgroundColor: '#FFFFFF', borderRadius: 18, borderTopLeftRadius: 4,
    paddingHorizontal: 14, paddingVertical: 12, maxWidth: '100%',
    borderWidth: 1, borderColor: '#E8EBF0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  bubbleBlueText: { fontSize: 15, color: '#1A1A1A', lineHeight: 22 },
  aiNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  aiAvatarCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },
  aiAvatarEmoji: { fontSize: 14 },
  aiName: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  aiBadge: {
    fontSize: 10, fontWeight: '700', color: '#6366F1',
    backgroundColor: '#EEF2FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  typingRow: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingHorizontal: 4 },
  typingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#9CA3AF' },

  followUpRow: {
    flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center',
  },
  followUpInput: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: RADIUS.pill,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 14, color: COLORS.text,
  },
  followUpSendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    ...SHADOWS.md,
  },

  finishedBanner: {
    backgroundColor: '#F0FDF4', borderRadius: 10, padding: 10, marginTop: 12,
    alignItems: 'center',
  },
  finishedText: { fontSize: 13, color: '#16A34A', fontWeight: '600' },

  endAndSaveBtn: {
    backgroundColor: '#1A1A2E', borderRadius: RADIUS.pill,
    paddingVertical: 16, alignItems: 'center',
    marginTop: 8, marginBottom: 24,
    ...SHADOWS.md,
  },
  endAndSaveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
