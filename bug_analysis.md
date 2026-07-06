# Bug 分析汇总

## 问题1: Joiner 简报标题显示「家人」，记录人显示「Tt」而不是主照顾者名字
- 文件: app/share.tsx
- 根因: `caregiverName` 初始值是 `'照顾者'`，从 `getUserProfile()` 读取。
  Joiner 的 `UserProfile.caregiverName` 是 joiner 自己的名字，不是主照顾者名字。
- 修复: 在 joiner 路径下，从 `activeMembership.room.members` 找到 `isCreator=true` 的成员，用其 name 作为 caregiverName
- 位置: share.tsx 第 972-992 行（loadAndGenerate）、第 1084-1085 行（loadSupplementaryData）、第 809-815 行（loadHistoryDate）

## 问题2: Joiner 首页「记录人：照顾者」应显示主照顾者真实名字
- 文件: components/joiner-home.tsx
- 根因: 第 750 行 `记录人：{caregiverName || '照顾者'}` 中 caregiverName 从 `getProfile()` 读取，可能为空
- 修复: loadData 中从 `activeMembership.room.members` 找 isCreator 成员作为 caregiverName 的来源

## 问题3: 主照顾者简报页缺少「近一周白天小睡趋势」
- 文件: app/(tabs)/index.tsx
- 根因: 首页云端同步时（第 589-613 行）写回本地打卡数据时，漏了 `daytimeNap`、`napMinutes`、`napDuration`、`awakeHours`、`nightWakings` 等字段
- 修复: 在 index.tsx 云端打卡同步写回时补充这些字段

## 问题4: 主照顾者首页白天小睡数据没有 sync
- 同问题3，同一个修复

## 问题5: 日记「结束并保存」按钮点击后仍可继续对话
- 文件: app/diary-edit.tsx
- 根因: 底部「结束并保存」按钮（第 824-830 行）调用 `handleEndAndSave`，但 `handleEndAndSave` 只保存了 conversation 和设置 conversationFinished=true，然后 `router.replace('/(tabs)/diary')`。
  但问题是：当用户从日记列表重新打开同一篇日记时，`finished` 状态从本地 `entry.conversationFinished` 读取。
  如果 `updateDiaryEntry` 异步还没完成就 replace 了，或者本地写入成功但 `finished` 状态没有正确被读到，就会出现仍可继续对话的情况。
- 另外：右上角「❤️ 保存」按钮也调用同一个 `handleEndAndSave`，但用户说右上角可以正常结束——说明问题可能在于底部按钮的旧版本（旧 TestFlight）调用的不是 `handleEndAndSave` 而是别的逻辑。
- 修复: 确保底部按钮调用完全相同的 `handleEndAndSave` 逻辑，并且 await 完成后再跳转

## 问题6: 日记列表排序问题（新日记被收起来了）
- 文件: app/(tabs)/diary.tsx
- 根因: 列表永远先展示 `entries.slice(0, 3)`，其余折叠到「查看更多日记」。
  新日记虽然排在最前面，但如果已展开「查看更多」，收起后新日记会跑到分组里。
- 修复: 确保排序正确（最新在最前），展开后的分组也按时间降序排列

## 问题7: 新注册用户没有 notification
- 文件: app/onboarding.tsx
- 根因: `handleFinish`（creator）和 `handleJoinerFinish`（joiner）都没有调用 `registerPushToken()`
  只有 `_layout.tsx` 延迟 3/8 秒注册，但如果用户刚注册完还没登录（session 还没建立），token 注册会被跳过
- 修复: 在 onboarding 完成跳转前调用 `registerPushToken()`
