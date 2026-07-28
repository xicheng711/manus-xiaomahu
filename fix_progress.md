# 修复进度

## Bug1 - Joiner 打卡总结页面 ✅ 已修复
- 标题重复：share.tsx 第1346行，修复 params.date 时不再重复"打卡总结"
- 缺图表：loadHistoryDate 函数，Joiner 现在从云端拉取打卡数据构建 weeklyData
- 头像名字：loadHistoryDate 从云端 cloudGetRoomDetail 获取 elderName、elderPhotoUri、caregiver

## Bug2 - 公告时间错误 🔄 进行中
- 根因：数据库迁移未执行，announcements 表没有 localTimeStr 列
- 已创建迁移文件：drizzle/0003_add_local_time_str.sql
- 需要在 Replit 上执行 pnpm db:push
- 备选方案：在 server 启动时自动执行 ALTER TABLE（如果列不存在）

## Bug3 - 日记结束后仍可对话 🔄 待修复
- 根因：handleEndAndSave 调用 updateDiaryEntry 后立即 router.replace
  updateDiaryEntry 内部有异步云同步（等待 serverDiaryId 最多5秒）
  在等待期间，云端的 conversationFinished 可能还是 false
  用户重新打开日记时，mergeCloudDiaries 用云端数据覆盖本地，导致 finished=false
- 修复方案：在 mergeCloudDiaries 中，对已存在条目的 conversationFinished 字段
  只有当云端值为 true 时才更新（本地 true 不被云端 false 覆盖）

## Bug4 - 日记排序错误 🔄 待修复
- 根因：mergeCloudDiaries 对已存在条目更新时没有更新 createdAt
  主照顾者写完日记后，本地 saveDiaryEntry 用 unshift 写入
  但 mergeCloudDiaries 合并时可能将顺序打乱（已存在条目保留旧 createdAt）
- 修复方案：确保 mergeCloudDiaries 对全新条目的 createdAt 正确解析
  以及本地新写入的日记 createdAt 格式统一

## 关键文件
- app/share.tsx: Joiner 打卡总结页面
- app/(tabs)/diary.tsx: 日记列表，mergeCloudDiaries 函数
- app/diary-edit.tsx: 日记编辑，handleEndAndSave
- app/(tabs)/family.tsx: 家人共享，公告时间显示
- lib/storage.ts: saveDiaryEntry/updateDiaryEntry/saveFamilyAnnouncement
- server/family-router.ts: postAnnouncement
- drizzle/schema.ts: 数据库 schema（已有 localTimeStr 字段定义）
- drizzle/0003_add_local_time_str.sql: 新建的迁移文件

## 数据库迁移
- 迁移文件已创建：drizzle/0003_add_local_time_str.sql
- 需要在 Replit 上执行：pnpm db:push
- 或者在服务器启动时自动执行 ALTER TABLE（如果列不存在）
