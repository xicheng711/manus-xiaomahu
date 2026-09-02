import { getZodiac } from './zodiac';

/**
 * 家庭成员在非日记对话页面的统一头像来源。
 * 有有效出生年份时始终显示十二生肖；没有出生年份时才保留该成员明确设置的 Emoji。
 */
export type MemberAvatarSource = {
  emoji?: string | null;
  birthYear?: number | string | null;
};

function validBirthYear(value: unknown): number | null {
  const year = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  const currentYear = new Date().getFullYear();
  return Number.isInteger(year) && year >= 1900 && year <= currentYear ? year : null;
}

export function getMemberDisplayEmoji(
  member: MemberAvatarSource | null | undefined,
  fallback = '👤',
): string {
  const birthYear = validBirthYear(member?.birthYear);
  if (birthYear !== null) return getZodiac(birthYear).emoji;
  const configuredEmoji = typeof member?.emoji === 'string' ? member.emoji.trim() : '';
  return configuredEmoji || fallback;
}

/** 用成员行 ID 构建头像表，用于对旧公告和旧反应做显示时回填。 */
export function getMemberEmojiById(members: Array<MemberAvatarSource & { id?: string | number }> | null | undefined): Map<string, string> {
  return new Map((members ?? []).map(member => [String(member.id ?? ''), getMemberDisplayEmoji(member)]));
}

/** 用账户用户 ID 构建头像表，用于评论等作者使用 userId 的云端记录。 */
export function getMemberEmojiByUserId(members: Array<MemberAvatarSource & { userId?: string | number }> | null | undefined): Map<string, string> {
  return new Map((members ?? []).map(member => [String(member.userId ?? ''), getMemberDisplayEmoji(member)]));
}
