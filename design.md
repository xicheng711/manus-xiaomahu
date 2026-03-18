# 守护家人 — App Design Document

## Brand & Style
- **Theme**: Stardew Valley-inspired cute cartoon pixel art
- **Palette**:
  - Primary: `#7CB87C` (soft sage green — nature, calm)
  - Accent: `#F4A261` (warm orange — warmth, energy)
  - Background: `#FFF8F0` (creamy warm white)
  - Surface: `#FFFBF5` (card backgrounds)
  - Muted: `#A89B8C` (secondary text)
  - Border: `#E8D5C4` (warm beige borders)
  - Success: `#6BCB77` (green)
  - Warning: `#FFD166` (yellow)
  - Error: `#EF6C6C` (soft red)
- **Typography**: Rounded, friendly fonts (System font with rounded style)
- **Icons**: Emoji-style + SF Symbols, large touch targets (min 48px)
- **Cards**: Rounded corners (16–24px), soft shadows, warm backgrounds
- **Animations**: Gentle bounce/fade transitions

## Screen List

### 1. Home Screen (首页)
- Daily greeting with time-of-day message ("早上好！")
- Today's check-in status card (completed / pending)
- Quick action buttons: 开始今日打卡, 用药提醒, 护理日记
- AI encouragement card (today's message)
- Recent mood trend mini-chart (last 7 days)

### 2. Daily Check-in Flow (每日打卡) — Modal/Stack
- Step 1: 睡眠记录 — "老宝昨晚睡了几小时？" (slider 0–12h + quality emoji)
- Step 2: 今日心情 — "老宝今天心情怎么样？" (emoji picker + score 1–10)
- Step 3: 用药情况 — "今天的药都吃了吗？" (yes/no + notes)
- Completion screen: AI encouragement message + confetti animation

### 3. Medication Reminders (用药提醒)
- List of medications with name, dosage, time
- Add/edit/delete medication
- Toggle reminder on/off
- Scheduled local push notifications

### 4. Care Diary (护理日记)
- List of diary entries (date, mood emoji, preview text)
- New entry: text input + voice recording button
- Voice-to-text transcription display
- Mood emoji picker + score 1–10
- Save entry

### 5. AI Assistant (AI 小助手)
- Chat-style interface with a cute cartoon mascot
- Shows today's encouragement message
- Care tips based on recent diary entries
- Positive affirmations for the caregiver

### 6. Family Sharing (家庭共享)
- Today's summary card (sleep, mood, medication)
- Share button → system share sheet (WeChat compatible)
- Generate shareable image/text summary
- Family members list (local, no auth required)

## Key User Flows

### Daily Check-in Flow
Home → Tap "开始今日打卡" → Step 1 (Sleep) → Step 2 (Mood) → Step 3 (Medication) → AI Encouragement → Home (check-in marked complete)

### Add Medication Reminder
Medication Tab → Tap "+" → Fill name/dosage/time → Save → Notification scheduled

### Write Diary Entry
Diary Tab → Tap "新建日记" → Tap mic for voice OR type text → Select mood emoji + score → Save

### Share Daily Summary
Home or Sharing Tab → Tap "分享今日报告" → System share sheet → WeChat

## Data Models (AsyncStorage — local only)

### DailyCheckIn
```ts
{
  id: string;
  date: string; // YYYY-MM-DD
  sleepHours: number; // 0–12
  sleepQuality: 'poor' | 'fair' | 'good';
  moodEmoji: string; // emoji character
  moodScore: number; // 1–10
  medicationTaken: boolean;
  medicationNotes: string;
  aiMessage: string; // generated encouragement
  completedAt: string;
}
```

### Medication
```ts
{
  id: string;
  name: string;
  dosage: string;
  times: string[]; // ["08:00", "20:00"]
  reminderEnabled: boolean;
  color: string; // pill color for display
}
```

### DiaryEntry
```ts
{
  id: string;
  date: string;
  content: string;
  voiceUri?: string;
  moodEmoji: string;
  moodScore: number;
  createdAt: string;
}
```

### ElderProfile
```ts
{
  id: string;
  name: string; // "老宝" or custom
  nickname: string;
  caregiverName: string;
}
```

## Navigation Structure
- Bottom Tab Bar (4 tabs):
  1. 首页 (Home) — house icon
  2. 用药 (Medication) — pill icon
  3. 日记 (Diary) — book icon
  4. 分享 (Share) — heart icon
- Modal stack for daily check-in flow
- Stack navigation for detail screens
