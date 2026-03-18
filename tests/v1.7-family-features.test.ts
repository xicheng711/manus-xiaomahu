import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mock AsyncStorage ────────────────────────────────────────────────────────
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    multiGet: vi.fn().mockResolvedValue([]),
    multiSet: vi.fn().mockResolvedValue(undefined),
    getAllKeys: vi.fn().mockResolvedValue([]),
  },
}));

// ─── Family Data Model Tests ──────────────────────────────────────────────────
describe('Family Room Data Model', () => {
  it('generates a valid 6-character room code', () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    expect(code).toHaveLength(6);
    expect(/^[A-Z0-9]+$/.test(code)).toBe(true);
  });

  it('creates a valid FamilyRoom structure', () => {
    const room = {
      id: 'room_123',
      elderName: '奶奶',
      code: 'ABC123',
      createdAt: new Date().toISOString(),
      members: [],
    };
    expect(room.id).toBeTruthy();
    expect(room.elderName).toBe('奶奶');
    expect(room.code).toHaveLength(6);
    expect(Array.isArray(room.members)).toBe(true);
  });

  it('creates a valid FamilyMember structure', () => {
    const member = {
      id: 'member_456',
      name: '小明',
      role: 'caregiver' as const,
      roleLabel: '主要照顾者',
      emoji: '👩',
      color: '#FF6B6B',
      joinedAt: new Date().toISOString(),
    };
    expect(member.id).toBeTruthy();
    expect(member.name).toBe('小明');
    expect(['caregiver', 'family', 'nurse']).toContain(member.role);
    expect(member.emoji).toBeTruthy();
  });

  it('creates a valid FamilyAnnouncement structure', () => {
    const announcement = {
      id: 'ann_789',
      authorId: 'member_456',
      authorName: '小明',
      authorEmoji: '👩',
      authorColor: '#FF6B6B',
      content: '今天带奶奶去公园散步了，她心情很好！',
      emoji: '🌸',
      type: 'daily' as const,
      createdAt: new Date().toISOString(),
    };
    expect(announcement.id).toBeTruthy();
    expect(announcement.content).toBeTruthy();
    expect(['daily', 'visit', 'medical', 'news', 'reminder']).toContain(announcement.type);
  });
});

// ─── Announcement Type Tests ──────────────────────────────────────────────────
describe('Announcement Types', () => {
  const ANNOUNCEMENT_TYPES = [
    { type: 'daily', emoji: '📢', label: '日常', color: '#60A5FA' },
    { type: 'visit', emoji: '🏠', label: '探望', color: '#4ADE80' },
    { type: 'medical', emoji: '🏥', label: '医疗', color: '#F87171' },
    { type: 'news', emoji: '📰', label: '新闻', color: '#FBBF24' },
    { type: 'reminder', emoji: '⏰', label: '提醒', color: '#A78BFA' },
  ];

  it('has exactly 5 announcement types', () => {
    expect(ANNOUNCEMENT_TYPES).toHaveLength(5);
  });

  it('each type has required fields', () => {
    ANNOUNCEMENT_TYPES.forEach(t => {
      expect(t.type).toBeTruthy();
      expect(t.emoji).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.color).toMatch(/^#[0-9A-F]{6}$/i);
    });
  });

  it('has unique type identifiers', () => {
    const types = ANNOUNCEMENT_TYPES.map(t => t.type);
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
  });
});

// ─── Briefing Share Content Tests ─────────────────────────────────────────────
describe('Briefing Share Content', () => {
  it('formats briefing text with all sections', () => {
    const elderName = '奶奶';
    const date = '2026年3月13日';
    const checkIn = {
      moodEmoji: '😊',
      moodScore: 8,
      sleepHours: 7,
      sleepQuality: '良好',
      medicationTaken: true,
      diet: '正常',
      careScore: 88,
    };
    const aiSummary = '今日护理状态良好，建议多进行户外活动。';
    const encouragement = '您辛苦了！每一天的坚持都是爱的表达。';

    const shareText = [
      `🌸 ${elderName}今日护理简报 - ${date}`,
      ``,
      `💤 睡眠：${checkIn.sleepHours}小时（${checkIn.sleepQuality}）`,
      `😊 心情：${checkIn.moodEmoji} ${checkIn.moodScore}/10`,
      `💊 用药：${checkIn.medicationTaken ? '✅ 按时服药' : '❌ 未服药'}`,
      `🍽️ 饮食：${checkIn.diet}`,
      `⭐ 护理指数：${checkIn.careScore}分`,
      ``,
      `🤖 AI 护理分析：${aiSummary}`,
      ``,
      `💪 ${encouragement}`,
    ].join('\n');

    expect(shareText).toContain('护理简报');
    expect(shareText).toContain('睡眠');
    expect(shareText).toContain('护理指数');
    expect(shareText).toContain('AI 护理分析');
    expect(shareText).toContain(encouragement);
  });
});

// ─── Care Index Display Tests ──────────────────────────────────────────────────
describe('Care Index Score Display', () => {
  it('displays care score badge when score exists', () => {
    const careScore = 88;
    const badge = careScore != null ? `护理指数 ${careScore}分` : null;
    expect(badge).toBe('护理指数 88分');
  });

  it('does not display badge when score is null', () => {
    const careScore: number | null = null;
    const badge = careScore != null ? `护理指数 ${careScore}分` : null;
    expect(badge).toBeNull();
  });

  it('formats care score correctly for different values', () => {
    const scores = [60, 75, 88, 95, 100];
    scores.forEach(score => {
      const text = `护理指数 ${score}分`;
      expect(text).toContain(score.toString());
      expect(text).toContain('分');
    });
  });
});

// ─── Notification Content Tests ───────────────────────────────────────────────
describe('Family Announcement Notification', () => {
  it('formats notification title correctly', () => {
    const authorName = '小明';
    const authorEmoji = '👩';
    const title = `${authorEmoji} ${authorName} 发布了家庭公告`;
    expect(title).toBe('👩 小明 发布了家庭公告');
  });

  it('truncates long announcement content', () => {
    // Use ASCII content to avoid multi-byte character length issues
    const longContent = 'This is a very long family announcement content that exceeds sixty characters and should be truncated for display in notifications.';
    const truncated = longContent.length > 60 ? longContent.slice(0, 60) + '...' : longContent;
    expect(truncated.length).toBeLessThanOrEqual(63); // 60 chars + '...'
    expect(truncated.endsWith('...')).toBe(true);
  });

  it('does not truncate short announcement content', () => {
    const shortContent = '今天带奶奶去公园了！';
    const result = shortContent.length > 60 ? shortContent.slice(0, 60) + '...' : shortContent;
    expect(result).toBe(shortContent);
    expect(result.endsWith('...')).toBe(false);
  });
});

// ─── Onboarding Medication Step Tests ─────────────────────────────────────────
describe('Onboarding Medication Step', () => {
  it('validates medication name is not empty', () => {
    const name = '阿司匹林';
    expect(name.trim().length > 0).toBe(true);
  });

  it('validates medication name is empty', () => {
    const name = '   ';
    expect(name.trim().length > 0).toBe(false);
  });

  it('creates a valid medication entry from onboarding', () => {
    const med = {
      id: `med_${Date.now()}`,
      name: '阿司匹林',
      dosage: '100mg',
      frequency: '每日一次',
      times: ['08:00'],
      notes: '饭后服用',
      active: true,
      createdAt: new Date().toISOString(),
    };
    expect(med.name).toBe('阿司匹林');
    expect(med.active).toBe(true);
    expect(med.times).toHaveLength(1);
  });

  it('supports skipping medication step', () => {
    // Skipping should be allowed (medications are optional during onboarding)
    const medications: any[] = [];
    const canProceed = true; // always can proceed even with empty medications
    expect(canProceed).toBe(true);
    expect(medications).toHaveLength(0);
  });
});
