# 小马虎 (Dementia Care App)

## Overview
小马虎 is a mobile-first dementia care application built with Expo/React Native, designed to run as a web app on Replit. It aims to be a practical caregiver assistant, helping users save mental energy through specific insights, anomaly detection, and easy family sharing. The app includes AI-powered features, diary management, check-ins, medication tracking, and family coordination. Its core philosophy is to provide a warm but trustworthy, data-driven, and actionable experience for caregivers.

## User Preferences
- **Communication Style**: Warm but trustworthy, data-driven, and actionable. Avoid overly cute or emotional language.
- **Tone**: Practical caregiver assistant, not a "cute companion."
- **Language**: Use professional and clear language for greetings, notifications, and advice.
- **AI Interaction**: The app pre-computes data, and the AI only interprets it; it should never re-analyze raw numbers. AI prompts should send structured JSON.
- **Workflow**: Prioritize specific insights, anomaly detection, and easy family sharing.
- **Data Presentation**: Focus on data-oriented summaries, trend changes, and anomaly alerts.

## System Architecture
The application features a modern, full-stack architecture designed for scalability and maintainability, emphasizing type safety and a mobile-first approach.

### UI/UX Decisions
- **Color Scheme**: Premium warm palette with primary=#8EB89A, background=#F7F1F3, foreground=#2F2A2E.
- **Typography**: Defined typography scale for various elements (heroTitle, pageTitle, body, etc.).
- **Spacing**: 8pt system with semantic tokens for consistent layout.
- **Radius**: Consistent border radii for cards, buttons, and chips.
- **Shadows**: Soft, card, and elevated shadow presets.
- **Motion**: Staggered entrances, pulse effects, and press animations for enhanced user experience.
- **Reusable UI Components**: BaseCard, GradientCard, MetricCard, PrimaryButton, SectionHeader, and Chip components for consistent design.
- **Accessibility**: WCAG 2.1 color contrast standards are met for text elements.
- **Check-in Redesign**: Typeform-style questions with one question per screen, smart defaults, and pre-filling strategies for sleep data.
- **Diary Calendar Redesign**: Displays recent entries, a monthly grid with navigation, highlights days with entries, and shows caregiver mood emojis on date cells.
- **Skeleton Loading**: Reusable `SkeletonBlock` component (`components/skeleton-loader.tsx`) with breathing opacity animation. `FamilySkeleton`, `BriefingSkeleton`, `WeeklyEchoSkeleton` variants replace text/ActivityIndicator loading states.
- **Audio Waveform**: Voice input (`components/voice-input.tsx`) displays 7-bar animated waveform during recording with glow pulse effect, replacing simple icon toggle.
- **Calendar Day Detail Transition**: MonthCalendar in `checkin.tsx` uses spring scale + fade overlay animation for day detail popup instead of basic Modal fade.
- **AI Advice Skeleton Screen**: Shows a blurred preview of AI advice with a lock overlay to motivate check-ins.
- **Care Analysis Page**: Unified `share.tsx` for daily record analysis, including header card with app icon, 5-grid badges, AI summary, sleep detail (donut chart), and weekly bar chart. Warm beige (#FBF7F4) card backgrounds with soft borders.
- **Tone**: Professional and practical throughout. Headings use factual language ("今日照护总览", "今日状态分析"), AI responses are data-driven, completion screens use neutral copy ("早间记录已保存"), and no cutesy emoji decorations.

### Technical Implementations
- **Frontend**: Expo React Native (web mode) using Expo Router for file-based routing.
- **Backend**: Express.js API server.
- **Database**: MySQL managed with Drizzle ORM.
- **API**: tRPC v11 with React Query for type-safe client-server communication.
- **Styling**: NativeWind (Tailwind CSS for React Native).
- **Language**: TypeScript throughout the project.
- **Package Manager**: pnpm.
- **API URL Resolution**: Dynamic resolution of backend URL from frontend hostname for Replit environment.
- **Sleep Scoring Engine**: Pure rule-based function for scoring sleep input, providing scores, problems, and breakdowns based on geriatric sleep guidelines.
- **Structured AI Pipeline**: App pre-computes data (e.g., sleep score, problems) which is then interpreted by the AI. AI prompt sends structured JSON for factual grounding.
- **Multi-Family Support**: Allows caregivers to manage multiple family memberships with a family switcher modal and role-gated screens. Switching families triggers an immediate `loadData` refresh via `useEffect` on `activeMembership.familyId`, updating elder info, member data, and all displayed content instantly. Both creator (index.tsx) and joiner (joiner-home.tsx) pages respond to family changes.
- **Unified Weather Context**: `lib/weather-context.tsx` provides a centralized `WeatherProvider` wrapping the app in `_layout.tsx`. Uses `useWeather()` hook to share real-time weather data (Open-Meteo API + GPS) across all pages. Auto-refreshes every 30 minutes with race-condition protection. Consumed by index.tsx (greeting + weather chip), share.tsx (briefing weather line), joiner-home.tsx (greeting). Server-side AI router fetches independently via wttr.in.
- **Data Visualization**: Uses `react-native-gifted-charts` for sleep visualization (donut and bar charts).
- **Briefing Persistence**: `CareBriefing` interface and storage functions to persist and load daily briefings, prioritizing fresh data.
- **Route Unification**: `/assistant` route deprecated; all post-checkin and analysis flows redirect to `/share`.

### Feature Specifications
- **Check-ins**: Morning and evening check-ins with detailed sleep tracking, medication tracking, and caregiver mood.
- **Diary Management**: Daily diary entries with caregiver mood selection and calendar view.
- **AI-Powered Advice**: Daily advice, briefing, and anomaly detection based on check-in data and pre-computed analyses.
- **Family Coordination**: Support for multiple family members and roles (creator/joiner).
- **Sharing**: Native sharing functionality (iOS Share Sheet, React Native Share for web).

## External Dependencies
- **Database**: MySQL
- **ORM**: Drizzle ORM
- **Authentication**: Manus OAuth (for `OAUTH_SERVER_URL`), WeChat Login (`WECHAT_APP_ID`, `WECHAT_APP_SECRET`), Apple Sign In (`APPLE_SERVICE_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`)
- **AI Services**: Built-in Forge API (for `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`), Alibaba Cloud Qwen (for `DASHSCOPE_API_KEY`)
- **JWT Verification**: `jose` library for Apple identity token signature verification via Apple JWKS
- **Charting Library**: `react-native-gifted-charts`
- **SVG Rendering**: `react-native-svg`
- **Sharing**: `expo-sharing`

### Login System
- **Login Page**: `app/login.tsx` — premium warm UI with WeChat (green) and Apple (black) login buttons, privacy agreement checkbox (required for China App Store), guest mode entry
- **Client Auth Providers**: `lib/auth-providers.ts` — dynamic native SDK imports for WeChat (`react-native-wechat-lib`) and Apple (`expo-apple-authentication`), with web fallback messages
- **Server Auth Routes**: `server/auth-providers.ts` — `/api/auth/wechat/callback` (WeChat OAuth token exchange) and `/api/auth/apple/callback` (Apple JWT signature verification via JWKS, audience/issuer validation)
- **OpenId Conventions**: WeChat users prefixed `wechat_`, Apple users prefixed `apple_`, Manus OAuth users use standard openId
- **Security**: Apple identity tokens are cryptographically verified using Apple's public JWKS; `sub` claim is used for identity (not client-supplied user field)
- **Animations**: Native-only entrance animations (logo fade/scale, content slide-up); web renders immediately without animation