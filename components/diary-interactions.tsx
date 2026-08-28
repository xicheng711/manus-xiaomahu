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
  cloudDeleteDiaryComment,
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
  canDelete?: boolean;
};

type Props = {
  diaryId?: number | null;
  roomId?: number | null;
  enabled?: boolean;
  /** 输入框聚焦后由页面滚动到末尾，确保键盘不会遮挡留言。 */
  onInputFocus?: () => void;
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

export function DiaryInteractions({ diaryId, roomId, enabled = true, onInputFocus }: Props) {
  const [readers, setReaders] = useState<DiaryReader[]>([]);
  const [comments, setComments] = useState<DiaryComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');

  const loadInteractions = useCallback(async (recordRead = false) => {
    if (!enabled || !diaryId || !roomId) return;
    setLoading(true);
    try {
      if (recordRead) await cloudMarkDiaryRead(diaryId, roomId);
      const data = await cloudGetDiaryInteractions(diaryId, roomId);
      setLoadFailed(Boolean(data?.loadFailed));
      if (!data?.loadFailed) {
        setReaders(Array.isArray(data?.readers) ? data.readers as DiaryReader[] : []);
        setComments(Array.isArray(data?.comments) ? data.comments as DiaryComment[] : []);
      }
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

  const handleDeleteComment = useCallback((comment: DiaryComment) => {
    if (!comment.canDelete || deletingCommentId !== null || !roomId) return;
    Alert.alert('删除留言', '确定删除这条留言吗？删除后其他家人也将看不到。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          setDeletingCommentId(comment.id);
          try {
            const result = await cloudDeleteDiaryComment(comment.id, roomId);
            if (!result?.success) {
              Alert.alert('删除没有成功', '请检查网络后重试，留言仍然保留。');
              return;
            }
            setComments(current => current.filter(item => item.id !== comment.id));
          } finally {
            setDeletingCommentId(null);
          }
        },
      },
    ]);
  }, [deletingCommentId, roomId]);

  if (!enabled || !diaryId || !roomId) return null;

  const readerText = loadFailed
    ? '阅读信息暂未加载'
    : readers.length > 0
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

      {loading && comments.length === 0 && readers.length === 0 ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#A66B7E" />
          <Text style={styles.statusText}>正在加载家人互动…</Text>
        </View>
      ) : loadFailed ? (
        <TouchableOpacity style={styles.statusRow} onPress={() => loadInteractions(false)} activeOpacity={0.75}>
          <Text style={styles.statusText}>网络暂时不可用，点击重试</Text>
        </TouchableOpacity>
      ) : comments.length > 0 ? (
        <View style={styles.commentsList}>
          {comments.map(comment => (
            <View key={comment.id} style={styles.commentRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{comment.authorEmoji || '👤'}</Text>
              </View>
              <View style={styles.commentBody}>
                <View style={styles.commentMeta}>
                  <Text style={styles.commentAuthor}>{comment.authorName || '家人'}</Text>
                  <View style={styles.commentMetaRight}>
                    <Text style={styles.commentTime}>{formatInteractionTime(comment.createdAt)}</Text>
                    {comment.canDelete ? (
                      <TouchableOpacity
                        onPress={() => handleDeleteComment(comment)}
                        disabled={deletingCommentId !== null}
                        style={styles.commentDeleteButton}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.commentDeleteText}>{deletingCommentId === comment.id ? '删除中' : '删除'}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
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
          returnKeyType="default"
          submitBehavior="newline"
          blurOnSubmit={false}
          scrollEnabled
          onFocus={() => {
            onInputFocus?.();
            setTimeout(() => onInputFocus?.(), 320);
          }}
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
      <Text style={styles.hint}>支持回车分段 · 留言仅当前家庭所有成员可见</Text>
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
  commentMetaRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentTime: { fontSize: 11, color: '#A89DA0' },
  commentDeleteButton: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: '#FFF1F3' },
  commentDeleteText: { fontSize: 10, fontWeight: '700', color: '#B85C73' },
  commentContent: { fontSize: 14, lineHeight: 21, color: '#53464A' },
  emptyText: { marginTop: 14, fontSize: 13, color: '#A89DA0' },
  statusRow: { minHeight: 46, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  statusText: { fontSize: 13, color: '#94878B' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 14 },
  input: {
    flex: 1,
    minHeight: 68,
    maxHeight: 150,
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
  sendButton: { minWidth: 58, height: 46, borderRadius: 14, backgroundColor: '#C06D88', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginBottom: 1 },
  sendButtonDisabled: { opacity: 0.45 },
  sendText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  hint: { marginTop: 7, fontSize: 11, color: '#B1A7AA' },
});
