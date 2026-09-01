import { describe, expect, it } from 'vitest';
import { resolveDiarySyncIdentity, type DiarySyncIdentity } from '../server/diary-sync-identity';

const ROOM_ID = 701;
const USER_ID = 42;

function entry(overrides: Partial<DiarySyncIdentity> = {}): DiarySyncIdentity {
  return {
    id: 77,
    roomId: ROOM_ID,
    authorUserId: USER_ID,
    clientId: 'draft-client-1',
    date: '2026-09-01',
    content: '完整草稿正文',
    localTimeStr: '09:45',
    ...overrides,
  };
}

describe('reopened diary server identity resolution', () => {
  it('prefers the durable clientId match when a reopened draft carries a stale serverDiaryId', () => {
    const clientMatch = entry({ id: 88 });
    const staleRequestedMatch = entry({ id: 77, clientId: 'another-diary' });

    expect(resolveDiarySyncIdentity({
      roomId: ROOM_ID,
      userId: USER_ID,
      clientId: 'draft-client-1',
      requestedServerDiaryId: 77,
      clientMatch,
      requestedMatch: staleRequestedMatch,
    })).toEqual(clientMatch);
  });

  it('accepts the requested server diary when it belongs to the same room, author and client identity', () => {
    const requestedMatch = entry();

    expect(resolveDiarySyncIdentity({
      roomId: ROOM_ID,
      userId: USER_ID,
      clientId: 'draft-client-1',
      requestedServerDiaryId: 77,
      clientMatch: requestedMatch,
      requestedMatch,
    })).toEqual(requestedMatch);
  });

  it('accepts a legacy server draft without clientId and lets the publish attach the new durable identity', () => {
    const legacyRequestedMatch = entry({ clientId: null });

    expect(resolveDiarySyncIdentity({
      roomId: ROOM_ID,
      userId: USER_ID,
      clientId: 'new-durable-client-id',
      requestedServerDiaryId: 77,
      expectedDate: '2026-09-01',
      expectedContent: '完整草稿正文',
      expectedLocalTimeStr: '09:45',
      clientMatch: null,
      requestedMatch: legacyRequestedMatch,
    })).toEqual(legacyRequestedMatch);
  });

  it('rejects a legacy server id that belongs to the author but contains another diary', () => {
    const otherLegacyDiary = entry({ clientId: null, content: '另一篇日记正文' });

    expect(resolveDiarySyncIdentity({
      roomId: ROOM_ID,
      userId: USER_ID,
      clientId: 'draft-client-1',
      requestedServerDiaryId: 77,
      expectedDate: '2026-09-01',
      expectedContent: '完整草稿正文',
      expectedLocalTimeStr: '09:45',
      clientMatch: null,
      requestedMatch: otherLegacyDiary,
    })).toBeNull();
  });

  it('rejects a stale server id that points to another diary instead of blocking the reopened draft', () => {
    const anotherDiary = entry({ clientId: 'another-diary' });

    expect(resolveDiarySyncIdentity({
      roomId: ROOM_ID,
      userId: USER_ID,
      clientId: 'draft-client-1',
      requestedServerDiaryId: 77,
      clientMatch: null,
      requestedMatch: anotherDiary,
    })).toBeNull();
  });

  it('never accepts a client or server match from another family or another author', () => {
    expect(resolveDiarySyncIdentity({
      roomId: ROOM_ID,
      userId: USER_ID,
      clientId: 'draft-client-1',
      requestedServerDiaryId: 77,
      clientMatch: entry({ roomId: 999 }),
      requestedMatch: entry({ authorUserId: 999 }),
    })).toBeNull();
  });
});
