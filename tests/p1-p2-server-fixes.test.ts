/**
 * P1/P2 服务端修复的源码断言（server 代码无 DB 时的回归网）：
 * - 日记并发：毫秒精度时间戳 + 去重分支陈旧快照保护
 * - 公告并发：按"本次是否新建成功"决定推送，而非预查
 * - 登出：先 flush 待同步公告，失败时警告不静默丢数据
 * - clearScopedFamilyData：不漏清 medication_changes
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(repo, p), 'utf8');

describe('P1：日记并发覆盖保护', () => {
  it('diary_entries 时间戳为毫秒精度（fsp=3）', () => {
    const schema = read('drizzle/schema.ts');
    // 只断言日记表的两处（打卡等表不动，避免误伤）
    const diaryBlock = schema.slice(
      schema.indexOf('export const diaryEntries'),
      schema.indexOf('export const diaryReads'),
    );
    expect(diaryBlock).toContain('timestamp("createdAt", { fsp: 3 })');
    expect(diaryBlock).toContain('timestamp("updatedAt", { fsp: 3 })');
  });

  it('有正式 migration SQL 且 server/db.ts 有幂等 MODIFY 迁移', () => {
    expect(existsSync(resolve(repo, 'drizzle/0005_diary_ms_timestamps.sql'))).toBe(true);
    const migration = read('drizzle/0005_diary_ms_timestamps.sql');
    expect(migration).toContain('timestamp(3)');
    const db = read('server/db.ts');
    expect(db).toContain("MODIFY COLUMN createdAt timestamp(3)");
    expect(db).toContain("MODIFY COLUMN updatedAt timestamp(3)");
    expect(db).toContain('DATETIME_PRECISION');
  });

  it('去重分支用 updatedAt > createdAt 判断行是否被推进，陈旧时跳过整行覆盖', () => {
    const router = read('server/family-router.ts');
    const branchStart = router.indexOf('if (!createResult.created)');
    expect(branchStart).toBeGreaterThan(-1);
    const branch = router.slice(branchStart, branchStart + 2500);
    // 已发布幂等直接返回
    expect(branch).toContain('dedup-already-published');
    // 行被推进过 → 陈旧快照只允许 finished 单向推进
    expect(branch).toContain('rowAdvanced');
    expect(branch).toContain('dedup-stale-skipped');
    // 陈旧分支里不允许整行 updateDiaryEntry（只能单字段 finished）
    const staleStart = branch.indexOf('if (rowAdvanced)');
    const staleEnd = branch.indexOf('} else {', staleStart);
    const staleBlock = branch.slice(staleStart, staleEnd);
    expect(staleBlock).not.toContain('content: input.content');
    expect(staleBlock).toContain('conversationFinished: true');
  });
});

describe('P2：公告并发只推一次', () => {
  it('createAnnouncement 返回 { announcement, created }', () => {
    const db = read('server/family-db.ts');
    const fnStart = db.indexOf('export async function createAnnouncement');
    const fn = db.slice(fnStart, fnStart + 1500);
    expect(fn).toContain('created: false');
    expect(fn).toContain('created: true');
    // 不再用 onDuplicateKeyUpdate 盲更新（并发输家会覆盖赢家内容）
    expect(fn).not.toContain('onDuplicateKeyUpdate');
  });

  it('postAnnouncement 只在 created 时推送，不用预查判断', () => {
    const router = read('server/family-router.ts');
    const procStart = router.indexOf('postAnnouncement: protectedProcedure');
    const proc = router.slice(procStart, procStart + 2500);
    expect(proc).toContain('const { announcement, created } = await createAnnouncement');
    expect(proc).toContain('if (created)');
    // 并发时两个请求的预查都可能为空——不能再靠它决定是否推送
    expect(proc).not.toContain('existingAnnouncement');
  });
});

describe('P2：登出前 flush 公告 + 不漏清 key', () => {
  it('handleSignOut 先刷待同步公告，刷不完警告二次确认', () => {
    const profile = read('app/profile.tsx');
    const fnStart = profile.indexOf('async function handleSignOut()');
    const fn = profile.slice(fnStart, fnStart + 1200);
    expect(fn).toContain('await syncAllPendingAnnouncements()');
    expect(fn).toContain('countPendingAnnouncements()');
    // 刷不完（断网）时设置警告数并 return，不直接清数据
    expect(fn).toContain('setSignOutPendingCount(n)');
    // 清本地数据在 flush 之后
    expect(fn.indexOf('syncAllPendingAnnouncements')).toBeLessThan(fn.indexOf('clearAllLocalData'));
  });

  it('登出弹窗展示未同步条数警告', () => {
    const profile = read('app/profile.tsx');
    expect(profile).toContain('signOutPendingCount > 0');
    expect(profile).toContain('仍要退出');
  });

  it('clearScopedFamilyData 清掉 medication_changes', () => {
    const storage = read('lib/storage.ts');
    const fnStart = storage.indexOf('export async function clearScopedFamilyData');
    const fn = storage.slice(fnStart, fnStart + 800);
    expect(fn).toContain('KEYS.MEDICATION_CHANGES');
  });

  it('有 countPendingAnnouncements helper', () => {
    const storage = read('lib/storage.ts');
    expect(storage).toContain('export async function countPendingAnnouncements');
  });
});
