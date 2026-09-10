export interface CheckInSyncIdentity {
  id: number;
  roomId: number;
  clientId?: string | null;
  date: string;
}

interface ResolveCheckInSyncIdentityInput<T extends CheckInSyncIdentity> {
  roomId: number;
  clientId?: string;
  requestedServerCheckInId?: number;
  expectedDate: string;
  clientMatch: T | null;
  requestedMatch: T | null;
  dateMatch: T | null;
}

function belongsToRoom(
  entry: CheckInSyncIdentity | null,
  roomId: number,
): entry is CheckInSyncIdentity {
  return !!entry && entry.roomId === roomId;
}

/**
 * Resolve one daily care record without treating a clock-derived date as its
 * primary identity. Stable clientId wins, then a verified server ID. The
 * room/date match remains a compatibility bridge for historical rows and old
 * clients that did not persist a clientId.
 */
export function resolveCheckInSyncIdentity<T extends CheckInSyncIdentity>({
  roomId,
  clientId,
  requestedServerCheckInId,
  expectedDate,
  clientMatch,
  requestedMatch,
  dateMatch,
}: ResolveCheckInSyncIdentityInput<T>): T | null {
  if (
    clientId
    && belongsToRoom(clientMatch, roomId)
    && clientMatch.clientId === clientId
  ) {
    return clientMatch;
  }

  if (requestedServerCheckInId && belongsToRoom(requestedMatch, roomId)) {
    // When a cached ID points at another care date in the same room, ignore it
    // and continue to the locked-date fallback instead of mutating that row.
    const conflictsWithLockedTarget = !!clientId
      && !!requestedMatch.clientId
      && requestedMatch.clientId !== clientId
      && requestedMatch.date !== expectedDate;
    if (!conflictsWithLockedTarget) return requestedMatch;
  }

  if (!belongsToRoom(dateMatch, roomId) || dateMatch.date !== expectedDate) {
    return null;
  }

  // The daily date is only a compatibility/uniqueness fallback. If another
  // device already assigned the canonical ID for this care day, keep that ID
  // and return it to the caller rather than creating a duplicate row.
  return dateMatch;
}
