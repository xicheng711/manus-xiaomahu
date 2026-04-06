/**
 * 小马虎 AI Router — Qwen-Plus powered dementia care companion
 * Uses DashScope Qwen-Plus for dynamic professional care advice generation
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";

/** Try to extract valid JSON from a potentially truncated LLM response */
function extractJSON(raw: string): string {
  // Strip markdown code fences if present
  let s = raw.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }
  // Try direct parse first
  try { JSON.parse(s); return s; } catch {}
  // Try to repair truncated JSON by closing open braces/brackets
  let repaired = s;
  const opens = (repaired.match(/[{[]/g) || []).length;
  const closes = (repaired.match(/[}\]]/g) || []).length;
  // Remove trailing comma or incomplete key-value
  repaired = repaired.replace(/,\s*$/, '');
  // Close missing brackets
  for (let i = 0; i < opens - closes; i++) {
    // Determine if we need } or ]
    const lastOpen = repaired.lastIndexOf('{') > repaired.lastIndexOf('[') ? '}' : ']';
    repaired += lastOpen;
  }
  try { JSON.parse(repaired); return repaired; } catch {}
  // Last resort: find the outermost { ... } and try to repair that
  const firstBrace = s.indexOf('{');
  if (firstBrace >= 0) {
    let depth = 0;
    let lastValid = firstBrace;
    for (let i = firstBrace; i < s.length; i++) {
      if (s[i] === '{') depth++;
      else if (s[i] === '}') { depth--; lastValid = i; }
      if (depth === 0) break;
    }
    let sub = s.slice(firstBrace, lastValid + 1);
    if (depth > 0) {
      sub = sub.replace(/,\s*$/, '');
      // Remove incomplete last string value
      sub = sub.replace(/"[^"]*$/, '""');
      for (let i = 0; i < depth; i++) sub += '}';
    }
    try { JSON.parse(sub); return sub; } catch {}
  }
  throw new Error('Failed to parse LLM JSON response');
}

async function callQwen(prompt: string, systemPrompt: string, retries = 2, maxTokens = 2000): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await invokeLLM({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        maxTokens,
      });
      const raw = (result.choices?.[0]?.message?.content as string) ?? "{}";
      try {
        return extractJSON(raw);
      } catch (e) {
        console.warn(`Qwen JSON parse attempt ${attempt + 1} failed, raw length: ${raw.length}, raw: ${raw.slice(0, 200)}`);
        if (attempt === retries) throw e;
      }
    } catch (e) {
      console.error(`Qwen API call attempt ${attempt + 1} failed:`, e instanceof Error ? e.message : e);
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return "{}";
}

async function getWeatherForCity(city: string): Promise<{ temp: number; description: string; icon: string; isHot: boolean; isCold: boolean; isRainy: boolean } | null> {
  try {
    // wttr.in: 完全免费，无需 API Key，支持中文城市名
    const res = await fetch(
      `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
      { headers: { "User-Agent": "XiaoMaHuApp/1.0" }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;

    const cur = data.current_condition?.[0];
    if (!cur) return null;

    const temp = parseInt(cur.temp_C ?? "20");
    const code = parseInt(cur.weatherCode ?? "113");

    // 天气码分类
    const rainy = [176,180,182,185,200,263,266,281,284,293,296,299,302,305,308,353,356,359,386,389].includes(code)
      || (code >= 260 && code <= 320);
    const snowy = [179,227,230,317,320,323,326,329,332,335,338,368,371,374,377,392,395].includes(code);
    const cloudy = [116,119,122,143,248,260].includes(code);

    const isRainy = rainy || snowy;
    const isHot = temp >= 30;
    const isCold = temp <= 10;

    let icon = "☀️";
    let description = "晴朗";
    if (snowy)       { icon = "🌨️"; description = "有雪"; }
    else if (rainy)  { icon = "🌧️"; description = "有雨"; }
    else if (cloudy) { icon = "⛅"; description = "多云"; }
    else if (isHot)  { icon = "☀️"; description = "晴热"; }
    else if (isCold) { icon = "🥶"; description = "寒冷晴朗"; }

    return { temp, description, icon, isHot, isCold, isRainy };
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `您是"小马虎"App的照护数据分析助手。

【核心职责】
您的任务是帮助主照顾人"省脑子"——快速看清今天的情况，知道该关注什么。

【工作原则】
- sleep_analysis.score 和 problems 已由规则引擎预处理，直接使用
- 您的回复必须基于数据事实，不做额外推断
- 每句话都要有依据：说清"是什么、和之前比有没有变化、建议做什么"
- 不说空话、不说套话、不过度鼓励

【回复风格】
- 温和但专业，像一个可信赖的助手
- 语气：温柔、安心、清楚、可信
- 避免：太萌、太拟人、太儿童化的表达
- 避免："加油"、"你很棒"、"我们一起"之类的泛泛鼓励
- 正确示例：
  · "今天睡眠时长正常，但夜间中断较多，建议今晚继续观察是否重复出现"
  · "饮食较昨天略少，但心情和活动正常，可先继续记录"
  · "用药已完成，当前整体状态稳定，适合按平常节奏照护"
- 用中文回复
- 回复必须是严格的JSON格式，不要包含任何Markdown代码块标记`;

export const aiRouter = router({
  // Generate daily care advice based on yesterday's check-in data
  getDailyAdvice: publicProcedure
    .input(z.object({
      elderNickname: z.string(),
      caregiverName: z.string(),
      city: z.string().optional(),
      // v4.1 结构化输入（规则引擎已预处理，AI只负责解读）
      baseline: z.object({
        care_needs: z.array(z.string()),
      }).optional(),
      sleep_analysis: z.object({
        score: z.number(),           // 0-100，规则引擎计算
        problems: z.array(z.string()), // 推导出的问题标签
        sleep_range: z.string().optional(), // 如 "7-9小时"（展示用）
      }).optional(),
      today_input: z.object({
        mood: z.string().optional(),          // 心情描述
        mood_score: z.number().optional(),    // 1-10
        medication_taken: z.boolean().optional(),
        meal: z.string().optional(),          // 如 "正常进食"
        caregiver_mood: z.string().optional(), // 照顾者心情描述
        notes: z.string().optional(),
      }).optional(),
      // 向后兼容：旧版本仍会传 yesterday
      yesterday: z.object({
        sleepHours: z.number(),
        sleepQuality: z.enum(["good", "fair", "poor"]),
        moodScore: z.number(),
        medicationTaken: z.boolean(),
        mealNotes: z.string().optional(),
        notes: z.string().optional(),
      }).nullable().optional(),
      careNeeds: z.array(z.string()).optional(),
      extraNotes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { elderNickname, caregiverName, city, baseline, sleep_analysis, today_input, yesterday, extraNotes, careNeeds } = input;
      const nickname = elderNickname || "家人";

      // Get weather if city provided
      let weatherInfo = "";
      let weatherData = null;
      if (city) {
        weatherData = await getWeatherForCity(city);
        if (weatherData) {
          weatherInfo = `今日${city}天气：${weatherData.icon}${weatherData.description}，气温${weatherData.temp}°C。`;
        }
      }

      // 构建结构化输入 JSON（v4.1 路径）
      const effectiveCareNeeds = baseline?.care_needs ?? careNeeds ?? [];
      const hasSleepAnalysis = sleep_analysis && sleep_analysis.score !== undefined;

      const structuredInput = {
        baseline: { care_needs: effectiveCareNeeds },
        sleep_analysis: hasSleepAnalysis
          ? {
              score: sleep_analysis!.score,
              problems: sleep_analysis!.problems,
              sleep_range: sleep_analysis!.sleep_range,
            }
          : yesterday
          ? {
              // 旧版数据兼容
              score: Math.round(
                (yesterday.sleepQuality === "good" ? 80 : yesterday.sleepQuality === "fair" ? 60 : 35) *
                (yesterday.sleepHours >= 7 ? 1 : yesterday.sleepHours >= 6 ? 0.85 : 0.6)
              ),
              problems: [
                ...(yesterday.sleepHours < 5 ? ["睡眠严重不足"] : yesterday.sleepHours < 7 ? ["睡眠时间偏少"] : []),
                ...(yesterday.sleepQuality === "poor" ? ["睡眠质量较差"] : []),
              ],
            }
          : null,
        today_input: today_input ?? (yesterday ? {
          mood: yesterday.moodScore >= 7 ? "良好" : yesterday.moodScore >= 5 ? "一般" : "较差",
          mood_score: yesterday.moodScore,
          medication_taken: yesterday.medicationTaken,
	          meal: yesterday.mealNotes || undefined,
          notes: yesterday.notes,
        } : null),
        weather: weatherInfo || null,
        extra_notes: extraNotes || null,
      };

      const prompt = `
照顾者：${caregiverName}，正在照顾老人：${nickname}。

以下是今日护理数据（已由规则引擎预处理）：

${JSON.stringify(structuredInput, null, 2)}

请根据以上数据生成简洁的照护分析。
注意：
- sleep_analysis.score 是规则引擎的计算结果，直接使用
- summary 必须基于数据事实，指出值得注意的变化或异常
- suggestion 必须给出具体可执行的下一步动作

返回以下JSON格式（不包含任何代码块标记，直接返回JSON）：
{
  "careScore": <1-100整数，综合状态指数，100=状态极佳，sleep_analysis.score可作为重要参考>,
  "summary": "<基于数据的客观情况描述，指出哪些指标正常、哪些值得注意，30-50字>",
  "suggestion": "<具体的下一步建议，基于数据给出可执行动作，20字以内>"
}`;

      try {
        const raw = await callQwen(prompt, SYSTEM_PROMPT, 1, 500);
        const advice = JSON.parse(raw);
        if (advice.suggestion && advice.suggestion.length > 25) {
          const first = advice.suggestion.split(/[。！？!?]/)[0];
          advice.suggestion = first.slice(0, 25);
        }
        return { success: true, advice, weather: weatherData };
      } catch (e) {
        console.error("Qwen parse error:", e);
        // Return fallback
        return {
          success: false,
          advice: null,
          weather: weatherData,
          error: e instanceof Error ? e.message : "AI生成失败",
        };
      }
    }),

  getWeeklySleepData: publicProcedure
    .input(z.object({
      days: z.number().min(1).max(30).default(7),
      checkIns: z.array(z.object({
        date: z.string(),
        sleepHours: z.number(),
        sleepType: z.enum(['quick', 'detailed']).optional(),
        sleepSegments: z.array(z.object({
          start: z.string(),
          end: z.string(),
        })).optional(),
        nightWakings: z.number().optional(),
        daytimeNap: z.boolean().optional(),
        morningDone: z.boolean().optional(),
      })),
    }))
    .query(({ input }) => {
      const { days, checkIns } = input;
      const result: Array<{
        date: string;
        sleepHours: number;
        sleepType: string | null;
        nightWakings: number;
        daytimeNap: boolean;
        hasMorningData: boolean;
      }> = [];
      const today = new Date();
      for (let i = 0; i < days; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const ci = checkIns.find(c => c.date === dateStr);
        result.push({
          date: dateStr,
          sleepHours: ci?.sleepHours ?? 0,
          sleepType: ci?.sleepType ?? null,
          nightWakings: ci?.nightWakings ?? 0,
          daytimeNap: ci?.daytimeNap ?? false,
          hasMorningData: ci?.morningDone ?? false,
        });
      }
      return { success: true, data: result.reverse() };
    }),

  // Generate daily briefing for family sharing
  generateBriefing: publicProcedure
    .input(z.object({
      elderNickname: z.string(),
      caregiverName: z.string(),
      date: z.string(),
      checkIn: z.object({
        sleepHours: z.number(),
        sleepQuality: z.enum(["good", "fair", "poor"]),
        moodScore: z.number(),
        medicationTaken: z.boolean(),
        mealSituation: z.enum(["good", "fair", "poor"]).optional(),
        napMinutes: z.number().optional(),
        notes: z.string().optional(),
      }),
      careScore: z.number(),
    }))
    .mutation(async ({ input }) => {
      const { elderNickname, caregiverName, date, checkIn, careScore } = input;
      const nickname = elderNickname || "家人";

      const moodEmoji = checkIn.moodScore >= 8 ? "😊" : checkIn.moodScore >= 6 ? "😌" : checkIn.moodScore >= 4 ? "😐" : "😟";
      const sleepEmoji = checkIn.sleepHours >= 7 ? "🌙✨" : checkIn.sleepHours >= 5 ? "🌙" : "😴";
      const medEmoji = checkIn.medicationTaken ? "💊✅" : "💊❌";

      const prompt = `
为${nickname}生成今日护理简报，供家庭成员查看。
照顾者：${caregiverName}，日期：${date}

今日实际数据：
- 睡眠：${checkIn.sleepHours}小时，质量${checkIn.sleepQuality === "good" ? "良好" : checkIn.sleepQuality === "fair" ? "一般" : "较差"}
- 心情评分：${checkIn.moodScore}/10
- 用药：${checkIn.medicationTaken ? "已按时服药" : "未按时服药"}
${checkIn.mealSituation ? `- 饮食：${checkIn.mealSituation === "good" ? "进食良好" : checkIn.mealSituation === "fair" ? "进食一般" : "进食较差"}` : "- 饮食：未记录"}
- 白天小睡：${checkIn.napMinutes != null && checkIn.napMinutes > 0 ? `${checkIn.napMinutes}分钟` : "无"}
${checkIn.notes ? `- 照顾者备注：${checkIn.notes}` : ""}

要求：
- summary：客观描述今日整体状态，仅基于以上实际数据，不要提及护理指数、careScore等概念。结尾加一句温暖鼓励的话（如“辛苦了，谢谢你的用心呢”、“每一天的照顾都小小的不容易”这类自然温情的话），总共不超过80字
- highlights：2-3条値得关注的事项，每条15字以内，基于数据事实
- attention：如有异常指标（如睡眠不足、漏药、情绪低落），用一句话指出，无异常则留空字符串
- shareText：适合直接发送到家人微信群的今日简报，格式清晰好读，包含：睡眠、心情、用药、饮食、是否有异常，语气温和可信，150字以内

返回JSON格式（不要包含任何代码块标记）：
{
  "summary": "<基于数据的客观描述+结尾鼓励语>",
  "highlights": ["<关键事项1>", "<关键事项2>"],
  "attention": "<需要关注的异常，无则为空字符串>",
  "shareText": "<微信分享简报>"
}`;

      try {
        const raw = await callQwen(prompt, SYSTEM_PROMPT, 1, 4000);
        const briefing = JSON.parse(raw);
        if (briefing.attention && briefing.attention.length > 40) {
          briefing.attention = briefing.attention.slice(0, 40);
        }
        return { success: true, briefing };
      } catch (e) {
        console.error("Briefing generation error:", e);
        return {
          success: false,
          briefing: null,
          error: e instanceof Error ? e.message : "简报生成失败",
        };
      }
    }),

  // Generate AI reply after diary entry — warm, professional caregiver support
  replyToDiary: publicProcedure
    .input(z.object({
      elderNickname: z.string(),
      caregiverName: z.string(),
      moodEmoji: z.string(),
      moodLabel: z.string(),
      tags: z.array(z.string()),
      content: z.string(),
      checkIn: z.object({
        morningDone: z.boolean().optional(),
        eveningDone: z.boolean().optional(),
        sleepHours: z.number().optional(),
        sleepRange: z.string().optional(),
        sleepQuality: z.string().optional(),
        nightAwakenings: z.string().optional(),
        napDuration: z.string().optional(),
        moodScore: z.number().optional(),
        medicationTaken: z.boolean().optional(),
        mealNotes: z.string().optional(),
        morningNotes: z.string().optional(),
        eveningNotes: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input }) => {
      const { elderNickname, caregiverName, moodEmoji, moodLabel, tags, content, checkIn } = input;
      const nickname = elderNickname || "家人";

      // Build check-in summary only from available fields
      const checkInLines: string[] = [];
      if (checkIn?.morningDone) {
        const sleep = checkIn.sleepRange ?? (checkIn.sleepHours ? `${checkIn.sleepHours}小时` : null);
        const quality = checkIn.sleepQuality === 'good' ? '睡眠质量良好' : checkIn.sleepQuality === 'fair' ? '睡眠质量一般' : checkIn.sleepQuality === 'poor' ? '睡眠质量较差' : null;
        if (sleep) checkInLines.push(`夜间睡眠：${sleep}${checkIn.nightAwakenings ? `，夜醒${checkIn.nightAwakenings}` : ''}${quality ? `，${quality}` : ''}`);
        if (checkIn.napDuration && checkIn.napDuration !== '没有') checkInLines.push(`白天小睡：${checkIn.napDuration}`);
        if (checkIn.morningNotes) checkInLines.push(`早间备注：${checkIn.morningNotes}`);
      }
      if (checkIn?.eveningDone) {
        if (checkIn.moodScore !== undefined) checkInLines.push(`${nickname}今日心情评分：${checkIn.moodScore}/10`);
        if (checkIn.medicationTaken !== undefined) checkInLines.push(`用药情况：${checkIn.medicationTaken ? '已按时服药' : '今日未服药'}`);
        if (checkIn.mealNotes) checkInLines.push(`饮食：${checkIn.mealNotes}`);
        if (checkIn.eveningNotes) checkInLines.push(`晚间备注：${checkIn.eveningNotes}`);
      }
      const checkInSummary = checkInLines.length > 0 ? checkInLines.join('\n') : '（今日暂无打卡数据）';

      // ── 分流：日记内容丰富 vs 简短 ──────────────────────────────────────
      const cleanContent = (content || '').replace(/\s/g, '');
      const isRichDiary = cleanContent.length >= 12;

      const diaryBlock = `【今日日记】
- 记录内容：${content || '（未填写详细内容）'}
- 心情：${moodLabel}
- 标签：${tags.length > 0 ? tags.join('、') : '无'}`;

      const checkInBlock = `【今日打卡数据】
${checkInSummary}`;

      const prompt = isRichDiary
        ? `你是一位有多年照护经验的温和陪伴者。${caregiverName}刚写完了今天的护理日记。

${diaryBlock}

${checkInBlock}

回复原则：
1. 主要回应日记“记录内容”里写的具体事情，自然提到日记中的具体场景
2. 打卡数据只作为背景参考，不要主动罗列打卡数据，更不要报流水账
3. 如有值得留意的护理点，自然地嵌在正文里提一句，不要单独列出
4. 语气像熟人聊天，用口语，不要像报告或客服
5. 不要臆想没写到的情节，不要揣测心理
6. 禁用：“根据您的记录”“综合来看”“建议继续保持”“你一定”“你心里”
7. 字数根据日记内容自然决定，不要硬凑，说完就停，不超过130字

返回JSON（不要代码块标记）：
{"reply": "<回复正文>", "emoji": "<1个emoji>"}}`
        : `你是一位有多年照护经验的温和陪伴者。${caregiverName}刚写了一条简短的护理日记。

${diaryBlock}

${checkInBlock}

回复原则：
1. 自然地接一下日记内容，不要过度解读短内容
2. 打卡数据只作为背景，最多补充1句轻量观察，不要罗列数据
3. 语气像熟人聊天，简洁自然
4. 不要臆想没写到的情节
5. 禁用：“根据您的记录”“综合来看”“建议继续保持”“你一定”“你心里”
6. 字数根据内容自然决定，短日记就短回复，说完就停，不要硬凑，不超过100字

返回JSON（不要代码块标记）：
{"reply": "<回复正文>", "emoji": "<1个emoji>"}}`;

      try {
        const raw = await callQwen(prompt, SYSTEM_PROMPT, 2, 600);
        const result = JSON.parse(raw);
        return { success: true, ...result };
      } catch (e) {
        console.error("Diary reply error:", e instanceof Error ? e.message : e);
        return {
          success: false,
          reply: `${caregiverName}，已收到您的护理记录。持续记录有助于了解${nickname}的状态变化，如有异常建议及时咨询专业医生。`,
          emoji: "📋",
          tip: "保持稳定的记录频率，便于追踪变化",
        };
      }
    }),

  followUpDiary: publicProcedure
    .input(z.object({
      elderNickname: z.string(),
      caregiverName: z.string(),
      originalContent: z.string(),
      originalMood: z.string(),
      originalAiReply: z.string(),
      checkInSummary: z.string().optional(),
      history: z.array(z.object({
        role: z.enum(['user', 'ai']),
        text: z.string(),
      })),
      question: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { elderNickname, caregiverName, originalContent, originalMood, originalAiReply, checkInSummary, history, question } = input;
      const nickname = elderNickname || '家人';
      const historyText = history.length > 0
        ? history.map(m => m.role === 'user' ? `${caregiverName}：${m.text}` : `护理员：${m.text}`).join('\n')
        : '';
      const prompt = `你正在和${caregiverName}聊天。你是一个有照护经验的朋友。你的角色是倾听，不是主导对话。

背景：
- 日记内容：${originalContent || '未填写'}
- 心情：${originalMood}
${checkInSummary ? `- 打卡数据：${checkInSummary}` : ''}
${historyText ? `\n之前的对话：\n${historyText}\n` : ''}
${caregiverName}说：${question}

回复要求：
- 你是倾听者，不是对话发起者。不要主动抛问题、不要硬拉话题
- 如果用户回复很简短（比如"好""嗯""知道了""谢谢"），说明对话可以结束了，你就简短温暖地收尾，比如"好的~""嗯嗯""有事随时说"，不要再追问或给建议
- 如果用户主动聊了新内容或问了问题，再正常回应
- 语气像朋友，自然、不啰嗦
- 不要臆想没提到的事情
- 字数跟着用户走：用户说得少你也少，用户说得多你可以多一点，不超过100字

返回JSON（不要代码块标记）：
{"reply": "<回复内容>"}`;
      try {
        const raw = await callQwen(prompt, SYSTEM_PROMPT);
        const parsed = JSON.parse(raw);
        // Extract reply from various possible JSON shapes
        const replyText = parsed.reply ?? parsed.message ?? parsed.text ?? raw;
        return { success: true, reply: String(replyText).trim() };
      } catch (e) {
        console.error('followUpDiary error:', e instanceof Error ? e.message : e);
        return {
          success: false,
          reply: `这个问题我需要再想想。如果涉及具体的病情判断，建议和主治医生确认一下。您能再说详细一点吗？`,
        };
      }
    }),
  weeklyEcho: publicProcedure
    .input(z.object({
      caregiverName: z.string(),
      elderNickname: z.string().optional(),
      weekDiaries: z.array(z.object({
        date: z.string(),
        mood: z.string(),
        content: z.string(),
        tags: z.array(z.string()).optional(),
      })),
      weekCheckins: z.array(z.object({
        date: z.string(),
        moodScore: z.number().optional(),
        moodEmoji: z.string().optional(),
        sleepHours: z.number().optional(),
        morningNotes: z.string().optional(),
        eveningNotes: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const { caregiverName, elderNickname, weekDiaries, weekCheckins } = input;
      const name = caregiverName || '照顾者';

      // 日记按日期排序，只传实际有内容的
      const sortedDiaries = [...weekDiaries]
        .sort((a, b) => a.date.localeCompare(b.date))
        .filter(d => d.content && d.content.trim().length > 0);
      const diaryText = sortedDiaries.length > 0
        ? sortedDiaries.map(d => `${d.date}（心情:${d.mood}）：${d.content.slice(0, 200)}`).join('\n')
        : '本周没有写日记';

      // 打卡数据：只统计实际有心情分数的记录，不用默认分展开
      const checkinsWithMood = weekCheckins.filter(c => c.moodScore !== undefined && c.moodScore !== null);
      const avgMood = checkinsWithMood.length > 0
        ? (checkinsWithMood.reduce((s, c) => s + (c.moodScore!), 0) / checkinsWithMood.length).toFixed(1)
        : null;
      const checkinsWithSleep = weekCheckins.filter(c => c.sleepHours && c.sleepHours > 0);
      const avgSleep = checkinsWithSleep.length > 0
        ? (checkinsWithSleep.reduce((s, c) => s + c.sleepHours!, 0) / checkinsWithSleep.length).toFixed(1)
        : null;

      const checkinLines: string[] = [];
      if (weekCheckins.length > 0) checkinLines.push(`本周打卡 ${weekCheckins.length} 天`);
      if (avgMood) checkinLines.push(`平均心情分数 ${avgMood}/10`);
      if (avgSleep) checkinLines.push(`平均睡眠 ${avgSleep} 小时`);
      const checkinText = checkinLines.length > 0 ? checkinLines.join('，') : '本周未打卡';

      // 如果本周没有任何数据，返回简短提示
      const hasAnyData = sortedDiaries.length > 0 || weekCheckins.length > 0;

      const prompt = `你是一个温暖的护理伴侣。每周日本周结束时，你会基于照顾者本周实际的日记和打卡记录，写一段周回顾。

照顾者：${name}${elderNickname ? `，照顾对象：${elderNickname}` : ''}

本周日记：
${diaryText}

打卡数据：${checkinText}

要求：
- 严格基于上面的实际数据，不要添加任何未记录的内容
- 如果日记有具体细节，自然地提及
- 如果本周没有日记也没有打卡，就说“本周没有记录，下周加油”这类的话
- 语气像朋友一样自然温暖，不要太正式
- 字数根据内容多少自然决定，不要硬凑凑凑

返回JSON（不要包含代码块标记）：
{"echo": "<周回顾文字>", "title": "<一句话标题>"}`;
      try {
        const raw = await callQwen(prompt, SYSTEM_PROMPT);
        const parsed = JSON.parse(raw);
        return {
          success: true,
          echo: String(parsed.echo || parsed.message || raw).trim(),
          title: String(parsed.title || '这一周，您做得很棒').trim(),
        };
      } catch (e) {
        return {
          success: false,
          echo: `${name}，本周照护记录已整理完毕。照护是一项长期工作，保持稳定的记录习惯有助于及时发现变化。如有异常波动，建议及时与医生沟通。`,
          title: '本周照护情况已整理',
        };
      }
    }),
});