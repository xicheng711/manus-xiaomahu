export interface DiarySyncIdentity {
  id: number;
  roomId: number;
  authorUserId: number;
  clientId?: string | null;
  date?: string | null;
  content?: string | null;
  localTimeStr?: string | null;
}

interface ResolveDiarySyncIdentityInput<T extends DiarySyncIdentity> {
  roomId: number;
  userId: number;
  clientId?: string;
  requestedServerDiaryId?: number;
  expectedDate?: string;
  expectedContent?: string;
  expectedLocalTimeStr?: string;
  clientMatch: T | null;
  requestedMatch: T | null;
}

function belongsToAuthorAndRoom(
  entry: DiarySyncIdentity | null,
  roomId: number,
  userId: number,
): entry is DiarySyncIdentity {
  return !!entry && entry.roomId === roomId && entry.authorUserId === userId;
}

/**
 * Resolve an existing server diary for a publish retry.
 *
 * A durable clientId is authoritative for a reopened draft. A cached
 * serverDiaryId may be stale after earlier duplicate merges or response-loss
 * recovery, so it is accepted only when it still belongs to the same room,
 * author and (when present) client identity.
 */
export function resolveDiarySyncIdentity<T extends DiarySyncIdentity>({
  roomId,
  userId,
  clientId,
  requestedServerDiaryId,
  expectedDate,
  expectedContent,
  expectedLocalTimeStr,
  clientMatch,
  requestedMatch,
}: ResolveDiarySyncIdentityInput<T>): T | null {
  if (
    clientId &&
    belongsToAuthorAndRoom(clientMatch, roomId, userId) &&
    clientMatch.clientId === clientId
  ) {
    return clientMatch;
  }

  if (!requestedServerDiaryId || !belongsToAuthorAndRoom(requestedMatch, roomId, userId)) {
    return null;
  }

  if (clientId && requestedMatch.clientId && requestedMatch.clientId !== clientId) {
    return null;
  }

  if (clientId && !requestedMatch.clientId) {
    // 旧草稿没有 clientId 时，不能仅凭一个可能陈旧的数字 ID 覆盖同一作者的其他日记。
    // 日期和完整正文必须同时匹配；本地时间仅在双方都有值时参与校验。
    const legacyPayloadMatches = !!expectedDate
      && expectedContent !== undefined
      && requestedMatch.date === expectedDate
      && (requestedMatch.content ?? '') === expectedContent
      && (!expectedLocalTimeStr || !requestedMatch.localTimeStr || requestedMatch.localTimeStr === expectedLocalTimeStr);
    if (!legacyPayloadMatches) return null;
  }

  return requestedMatch;
}
