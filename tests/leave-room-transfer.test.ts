/**
 * 主照顾者退出时的转移语义（P0）
 *
 * Bug：leaveRoom 对创建者无任何防护，直接 removeFamilyMember 会留下"无主"家庭——
 * 剩余成员的打卡/用药/档案操作全被 isCreator 门禁拦死，连解散都解散不了，
 * 数据变成谁也改不了的只读孤儿。
 *
 * 修复后的语义（server/family-router.ts leaveRoom）：
 * 1. 主照顾者退出 → 身份转给最早加入的成员（joinedAt 最早，id 次之）；
 * 2. 只剩自己 → 直接解散家庭（复用 deleteFamilyRoom）；
 * 3. 继任者不能已是别家庭的主照顾者（硬限制：一人只能是一个家庭的 creator），
 *    顺延下一位；全都不合格则报错，提示先解散；
 * 4. 同步更新 familyRooms.creatorUserId（此前是只写不读的死字段）。
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO = path.resolve(__dirname, '..');
const ROUTER = fs.readFileSync(path.join(REPO, 'server/family-router.ts'), 'utf8');

describe('主照顾者退出转移语义', () => {
  it('leaveRoom 先查成员身份，创建者走转移分支', () => {
    expect(ROUTER).toContain('const member = await requireRoomMember(userId, input.roomId);');
    expect(ROUTER).toContain('if (member.isCreator) {');
  });

  it('有其他成员时转给最早加入者（joinedAt 排序，id 兜底）', () => {
    expect(ROUTER).toContain('await getRoomMembers(input.roomId)');
    expect(ROUTER).toContain('new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()');
    expect(ROUTER).toContain('await updateFamilyMember(successor.id, { isCreator: true });');
  });

  it('只剩自己时直接解散家庭，不留无主孤儿', () => {
    expect(ROUTER).toContain('if (others.length === 0) {');
    expect(ROUTER).toContain('await deleteFamilyRoom(input.roomId);');
    expect(ROUTER).toContain('dissolved: true');
  });

  it('继任者跳过已是别家庭主照顾者的人（一人只能是一个家庭 creator）', () => {
    expect(ROUTER).toContain('await getUserFamilyRooms(m.userId)');
    expect(ROUTER).toContain('r.membership.isCreator');
    expect(ROUTER).toContain('请先解散家庭');
  });

  it('转移时同步 creatorUserId，不再是死字段', () => {
    expect(ROUTER).toContain('await updateFamilyRoom(input.roomId, { creatorUserId: successor.userId });');
  });

  it('非创建者退出走原来的直接移除', () => {
    // isCreator 分支结束后，所有退出都走 removeFamilyMember
    const idx = ROUTER.indexOf('await removeFamilyMember(input.roomId, userId);');
    expect(idx).toBeGreaterThan(0);
  });
});
