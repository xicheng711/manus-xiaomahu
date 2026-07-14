# 修复笔记

## 问题4：Notification 点开 Unmatched Route

### 根因分析
- 服务器端 `notifyRoomMembers` 发送 push notification 时，data 字段包含 `screen` 字段（如 `screen: 'family'`, `screen: 'home'`, `screen: 'diary'`）
- 客户端 `_layout.tsx` 第63行有 `addNotificationResponseReceivedListener`，根据 `data.screen` 路由到对应页面
- 但有一个调用（`toggleReaction`）没有传 `screen` 字段，只传了 `{ type: 'reaction', announcementId, roomId }`
- 当 `data.screen` 不存在时，第65行 `if (!data?.screen) return;` 会直接返回，不做任何导航

### 截图中的 "Unmatched Route - manusxiaomahu:///"
- 这说明 notification 的 URL scheme 被触发了，但路径为空（`///`）
- 这可能是 Expo 的默认行为：当 notification 没有指定 URL 但 app 配置了 scheme 时，系统会尝试打开 `manusxiaomahu:///`
- 解决方案：在 app.json/app.config.ts 中确认 scheme 配置，并在 _layout.tsx 中添加对空路径的处理

### 修复方案
1. 在 _layout.tsx 的 notification listener 中，如果 data 没有 screen 字段，默认导航到首页
2. 添加 Expo Router 的 catch-all 路由（+not-found.tsx）来处理无效的深链接，重定向到首页

## 问题1：白天小睡 chart 不显示
- 首页 chart 组件 `WeeklyNapChart` 读取 `getWeeklySleepData()` 返回的 `napMinutes` 字段
- 打卡时选择了 2h（120分钟），但首页显示「暂无小睡记录」
- 可能原因：打卡保存时 `napMinutes` 字段名不一致，或者 `getWeeklySleepData` 读取的 key 不对
- 需要检查打卡保存流程中 napMinutes 的写入路径

## 问题2：睡眠 chart 数字 "10.8" 被截断
- 简报页 chart Y轴最大值是 13，但 bar 标签 "10.8" 显示不完整（h 被截断）
- 这是 chart 组件的 maxValue 或 label 宽度问题

## 问题3：首页头像下加被照顾者名字
- IMG_7726 截图：首页右上角有被照顾者的十二生肖头像（鼠），下面没有名字
- 需要在头像下方加上被照顾者昵称
