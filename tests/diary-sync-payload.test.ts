import { describe, expect, it } from 'vitest';
import { buildDiarySyncPayload } from '../lib/diary-sync-payload';

describe('diary sync canonical payload', () => {
  it('removes nullable legacy fields before the HTTP fallback reaches syncDiary', () => {
    const payload = buildDiarySyncPayload({
      id: 'local-restored-draft',
      clientId: 'client-142',
      date: '2026-09-03',
      content: '完整日记正文',
      moodEmoji: '😊',
      moodLabel: '还可以',
      moodScore: null,
      tags: ['散步'],
      caregiverMoodEmoji: null,
      caregiverMoodLabel: null,
      aiReply: '完整的小马虎回复',
      aiEmoji: null,
      aiTip: null,
      conversation: [
        { id: 'u1', role: 'user', text: '完整日记正文', createdAt: '2026-09-03T01:00:00.000Z' },
        { id: 'a1', role: 'ai', text: '完整的小马虎回复', createdAt: '2026-09-03T01:00:01.000Z' },
      ],
      conversationFinished: true,
      publishRevision: 'draft-snapshot-v4',
      localTimeStr: null,
    }, 21, 142);

    expect(payload).toMatchObject({
      roomId: 21,
      serverDiaryId: 142,
      clientId: 'client-142',
      date: '2026-09-03',
      content: '完整日记正文',
      conversationFinished: true,
      publishRevision: 'draft-snapshot-v4',
    });
    expect(payload.conversation).toHaveLength(2);
    expect(Object.values(payload)).not.toContain(null);
    expect(payload).not.toHaveProperty('moodScore');
    expect(payload).not.toHaveProperty('caregiverMoodEmoji');
    expect(payload).not.toHaveProperty('caregiverMoodLabel');
    expect(payload).not.toHaveProperty('aiEmoji');
    expect(payload).not.toHaveProperty('aiTip');
    expect(payload).not.toHaveProperty('localTimeStr');
  });

  it('normalizes numeric identities without ever converting null to server id zero', () => {
    const withoutServerId = buildDiarySyncPayload({
      clientId: null,
      date: '2026-09-03',
      content: '',
      moodScore: '4',
      conversationFinished: false,
    }, 21, undefined);

    expect(withoutServerId).not.toHaveProperty('serverDiaryId');
    expect(withoutServerId).not.toHaveProperty('clientId');
    expect(withoutServerId.moodScore).toBe(4);
    expect(withoutServerId.conversationFinished).toBe(false);
  });

  it('rejects invalid family and date fields before either transport is attempted', () => {
    expect(() => buildDiarySyncPayload({ date: '2026-09-03', content: '内容' }, 0)).toThrow('家庭 ID');
    expect(() => buildDiarySyncPayload({ date: '', content: '内容' }, 21)).toThrow('有效日期');
  });
});
