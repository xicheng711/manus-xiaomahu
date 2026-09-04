export type DiarySyncPayload = Record<string, unknown> & {
  roomId: number;
  date: string;
  content: string;
  conversationFinished: boolean;
};

/**
 * Build the single canonical payload used by both tRPC diary sync and the
 * authenticated HTTP fallback. Historical cloud drafts may contain null in
 * nullable database columns; syncDiary accepts optional strings/numbers, so
 * those null values must be omitted before either transport serializes them.
 */
export function buildDiarySyncPayload(
  diary: Record<string, any>,
  roomId: number,
  serverDiaryId?: number,
): DiarySyncPayload {
  const positiveRoomId = Number(roomId);
  const positiveServerId = Number(serverDiaryId);
  const numericMoodScore = Number(diary.moodScore);
  const optionalString = (value: unknown): string | undefined =>
    typeof value === 'string' ? value : undefined;

  const payload: Record<string, unknown> = {
    roomId: positiveRoomId,
    serverDiaryId: Number.isSafeInteger(positiveServerId) && positiveServerId > 0
      ? positiveServerId
      : undefined,
    clientId: optionalString(diary.clientId),
    date: typeof diary.date === 'string' ? diary.date : String(diary.date ?? ''),
    content: typeof diary.content === 'string' ? diary.content : String(diary.content ?? ''),
    moodEmoji: optionalString(diary.moodEmoji),
    moodLabel: optionalString(diary.moodLabel),
    moodScore: diary.moodScore !== null && diary.moodScore !== undefined && Number.isFinite(numericMoodScore)
      ? numericMoodScore
      : undefined,
    tags: diary.tags ?? undefined,
    caregiverMoodEmoji: optionalString(diary.caregiverMoodEmoji),
    caregiverMoodLabel: optionalString(diary.caregiverMoodLabel),
    aiReply: optionalString(diary.aiReply ?? diary.smartReply),
    aiEmoji: optionalString(diary.aiEmoji),
    aiTip: optionalString(diary.aiTip ?? diary.smartTip),
    conversation: diary.conversation ?? undefined,
    conversationFinished: diary.conversationFinished === true,
    publishRevision: optionalString(diary.publishRevision),
    localTimeStr: optionalString(diary.localTimeStr),
  };

  const normalized = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null),
  );

  if (!Number.isSafeInteger(normalized.roomId) || Number(normalized.roomId) <= 0) {
    throw new Error('日记缺少有效的家庭 ID');
  }
  if (typeof normalized.date !== 'string' || normalized.date.length === 0) {
    throw new Error('日记缺少有效日期');
  }
  if (typeof normalized.content !== 'string') {
    throw new Error('日记正文格式无效');
  }

  return normalized as DiarySyncPayload;
}
