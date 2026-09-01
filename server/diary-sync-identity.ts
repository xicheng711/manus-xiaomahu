export interface DiarySyncIdentity {
  id: number;
  roomId: number;
  authorUserId: number;
  clientId?: string | null;
}

interface ResolveDiarySyncIdentityInput<T extends DiarySyncIdentity> {
  roomId: number;
  userId: number;
  clientId?: string;
  requestedServerDiaryId?: number;
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

  return requestedMatch;
}
