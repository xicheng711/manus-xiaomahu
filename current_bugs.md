# 当前待修复问题（2026-07-13）

## 问题1：白天小睡 chart 不显示 + 睡眠 chart 数字被截断
- 截图 IMG_7730：简报页中「近一周白天小睡趋势」显示了 2h（120分钟），但首页 IMG_7732 显示「近7天暂无小睡记录」
- 首页的白天小睡 chart 数据来源是 `getWeeklySleepData()`，从本地 AsyncStorage 读取
- 晚间打卡记录了白天小睡 2h（IMG_7731），但首页 chart 没有显示
- 可能原因：首页 chart 组件读取的是旧缓存数据，或者打卡保存时 napMinutes 字段没有正确写入
- 睡眠 chart 数字 "10.8" 被截断为 "10.8"（实际上是 "10.8h" 但 h 被截断了）—— 这是 chart maxValue 不够大导致数字溢出

## 问题2：主照顾者首页头像下加被照顾者名字
- 截图 IMG_7726：首页右上角显示的是被照顾者的十二生肖头像（鼠），但下面没有名字
- 需要在头像下方加上被照顾者的昵称（如「姥姥」）

## 问题3：日记「结束并保存」后 AI 最后回复消失且未保存（核心 bug）
- 截图 IMG_7729：对话中有用户说「很不错」→ AI 回复「真好呀～看来姥姥今天状态在线...」
- 点击「结束并保存」或右上角「保存」后，AI 最后的回复消失了，没有被保存
- 根本原因分析：
  - `handleEndAndSave` 保存的是 `conversation` state 变量
  - 但 AI 回复是通过 streaming 逐步添加到 conversation 的
  - 如果 AI 正在 streaming 或者刚完成 streaming，conversation state 可能还没有包含完整的最后一条 AI 消息
  - 或者：conversation state 是最新的，但 `updateDiaryEntry` 保存时用的是旧的 closure 中的 conversation

## 问题4：Notification 点开后 Unmatched Route
- 截图 Screenshot2026-07-13at21.26.13：joiner 手机点开 notification 后显示 "Unmatched Route - Page could not be found. manusxiaomahu:///"
- 这是 deep link scheme 配置问题：notification 发送的 URL 是 `manusxiaomahu:///`（空路径），App 没有对应的路由处理
- 需要检查 notifications.ts 中 push notification 的 data 字段，以及 _layout.tsx 中的 deep link 处理逻辑
