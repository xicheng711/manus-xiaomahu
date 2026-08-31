import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  findNodeHandle,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  cloudAddAnnouncementComment,
  cloudDeleteAnnouncementComment,
  cloudGetAnnouncementComments,
} from '@/lib/cloud-sync';
import {
  cacheAnnouncementComments,
  generateId,
  getCachedAnnouncementComments,
  todayStr,
  type AnnouncementComment,
} from '@/lib/storage';

type Props = {
  announcementId: number;
  roomId: number;
  announcementAuthorName: string;
  onInputFocus?: (nativeHandle: number | null) => void;
  onInputBlur?: () => void;
};

function localTimeStr(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function normalizeComment(raw: any): AnnouncementComment {
  return {
    id: Number(raw.id),
    announcementId: Number(raw.announcementId),
    clientId: String(raw.clientId ?? ''),
    authorUserId: Number(raw.authorUserId),
    authorName: String(raw.authorName ?? '家人'),
    authorEmoji: String(raw.authorEmoji ?? '👤'),
    content: String(raw.content ?? ''),
    date: String(raw.date ?? ''),
    localTimeStr: String(raw.localTimeStr ?? ''),
    createdAt: raw.createdAt instanceof Date
      ? raw.createdAt.toISOString()
      : String(raw.createdAt ?? ''),
    canDelete: raw.canDelete === true,
  };
}

function formatCommentDateTime(comment: AnnouncementComment): string {
  const match = comment.date?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match && /^\d{2}:\d{2}$/.test(comment.localTimeStr ?? '')) {
    return `${match[1]}年${Number(match[2])}月${Number(match[3])}日 ${comment.localTimeStr}`;
  }
  const created = new Date(comment.createdAt);
  if (Number.isNaN(created.getTime())) return '';
  return created.toLocaleString('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function AnnouncementComments({
  announcementId,
  roomId,
  announcementAuthorName,
  onInputFocus,
  onInputBlur,
}: Props) {
  const [comments, setComments] = useState<AnnouncementComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const inputRef = useRef<TextInput>(null);
  const scopeKey = `${roomId}:${announcementId}`;
  const scopeKeyRef = useRef(scopeKey);
  const pendingClientIdRef = useRef<string | null>(null);
  scopeKeyRef.current = scopeKey;

  const saveCache = useCallback((next: AnnouncementComment[]) => {
    void cacheAnnouncementComments(String(roomId), announcementId, next).catch(() => {});
  }, [announcementId, roomId]);

  const loadComments = useCallback(async () => {
    const requestedScope = `${roomId}:${announcementId}`;
    setLoading(true);
    try {
      const cached = await getCachedAnnouncementComments(String(roomId), announcementId);
      if (scopeKeyRef.current !== requestedScope) return;
      if (cached.length > 0) {
        // canDelete is tied to the authenticated user and must be refreshed from the server.
        setComments(cached.map(item => ({ ...normalizeComment(item), canDelete: false })));
        setLoading(false);
      }

      const result = await cloudGetAnnouncementComments(announcementId, roomId);
      if (scopeKeyRef.current !== requestedScope) return;
      setLoadFailed(result.loadFailed);
      if (!result.loadFailed) {
        const next = (Array.isArray(result.comments) ? result.comments : []).map(normalizeComment);
        setComments(next);
        saveCache(next);
      }
    } catch (error) {
      if (scopeKeyRef.current === requestedScope) {
        console.warn('[AnnouncementComments] load failed', error);
        setLoadFailed(true);
      }
    } finally {
      if (scopeKeyRef.current === requestedScope) setLoading(false);
    }
  }, [announcementId, roomId, saveCache]);

  useEffect(() => {
    setComments([]);
    setCommentText('');
    setLoadFailed(false);
    setSending(false);
    setDeletingId(null);
    void loadComments();
  }, [loadComments, scopeKey]);

  const handleSend = useCallback(async () => {
    const content = commentText.trim();
    if (!content || sending) return;
    const requestedScope = `${roomId}:${announcementId}`;
    const clientId = pendingClientIdRef.current ?? generateId();
    pendingClientIdRef.current = clientId;
    const result = await (async () => {
      setSending(true);
      try {
        return await cloudAddAnnouncementComment({
          roomId,
          announcementId,
          clientId,
          content,
          date: todayStr(),
          localTimeStr: localTimeStr(),
        });
      } catch (error) {
        console.warn('[AnnouncementComments] send failed', error);
        return null;
      }
    })();
    if (scopeKeyRef.current !== requestedScope) return;
    setSending(false);
    if (!result?.success || !result.comment) {
      Alert.alert('评论没有发送成功', '请检查网络后重试，刚才输入的文字仍然保留。');
      return;
    }
    const sent = normalizeComment(result.comment);
    setComments(current => {
      const withoutDuplicate = current.filter(item => item.id !== sent.id && item.clientId !== sent.clientId);
      const next = [...withoutDuplicate, sent];
      saveCache(next);
      return next;
    });
    setCommentText('');
    pendingClientIdRef.current = null;
  }, [announcementId, commentText, roomId, saveCache, sending]);

  const handleDelete = useCallback((comment: AnnouncementComment) => {
    if (!comment.canDelete || deletingId !== null) return;
    Alert.alert('删除评论', '确定删除这条评论吗？删除后其他家人也将看不到。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          const requestedScope = `${roomId}:${announcementId}`;
          setDeletingId(comment.id);
          try {
            const result = await cloudDeleteAnnouncementComment(comment.id, announcementId, roomId);
            if (scopeKeyRef.current !== requestedScope) return;
            if (!result?.success) {
              Alert.alert('删除没有成功', '请检查网络后重试，评论仍然保留。');
              return;
            }
            setComments(current => {
              const next = current.filter(item => item.id !== comment.id);
              saveCache(next);
              return next;
            });
          } finally {
            if (scopeKeyRef.current === requestedScope) setDeletingId(null);
          }
        },
      },
    ]);
  }, [announcementId, deletingId, roomId, saveCache]);

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>家人评论</Text>
          <Text style={styles.subtitle}>回复 {announcementAuthorName || '家人'} 的这条公告</Text>
        </View>
        <TouchableOpacity
          onPress={() => void loadComments()}
          disabled={loading}
          style={styles.refreshButton}
          activeOpacity={0.7}
        >
          <Text style={styles.refreshText}>{loading ? '刷新中' : '刷新'}</Text>
        </TouchableOpacity>
      </View>

      {loading && comments.length === 0 ? (
        <View style={styles.statusRow}>
          <ActivityIndicator size="small" color="#B8426A" />
          <Text style={styles.statusText}>正在加载评论…</Text>
        </View>
      ) : comments.length > 0 ? (
        <View style={styles.commentsList}>
          {comments.map(comment => (
            <View key={comment.id} style={styles.commentRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{comment.authorEmoji || '👤'}</Text>
              </View>
              <View style={styles.commentBody}>
                <View style={styles.commentHeader}>
                  <Text style={styles.commentAuthor}>{comment.authorName || '家人'}</Text>
                  {comment.canDelete ? (
                    <TouchableOpacity
                      onPress={() => handleDelete(comment)}
                      disabled={deletingId !== null}
                      style={styles.deleteButton}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.deleteText}>{deletingId === comment.id ? '删除中' : '删除'}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <Text style={styles.commentTime}>{formatCommentDateTime(comment)}</Text>
                <Text style={styles.commentContent}>{comment.content}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyText}>还没有评论，写下第一条回复吧。</Text>
      )}

      {loadFailed ? (
        <TouchableOpacity onPress={() => void loadComments()} activeOpacity={0.75} style={styles.warningRow}>
          <Text style={styles.warningText}>网络暂时不可用，已保留本地评论 · 点击重试</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          value={commentText}
          onChangeText={text => {
            setCommentText(text);
            if (!text.trim()) pendingClientIdRef.current = null;
          }}
          placeholder="写评论回复这条公告…"
          placeholderTextColor="#A89DA0"
          style={styles.input}
          multiline
          returnKeyType="default"
          submitBehavior="newline"
          blurOnSubmit={false}
          scrollEnabled
          editable={!sending}
          onFocus={() => {
            const revealInput = () => onInputFocus?.(findNodeHandle(inputRef.current));
            revealInput();
            setTimeout(revealInput, 120);
            setTimeout(revealInput, 360);
          }}
          onBlur={onInputBlur}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={sending || !commentText.trim()}
          style={[styles.sendButton, (sending || !commentText.trim()) && styles.sendButtonDisabled]}
          activeOpacity={0.8}
        >
          {sending
            ? <ActivityIndicator size="small" color="#FFFFFF" />
            : <Text style={styles.sendText}>发送</Text>}
        </TouchableOpacity>
      </View>
      <Text style={styles.hint}>支持回车分段 · 评论仅当前家庭成员可见</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EADFE2',
    paddingTop: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerCopy: { flex: 1 },
  title: { fontSize: 14, fontWeight: '800', color: '#493A3F' },
  subtitle: { marginTop: 2, fontSize: 11, color: '#96888D' },
  refreshButton: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: '#F8EEF1' },
  refreshText: { fontSize: 11, fontWeight: '700', color: '#A6536C' },
  statusRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  statusText: { fontSize: 12, color: '#978A8E' },
  commentsList: { marginTop: 8 },
  commentRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFE7E9',
  },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F8EEF1', alignItems: 'center', justifyContent: 'center', marginRight: 9 },
  avatarText: { fontSize: 16 },
  commentBody: { flex: 1 },
  commentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  commentAuthor: { flex: 1, fontSize: 12, fontWeight: '800', color: '#4A3B40' },
  commentTime: { marginTop: 2, fontSize: 10, color: '#A89DA0' },
  commentContent: { marginTop: 5, fontSize: 13, lineHeight: 20, color: '#55484C' },
  deleteButton: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: '#FFF0F3' },
  deleteText: { fontSize: 10, fontWeight: '700', color: '#B85C73' },
  emptyText: { marginTop: 12, fontSize: 12, color: '#A89DA0' },
  warningRow: { marginTop: 8, paddingVertical: 7, paddingHorizontal: 9, borderRadius: 9, backgroundColor: '#FFF8E8' },
  warningText: { fontSize: 11, color: '#9A7020' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 12 },
  input: {
    flex: 1,
    minHeight: 64,
    maxHeight: 150,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E9DDE0',
    backgroundColor: '#FCF7F8',
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13,
    lineHeight: 19,
    color: '#493A3F',
    textAlignVertical: 'top',
  },
  sendButton: { minWidth: 54, height: 44, borderRadius: 13, backgroundColor: '#B8426A', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, marginBottom: 1 },
  sendButtonDisabled: { opacity: 0.4 },
  sendText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  hint: { marginTop: 6, fontSize: 10, color: '#B1A6AA' },
});
