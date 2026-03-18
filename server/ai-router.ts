/**
 * 小马虎 AI Router — Gemini-powered dementia care advice
 * Uses gemini-2.5-flash for dynamic professional care advice generation
 */

import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Try to extract valid JSON from a potentially truncated Gemini response */
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
  throw new Error('Failed to parse Gemini JSON response');
}

async function callGemini(prompt: string, systemPrompt: string, retries = 1): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
          responseMimeType: "application/json",
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json() as any;
      throw new Error(`Gemini API error: ${err.error?.message ?? res.status}`);
    }

    const data = await res.json() as any;
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    try {
      return extractJSON(raw);
    } catch (e) {
      console.warn(`Gemini JSON parse attempt ${attempt + 1} failed, raw length: ${raw.length}`);
      if (attempt === retries) throw e;
    }
  }
  return "{}";
}

async function getWeatherForCity(city: string): Promise<{ temp: number; description: string; icon: string; isHot: boolean; isCold: boolean; isRainy: boolean } | null> {
  try {
    const braveKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!braveKey) return null;

    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(`${city}今日天气温度`)}&count=3`,
      { headers: { "Accept": "application/json", "X-Subscription-Token": braveKey } }
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const snippet = data.web?.results?.[0]?.description ?? "";

    // Parse temperature from snippet
    const tempMatch = snippet.match(/(\d+)[°℃]/);
    const temp = tempMatch ? parseInt(tempMatch[1]) : 20;
    const isRainy = /雨|阴|雷/.test(snippet);
    const isHot = temp >= 30;
    const isCold = temp <= 10;

    let icon = "🌤️";
    let description = "晴间多云";
    if (isRainy) { icon = "🌧️"; description = "有雨"; }
    else if (isHot) { icon = "☀️"; description = "晴热"; }
    else if (isCold) { icon = "🥶"; description = "寒冷"; }

    return { temp, description, icon, isHot, isCold, isRainy };
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `你是"小马虎"App的专业阿兹海默护理顾问。

你的专业知识涵盖：
- 阿尔茨海默症各阶段的行为特征和护理要点
- 日落综合症、游走行为、拒绝服药等常见问题的处理方法
- 认知刺激疗法、音乐疗法、回忆疗法等非药物干预手段
- 老年人营养需求和饮食安全（防呛咳）
- 照顾者心理健康和防止照顾者倦怠
- 中国家庭文化背景下的护理沟通技巧

【重要工作原则】
你收到的数据已由规则引擎预处理完毕：
- sleep_analysis.score 已由评分规则计算（你不需要重新评估睡眠质量）
- sleep_analysis.problems 已由规则推导（你不需要自己判断有哪些睡眠问题）
- 你的职责是：用这些事实生成温暖、具体、可操作的护理建议
- 不要对数据做额外推断，不要改变或质疑分数

你的回复风格：
- 温暖、专业、有同理心
- 建议具体可操作，不空泛
- 用中文回复
- 理解照顾者的辛苦，给予鼓励

重要：你的回复必须是严格的JSON格式，不要包含任何Markdown代码块标记。`;

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
      const nickname = elderNickname || "老宝";

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
          meal: yesterday.mealNotes || "未记录",
          notes: yesterday.notes,
        } : null),
        weather: weatherInfo || null,
        extra_notes: extraNotes || null,
      };

      const prompt = `
照顾者：${caregiverName}，正在照顾老人：${nickname}。

以下是今日护理数据（已由规则引擎预处理，请直接使用这些事实）：

${JSON.stringify(structuredInput, null, 2)}

请根据以上结构化数据生成今日专业护理建议报告。
注意：
- sleep_analysis.score 和 problems 是规则引擎的计算结果，你无需重新判断，直接引用
- 如果 sleep_analysis.problems 为空，说明睡眠状况良好，请给出积极的肯定
- 建议必须与 baseline.care_needs 中的护理需求相关联
- 如果 care_needs 为空，默认按老年认知/身体保健给出通用建议

返回以下JSON格式（不包含任何代码块标记，直接返回JSON）：
{
  "careScore": <1-100整数，综合护理难度/关注指数，100=状态极佳，sleep_analysis.score可作为重要参考>,
  "scoreLabel": "<状态极佳/状态良好/状态平稳/需要关注/需要照顾>",
  "greeting": "<给${caregiverName}的温馨问候，提到${nickname}>",
  "overallAssessment": "<2-3句综合评估，直接引用sleep_analysis数据，专业且温暖>",
  "adviceCards": [
    {
      "title": "<建议标题>",
      "icon": "<emoji>",
      "priority": "<high/medium/low>",
      "advice": "<详细建议2-3句，必须基于传入的数据，不要泛泛而谈>",
      "actionTips": ["<具体可操作建议1>", "<建议2>", "<建议3>"]
    }
  ],
  "nutritionAdvice": {
    "breakfast": ["<早餐建议1>", "<早餐建议2>"],
    "lunch": ["<午餐建议1>", "<午餐建议2>"],
    "dinner": ["<晚餐建议1>"],
    "hydration": "<饮水提醒>"
  },
  "outdoorAdvice": "<结合天气的户外活动建议>",
  "encouragement": "<给${caregiverName}的鼓励，温暖有力>",
  "watchOut": "<今日最需要特别注意的一件事>"
}

adviceCards必须包含3-5张，第一张必须关于睡眠（直接引用sleep_analysis.problems）。`;

      try {
        const raw = await callGemini(prompt, SYSTEM_PROMPT);
        const advice = JSON.parse(raw);
        return { success: true, advice, weather: weatherData };
      } catch (e) {
        console.error("Gemini parse error:", e);
        // Return fallback
        return {
          success: false,
          advice: null,
          weather: weatherData,
          error: e instanceof Error ? e.message : "AI生成失败",
        };
      }
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
        notes: z.string().optional(),
      }),
      careScore: z.number(),
    }))
    .mutation(async ({ input }) => {
      const { elderNickname, caregiverName, date, checkIn, careScore } = input;
      const nickname = elderNickname || "老宝";

      const moodEmoji = checkIn.moodScore >= 8 ? "😊" : checkIn.moodScore >= 6 ? "😌" : checkIn.moodScore >= 4 ? "😐" : "😟";
      const sleepEmoji = checkIn.sleepHours >= 7 ? "🌙✨" : checkIn.sleepHours >= 5 ? "🌙" : "😴";
      const medEmoji = checkIn.medicationTaken ? "💊✅" : "💊❌";

      const prompt = `
为阿兹海默患者${nickname}生成一份温馨的家庭日报，供家庭成员在微信上查看。
照顾者：${caregiverName}，日期：${date}

今日数据：
- 护理指数：${careScore}/100
- 睡眠：${checkIn.sleepHours}小时 ${sleepEmoji}，质量${checkIn.sleepQuality === "good" ? "良好" : checkIn.sleepQuality === "fair" ? "一般" : "较差"}
- 心情：${checkIn.moodScore}/10 ${moodEmoji}
- 用药：${medEmoji}
- 饮食：${checkIn.mealSituation === "good" ? "进食良好" : checkIn.mealSituation === "fair" ? "进食一般" : "进食较差"}
${checkIn.notes ? `- 备注：${checkIn.notes}` : ""}

请生成一份简短温馨的家庭日报，返回JSON格式（不要包含任何代码块标记）：
{
  "title": "<日报标题，包含日期和老人昵称>",
  "summary": "<2-3句温馨的今日状态总结，像家人写给家人的>",
  "highlights": ["<今日亮点1>", "<今日亮点2>"],
  "caregiverNote": "<照顾者${caregiverName}今日辛苦了的温馨话语>",
  "emoji_status": "<用3-5个emoji表达今日状态>",
  "shareText": "<适合发微信的完整分享文字，包含所有关键信息，温馨自然，200字以内>",
  "encouragement": "<每天不同的加油鼓气的话，给照顾者力量和温暖，30字以内，充满正能量>"
}`;

      try {
        const raw = await callGemini(prompt, SYSTEM_PROMPT);
        const briefing = JSON.parse(raw);
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
    }))
    .mutation(async ({ input }) => {
      const { elderNickname, caregiverName, moodEmoji, moodLabel, tags, content } = input;
      const nickname = elderNickname || "老宝";

      const prompt = `
照顾者${caregiverName}刚刚写了一篇关于照顾阿兹海默患者${nickname}的护理日记。

日记内容：
- 老人今日心情：${moodEmoji} ${moodLabel}
- 今日标签：${tags.length > 0 ? tags.join('、') : '无'}
- 详细记录：${content || '（未写详细内容）'}

请以一位专业的阿兹海默护理医生 + 温暖的心理咋询师的身份，给照顾者${caregiverName}写一段温暖的回复。

回复结构必须按照以下三段式：
1【共情】首先真心感受和理解照顾者的心情和处境，让对方感到被看见、被理解。不要直接给建议。
2【专业】针对日记中提到的具体情况，给出1-2条具体可操作的专业建议（如果老人心情好，可以这样巩固；如果心情不好，可以尝试……）。
3【鼓励】最后给照顾者温暖的鼓励，让对方感到不孤单。

语气要求：温暖、真诚、有同理心，像一位认识多年的老年科医生和心理咋询师。不要冷冰冰、不要空泛。总字数200字左右。

返回JSON格式（不要包含任何代码块标记）：
{
  "reply": "<按共情→专业→鼓励结构写的回复文字>",
  "emoji": "<1个最合适的emoji表情>",
  "tip": "<一条简短的专业护理小贴士，30字以内>"
}`;

      try {
        const raw = await callGemini(prompt, SYSTEM_PROMPT);
        const result = JSON.parse(raw);
        return { success: true, ...result };
      } catch (e) {
        console.error("Diary reply error:", e);
        return {
          success: false,
          reply: `${caregiverName}，辛苦了！你的每一份记录都是对${nickname}最好的关爱。照顾好自己，才能更好地照顾家人 💕`,
          emoji: "💕",
          tip: "记得给自己也留一些休息时间",
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
      history: z.array(z.object({
        role: z.enum(['user', 'ai']),
        text: z.string(),
      })),
      question: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { elderNickname, caregiverName, originalContent, originalMood, originalAiReply, history, question } = input;
      const nickname = elderNickname || '老宝';
      const historyText = history.length > 0
        ? history.map(m => m.role === 'user' ? `照顾者问：${m.text}` : `AI回复：${m.text}`).join('\n')
        : '';
      // Use JSON format to avoid raw text parsing issues
      const prompt = `你是一位专业的阿兹海默护理医生和温暖的心理咨询师。
背景：照顾者${caregiverName}在照顾阿兹海默患者${nickname}。
日记内容：${originalContent || '未写详细内容'}
心情：${originalMood}
之前的AI回复：${originalAiReply}
${historyText ? `\n对话历史：\n${historyText}\n` : ''}
照顾者现在问：${question}

请给出简洁、专业、温暖的回复（150字内）。
返回JSON格式（不要包含任何代码块标记）：
{
  "reply": "<你的回复文字>"
}`;
      try {
        const raw = await callGemini(prompt, SYSTEM_PROMPT);
        const parsed = JSON.parse(raw);
        // Extract reply from various possible JSON shapes
        const replyText = parsed.reply ?? parsed.message ?? parsed.text ?? raw;
        return { success: true, reply: String(replyText).trim() };
      } catch (e) {
        return {
          success: false,
          reply: `${caregiverName}，这是个好问题。建议您和专业医生进一步沟通。您对${nickname}的用心我都看到了`,
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
      const name = caregiverName || '亲爱的照顾者';
      const diaryText = weekDiaries.length > 0
        ? weekDiaries.map(d => `${d.date}（${d.mood}）：${d.content || '未写内容'}`).join('\n')
        : '本周没有写日记';
      const avgMood = weekCheckins.length > 0
        ? (weekCheckins.reduce((s, c) => s + (c.moodScore || 5), 0) / weekCheckins.length).toFixed(1)
        : '未知';
      const checkinText = weekCheckins.length > 0
        ? `本周打卡 ${weekCheckins.length} 天，平均心情分数 ${avgMood} 分`
        : '本周未打卡';
      const prompt = `你是一位温暖的护理陪伴AI，每周末给照顾者写一封有温度的"时光回音"信。

照顾者名字：${name}
${elderNickname ? `被照顾的家人：${elderNickname}` : ''}

本周护理记录：
${diaryText}

打卡情况：${checkinText}

请写一封温暖的周末时光回音（150-200字），要求：
1. 用第一人称"我"（AI）来写，像一个老朋友在回顾这一周
2. 具体提到日记中的某个细节（如果有），让照顾者感到"被看见"
3. 给予真诚的鼓励，不要空洞的套话
4. 结尾给一个温馨的小建议（如：给自己买杯咖啡、出去散散步）
5. 语气温暖、亲切，像明信片一样

返回JSON格式（不要包含任何代码块标记）：
{
  "echo": "<你的时光回音文字>",
  "title": "<一句话标题，如：这一周，你做得很棒>"
}`;
      try {
        const raw = await callGemini(prompt, SYSTEM_PROMPT);
        const parsed = JSON.parse(raw);
        return {
          success: true,
          echo: String(parsed.echo || parsed.message || raw).trim(),
          title: String(parsed.title || '这一周，你做得很棒').trim(),
        };
      } catch (e) {
        return {
          success: false,
          echo: `${name}，这一周你一直在默默付出，照顾家人是一件需要很大勇气的事。我看到了你的坚持，也感受到了你的爱。今天给自己一点时间休息，你值得被好好对待。`,
          title: '这一周，你做得很棒',
        };
      }
    }),
});