# 小马虎 — Project TODO

## Setup & Architecture
- [x] Initialize Expo project with TypeScript and NativeWind
- [x] Design warm Notion/Canva color palette
- [x] Create AsyncStorage data layer (storage.ts)
- [x] Create zodiac utility (zodiac.ts)
- [x] Create professional dementia care knowledge base (care-knowledge.ts)
- [x] Create AI care advice engine with 1-100 score (ai-advice.ts)
- [x] Create weather fetch utility (weather.ts)

## Branding
- [x] Update app name to 小马虎
- [x] Generate cute horse-tiger cartoon mascot icon
- [x] Update app.config.ts with name and logoUrl

## Onboarding Flow
- [x] Welcome screen with app introduction
- [x] Elder name + nickname + birth date input
- [x] Zodiac auto-detection from birth year
- [x] Caregiver name + birth year input
- [x] City input for weather
- [x] Save profile to AsyncStorage

## Home Screen
- [x] App header with 小马虎 branding
- [x] Today check-in banner (pending/done state)
- [x] AI encouragement card
- [x] 7-day mood trend bar chart
- [x] Daily care tip card
- [x] Quick access grid (medication, diary, share, AI)
- [x] Fade-in animation on load

## Daily Check-in (游戏对话式)
- [x] Morning check-in: sleep hours scroll wheel picker
- [x] Morning check-in: sleep quality option cards
- [x] Morning check-in: optional voice/text notes
- [x] Evening check-in: mood emoji picker grid
- [x] Evening check-in: medication taken cards
- [x] Evening check-in: meal situation option cards
- [x] Evening check-in: optional notes
- [x] Completion animation with care score display
- [x] Step-by-step game dialog with progress indicator

## AI Assistant Screen
- [x] 1-100 care score ring with animated spring effect
- [x] Weather badge integration
- [x] Professional advice cards (sleep, mood, medication, activity, nutrition)
- [x] Detailed nutrition advice with meal suggestions
- [x] Encouragement message for caregiver

## Medication Reminders
- [x] Medication list with emoji icons
- [x] Add medication form
- [x] Toggle active/inactive and delete

## Care Diary
- [x] Diary entry list with mood emoji
- [x] New entry form with mood picker and tags
- [x] Delete entries

## Family Sharing
- [x] Daily summary generation
- [x] Share via system share sheet (WeChat compatible)

## Animations & Polish
- [x] Fade-in animations on screen load
- [x] Spring animation on score ring
- [x] Staggered advice card animations
- [x] Haptic feedback on interactions

## Gemini AI 升级 & 动态简报
- [x] 集成 Gemini 2.5 Flash API 到服务器端，生成动态专业护理建议
- [x] 集成 Brave Search API 获取实时天气和健康资讯
- [x] 每日 AI 简报：综合打卡数据生成今日老人状态简报文字
- [x] 生成可爱动画简报卡片（可分享至微信）
- [x] 家庭成员分享页面接入 Gemini AI 简报
- [x] 首页 AI 卡片升级（显示 Gemini AI 标识 + 功能徽章）

## 本地推送提醒
- [x] 早上 8:00 打卡提醒推送通知
- [x] 晚上 21:00 打卡提醒推送通知
- [x] 设置页面可开关推送提醒
- [x] 首次使用时请求通知权限

## 历史趋势图
- [x] 近7天/30天睡眠时长折线图
- [x] 近7天/30天情绪评分折线图
- [x] 近7天/30天用药情况（按时/漏药）
- [x] 周/月切换视图
- [x] 集成到首页或日记页

## 精美简报卡片重设计
- [x] 研究精美简报卡片设计参考
- [x] 重新设计简报卡片：内容全面覆盖（睡眠、心情、用药、饮食、天气、AI建议、护理指数）
- [x] 精美可爱的视觉风格，适合微信分享
- [x] 一键分享到微信功能优化

## AI 日记即时回复
- [x] 日记写完后 Gemini AI 立刻生成专业医生+温暖助手风格的回复
- [x] 回复包含心理安慰、鼓励、专业护理建议
- [x] 回复以对话气泡形式显示在日记下方

## 日记语音输入
- [x] 日记页面添加小话筒按钮（语音转文字）
- [x] 使用 expo-speech-recognition 或类似方案实现语音输入

## Bug 修复
- [x] 修复 AI 建议页面 JSON 解析错误（Unterminated string in JSON）

## 趋势图重设计
- [x] 参考情绪晴雨表风格重新设计趋势图
- [x] 心情指数温度计/仪表盘样式 + 平均值 + 环比变化
- [x] 心情分布统计（emoji 计数）
- [x] 情绪变化平滑曲线图（替代柱状图）
- [x] 周/月切换 + 日期范围导航（上一周/下一周箭头）

## 导出长图片分享
- [x] 生成包含老人今日所有信息的精美长图片
- [x] 图片末尾包含 AI 每日不同的鼓励话语
- [x] 支持保存到本地相册
- [x] 支持分享到微信

## 语音输入修复
- [x] 修复日记语音输入按钮灰色不可点击问题（Expo Go 兼容）

## 首页头像
- [x] 右上角显示用户十二生肖 emoji 圆形头像

## Bug 修复 v1.3
- [x] 修复 VirtualizedList 嵌套在 ScrollView 中的控制台错误

## Bug 修复 v1.4
- [x] 修复 ExpoSpeechRecognition 原生模块在 Expo Go 中崩溃 — 替换为 Expo Go 兼容方案
- [x] 修复 checkin.tsx 中 VirtualizedList 嵌套在 ScrollView 中的错误（彻底解决）

## 日记 AI 回复持久化
- [x] 更新 DiaryEntry 类型，添加 aiReply 字段
- [x] 修改日记保存逻辑，将 AI 回复一并存储到本地
- [x] 创建日记详情页（diary-detail），展示完整日记内容和 AI 回复
- [x] 日记详情页支持再次分享功能
- [x] 日记历史列表中显示 AI 回复摘要预览
- [x] 点击日记条目可跳转到详情页

## UI 美化与动画
- [x] 创建共享动画工具库（fadeIn, slideUp, bounce, stagger, pulse）
- [x] 统一精致配色方案（基于 Coolors 研究）
- [x] 首页美化：卡片渐入动画、问候语打字效果、快捷入口弹入
- [x] 打卡页美化：心情 emoji 选中弹跳、进度条动画、完成庆祝动画
- [x] 日记页美化：写作模式滑入、标签弹跳、AI 回复打字效果
- [x] 用药页美化：药物卡片动画、服药打勾动画
- [x] 按钮按压缩放微交互（全局）
- [x] 卡片阴影和圆角统一优化

## UI 美化 v1.6
- [x] 创建共享 BackButton 组件（丝滑动画返回按钮）
- [x] 所有子页面添加左上角返回按钮（assistant, share, diary-detail, export-image, profile）
- [x] 更新 Tab 栏图标为线条风格（参考 Figma 设计）
- [x] 美化 assistant 页面整体 UI

## 家庭多人模式 & 家人共享 Tab
- [x] 设计家庭数据模型（FamilyRoom, FamilyMember, FamilyAnnouncement）
- [x] 更新存储层支持家庭房间码、成员管理
- [x] Onboarding 末尾添加药物录入步骤
- [x] 底部导航新增「家人共享」第5个 Tab
- [x] 家庭公告/小广播：发布、查看、删除
- [x] 家庭公告推送通知（有新公告时提醒）
- [x] 简报分享区：AI护理预测 + 昨日日记 + 今日公告
- [x] 简报一键分享微信/保存长图
- [x] 首页显示护理指数评分

## Tab 栏图标风格升级
- [x] 激活状态：橙粉渐变圆角方块背景 + 白色图标
- [x] 未激活状态：浅灰色圆角方块背景 + 深灰色图标
- [x] 5个 Tab 统一使用新风格

## UI 精修 v1.9
- [x] 快捷入口改为大圆角渐变卡片 + 大号白色线条图标
- [x] Tab 栏改为圆形图标背景（参考截图风格）

## Bug 修复 v1.9.1
- [x] 快捷入口改为 2×2 网格排列
- [x] Tab 栏底部白色区域突兀/不居中问题修复

## 功能升级 v2.0
- [x] Tab 栏图标垂直居中（图标在白色区域中间）
- [x] 调研当前语音转文字 API，确认中文支持质量
- [x] AI 医生回复结构优化：共情 → 专业建议 → 鼓励
- [x] 日记页改为微信聊天气泡样式（用户右绿，AI左蓝）

## 文案与体验优化 v2.1
- [x] 主页 App 名称改为『我们一起照顾好今天』，emoji 改为 🩺☀️
- [x] AI 卡片标题改为『AI 今日护理预测』，副标题改为『[老人名称]护理建议』
- [x] 全 App 替换『老年痴呆』为『阿兹海默』
- [x] 问候语加入设备定位获取实时天气和天气 emoji

## UI 优化 v2.2
- [x] 问候语改为使用照顾者自己的名字（如『亲爱的乐妈』）
- [x] 打卡横幅重新设计，参考 Figma 风格，去掉纯绿色背景

## 功能完善 v2.3
- [x] 设置页加入『照顾者姓名』输入框
- [x] 快捷入口改为 Figma 风格小圆角方形图标（64×64）+ 标签紧凑布局
- [x] 首次启动引导用户完成 profile 设置（onboarding）

## UI 对齐 Figma Make v2.4
- [ ] 主页标题「我们一起照顾好今天」改为珊瑚红色（#FF6B6B）大字
- [ ] 右上角头像改为三文鱼粉色圆角方形
- [ ] AI 卡片加入标签行（护理指数/营养建议/天气组合）和「查看详细建议」链接
- [ ] AI 卡片图标改为紫色渐变圆形背景 + 星星图标
- [ ] 周/月切换改为居中 pill 样式

## 新功能 v2.5
- [x] 打卡完成后全屏撒花/烟花庆祝动画
- [x] 日记详情页底部加『继续追问 AI』多轮对话输入框
- [x] 家人 Tab 成员头像支持上传真实照片
- [x] 首页右上角头像优化（大小、圆角、显示照片）

## 品牌统一 v2.6
- [x] Onboarding 首页马虎 emoji 换成新图标图片
- [x] Splash 背景色改为淡紫色 #F3EEFF
- [x] 参考 Figma node 5-454 重新设计对应区域

## 功能与 UI 优化 v2.7
- [x] 更新 App 图标为新版奶奶+日记本插画
- [x] 快捷入口重新设计：大圆角卡片 + 渐变背景 + 圆角方形图标（左上）+ 标签（左下）
- [x] Onboarding 最后一步加打卡提醒时间选择器（早/晚）
- [x] 设置页支持修改打卡提醒时间

## 头像与文案优化 v2.8
- [x] Onboarding 加头像选择步骤（上传照片 or 选择十二生肖）
- [x] 首页右上角头像同步显示用户选择的头像/照片
- [x] 文案『我们一起照顾好今天』改为『让我们一起照顾好每一天』

## Tab 栏与日记重构 v2.9
- [x] Tab 栏标签改为 Figma 风格：首页/每日打卡/用药记录/日记/家人共享
- [x] 日记页改为纯列表页 + 浮动新建按鈕（FAB）
- [x] 新建 diary-edit.tsx 日记编辑页（含 AI 对话区域）
- [x] 日记详情页 AI 追问逻辑迁移到 diary-edit.tsx

## v3.0 日记重构 + 多角色家庭架构

### Bug 修复
- [x] 修复 followUpDiary AI 回复返回原始 JSON 字符串问题（应返回纯文本）
- [x] 日记编辑页保存后按钮文案改为「查看日记详情」和「返回日记列表」（已改为「结束并保存」统一按钮）

### 日记 UX 重构（pasted_content_2.txt）
- [x] 扩展 DiaryEntry 数据模型：新增 conversation 字段（多轮对话历史）
- [x] 重构 diary-edit.tsx：统一日记编写 + AI 首次回复 + 多轮追问在同一页面
- [x] 日记页保存后不跳转，留在当前页面继续追问 AI
- [x] 新增「结束并保存」按钮返回日记列表
- [x] 重新打开已有日记时，完整恢复对话历史
- [x] 兼容旧日记（只有 aiReply 字段的条目）

### 家庭分享 UI 改进（pasted_content_4.txt）
- [x] 发布公告的「发布」按钮移到页面底部（不在右上角）
- [x] 简报分享按日期显示（今日 + 历史日期）
- [x] 「导出长图」改为「查看简报」
- [x] 简报分享选项：先「查看简报」再「一键分享」（默认微信）

## v3.1 公告 Modal 改进 + 护理档案

### 公告 Modal UI 改进
- [ ] 发布公告 Modal 内容居中布局（参考截图）
- [ ] 取消按钮保留在左上角
- [ ] 发布后自动滚动到新公告位置
- [ ] 每条公告右上角小叉子删除按钮（发布人可删除自己的公告）
- [ ] 点击叉子弹出确认对话框「要不要删除」

### 护理档案（pasted_content_5.txt）
- [ ] Onboarding 新增护理需求多选步骤（记忆/认知、高血压、血糖/糖尿病、情绪支持、癌症护理、睡眠问题、跌倒风险、营养/食欲、术后恢复）
- [ ] 根据选择的护理需求动态显示条件特定输入项
- [ ] Onboarding 完成后 AI 生成护理档案摘要
- [ ] AI 评分和建议根据护理档案个性化调整
- [ ] 日记 AI 回复理解老人护理背景

## v3.2 Tab Bar 重设计（Figma node-id=5-638）

- [x] 底部 Tab Bar 活跃 Tab：橙色渐变圆形背景 + 白色图标
- [x] 底部 Tab Bar 非活跃 Tab：无背景，灰色线条图标 + 灰色标签
- [x] 用药记录 Tab 图标换成胶囊/药片线条图标（不用 emoji）
- [x] Tab Bar 白色背景 + 顶部阴影

## v3.3 首页 AI 卡片重设计（Figma node-id=4-252）

- [x] AI 卡片背景改为淡紫色渐变（#F3EEFF → #EDE9FE）
- [x] 左上角图标：紫色渐变圆角方形背景 + 白色星星图标
- [x] 右上角装饰星星（浅紫色，半透明）
- [x] 副标题文案：「老宝的阿兹海默护理建议 · 每日更新」
- [x] 内容区：白色圆角卡片，显示 AI 建议摘要文字
- [x] 标签行：🧠 护理指数 · 💬 营养建议 · ☀️ 天气组合（pill 样式）
- [x] 底部「查看详细建议 >」链接，点击跳转 AI 助手页

## v3.5 AI卡片文案 + 快捷入口对齐

- [x] AI卡片右上角装饰换成医生图标（🩺）
- [x] AI卡片副标题改为每日轮换正能量语（不提具体疾病）
- [x] 标题「AI今日护理预测」→「AI今日护理建议」
- [x] 快捷入口完全对齐截图：胶囊图标、心形书本、人群、大脑
- [x] 快捷入口卡片尺寸/间距/圆角完全匹配截图
- [x] App内文案去掉「老人」「阿兹海默」等特定词汇，改为通用表达

## v3.6 文案通用化 + 打卡后动态首页

- [x] Onboarding 文案通用化：去掉「老人」「家人」等特定词汇，改为通用护理表达
- [x] Onboarding 介绍功能列表文案通用化
- [x] 打卡完成后首页快捷入口下方显示今日数据摘要（心情+睡眠+活动）
- [x] AI卡片打卡后显示基于数据的个性化建议（不再显示「还没打卡」提示）

## v3.7 一键分享长图

- [ ] 一键分享：生成包含今日打卡/日记/公告的完整长图
- [ ] 使用 react-native-view-shot 截取 BriefingCard 为图片
- [ ] 生成后调用 expo-sharing 分享图片

## v3.8 治愈系微动效 + AI 时光回音

- [ ] 快捷入口图标对齐 Figma：pill, book-heart, people, sparkles-outline
- [ ] 日记 FAB 按钮呼吸动画（scale 1.0→1.08 循环）
- [ ] 打卡进度条光泽脉冲动画（translateX 扫光）
- [ ] 打卡完成庆祝动画（花瓣/纸屑飘落）
- [ ] 空状态文案改为有温度的引导语（禁止「暂无数据」等冷冰冰词汇）
- [ ] 周日 AI 时光回音明信片功能（周末生成有温度的周总结卡片）

## v3.9 打卡完成后按钮

- [x] 打卡完成后按钮文案改为「查看今日 AI 护理建议」
- [x] 点击后跳转到首页（AI 护理建议区域）
## v3.8 完成项目
- [x] 日记 FAB 按钮呼吸动画（scale 1.0→1.08 循环）
- [x] 打卡进度条光泽脉冲动画（shimmer translateX 扫光）
- [x] AI 时光回音（WeeklyEcho）明信片组件 — 周日晚自动显示，紫粉渐变卡片，生成个性化周总结
- [x] weeklyEcho AI 端点 — 基于本周日记+打卡数据生成有温度的周总结

## v3.8 完成项目
- [x] 日记 FAB 按钮呼吸动画（scale 1.0->1.08 循环）
- [x] 打卡进度条光泽脉冲动画（shimmer translateX 扫光）
- [x] AI 时光回音（WeeklyEcho）明信片组件 — 周日晚自动显示，紫粉渐变卡片，生成个性化周总结
- [x] weeklyEcho AI 端点 — 基于本周日记+打卡数据生成有温度的周总结

## v3.9 打卡流程重构 + 新功能
- [x] 早间打卡重构：3个问题（被照顾者睡眠、照顾者心情、可选备注），角色文案清晰区分
- [x] 打卡落地页：显示早间/晚间两个状态块，完成时间、摘要、下一步引导
- [x] 首页联动：早间打卡未完成时锁定 AI 建议，显示「先完成打卡解锁今日建议」
- [x] 首页显示今日打卡进度（1/2 早间已完成 / 晚间待完成）
- [x] Onboarding 加入护理需求多选步骤（记忆/认知、血压、睡眠、情绪等）
- [x] 时光回音「保存为图片」功能（react-native-view-shot 截图）
- [x] 用药提醒推送通知（expo-notifications，早晚定时）
