export function ObserverFeed() {
  const feed = [
    { id: 1, type: "checkin", time: "08:23", icon: "✅", color: "#10B981", bg: "#ECFDF5", tag: "早间打卡", title: "奶奶今晨状态良好", detail: "心情 😊 好 · 睡眠 7.5h · 用药已服", author: null },
    { id: 2, type: "med", time: "08:30", icon: "💊", color: "#6366F1", bg: "#EEF2FF", tag: "用药记录", title: "降压药已按时服用", detail: "安立生坦片 5mg", author: "小明" },
    { id: 3, type: "diary", time: "10:15", icon: "📔", color: "#F59E0B", bg: "#FFFBEB", tag: "护理日记", title: "今天带奶奶晒了太阳", detail: "散步约20分钟，精神比昨天好很多…", author: "小明" },
    { id: 4, type: "announce", time: "14:02", icon: "📢", color: "#EC4899", bg: "#FDF2F8", tag: "家庭公告", title: "下周三复查，提醒大家", detail: "协和医院神经内科 · 记得早点出发", author: "小明" },
    { id: 5, type: "checkin", time: "21:05", icon: "🌙", color: "#8B5CF6", bg: "#F5F3FF", tag: "晚间打卡", title: "今日护理完成 ⭐ 92分", detail: "心情 😴 平静 · 晚饭胃口好 · 已休息", author: null },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 font-['Inter']">
      {/* Status bar space */}
      <div className="h-12" />

      {/* Header */}
      <div className="px-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-xs font-medium text-slate-400 tracking-wide uppercase">3月21日 周六</p>
            <h1 className="text-xl font-bold text-slate-800">奶奶的今日动态</h1>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center shadow-md">
            <span className="text-lg">👩</span>
          </div>
        </div>
        {/* Summary chips */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <span className="text-xs bg-green-100 text-green-700 font-semibold px-3 py-1 rounded-full">✅ 早晚打卡完成</span>
          <span className="text-xs bg-indigo-100 text-indigo-700 font-semibold px-3 py-1 rounded-full">💊 用药 100%</span>
          <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-3 py-1 rounded-full">⭐ 今日 92分</span>
        </div>
      </div>

      {/* Elder status card */}
      <div className="mx-5 mb-4 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-3 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-2xl">🐂</div>
          <div className="flex-1">
            <p className="text-white/80 text-xs font-medium">被照顾者</p>
            <p className="text-white font-bold text-base">王奶奶 · 今天状态不错 😊</p>
          </div>
          <div className="text-right">
            <p className="text-white text-xl font-black">92</p>
            <p className="text-white/70 text-xs">护理分</p>
          </div>
        </div>
        <div className="bg-white px-4 py-3 flex justify-around">
          {[{ emoji: "😊", label: "心情", val: "好" }, { emoji: "💤", label: "睡眠", val: "7.5h" }, { emoji: "🍚", label: "饮食", val: "良好" }].map(m => (
            <div key={m.label} className="text-center">
              <p className="text-base">{m.emoji}</p>
              <p className="text-xs text-slate-400">{m.label}</p>
              <p className="text-sm font-bold text-slate-700">{m.val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline feed */}
      <div className="px-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">今日活动记录</p>
        <div className="space-y-3">
          {feed.map((item, i) => (
            <div key={item.id} className="flex gap-3">
              {/* Timeline line */}
              <div className="flex flex-col items-center">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ backgroundColor: item.bg, border: `2px solid ${item.color}20` }}>
                  <span>{item.icon}</span>
                </div>
                {i < feed.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1 mb-1" style={{ minHeight: 12 }} />}
              </div>
              {/* Content */}
              <div className="flex-1 pb-1">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: item.bg, color: item.color }}>{item.tag}</span>
                  {item.author && (
                    <span className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                      <span className="w-4 h-4 rounded-full bg-slate-200 inline-flex items-center justify-center text-xs leading-none">👤</span>
                      {item.author}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{item.time}</span>
                </div>
                <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="h-24" />

      {/* Bottom nav hint */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-slate-100 px-6 py-3 flex justify-around">
        {[{ e: "🏠", l: "首页" }, { e: "✨", l: "打卡" }, { e: "💊", l: "用药" }, { e: "📔", l: "日记" }, { e: "👨‍👩‍👧", l: "家庭", active: true }].map(t => (
          <div key={t.l} className={`flex flex-col items-center gap-0.5 ${t.active ? 'opacity-100' : 'opacity-40'}`}>
            <span className="text-xl">{t.e}</span>
            <span className={`text-xs font-medium ${t.active ? 'text-violet-600' : 'text-slate-400'}`}>{t.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
