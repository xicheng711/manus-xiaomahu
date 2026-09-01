import type { ConversationMessage } from '@/lib/storage';

function normalizeDisplayText(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, '');
}

function isSameDisplayTurn(left?: string | null, right?: string | null): boolean {
  const normalizedLeft = normalizeDisplayText(left);
  const normalizedRight = normalizeDisplayText(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;

  // 兼容旧版 conversation 首条消息曾只保存正文前半段的记录。
  // 只有较长文本才允许前缀匹配，避免误删真实的短句追问。
  const shorterLength = Math.min(normalizedLeft.length, normalizedRight.length);
  return shorterLength >= 24 && (
    normalizedLeft.startsWith(normalizedRight)
    || normalizedRight.startsWith(normalizedLeft)
  );
}

/**
 * 旧版本偶尔会让正文和 conversation 首条副本保存到不同长度。
 * 两者内容相同或互为前缀时，选择更完整的一份作为顶部唯一正文。
 */
export function getCompleteDiaryBody(
  diaryBody: string | null | undefined,
  conversation: ConversationMessage[] | null | undefined,
): string {
  const body = String(diaryBody ?? '').trim();
  const first = Array.isArray(conversation) ? conversation[0] : undefined;
  if (first?.role !== 'user') return body;
  const firstText = String(first.text ?? '').trim();
  if (!body) return firstText;
  if (!isSameDisplayTurn(firstText, body)) return body;
  return normalizeDisplayText(firstText).length > normalizeDisplayText(body).length
    ? firstText
    : body;
}

/**
 * 已发布日记会在顶部单独完整显示正文。conversation 的第一条用户消息
 * 按约定是同一正文副本，因此只从展示列表中移除，不修改任何已保存数据。
 */
export function getConversationAfterDiaryBody(
  conversation: ConversationMessage[] | null | undefined,
  diaryBody: string | null | undefined,
): ConversationMessage[] {
  if (!Array.isArray(conversation) || conversation.length === 0) return [];
  const [first, ...rest] = conversation;
  if (first?.role === 'user' && isSameDisplayTurn(first.text, diaryBody)) {
    return rest;
  }
  return [...conversation];
}

/**
 * 旧详情页会把首次 AI 回复单独展示；该页的后续历史还需要再移除
 * conversation 中同一条首次 AI 回复，但必须保留所有真实用户追问和后续回复。
 */
export function getDiaryFollowUpConversation(
  conversation: ConversationMessage[] | null | undefined,
  diaryBody: string | null | undefined,
  firstAiReply: string | null | undefined,
): ConversationMessage[] {
  const afterBody = getConversationAfterDiaryBody(conversation, diaryBody);
  const [first, ...rest] = afterBody;
  if (first?.role === 'ai' && isSameDisplayTurn(first.text, firstAiReply)) {
    return rest;
  }
  return afterBody;
}
