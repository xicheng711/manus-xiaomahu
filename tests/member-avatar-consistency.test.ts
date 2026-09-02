import { describe, expect, it } from 'vitest';
import { getMemberDisplayEmoji, getMemberEmojiById, getMemberEmojiByUserId } from '../lib/member-avatar';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('family member zodiac avatar consistency', () => {
  const sheepMember = { id: '17', userId: 4280, emoji: '👩', birthYear: 1991 };

  it('uses birth year before a legacy gender emoji and keeps stable member/user lookup maps', () => {
    expect(getMemberDisplayEmoji(sheepMember)).toBe('🐑');
    expect(getMemberDisplayEmoji({ emoji: '👨' })).toBe('👨');
    expect(getMemberDisplayEmoji({ emoji: '', birthYear: null })).toBe('👤');
    expect(getMemberEmojiById([sheepMember]).get('17')).toBe('🐑');
    expect(getMemberEmojiByUserId([sheepMember]).get('4280')).toBe('🐑');
  });

  it('routes non-diary surfaces through the shared resolver while diary chat remains the fixed smiley exception', () => {
    const familyPage = read('app/(tabs)/family.tsx');
    const joinerHome = read('components/joiner-home.tsx');
    const creatorHome = read('app/(tabs)/index.tsx');
    const familyRouter = read('server/family-router.ts');
    const diaryEdit = read('app/diary-edit.tsx');

    expect(familyPage).toContain('authorEmoji: getMemberDisplayEmoji(postingMember)');
    expect(familyPage).toContain('memberEmojiById.get(String(ann.authorId))');
    expect(familyPage).toContain('memberEmojiById.get(String(m.memberId))');
    expect(joinerHome).toContain('authorEmoji: getMemberDisplayEmoji(member)');
    expect(joinerHome).toContain('getMemberDisplayEmoji(m.room.members.find');
    expect(creatorHome).toContain('setMemberAvatarEmoji(getMemberDisplayEmoji(member))');
    expect(creatorHome).toContain('getMemberDisplayEmoji(myMember ?? m.room.members[0], \'🏠\')');
    expect(familyRouter).toContain('authorEmoji: getMemberDisplayEmoji(member)');
    expect(familyRouter).toContain('authorEmoji: getMemberDisplayEmoji(author, row.authorEmoji || \'👤\')');
    expect(diaryEdit).toContain('<Text style={styles.userAvatarEmoji}>😊</Text>');
  });
});
