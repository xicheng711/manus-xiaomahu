import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  cloudAddDiaryComment,
  cloudGetDiaryInteractions,
  cloudMarkDiaryRead,
} from '@/lib/cloud-sync';

type DiaryReader = {
  id: number;
  readerUserId: number;
  readerName: string;
  readerEmoji: string;
  readAt: string | Date;
};

type DiaryComment = {
  id: number;
  authorUserId: number;
  authorName: string;
  authorEmoji: string;
  content: string;
  createdAt: string | Date;
};

type Props = {
  diaryId?: number | null;
  roomId?: number | null;
  enabled?: boolean;
};

function formatInteractionTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function DiaryInteractions({ diaryId, roomId, enabled = true }: Props) {
  const [readers, setReaders] = useState<DiaryReader[]>([]);
  const [comments, setComments] = useState<DiaryComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [commentText, setCommentText] = useState('');

  const loadInteractions = useCallback(async (recordRead = false) => {
    if (!enabled || !diaryId || !roomId) return;
    setLoading(true);
    try {
      if (recordRead) await cloudMarkDiaryRead(diaryId, roomId);
      const data = await cloudGetDiaryInteractions(diaryId, roomId);
      setReaders(Array.isArray(data?.readers) ? data.readers as DiaryReader[] : []);
      setComments(Array.isArray(data?.comments) ? data.comments as DiaryComment[] : []);
    } finally {
      setLoading(false);
    }
  }, [diaryId, enabled, roomId]);

  useEffect(() => {
    loadInteractions(true).catch(() => {});
  }, [loadInteractions]);

  const handleSend = useCallback(async () => {
    const content = commentText.trim();
    if (!content || sending || !diaryId || !roomId) return;
    setSending(true);
    try {
      const result = await cloudAddDiaryComment(diaryId, content, roomId);
      if (!result?.success) {
        Alert.alert('留言没有发送成功', '请检查网络后重试。');
        return;
      }
      setCommentText('');
      await loadInteractions(false);
    } finally {
      setSending(false);
    }
  }, [commentText, diaryId, loadInteractions, roomId, sending]);

  if (!enabled || !diaryId || !roomId) return null;

  const readerText = readers.length > 0
    ? `已被 ${readers.map(reader => `${reader.readerEmoji || '👤'} ${reader.readerName}`).join('、')} 阅读`
    : '还没有其他家人阅读';

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>家人互动</Text>
          <Text style={styles.readReceipt}>👀 {readerText}</Text>
        </View>
        <TouchableOpacity
          onPress={() => loadInteractions(false)}
          disabled={loading}
          style={styles.refreshButton}
          activeOpacity={0.7}
        >
          <Text style={styles.refreshText}>{loading ? '刷新中' : '刷新'}</Text>
        </TouchableOpacity>
      </View>

      {comments.length > 0 ? (
        <View style={styles.commentsList}>
          {comments.map(comment => (
            <View key={comment.id} style={styles.commentRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{comment.authorEmoji || '👤'}</Text>
              </View>
              <View style={styles.commentBody}>
                <View style={styles.commentMeta}>
                  <Text style={styles.commentAuthor}>{comment.authorName || '家人'}</Text>
                  <Text style={styles.commentTime}>{formatInteractionTime(comment.createdAt)}</Text>
                </View>
                <Text style={styles.commentContent}>{comment.content}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>还没有留言，和家人说句话吧。</Text>
      )}

      <View style={styles.inputRow}>
        <TextInput
          value={commentText}
          onChangeText={setCommentText}
          placeholder="给这篇日记留言…"
          placeholderTextColor="#A8A0A3"
          style={styles.input}
          multiline
          maxLength={500}
          returnKeyType="default"
          blurOnSubmit={false}
          editable={!sending}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={sending || !commentText.trim()}
          style={[styles.sendButton, (sending || !commentText.trim()) && styles.sendButtonDisabled]}
          activeOpacity={0.8}
        >
          {sending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.sendText}>发送</Text>}
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>留言仅当前家庭成员可见</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 18,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EFE7E4',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 16, fontWeight: '800', color: '#3C3034', marginBottom: 6 },
  readReceipt: { fontSize: 12, color: '#8B7B80', lineHeight: 18 },
  refreshButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#F7F1F3' },
  refreshText: { fontSize: 12, color: '#9E6978', fontWeight: '700' },
  commentsList: { marginTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EDE5E7' },
  commentRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0E9EB' },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F8F1F3', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  avatarText: { fontSize: 18 },
  commentBody: { flex: 1 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: '#493A3F', flexShrink: 1 },
  commentTime: { fontSize: 11, color: '#A89DA0' },
  commentContent: { fontSize: 14, lineHeight: 21, color: '#53464A' },
  emptyText: { marginTop: 14, fontSize: 13, color: '#A89DA0' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 14 },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderRadius: 14,
    backgroundColor: '#F8F4F5',
    borderWidth: 1,
    borderColor: '#EDE3E6',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: 20,
    color: '#493A3F',
    textAlignVertical: 'top',
  },
  sendButton: { minWidth: 58, height: 42, borderRadius: 14, backgroundColor: '#C06D88', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  sendButtonDisabled: { opacity: 0.45 },
  sendText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  hint: { marginTop: 7, fontSize: 11, color: '#B1A7AA' },
});
