# 家庭共享功能审计

## 服务器端已有的基础设施
- users 表已有 pushToken 字段 ✅
- updatePushToken API 已有 ✅
- sendExpoPushNotifications helper 已有 ✅
- joinRoom 时已有推送通知（通知其他成员有新人加入）✅
- getUsersByIds 已有 ✅

## 缺失的功能

### 1. 客户端未注册 push token 到服务器
- cloud-sync.ts 中没有 cloudUpdatePushToken 函数
- App 启动时没有注册 push token 的逻辑

### 2. 服务器端 postAnnouncement 没有推送通知
- 只存储到数据库，不通知其他家庭成员

### 3. 服务器端 syncCheckIn 没有推送通知
- 打卡后不通知 joiner

### 4. 服务器端 syncDiary 没有推送通知
- 写日记后不通知 joiner

### 5. 客户端 family.tsx 和 joiner-home.tsx 的公告从本地读
- getFamilyAnnouncements() 只读本地
- 需要改为 cloudGetAnnouncements()

### 6. family.tsx 的 loadData 中打卡/日记/档案也是本地读
- joiner 视角下应该从云端拉取
