# 小马虎 (Dementia Care App)

A mobile-first dementia care application built with Expo/React Native that runs as a web app on Replit. It includes AI-powered features, diary management, check-ins, medication tracking, and family coordination.

## Architecture

- **Frontend**: Expo React Native (web mode via Metro bundler) on port 5000
- **Backend**: Express.js API server on port 3000
- **Database**: MySQL (via Drizzle ORM)
- **API**: tRPC for type-safe client-server communication
- **Styling**: NativeWind (Tailwind for React Native)

## Key Technologies

- Expo Router (file-based routing)
- tRPC v11 with React Query
- Drizzle ORM with MySQL2
- NativeWind / Tailwind CSS
- TypeScript throughout
- pnpm package manager

## Development

### Running the App

The workflow `Start application` runs both servers concurrently:
- `EXPO_PORT=5000 pnpm dev` starts:
  - Metro bundler (Expo web) on port 5000
  - Express API server on port 3000

### Environment Variables

Required for full functionality:
- `DATABASE_URL` - MySQL connection string
- `JWT_SECRET` - Session cookie signing secret
- `OAUTH_SERVER_URL` - Manus OAuth server URL
- `VITE_APP_ID` / `EXPO_PUBLIC_APP_ID` - Application ID
- `OWNER_OPEN_ID` - Owner's OpenID for admin role

Optional:
- `EXPO_PUBLIC_API_BASE_URL` - Override API base URL
- `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` - AI API credentials

### API URL Resolution

The `getApiBaseUrl()` function in `constants/oauth.ts` derives the backend URL from the frontend hostname by replacing the port prefix (e.g., `5000-xxx.domain` → `3000-xxx.domain`). This works for Replit's port-based subdomain routing.

## Project Structure

```
app/           - Expo Router pages (tabs, auth flows, etc.)
components/    - Shared React Native components
constants/     - App constants including OAuth config
drizzle/       - Database schema and migrations
hooks/         - Custom React hooks
lib/           - Utility libraries (auth, trpc, theme, etc.)
server/        - Express + tRPC backend
  _core/       - Server infrastructure (express, auth, env)
  routers.ts   - tRPC router definitions
  db.ts        - Drizzle database client
shared/        - Shared types between client and server
scripts/       - Build and utility scripts
```

## Database

Uses MySQL with Drizzle ORM. Run migrations with:
```
pnpm db:push
```

The `users` table stores authentication data. The schema is in `drizzle/schema.ts`.

## Recent Feature Updates (v4.0)

### Check-in Redesign (app/(tabs)/checkin.tsx)
- **Typeform-style questions**: One question per screen with animated step transitions
- **Smart defaults**: All options pre-selected to the most common "healthy" state so users can tap "下一步" rapidly
- **Morning check-in sleep redesign**:
  - Q1: Total sleep duration (5 range buttons: 少于4小时→9小时以上)
  - Q2: Night awakenings count (4 options: 没醒/1-2次/3-4次/5次以上)
  - Q3: Night awake duration (4 options: 几乎没有/10-30分/30-60分/1小时以上)
  - Q4: Daytime nap (4 options: 没有/少于20分/20-60分/1小时以上)
  - Q5: Caregiver mood
  - Q6: Optional notes
- **Evening check-in**: "饮食情况" replaced from free text → 4-option pill list (正常进食 default)
- **Backward compatible**: `sleepHours` & `sleepQuality` still saved for chart compatibility
- **Pre-fill strategy (v4.1)**: On fresh day (no today's data), loads the most recent historical morning check-in and pre-fills sleep fields — user can confirm in one tap or adjust

### Sleep Scoring Engine (lib/sleep-scoring.ts) — v4.1
- Pure rule-based function (NOT AI): `SleepInput → { score, problems, breakdown }`
- Scoring dimensions (NSF/AASM geriatric sleep guidelines):
  - Sleep duration: 35 pts (optimal: 7-9h for elderly)
  - Night awakenings: 15 pts
  - WASO (night awake duration): 20 pts  
  - Daytime nap: 15 pts
  - Sleep latency: 15 pts (optional)
- Exports: `scoreSleepInput()`, `getSleepScoreLabel()`
- `problems[]` are human-readable labels e.g. "睡眠碎片化", "夜间频繁醒来"

### Structured AI Pipeline (v4.1)
- **Principle**: App pre-computes → AI only interprets (AI never re-analyzes raw numbers)
- **Data flow**: `SleepInput` → `scoreSleepInput()` → `{ score, problems }` → tRPC mutation → AI prompt
- **server/ai-router.ts** `getDailyAdvice` new schema:
  - `baseline.care_needs[]` — profile care needs
  - `sleep_analysis.{ score, problems, sleep_range }` — pre-computed by rule engine
  - `today_input.{ mood, mood_score, medication_taken, meal, caregiver_mood, notes }` — today's data
  - Backward compat: old `yesterday` field still accepted, server maps to structured format
- **SYSTEM_PROMPT**: explicitly instructs AI to use pre-computed facts, not re-judge
- AI prompt sends structured JSON, not free text — reduces hallucination, enforces factual grounding

### AI Advice Skeleton Screen (app/(tabs)/index.tsx)
- When morning check-in not done: shows blurred skeleton preview (3 fake text lines + 3 tag badges + lock overlay)
- Skeleton makes the "value behind the gate" visible — drives check-in motivation
- Lock overlay shows purple card with "完成早间打卡后解锁" CTA

### Multi-Family Support (v5.0)
- **FamilyMembership interface** in `lib/storage.ts`: `{ familyId, room, myMemberId, role, joinedAt }`
- **Storage keys**: `MEMBERSHIPS_KEY = 'family_memberships_v1'`, `ACTIVE_FAMILY_ID_KEY = 'active_family_id_v1'`
- **Storage functions**: `getAllMemberships`, `addOrUpdateMembership`, `getActiveFamilyId`, `setActiveFamilyId`, `migrateToMultiFamily`
- **FamilyContext** (`lib/family-context.tsx`): `FamilyProvider` wraps app, provides `memberships`, `activeMembership`, `isCreator`, `hasFamilies`, `switchFamily()`, `refresh()`
- **Family Switcher Modal**: both `JoinerHomeScreen` (components/joiner-home.tsx) and `CreatorHomeScreen` (app/(tabs)/index.tsx) show family name tag with ▼ (tappable to switch when multiple families)
- **Create-family modal** (`app/(modals)/create-family.tsx`): 2-step form (elder info → my info); JoinerLockedScreen CTA routes here
- **`switchFamily(id)`**: saves activeFamilyId, updates family_room_v1 key + currentMember → triggers re-render across app

### Diary Calendar Redesign (v5.0)
- `app/(tabs)/diary.tsx` — new layout:
  - **Top**: most recent 7 diary entries as cards (existing DiaryCard component)
  - **Bottom**: `CalendarView` component — monthly grid with prev/next navigation
  - Calendar highlights days with entries (green dot + green circle background)
  - Today shown in filled primary green circle
  - Tapping an entry day expands mini-list of that day's entries below the calendar
  - Mini-cards open the full diary entry editor when tapped
  - Calendar hidden in edit/delete mode

### Role-Gated Screens (v5.0)
- `app/(tabs)/index.tsx`: default export checks `getCurrentUserIsCreator()` → renders `JoinerHomeScreen` or `CreatorHomeScreen`
- `app/(tabs)/checkin.tsx`, `medication.tsx`, `diary.tsx`: wrapper pattern — non-creator users see `JoinerLockedScreen`
- **`JoinerLockedScreen`**: explains role restriction + CTA to "创建我的家庭档案" (`/(modals)/create-family`)

### WCAG 2.1 Color Contrast (lib/animations.ts)
- `COLORS.textMuted` upgraded from `#9BA1A6` (2.7:1 ratio, fail) → `#6B7280` (4.6:1 ratio, pass AA)
- All hint/muted text now meets minimum contrast for small text (4.5:1)

### Share (app/export-image.tsx)
- Uses `expo-sharing.shareAsync()` on native → triggers iOS Share Sheet
- No WeChat SDK needed; user picks WeChat from native system panel
- Web fallback: React Native `Share.share()` for text sharing

## v5.1 Restructure: Data Visualization + Warm Companionship

### Schema Changes (lib/storage.ts)
- **DailyCheckIn** new fields: `sleepType` ('quick'|'detailed'), `sleepSegments` (SleepSegment[]), `nightWakings` (number), `daytimeNap` (boolean)
- **SleepSegment** interface: `{ startTime, endTime, hours, label }`
- **DiaryEntry** new fields: `caregiverMoodEmoji`, `caregiverMoodLabel` — caregiver mood moved from morning check-in to diary
- **`getWeeklySleepData(days)`**: returns 7 days of sleep data for chart visualization

### Backend Simplification (server/ai-router.ts)
- `getDailyAdvice` AI response simplified to 3 fields: `careScore`, `summary` (1 sentence), `encouragement` (≤20 chars)
- 500 token limit for fast responses
- `getWeeklySleepData` tRPC query endpoint added

### Morning Check-in Redesign (app/(tabs)/checkin.tsx)
- Quick/Detailed sleep toggle: Quick mode uses slider, Detailed mode allows multiple sleep segments
- Sleep segment time pickers with +/- hour/15min controls
- Night wakings stepper counter, daytime nap boolean toggle
- Caregiver mood step removed from morning flow (moved to diary)

### Diary Enhancement (app/diary-edit.tsx, app/(tabs)/diary.tsx)
- **Caregiver mood selector** added above text input in diary-edit: 5 mood options (挺好的/还行/有点累/不太好/快撑不住了)
- Purple-themed chip UI with "照顾好自己也很重要" hint text
- Mood saved as `caregiverMoodEmoji`/`caregiverMoodLabel` in DiaryEntry
- Calendar shows mood emoji on date cells (with useMemo for performance)

### Route Unification (v5.2)
- **`/assistant` route deprecated** — all post-checkin and analysis flows redirect to `/share` (now "今日记录分析")
- `checkin.tsx` morning done → `/share`; `index.tsx` AI card + data summary + quick actions → `/share`
- `share.tsx` prioritizes today's check-in over yesterday's (`today || yesterday`)

### Care Analysis Page (app/share.tsx) — Unified
- **Title**: "📋 今日记录分析"
- **Layout order**: header card → 5-grid badges → AI summary → sleep detail (donut) → weekly bar chart → home button → share buttons
- **Sleep donut**: green (#6EE7B7) = sleep hours, warm yellow (#FEF3C7) = awake hours; uses real `awakeHours` for detailed mode
- **Bar chart**: `endSpacing={30}` to prevent right-side clipping
- **Bottom**: "返回首页" gradient button + WeChat share + family sync notice

### Awake Hours Computation (v5.2)
- **`awakeHours`** field added to `DailyCheckIn` in `lib/storage.ts`
- Computed in `checkin.tsx` for detailed mode: sum of gaps between consecutive sorted sleep segments
- Displayed inline as "总计：X 小时 | 夜间清醒：Y 小时"
- `share.tsx` donut: detailed mode uses `awakeHours ?? 0`; quick/legacy mode uses `max(0, 8 - sleepHours)` fallback

### Briefing Persistence (lib/storage.ts, app/assistant.tsx) — v5.1
- **CareBriefing** interface: `{ date, careScore, summary, encouragement, generatedAt, checkInDate }`
- **Storage key**: `BRIEFINGS = 'care_briefings_v1'` — persists up to 30 briefings
- **Storage functions**: `saveBriefing()`, `getTodayBriefing()`, `getLatestBriefing()`
- **Load priority**: (1) today's saved briefing if fresh (generatedAt >= latest check-in completedAt) → (2) if no new check-in, latest saved briefing → (3) generate new via API and persist
- **Data source fix**: AI prompt `today_input` now reads from yesterday's evening check-in (mood, medication, meal), not mixed today/yesterday

### New Dependencies
- `react-native-gifted-charts` — chart library for sleep visualization
- `react-native-svg` — SVG rendering for charts

## Design System (v6.0 — Premium Warm Redesign)

### Design Token Files (`lib/design-tokens/`)
- **colors.ts** — `AppColors`: bg (primary/secondary/soft), green, purple, coral, peach palettes + text/border/surface/shadow
- **gradients.ts** — `Gradients`: appBg, heroGlow, green, purple, coral, peach, navActive gradient arrays
- **typography.ts** — `Typography`: heroTitle/pageTitle/sectionTitle/cardTitle/metricNumber/scoreNumber/body/bodySmall/caption
- **spacing.ts** — `Spacing`: 8pt system (space4–space32) + semantic tokens (pageHorizontal, cardPadding, cardGap, chipPadding)
- **radius.ts** — `Radius`: cardLarge(24)/cardMedium(20)/cardSmall(16)/button(18)/chip(999)/iconButton(16)
- **shadows.ts** — `Shadows`: soft/card/elevated presets + glow(color) factory
- **motion.ts** — `Motion`: stagger(100ms), entrance(400ms/12px), pulse(1–1.02/1400ms), press(0.98/120ms) + helper factories
- **index.ts** — barrel export for all tokens

### Reusable UI Components (`components/ui/`)
- **BaseCard** — white card with soft shadow + light border, configurable padding/radius
- **GradientCard** — LinearGradient card wrapper with shadow
- **MetricCard** — animated metric display (emoji + value + label) with staggered entrance
- **PrimaryButton** — gradient button with press animation, loading state, icon support
- **SectionHeader** — title + optional subtitle with consistent typography
- **Chip** — pill-shaped tag with selected/unselected states

### Theme Config (`theme.config.js`)
- Updated to premium warm palette: primary=#8EB89A, background=#F7F1F3, foreground=#2F2A2E
- Feeds into NativeWind CSS variables via `lib/theme-provider.tsx`

### Color Migration (`lib/animations.ts`)
- COLORS updated from old coral/cream palette to new premium warm palette
- bg=#F7F1F3, primary=#F28C7C, secondary=#8EB89A, text=#2F2A2E, shadow=rgba(88,64,78,0.08)
