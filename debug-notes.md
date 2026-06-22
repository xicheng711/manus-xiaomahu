# 截图分析

## 家人共享页（IMG_6905）
- 成员"菠萝🍍"显示默认 emoji 头像（👩），没有显示真实照片
- 成员"脚🦶"显示默认 emoji 头像（👩），没有显示真实照片
- 但在个人信息页（IMG_6902）中，照顾者"菠萝"有真实照片

## 首页（IMG_6903）
- 右上角显示的是🐷 emoji（被照顾者"提提"的生肖），而不是提提的真实照片
- 说明 elderPhotoUri 没有被正确加载到首页

## 个人信息页（IMG_6902）
- 照顾者"菠萝"有真实照片 ✅
- 被照顾者"提提"有真实照片 ✅
- 说明照片已经上传成功，但其他页面没有正确读取

## 日记 AI 回复（IMG_6904）
- 用户说"下雨了" → AI 回复"今天的记录收到了，菠萝🍍辛苦了。"（还行）
- 用户说"很好" → AI 回复"嗯，有事随时说~"（太敷衍）
- 用户说"今天去公园玩了" → AI 回复"嗯，有事随时说~"（重复且敷衍）

## 关键发现
1. family.tsx 的 MemberAvatarChip 组件逻辑正确（m.photoUri && !imgError 时显示图片）
2. loadData 中 cloudGetRoomDetail 也正确地获取了 serverPhotoUri
3. 问题可能在于：服务器端 family_members 表中 photoUri 字段为空（上传照片时没有正确写入）
4. 或者 cloudUploadPhoto 上传后返回的 URL 没有被正确写入 family_members.photoUri

## 需要检查
- profile.tsx 中上传头像后，是否调用了 cloudUpdateMemberProfile 更新服务器端 family_members.photoUri
- 还是只更新了 userProfile 的 caregiverPhotoUri
