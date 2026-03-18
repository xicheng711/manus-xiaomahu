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

### WCAG 2.1 Color Contrast (lib/animations.ts)
- `COLORS.textMuted` upgraded from `#9BA1A6` (2.7:1 ratio, fail) → `#6B7280` (4.6:1 ratio, pass AA)
- All hint/muted text now meets minimum contrast for small text (4.5:1)

### Share (app/export-image.tsx)
- Uses `expo-sharing.shareAsync()` on native → triggers iOS Share Sheet
- No WeChat SDK needed; user picks WeChat from native system panel
- Web fallback: React Native `Share.share()` for text sharing
