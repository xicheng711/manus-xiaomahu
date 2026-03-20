import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Platform, Alert, Animated, Share, ActivityIndicator,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/screen-container';
import { getDiaryEntryById, DiaryEntry, getProfile, formatDate } from '@/lib/storage';
import * as Haptics from 'expo-haptics';
import { BackButton } from '@/components/back-button';
import { trpc } from '@/lib/trpc';

const MOOD_OPTIONS = [
  { emoji: '😄', label: '很开心', color: '#22C55E' },
  { emoji: '😊', label: '还不错', color: '#84CC16' },
  { emoji: '😌', label: '平静', color: '#6B7280' },
  { emoji: '😕', label: '有点累', color: '#F59E0B' },
  { emoji: '😢', label: '不太好', color: '#EF4444' },
  { emoji: '😤', label: '烦躁', color: '#DC2626' },
];

export default function DiaryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [entry, setEntry] = useState<DiaryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [elderNickname, setElderNickname] = useState('老宝');
  const [caregiverName, setCaregiverName] = useState('照顾者');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  // Multi-turn follow-up
  const [followUpHistory, setFollowUpHistory] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([]);
  const [followUpInput, setFollowUpInput] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const followUpMutation = trpc.ai.followUpDiary.useMutation();

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);
    const profile = await getProfile();
    if (profile) {
      setElderNickname(profile.nickname || profile.name || '老宝');
      setCaregiverName(profile.caregiverName || '照顾者');
    }
    if (id) {
      const e = await getDiaryEntryById(id);
      if (e) {
        if (typeof (e.tags as any) === 'string') {
          try { e.tags = JSON.parse(e.tags as any); } catch { e.tags = []; }
        }
        if (!Array.isArray(e.tags)) e.tags = [];
      }
      setEntry(e);
    }
    setLoading(false);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }

  async function handleFollowUp() {
    const q = followUpInput.trim();
    if (!q || !entry || followUpLoading) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFollowUpInput('');
    setFollowUpLoading(true);
    const newHistory = [...followUpHistory, { role: 'user' as const, text: q }];
    setFollowUpHistory(newHistory);
    try {
      const result = await followUpMutation.mutateAsync({
        elderNickname,
        caregiverName,
        originalContent: entry.content || '',
        originalMood: entry.moodEmoji || '',
        originalAiReply: entry.aiReply || '',
        history: followUpHistory,
        question: q,
      });
      setFollowUpHistory([...newHistory, { role: 'ai' as const, text: result.reply }]);
    } catch {
      setFollowUpHistory([...newHistory, { role: 'ai' as const, text: '抱歉，暂时无法回复，请稍后重试' }]);
    } finally {
      setFollowUpLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
    }
  }

  async function handleShare() {
    if (!entry) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const mood = MOOD_OPTIONS.find(m => m.emoji === entry.moodEmoji);
    const lines = [
      `📖 ${elderNickname}的护理日记`,
      `📅 ${entry.date}`,
      `${entry.moodEmoji} 心情：${mood?.label || ''}`,
    ];
    if (Array.isArray(entry.tags) && entry.tags.length > 0) {
      lines.push(`🏷️ ${entry.tags.join('、')}`);
    }
    if (entry.content) {
      lines.push('', `📝 ${entry.content}`);
    }
    if (entry.aiReply) {
      lines.push('', `🩺 AI 护理顾问回复：`, entry.aiReply);
    }
    if (entry.aiTip) {
      lines.push('', `💡 小贴士：${entry.aiTip}`);
    }
    lines.push('', '—— 来自小马虎 🐴🐯 护理助手');

    try {
      await Share.share({
        message: lines.join('\n'),
        title: `${elderNickname}的护理日记 - ${entry.date}`,
      });
    } catch (e: any) {
      if (e?.message !== 'User did not share') {
        Alert.alert('分享失败', e?.message || '请稍后重试');
      }
    }
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (!entry) {
    return (
      <ScreenContainer>
        <View style={styles.loadingBox}>
          <Text style={styles.emptyEmoji}>😕</Text>
          <Text style={styles.emptyTitle}>日记未找到</Text>
          <BackButton />
        </View>
      </ScreenContainer>
    );
  }

  const mood = MOOD_OPTIONS.find(m => m.emoji === entry.moodEmoji) || MOOD_OPTIONS[2];
  const timeStr = entry.createdAt
    ? new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <ScreenContainer>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim }}>
          {/* Header */}
          <View style={styles.header}>
            <BackButton />
            <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
              <Text style={styles.shareBtnText}>分享 📤</Text>
            </TouchableOpacity>
          </View>

          {/* Date & Mood Hero */}
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View>
                <Text style={styles.heroDate}>{entry.date}</Text>
                {timeStr ? <Text style={styles.heroTime}>{timeStr} 记录</Text> : null}
              </View>
              <View style={[styles.heroBigMood, { backgroundColor: mood.color + '15' }]}>
                <Text style={styles.heroBigMoodEmoji}>{entry.moodEmoji}</Text>
              </View>
            </View>
            <View style={[styles.heroMoodBar, { backgroundColor: mood.color + '20' }]}>
              <Text style={[styles.heroMoodText, { color: mood.color }]}>
                {entry.moodEmoji} {mood.label}
              </Text>
            </View>
          </View>

          {/* Tags */}
          {entry.tags && entry.tags.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏷️ 今日标签</Text>
              <View style={styles.tagRow}>
                {entry.tags.map((tag, i) => (
                  <View key={i} style={styles.tagChip}>
                    <Text style={styles.tagChipText}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Content */}
          {entry.content ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📝 日记内容</Text>
              <View style={styles.contentCard}>
                <Text style={styles.contentText}>{entry.content}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              <View style={styles.noContentCard}>
                <Text style={styles.noContentEmoji}>📝</Text>
                <Text style={styles.noContentText}>这天没有写详细内容</Text>
              </View>
            </View>
          )}

          {/* AI Reply — WeChat chat bubble style */}
          {entry.aiReply ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💬 小马虎对话</Text>
              <View style={styles.chatBox}>
                {/* User bubble: diary content */}
                <View style={styles.bubbleRowRight}>
                  <View style={styles.bubbleGreen}>
                    <Text style={styles.bubbleGreenText}>
                      {entry.moodEmoji} {entry.content ? entry.content.slice(0, 100) + (entry.content.length > 100 ? '…' : '') : '已记录今日护理情况 📖'}
                    </Text>
                  </View>
                </View>
                {/* AI name row */}
                <View style={styles.aiNameRow}>
                  <View style={styles.aiAvatarCircle}>
                    <Text style={styles.aiAvatarEmoji}>🩺</Text>
                  </View>
                  <Text style={styles.aiName}>小马虎护理顾问</Text>
                  <Text style={styles.aiBadge}>Gemini AI</Text>
                </View>
                {/* AI blue bubble */}
                <View style={styles.bubbleRowLeft}>
                  <View style={styles.bubbleBlue}>
                    <Text style={styles.bubbleBlueText}>{entry.aiReply}</Text>
                    {entry.aiTip ? (
                      <View style={styles.aiTipBox}>
                        <Text style={styles.aiTipIcon}>💡</Text>
                        <Text style={styles.aiTipText}>{entry.aiTip}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.section}>
              <View style={styles.noAiCard}>
                <Text style={styles.noAiEmoji}>🩺</Text>
                <Text style={styles.noAiText}>这条日记还没有 AI 回复</Text>
                <Text style={styles.noAiHint}>新写的日记会自动获得 AI 回复</Text>
              </View>
            </View>
          )}

          {/* Follow-up AI Chat */}
          {entry.aiReply && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💬 继续追问 AI</Text>
              <View style={styles.chatBox}>
                {followUpHistory.map((msg, i) => (
                  msg.role === 'user' ? (
                    <View key={i} style={styles.bubbleRowRight}>
                      <View style={styles.bubbleGreen}>
                        <Text style={styles.bubbleGreenText}>{msg.text}</Text>
                      </View>
                    </View>
                  ) : (
                    <View key={i}>
                      <View style={styles.aiNameRow}>
                        <View style={styles.aiAvatarCircle}>
                          <Text style={styles.aiAvatarEmoji}>🩺</Text>
                        </View>
                        <Text style={styles.aiName}>小马虎护理顾问</Text>
                      </View>
                      <View style={styles.bubbleRowLeft}>
                        <View style={styles.bubbleBlue}>
                          <Text style={styles.bubbleBlueText}>{msg.text}</Text>
                        </View>
                      </View>
                    </View>
                  )
                ))}
                {followUpLoading && (
                  <View style={styles.aiNameRow}>
                    <View style={styles.aiAvatarCircle}>
                      <Text style={styles.aiAvatarEmoji}>🩺</Text>
                    </View>
                    <ActivityIndicator size="small" color="#7C3AED" style={{ marginLeft: 8 }} />
                    <Text style={{ fontSize: 13, color: '#9BA1A6', marginLeft: 6 }}>正在思考中...</Text>
                  </View>
                )}
              </View>
              <View style={styles.followUpRow}>
                <TextInput
                  style={styles.followUpInput}
                  value={followUpInput}
                  onChangeText={setFollowUpInput}
                  placeholder="追问 AI，如：这种情况怎么处理？"
                  placeholderTextColor="#C4C9CF"
                  returnKeyType="send"
                  onSubmitEditing={handleFollowUp}
                  editable={!followUpLoading}
                />
                <TouchableOpacity
                  style={[styles.followUpSend, followUpLoading && { opacity: 0.5 }]}
                  onPress={handleFollowUp}
                  disabled={followUpLoading}
                >
                  <Text style={styles.followUpSendText}>发送</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Bottom actions */}
          <View style={styles.bottomActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
              <Text style={styles.actionIcon}>💬</Text>
              <Text style={styles.actionText}>分享到微信</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
            >
              <Text style={styles.actionIcon}>📖</Text>
              <Text style={styles.actionText}>返回日记列表</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#687076' },
  emptyEmoji: { fontSize: 56 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#11181C' },
  backBtn: { marginTop: 16, backgroundColor: '#F8F9FA', borderRadius: 16, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnText: { fontSize: 15, fontWeight: '600', color: '#687076' },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  headerBackBtn: {
    backgroundColor: '#F8F9FA', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10,
  },
  headerBackText: { fontSize: 14, fontWeight: '600', color: '#687076' },
  shareBtn: {
    backgroundColor: '#FF6B6B', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10,
  },
  shareBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Hero
  heroCard: {
    backgroundColor: '#fff', borderRadius: 24, padding: 20, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06,
    shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: '#F0F0F0',
  },
  heroTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 16,
  },
  heroDate: { fontSize: 22, fontWeight: '800', color: '#11181C' },
  heroTime: { fontSize: 13, color: '#9BA1A6', marginTop: 4 },
  heroBigMood: {
    width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
  },
  heroBigMoodEmoji: { fontSize: 32 },
  heroMoodBar: {
    borderRadius: 14, padding: 12, alignItems: 'center',
  },
  heroMoodText: { fontSize: 16, fontWeight: '700' },

  // Sections
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#11181C', marginBottom: 10 },

  // Tags
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: {
    backgroundColor: '#FFF0F0', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6,
    borderWidth: 1, borderColor: '#FFD4D4',
  },
  tagChipText: { fontSize: 13, fontWeight: '600', color: '#FF6B6B' },

  // Content
  contentCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: '#F0F0F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03,
    shadowRadius: 6, elevation: 1,
  },
  contentText: { fontSize: 16, color: '#1F2937', lineHeight: 26 },
  noContentCard: {
    backgroundColor: '#F8F9FA', borderRadius: 20, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  noContentEmoji: { fontSize: 32, marginBottom: 8 },
  noContentText: { fontSize: 14, color: '#9BA1A6' },

  // Chat box
  chatBox: {
    backgroundColor: '#F7F8FA', borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: '#E8EBF0',
  },
  bubbleRowRight: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8, paddingLeft: 40 },
  bubbleRowLeft: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 8, paddingRight: 40 },
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
  bubbleBlueText: { fontSize: 15, color: '#1A1A1A', lineHeight: 24 },
  aiNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },

  // AI Reply
  aiCard: {
    backgroundColor: '#F0F7EE', borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: '#D4E8D4',
  },
  aiHeader: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 14 },
  aiAvatarCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#DCFCE7',
    alignItems: 'center', justifyContent: 'center',
  },
  aiAvatarEmoji: { fontSize: 22 },
  aiName: { fontSize: 15, fontWeight: '700', color: '#1A5C1A' },
  aiBadge: { fontSize: 11, color: '#6C9E6C', marginTop: 2 },
  aiText: { fontSize: 15, color: '#1F2937', lineHeight: 25, marginBottom: 12 },
  aiTipBox: {
    flexDirection: 'row', gap: 8, backgroundColor: '#DCFCE7', borderRadius: 14,
    padding: 14, alignItems: 'center', marginBottom: 8,
  },
  aiTipIcon: { fontSize: 16 },
  aiTipText: { flex: 1, fontSize: 13, color: '#166534', fontWeight: '500', lineHeight: 20 },
  aiEmoji: { fontSize: 32, textAlign: 'center', marginTop: 4 },

  // No AI
  noAiCard: {
    backgroundColor: '#F8F9FA', borderRadius: 20, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  noAiEmoji: { fontSize: 32, marginBottom: 8 },
  noAiText: { fontSize: 14, color: '#9BA1A6', fontWeight: '600' },
  noAiHint: { fontSize: 12, color: '#C4C9CF', marginTop: 4 },

  // Follow-up chat input
  followUpRow: {
    flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'center',
  },
  followUpInput: {
    flex: 1, backgroundColor: '#fff', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 14, color: '#1F2937',
    borderWidth: 1.5, borderColor: '#E8EBF0',
  },
  followUpSend: {
    backgroundColor: '#7C3AED', borderRadius: 20,
    paddingHorizontal: 18, paddingVertical: 12,
  },
  followUpSendText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Bottom actions
  bottomActions: {
    flexDirection: 'row', gap: 12, marginTop: 8,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04,
    shadowRadius: 6, elevation: 1,
  },
  actionIcon: { fontSize: 20 },
  actionText: { fontSize: 14, fontWeight: '600', color: '#11181C' },
});
