import { describe, expect, it } from 'vitest';

import {
  getCompleteDiaryBody,
  getConversationAfterDiaryBody,
  getDiaryFollowUpConversation,
} from '../lib/diary-conversation-display';
import type { ConversationMessage } from '../lib/storage';

function message(
  id: string,
  role: ConversationMessage['role'],
  text: string,
): ConversationMessage {
  return { id, role, text, createdAt: `2026-08-31T12:00:0${id}.000Z` };
}

describe('diary conversation display split', () => {
  const body = '昨晚姥姥醒了三次，后来一直观察到早上，精神状态目前还算稳定。';
  const firstReply = '辛苦你了。今晚请继续观察精神状态，也要注意防滑和夜间照明。';

  it('shows the diary body once and preserves the complete AI and follow-up sequence', () => {
    const conversation = [
      message('1', 'user', body),
      message('2', 'ai', firstReply),
      message('3', 'user', '我还有一些担心，今晚会继续留意。'),
      message('4', 'ai', '好的，有变化时及时记录，也请照顾好自己。'),
    ];

    expect(getCompleteDiaryBody(body, conversation)).toBe(body);
    expect(getConversationAfterDiaryBody(conversation, body).map(item => item.text)).toEqual([
      firstReply,
      '我还有一些担心，今晚会继续留意。',
      '好的，有变化时及时记录，也请照顾好自己。',
    ]);
    expect(getDiaryFollowUpConversation(conversation, body, firstReply).map(item => item.text)).toEqual([
      '我还有一些担心，今晚会继续留意。',
      '好的，有变化时及时记录，也请照顾好自己。',
    ]);
  });

  it('uses the longer legacy copy when the separately stored diary body was truncated', () => {
    const fullBody = '昨晚姥姥醒了三次，后来一直观察到早上，精神状态目前还算稳定，需要继续留意走路防滑。';
    const truncatedBody = '昨晚姥姥醒了三次，后来一直观察到早上，精神状态目前还算稳定';
    const conversation = [
      message('1', 'user', fullBody),
      message('2', 'ai', firstReply),
    ];

    expect(getCompleteDiaryBody(truncatedBody, conversation)).toBe(fullBody);
    expect(getConversationAfterDiaryBody(conversation, fullBody)).toEqual([
      conversation[1],
    ]);
  });

  it('deduplicates harmless whitespace differences without changing the saved text', () => {
    const conversation = [
      message('1', 'user', '昨晚姥姥醒了三次，\n后来一直观察到早上，精神状态目前还算稳定。'),
      message('2', 'ai', firstReply),
    ];

    expect(getConversationAfterDiaryBody(conversation, body)).toEqual([
      conversation[1],
    ]);
  });

  it('never drops a genuinely different first user turn from malformed legacy data', () => {
    const distinctFirstTurn = '这是后来补充的一段不同内容，不能因为它位于 conversation 第一条就被删除。';
    const conversation = [
      message('1', 'user', distinctFirstTurn),
      message('2', 'ai', firstReply),
    ];

    expect(getCompleteDiaryBody(body, conversation)).toBe(body);
    expect(getConversationAfterDiaryBody(conversation, body)).toEqual(conversation);
  });

  it('keeps a standalone body and handles missing conversation safely', () => {
    expect(getCompleteDiaryBody(body, [])).toBe(body);
    expect(getConversationAfterDiaryBody(undefined, body)).toEqual([]);
    expect(getDiaryFollowUpConversation(null, body, firstReply)).toEqual([]);
  });
});
