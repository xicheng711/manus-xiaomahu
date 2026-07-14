# 截图分析

## IMG_7726 - 首页
- 右上角有被照顾者的十二生肖头像（鼠 🐀），粉色圆形背景
- 头像下方没有名字（需要添加 "姥姥"）
- 被照顾者是"姥姥"，照顾者是"乐乐"
- 首页显示"姥姥的家庭"
- 首页没有显示 TrendChart（因为 allCheckIns.length === 0，还没完成打卡）

## IMG_7729 - 日记页面
- 显示日记对话界面，有"结束并保存"按钮
- AI 回复了"真好呀～看来姥姥今天状态在线，你也跟着轻松不少吧？😊"
- 这个截图是关于日记保存问题的

## IMG_7727 - 个人信息页
- 照顾者：乐乐，属牛，1997年
- 被照顾者：姥姥，属鼠，1984年
- 家庭管理：姥姥（主照顾者），邀请码 4N4HUJ

## 白天小睡 chart 问题分析
- 从截图看，首页还没有显示 TrendChart（因为 allCheckIns.length === 0）
- 问题可能是：用户完成了晚间打卡（选了 2h 白天小睡），但 chart 仍然显示"暂无小睡记录"
- 根据代码分析，napMinutes 在晚间打卡中被正确保存到本地和云端
- 可能的问题：
  1. 数据库中 napMinutes 是 int 类型，120 分钟应该能正确存储
  2. 从云端恢复时 napMinutes 也被正确映射
  3. TrendChart 中 napData 的 hasData 条件是 `!!c && napMins > 0`
  4. 如果 checkInMap 中的 date 和 dateRange 中的 date 格式不匹配，就会找不到数据

- 可能的根因：dateRange 生成的日期格式和 checkIn.date 格式不一致
  - dateRange 使用 `d.toISOString().split('T')[0]` 生成 YYYY-MM-DD
  - 但 buildDateRange 可能使用不同的格式
