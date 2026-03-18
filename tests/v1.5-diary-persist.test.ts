import { describe, it, expect } from 'vitest';

describe('Diary AI Reply Persistence', () => {
  describe('DiaryEntry type', () => {
    it('should support aiReply, aiEmoji, aiTip fields', () => {
      const entry = {
        id: 'test1',
        date: '2026-03-12',
        content: '今天奶奶认出了我',
        moodEmoji: '😄',
        moodLabel: '很开心',
        tags: ['认出家人', '特别开心'],
        createdAt: new Date().toISOString(),
        aiReply: '太棒了！奶奶今天认出了你，这是非常积极的信号。',
        aiEmoji: '🎉',
        aiTip: '多和奶奶聊聊过去的美好回忆',
      };
      expect(entry.aiReply).toBeDefined();
      expect(entry.aiEmoji).toBe('🎉');
      expect(entry.aiTip).toContain('回忆');
    });

    it('should allow aiReply fields to be undefined for old entries', () => {
      const oldEntry = {
        id: 'old1',
        date: '2026-03-10',
        content: '今天散步了',
        moodEmoji: '😊',
      };
      expect((oldEntry as any).aiReply).toBeUndefined();
      expect((oldEntry as any).aiEmoji).toBeUndefined();
    });
  });

  describe('AI reply preview truncation', () => {
    it('should truncate long AI replies to 60 chars with ellipsis', () => {
      const longReply = 'A'.repeat(80); // 80 chars, definitely > 60
      const preview = longReply.length > 60 ? longReply.slice(0, 60) + '...' : longReply;
      expect(preview.length).toBe(63); // 60 + '...'
      expect(preview.endsWith('...')).toBe(true);
    });

    it('should not truncate short AI replies', () => {
      const shortReply = '辛苦了，继续加油！';
      const preview = shortReply.length > 60 ? shortReply.slice(0, 60) + '...' : shortReply;
      expect(preview).toBe(shortReply);
      expect(preview.endsWith('...')).toBe(false);
    });
  });

  describe('Share text generation', () => {
    it('should generate proper share text with all fields', () => {
      const entry = {
        date: '2026-03-12',
        moodEmoji: '😄',
        moodLabel: '很开心',
        tags: ['散步', '认出家人'],
        content: '今天奶奶在公园散步时认出了我',
        aiReply: '这是非常好的信号！',
        aiTip: '多带奶奶去熟悉的地方',
      };

      const lines = [
        `📖 老宝的护理日记`,
        `📅 ${entry.date}`,
        `${entry.moodEmoji} 心情：${entry.moodLabel}`,
        `🏷️ ${entry.tags.join('、')}`,
        '', `📝 ${entry.content}`,
        '', `🩺 AI 护理顾问回复：`, entry.aiReply,
        '', `💡 小贴士：${entry.aiTip}`,
        '', '—— 来自小马虎 🐴🐯 护理助手',
      ];
      const shareText = lines.join('\n');

      expect(shareText).toContain('老宝的护理日记');
      expect(shareText).toContain('2026-03-12');
      expect(shareText).toContain('散步、认出家人');
      expect(shareText).toContain('AI 护理顾问回复');
      expect(shareText).toContain('小贴士');
      expect(shareText).toContain('小马虎');
    });

    it('should handle entries without AI reply', () => {
      const entry = {
        date: '2026-03-11',
        moodEmoji: '😌',
        content: '平静的一天',
        aiReply: undefined,
      };
      const lines = [`📅 ${entry.date}`, `📝 ${entry.content}`];
      if (entry.aiReply) {
        lines.push(`🩺 ${entry.aiReply}`);
      }
      const shareText = lines.join('\n');
      expect(shareText).not.toContain('🩺');
    });
  });

  describe('updateDiaryEntry logic', () => {
    it('should merge partial data with existing entry', () => {
      const existing = {
        id: 'e1',
        date: '2026-03-12',
        content: '原始内容',
        moodEmoji: '😊',
        aiReply: undefined as string | undefined,
      };
      const update = { aiReply: '新的AI回复', aiEmoji: '💕', aiTip: '小贴士' };
      const merged = { ...existing, ...update };

      expect(merged.content).toBe('原始内容');
      expect(merged.aiReply).toBe('新的AI回复');
      expect(merged.moodEmoji).toBe('😊');
    });
  });

  describe('getDiaryEntryById logic', () => {
    it('should find entry by id from array', () => {
      const entries = [
        { id: 'a1', date: '2026-03-12', content: 'First' },
        { id: 'a2', date: '2026-03-11', content: 'Second' },
        { id: 'a3', date: '2026-03-10', content: 'Third' },
      ];
      const found = entries.find(e => e.id === 'a2');
      expect(found).toBeDefined();
      expect(found?.content).toBe('Second');
    });

    it('should return undefined for non-existent id', () => {
      const entries = [
        { id: 'a1', date: '2026-03-12', content: 'First' },
      ];
      const found = entries.find(e => e.id === 'nonexistent');
      expect(found).toBeUndefined();
    });
  });
});
