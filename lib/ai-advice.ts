/**
 * 小马虎 AI 专业护理建议引擎 v2
 * 角色：专业阿兹海默照护医护顾问
 * 今日护理指数 1-100 + 专业建议 + 营养建议
 */

import { DailyCheckIn } from './storage';
import { WeatherData, getWeatherCareScore } from './weather';

export interface CareAdvice {
  title: string;
  icon: string;
  priority: 'high' | 'medium' | 'low';
  color: string;
  bgColor: string;
  advice: string;
  actionTips: string[];
}

export interface DailyAdviceReport {
  careScore: number;
  scoreEmoji: string;
  scoreLabel: string;
  scoreColor: string;
  scoreBgColor: string;
  greeting: string;
  overallAssessment: string;
  adviceCards: CareAdvice[];
  nutritionAdvice: NutritionAdvice;
  outdoorAdvice: string;
  encouragement: string;
  watchOut: string;
}

export interface NutritionAdvice {
  icon: string;
  title: string;
  meals: { meal: string; suggestions: string[] }[];
  hydration: string;
}

// ─── 护理指数计算 ─────────────────────────────────────────────────────────────

export function calculateCareScore(
  yesterday: DailyCheckIn | null,
  weather: WeatherData | null
): number | null {
  if (!yesterday) return null;
  if (!yesterday.eveningDone) return null;
  let score = 50;

  // 睡眠评分 (最高 +25 分)
  if (yesterday.sleepHours >= 8) score += 25;
  else if (yesterday.sleepHours >= 7) score += 20;
  else if (yesterday.sleepHours >= 6) score += 12;
  else if (yesterday.sleepHours >= 5) score += 5;
  else score -= 15;

  if (yesterday.sleepQuality === 'good') score += 5;
  else if (yesterday.sleepQuality === 'poor') score -= 10;

  // 心情评分 (最高 +20 分)
  const moodBonus = Math.round((yesterday.moodScore / 10) * 20);
  score += moodBonus - 10; // 5分以下扣分，以上加分

  // 用药评分 (+10 / -15)
  if (yesterday.medicationTaken) score += 10;
  else score -= 15;

  // 天气影响
  if (weather) score += getWeatherCareScore(weather);

  return Math.max(1, Math.min(100, score));
}

export function getScoreDisplay(score: number): {
  emoji: string; label: string; color: string; bgColor: string; mascot: string;
} {
  if (score >= 90) return { emoji: '🌟', label: '状态极佳', color: '#2E7D32', bgColor: '#E8F5E9', mascot: '🐴🐯✨' };
  if (score >= 75) return { emoji: '😊', label: '状态良好', color: '#388E3C', bgColor: '#F1F8E9', mascot: '🐴🐯' };
  if (score >= 60) return { emoji: '😌', label: '状态平稳', color: '#F57C00', bgColor: '#FFF8E1', mascot: '🐴💤' };
  if (score >= 45) return { emoji: '😟', label: '需要关注', color: '#E65100', bgColor: '#FFF3E0', mascot: '🐯💛' };
  if (score >= 30) return { emoji: '😢', label: '需要照顾', color: '#C62828', bgColor: '#FFEBEE', mascot: '🐯🤗' };
  return { emoji: '🆘', label: '需要特别关爱', color: '#B71C1C', bgColor: '#FFCDD2', mascot: '🐯❤️‍🩹' };
}

// ─── 营养建议生成 ─────────────────────────────────────────────────────────────

function generateNutritionAdvice(
  score: number,
  weather: WeatherData | null,
  mealNotes?: string
): NutritionAdvice {
  const isHot = weather?.isHot ?? false;
  const isCold = weather?.isCold ?? false;

  const breakfastOptions = isHot
    ? ['清淡粥品（小米粥/绿豆粥）', '新鲜水果（西瓜、黄瓜）', '低脂酸奶']
    : isCold
    ? ['热燕麦粥加坚果', '温热豆浆', '鸡蛋羹（软烂易消化）']
    : ['软烂米粥或燕麦粥', '蒸蛋或水煮蛋', '温热豆浆或牛奶'];

  const lunchOptions = score < 50
    ? ['清蒸鱼（富含Omega-3，有助大脑健康）', '蒸南瓜（软烂易吞咽）', '菠菜豆腐汤（补铁补钙）']
    : ['炖鸡腿肉（软烂）', '清炒时蔬（切小块）', '番茄蛋花汤'];

  const dinnerOptions = ['软烂面条或米饭', '清蒸蔬菜', '少量蛋白质（豆腐/鱼肉）', '避免辛辣刺激'];

  const hydration = isHot
    ? '今日高温，每小时提醒老人喝水50-100ml，全天饮水量不少于1500ml，可准备温热的淡盐水或绿豆汤。'
    : '每天保证1200-1500ml饮水量，阿兹海默老人容易忘记喝水，建议每2小时主动提醒一次。';

  return {
    icon: '🥗',
    title: '今日营养建议',
    meals: [
      { meal: '早餐', suggestions: breakfastOptions },
      { meal: '午餐', suggestions: lunchOptions },
      { meal: '晚餐', suggestions: dinnerOptions },
    ],
    hydration,
  };
}

// ─── 主建议生成函数 ───────────────────────────────────────────────────────────

export function generateDailyAdvice(
  yesterday: DailyCheckIn | null,
  elderNickname: string,
  weather: WeatherData | null,
  extraNotes?: string
): DailyAdviceReport {
  const nickname = elderNickname || '家人';
  const careScore = calculateCareScore(yesterday, weather) ?? 50;
  const scoreDisplay = getScoreDisplay(careScore);
  const cards: CareAdvice[] = [];

  if (!yesterday) {
    return {
      careScore: 50,
      scoreEmoji: '📋',
      scoreLabel: '等待数据',
      scoreColor: '#6C9E6C',
      scoreBgColor: '#F0F7EE',
      greeting: `开始记录${nickname}的状态`,
      overallAssessment: '还没有昨日数据，请先完成今日打卡，明天就能看到专业护理预测了。',
      adviceCards: [{
        title: '开始第一次打卡',
        icon: '📋',
        priority: 'high',
        color: '#6C9E6C',
        bgColor: '#F0F7EE',
        advice: '每天坚持打卡，小马虎就能为您提供越来越精准的护理建议。',
        actionTips: ['完成今日打卡', '记录睡眠、心情和用药情况', '坚持每天记录，数据越多建议越准确'],
      }],
      nutritionAdvice: generateNutritionAdvice(50, weather),
      outdoorAdvice: weather?.advice ?? '请先完成打卡以获取个性化建议。',
      encouragement: '您开始使用小马虎，是对老人最好的关爱！💕',
      watchOut: '请先完成今日打卡以获取个性化建议。',
    };
  }

  if (!yesterday.eveningDone) {
    return {
      careScore: 50,
      scoreEmoji: '📋',
      scoreLabel: '暂未评分',
      scoreColor: '#B8860B',
      scoreBgColor: '#FFF8EE',
      greeting: `${nickname}的部分记录已完成`,
      overallAssessment: `${nickname}的早间打卡已记录。缺少昨晚打卡数据，暂无法生成完整评分。请补充昨晚记录后查看完整分析。`,
      adviceCards: [{
        title: '补充昨晚打卡',
        icon: '📝',
        priority: 'high',
        color: '#B8860B',
        bgColor: '#FFF8EE',
        advice: '请补充昨晚的心情、用药和饮食记录，以便生成完整的护理评分。',
        actionTips: ['前往打卡页面补充昨晚记录', '完成后简报将自动更新'],
      }],
      nutritionAdvice: generateNutritionAdvice(50, weather),
      outdoorAdvice: weather?.advice ?? '请补充昨晚打卡以获取个性化建议。',
      encouragement: '记录越完整，分析越准确。',
      watchOut: '缺少昨晚记录，评分暂不可用。',
    };
  }

  const { sleepHours, sleepQuality, moodScore, medicationTaken, medicationNotes } = yesterday;

  // ── 睡眠建议 ────────────────────────────────────────────────────────────────
  if (sleepHours < 5 || sleepQuality === 'poor') {
    cards.push({
      title: '睡眠不足，今日重点关注',
      icon: '🌙',
      priority: 'high',
      color: '#5C6BC0',
      bgColor: '#EEF0FB',
      advice: `${nickname}昨晚睡眠${sleepHours < 5 ? `仅${sleepHours}小时，严重不足` : '质量较差'}。睡眠不足会显著加重认知混乱和情绪波动，日落综合症风险增加。`,
      actionTips: [
        '上午可安排15分钟以内的短暂休息，不超过30分钟',
        '下午3点后减少刺激，保持环境安静、光线柔和',
        '今晚睡前播放熟悉的轻音乐，室温保持22-24°C',
        '观察是否有疼痛、尿频等影响睡眠的身体原因',
        '避免下午给予咖啡因饮品',
      ],
    });
  } else if (sleepHours >= 7) {
    cards.push({
      title: `睡眠充足 ${sleepHours}小时 ✓`,
      icon: '🌙',
      priority: 'low',
      color: '#388E3C',
      bgColor: '#E8F5E9',
      advice: `${nickname}昨晚睡了${sleepHours}小时，睡眠质量${sleepQuality === 'good' ? '很好' : '一般'}。充足睡眠有助于大脑清除代谢废物，今日认知状态预计较稳定。`,
      actionTips: [
        '继续保持规律作息，这是最好的护理基础',
        careScore >= 75 ? '今日可安排稍有挑战性的认知活动，如翻看老照片' : '保持日常活动节奏',
      ],
    });
  } else {
    cards.push({
      title: `睡眠略不足 ${sleepHours}小时`,
      icon: '🌙',
      priority: 'medium',
      color: '#F57C00',
      bgColor: '#FFF3E0',
      advice: `${nickname}昨晚睡了${sleepHours}小时，略低于推荐的7-8小时，今日可能轻度疲倦。`,
      actionTips: ['今日活动强度适当降低', '午后可安排20分钟以内的短暂休息', '今晚尝试固定时间就寝'],
    });
  }

  // ── 情绪建议 ────────────────────────────────────────────────────────────────
  if (moodScore <= 3) {
    cards.push({
      title: '情绪低落，今日需特别陪伴',
      icon: '💛',
      priority: 'high',
      color: '#D32F2F',
      bgColor: '#FFEBEE',
      advice: `昨日${nickname}情绪较低落（${moodScore}/10）。情绪低落可能预示抑郁、疼痛不适或对环境变化的反应，今日需增加情感支持。`,
      actionTips: [
        '多给予肢体接触：握手、拍肩、拥抱，让老人感到安全被爱',
        '播放老人年轻时喜欢的音乐，音乐记忆往往是最后消失的',
        '避免争论和纠正，顺着老人的情绪引导',
        '观察是否有身体不适（头痛、便秘、关节痛）导致情绪问题',
        '如情绪持续低落超过3天，建议咨询医生',
      ],
    });
  } else if (moodScore >= 8) {
    cards.push({
      title: `情绪很好 ${moodScore}/10 ✓`,
      icon: '😊',
      priority: 'low',
      color: '#388E3C',
      bgColor: '#E8F5E9',
      advice: `昨日${nickname}情绪很好！情绪好的时候是进行认知训练和社交活动的最佳时机。`,
      actionTips: [
        '今日可尝试稍复杂的互动活动：拼图、折纸、简单手工',
        '这是与家人视频通话的好时机',
        '记录下让老人开心的事情，以后可以重复',
      ],
    });
  } else {
    cards.push({
      title: `情绪平稳 ${moodScore}/10`,
      icon: '😌',
      priority: 'low',
      color: '#6C9E6C',
      bgColor: '#F0F7EE',
      advice: `昨日${nickname}情绪平稳，今日护理可按常规进行。`,
      actionTips: ['保持规律的日常作息', '安排适量的轻体力活动，如散步或简单家务'],
    });
  }

  // ── 用药建议 ────────────────────────────────────────────────────────────────
  if (!medicationTaken) {
    cards.push({
      title: '昨日未按时用药',
      icon: '💊',
      priority: 'high',
      color: '#D32F2F',
      bgColor: '#FFEBEE',
      advice: '昨日未按时服药。阿尔茨海默症药物需规律服用才能维持疗效，漏服可能导致症状波动加重。',
      actionTips: [
        '今日务必按时给药，不要补服昨日漏服的剂量',
        '检查漏服原因：老人拒绝？忘记？药物副作用？',
        '使用分药盒，按早中晚分装，每次服药后做标记',
        '如老人经常拒绝服药，请咨询医生是否可以换剂型',
      ],
    });
  } else {
    cards.push({
      title: '按时用药 ✓',
      icon: '💊',
      priority: 'low',
      color: '#388E3C',
      bgColor: '#E8F5E9',
      advice: '昨日按时服药，很好！规律用药是控制症状进展的重要基础。',
      actionTips: ['继续保持规律用药习惯', '定期复查，告知医生近期状态变化'],
    });
  }

  // ── 天气建议 ────────────────────────────────────────────────────────────────
  if (weather) {
    const weatherPriority = (weather.isHot || weather.isRainy) ? 'high' : weather.isCold ? 'medium' : 'low';
    cards.push({
      title: `今日天气 ${weather.icon} ${weather.description} ${weather.temp}°C`,
      icon: weather.icon,
      priority: weatherPriority,
      color: weather.isRainy ? '#1565C0' : weather.isHot ? '#E65100' : weather.isCold ? '#37474F' : '#2E7D32',
      bgColor: weather.isRainy ? '#E3F2FD' : weather.isHot ? '#FFF3E0' : weather.isCold ? '#ECEFF1' : '#E8F5E9',
      advice: weather.advice,
      actionTips: weather.isRainy
        ? ['今日以室内活动为主', '阴雨天老人情绪可能波动，多给予陪伴', '保持室内温暖干燥，预防关节疼痛']
        : weather.isHot
        ? ['避免正午（11点-15点）外出', '每小时提醒老人补水', '室内保持通风，可开空调但避免直吹']
        : weather.isCold
        ? ['外出需穿厚外套、戴帽子手套', '注意防滑，地面可能结冰', '室内保暖，预防感冒']
        : ['今日天气适合户外散步10-20分钟', '上午9-11点阳光最舒适', '散步时保持慢速，注意路面情况'],
    });
  }

  // ── 额外备注 ────────────────────────────────────────────────────────────────
  if (extraNotes && extraNotes.trim().length > 0) {
    cards.push({
      title: '根据您的补充说明',
      icon: '📝',
      priority: 'medium',
      color: '#7B1FA2',
      bgColor: '#F3E5F5',
      advice: `您提到：「${extraNotes}」\n\n请密切关注这一情况，记录发生的时间、频率和诱因，这些信息对医生评估病情进展非常重要。`,
      actionTips: [
        '将此情况记录在护理日记中，注明时间和具体表现',
        '观察是否有规律性（特定时间段发生）',
        '如情况加重，及时联系主治医生',
      ],
    });
  }

  // ── 综合评估 ────────────────────────────────────────────────────────────────
  const highCount = cards.filter(c => c.priority === 'high').length;
  let overallAssessment = '';
  let watchOut = '';

  if (highCount >= 2) {
    overallAssessment = `今日需要重点关注${nickname}的状态。有${highCount}项需要特别注意，建议今天多陪伴、少刺激，以稳定为主。`;
    watchOut = '今日情绪波动和行为异常风险较高，遇到问题先冷静，转移注意力是最好的应对方式。';
  } else if (highCount === 1) {
    overallAssessment = `今日整体状态一般，有一项需要重点关注。按照下方建议护理，${nickname}今天应该会比较稳定。`;
    watchOut = '今日留意重点关注项，其余按常规护理即可。';
  } else {
    overallAssessment = `根据昨日数据，${nickname}今日状态预计良好！这是进行愉快互动和轻度认知活动的好时机。`;
    watchOut = '今日状态预计平稳，可以安排一些老人喜欢的活动，让今天充满温暖。';
  }

  const encouragements = [
    '今日照护数据已整理完毕，可查看详细分析',
    '持续记录有助于发现长期趋势和变化',
    '定期回顾数据，有助于及时调整照护方案',
    '规律记录让照护更有章法，也方便与家人同步',
    '数据积累越多，趋势分析越准确',
  ];

  return {
    careScore,
    scoreEmoji: scoreDisplay.emoji,
    scoreLabel: scoreDisplay.label,
    scoreColor: scoreDisplay.color,
    scoreBgColor: scoreDisplay.bgColor,
    greeting: `${nickname}今日护理预测`,
    overallAssessment,
    adviceCards: cards,
    nutritionAdvice: generateNutritionAdvice(careScore, weather, yesterday.mealNotes),
    outdoorAdvice: weather?.advice ?? '无法获取天气信息，请根据实际天气情况决定是否外出。',
    encouragement: encouragements[Math.floor(Math.random() * encouragements.length)],
    watchOut,
  };
}
