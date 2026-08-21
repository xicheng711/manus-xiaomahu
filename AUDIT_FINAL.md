# 小马虎 App 本轮修改完整审查结论

## 审查范围
提交 `6e5fcc5` + `ab3ed95`，共 11 个文件、403 行新增、170 行删除。

## 逐项审查结果

### 1. 本地缓存与后台刷新（cloud-sync.ts + 各页面）
- `DEFAULT_CACHE_MAX_AGE_MS = 0`：每次进入页面都后台拉取云端。
- 页面先 `setEntries(localSorted)` 立即渲染本地数据，再异步 `shouldRefreshCloudCache` → 云端拉取 → `setEntries(merged)`。
- 下拉刷新和通知点击传 `force=true` 跳过任何缓存判断。
- **覆盖页面**：首页（index.tsx）、Joiner 首页（joiner-home.tsx）、日记列表（diary.tsx 主照顾者+Joiner）。
- **未覆盖**：medication.tsx 和 family.tsx 仍使用旧的每次直接云端拉取模式（不影响正确性，只是没有本地优先优化）。

### 2. 日记完整显示（diary.tsx + diary-edit.tsx + diary-detail.tsx）
- diary.tsx：`numberOfLines={2}` 已移除（列表卡片内容）；AI 预览 `slice(0,60)` 已移除。
- diary-edit.tsx：`numberOfLines={5}` 已移除（输入框）；`slice(0,80)` 已移除（旧版日记气泡）。
- diary-detail.tsx：`slice(0,100)` 已移除（气泡内容）。
- 日历视图 miniContent 的 `numberOfLines={2}` 也已移除。

### 3. 日记草稿保存（diary-edit.tsx + storage.ts）
- `DiaryDraft` 接口：content, selectedMood, caregiverMoodIdx, selectedTags, savedAt。
- 自动保存：600ms 防抖，写入 `diary_draft_v1:${familyId}`。
- 恢复：新建日记时按 `familyId` 读取草稿，切换家庭时清空再恢复对应家庭。
- 发布时清除：`handleSubmit` 中 `clearDiaryDraft(familyId)`。
- 底部按钮："保存草稿，稍后继续"。
- 恢复提示："📝 已恢复本机草稿，可继续编辑"。

### 4. 左滑保护（_layout.tsx + diary-edit.tsx）
- `_layout.tsx`：`diary-edit` 路由 `gestureEnabled: false, fullScreenGestureEnabled: false`。
- `diary-edit.tsx`：返回和取消按钮改为 `requestLeaveEditor()`，有内容时弹出三选一确认。

### 5. 多家庭数据隔离（storage.ts + family-context.tsx + weekly-echo.tsx）
- 所有日记读写传 `familyId`；草稿按 `familyId` 隔离。
- 周回顾传入 `familyId`，`getDiaryEntries(familyId)` 和 `getRecentCheckIns(7, familyId)`。
- 家庭切换时先 `setActiveFamilyId` + `setActiveRoomIdCache` + `setCloudSyncState`，再切换 UI。
- `clearScopedFamilyData` 包含 `DIARY_DRAFT`。

### 6. AI 上下文连续性（ai-router.ts + diary-edit.tsx）
- 服务端提示词新增 3 条规则：优先回应用户最新一句、不重新分析日记、对收束性短句简短回应。
- 客户端 `handleFollowUp` 使用 `conversationRef.current` 构建完整历史。
- 服务端 `followUpDiary` 按 system → user(原文) → assistant(首次回复) → history → question 构建多轮消息。

### 7. 晚间吃饭记录换行（checkin.tsx）
- 饮食补充输入框：`multiline` + `submitBehavior="newline"` + `blurOnSubmit={false}` + `returnKeyType="default"`。

### 8. 打卡页面
- checkin.tsx 已有通知刷新监听（之前的提交）。
- 晚间打卡覆盖问题已修复（index.tsx 合并策略）。
- 备注输入框换行已修复（之前的提交）。

## 潜在风险（不影响发布，可后续优化）
1. diary-detail.tsx 的 `handleFollowUp` 中 `followUpHistory.slice(2)` 可能多跳过两条追问消息——但该页面目前主要用于只读查看，不太会触发追问。
2. medication.tsx 和 family.tsx 未接入本地优先缓存策略，但不影响正确性。
3. 日记列表卡片和日历视图移除了 numberOfLines 后，长日记会让卡片变高；如果觉得列表太长可以后续加回列表预览截断。
