import { Card } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ValidationList, ValidationResult } from "@/types/validation";

interface ValidationChartsProps {
  list: ValidationList;
  results: ValidationResult[];
}

const COLORS = {
  deliverable: {
    start: "#10b981",
    end: "#34d399",
    middle: "#059669",
    glow: "rgba(16, 185, 129, 0.6)",
    shadow: "0 0 40px rgba(16, 185, 129, 0.4)",
  },
  undeliverable: {
    start: "#ef4444",
    end: "#f87171",
    middle: "#dc2626",
    glow: "rgba(239, 68, 68, 0.6)",
    shadow: "0 0 40px rgba(239, 68, 68, 0.4)",
  },
  risky: {
    start: "#f59e0b",
    end: "#fbbf24",
    middle: "#d97706",
    glow: "rgba(251, 191, 36, 0.6)",
    shadow: "0 0 40px rgba(251, 191, 36, 0.4)",
  },
  unknown: {
    start: "#9333ea",
    end: "#c084fc",
    middle: "#7c3aed",
    glow: "rgba(147, 51, 234, 0.6)",
    shadow: "0 0 40px rgba(147, 51, 234, 0.4)",
  },
};

export const ValidationCharts = ({ list, results }: ValidationChartsProps) => {
  const pieData = [
    {
      name: "Deliverable",
      value: list.deliverable_count,
      color: COLORS.deliverable.start,
      gradient: `url(#deliverableGradient)`,
      description: "The recipient is valid and email can be delivered.",
    },
    {
      name: "Undeliverable",
      value: list.undeliverable_count,
      color: COLORS.undeliverable.start,
      gradient: `url(#undeliverableGradient)`,
      description: "The recipient is invalid and email cannot be delivered.",
    },
    {
      name: "Risky",
      value: list.risky_count,
      color: COLORS.risky.start,
      gradient: `url(#riskyGradient)`,
      description: "The email address is valid but the deliverability is uncertain.",
    },
    {
      name: "Unknown",
      value: list.unknown_count,
      color: COLORS.unknown.start,
      gradient: `url(#unknownGradient)`,
      description: "The address format is correct, but we could not communicate with the recipient's server.",
    },
  ].filter((item) => item.value > 0);

  const calculatePercentage = (count: number) => {
    return ((count / list.total_emails) * 100).toFixed(1);
  };

  // Breakdown data for categories
  const undeliverableReasons = results
    .filter((r) => r.result === "undeliverable")
    .reduce((acc, r) => {
      const reason = r.reason || "other";
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const riskyReasons = results
    .filter((r) => r.result === "risky")
    .reduce((acc, r) => {
      if (r.catch_all) acc["catch_all"] = (acc["catch_all"] || 0) + 1;
      if (r.disposable) acc["disposable"] = (acc["disposable"] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const unknownReasons = results
    .filter((r) => r.result === "unknown")
    .reduce((acc, r) => {
      const reason = r.reason || "other";
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  return (
    <>
      {/* RIEPILOGO LISTA - MAIN SPECTACULAR CHART */}
      <Card className="p-10 mb-8 bg-gradient-to-br from-slate-900 via-slate-900/98 to-slate-800/80 border-slate-700/50 shadow-2xl backdrop-blur-sm">
        <h2 className="text-3xl font-bold mb-10 text-white text-center">Riepilogo Lista</h2>
        
        <div className="relative">
          {/* MASSIVE GLOWING PIE CHART */}
          <div 
            className="flex items-center justify-center mb-12 relative" 
            style={{ 
              filter: 'drop-shadow(0 0 60px rgba(59, 130, 246, 0.4))',
            }}
          >
            {/* Glow effect background */}
            <div className="absolute inset-0 bg-gradient-radial from-blue-500/10 via-transparent to-transparent blur-3xl" />
            
            <ResponsiveContainer width="100%" height={600}>
              <PieChart>
                <defs>
                  {Object.entries(COLORS).map(([key, colors]) => (
                    <radialGradient key={key} id={`${key}Gradient`}>
                      <stop offset="0%" stopColor={colors.end} stopOpacity={1} />
                      <stop offset="50%" stopColor={colors.middle} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={colors.start} stopOpacity={0.9} />
                    </radialGradient>
                  ))}
                </defs>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={140}
                  outerRadius={240}
                  paddingAngle={4}
                  dataKey="value"
                  strokeWidth={2}
                  stroke="rgba(255,255,255,0.1)"
                  isAnimationActive={false}
                >
                  {pieData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.gradient}
                      style={{
                        filter: `drop-shadow(0 0 20px ${COLORS[entry.name.toLowerCase() as keyof typeof COLORS].glow})`
                      }}
                    />
                  ))}
                </Pie>
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0];
                      const itemName = String(data.name || '');
                      const colorKey = itemName.toLowerCase() as keyof typeof COLORS;
                      const itemValue = typeof data.value === 'number' ? data.value : 0;
                      return (
                        <div 
                          className="p-4 rounded-xl border-2 backdrop-blur-md shadow-2xl"
                          style={{
                            backgroundColor: 'rgba(15, 23, 42, 0.95)',
                            borderColor: COLORS[colorKey]?.start || '#fff',
                            boxShadow: `0 0 30px ${COLORS[colorKey]?.glow || 'rgba(255,255,255,0.3)'}`
                          }}
                        >
                          <p className="text-sm font-semibold mb-2 text-white">
                            {itemName}
                          </p>
                          <p 
                            className="text-2xl font-black"
                            style={{
                              background: COLORS[colorKey] 
                                ? `linear-gradient(135deg, ${COLORS[colorKey].end}, ${COLORS[colorKey].start})`
                                : '#fff',
                              WebkitBackgroundClip: 'text',
                              WebkitTextFillColor: 'transparent',
                              backgroundClip: 'text'
                            }}
                          >
                            {itemValue} ({((itemValue / list.total_emails) * 100).toFixed(1)}%)
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            
            {/* MASSIVE Center Label with glow */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
              <div 
                className="text-8xl font-black text-white mb-2" 
                style={{ 
                  textShadow: '0 0 40px rgba(255,255,255,0.8), 0 0 80px rgba(59, 130, 246, 0.5)',
                  background: 'linear-gradient(135deg, #fff, #60a5fa)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}
              >
                {list.total_emails.toLocaleString()}
              </div>
              <div className="text-lg text-slate-300 uppercase tracking-widest font-bold">Total Emails</div>
            </div>
          </div>

          {/* MODERN Stats Grid with aggressive colors */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {pieData.map((item) => {
              const colorKey = item.name.toLowerCase() as keyof typeof COLORS;
              return (
                <div
                  key={item.name}
                  className="group p-6 rounded-2xl border border-slate-700/40 backdrop-blur-md transition-all duration-300 hover:scale-105 hover:border-opacity-60"
                  style={{
                    background: `linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(30, 41, 59, 0.6))`,
                    boxShadow: `0 0 30px ${COLORS[colorKey].glow}, inset 0 1px 0 rgba(255,255,255,0.05)`,
                    borderColor: COLORS[colorKey].start
                  }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-5 h-5 rounded-full animate-pulse"
                      style={{
                        background: `linear-gradient(135deg, ${COLORS[colorKey].start}, ${COLORS[colorKey].end})`,
                        boxShadow: COLORS[colorKey].shadow
                      }}
                    />
                    <span className="font-bold text-white text-base tracking-wide">{item.name}</span>
                  </div>
                  <div className="flex items-baseline gap-3 mb-3">
                    <span 
                      className="text-5xl font-black"
                      style={{
                        background: `linear-gradient(135deg, ${COLORS[colorKey].end}, ${COLORS[colorKey].start})`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        textShadow: `0 0 30px ${COLORS[colorKey].glow}`
                      }}
                    >
                      {item.value.toLocaleString()}
                    </span>
                    <span 
                      className="text-2xl font-bold"
                      style={{ color: COLORS[colorKey].end }}
                    >
                      {calculatePercentage(item.value)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Category Breakdowns with Mini Pie Charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Undeliverable Breakdown */}
        {list.undeliverable_count > 0 && (
          <Card className="p-4 bg-slate-900/50 border-slate-700/50 hover:border-red-500/30 transition-all">
            <h3 className="text-base font-semibold mb-4 text-red-400 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-red-500 to-pink-600" style={{ boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)' }} />
              Undeliverable
            </h3>
            
            <div className="flex items-center justify-center mb-4">
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <defs>
                    {Object.keys(undeliverableReasons).map((reason, idx) => (
                      <radialGradient key={reason} id={`undeliverable-${idx}`}>
                        <stop offset="0%" stopColor={`hsl(${idx * 60}, 70%, 60%)`} />
                        <stop offset="100%" stopColor={`hsl(${idx * 60}, 70%, 45%)`} />
                      </radialGradient>
                    ))}
                  </defs>
                  <Pie
                    data={Object.entries(undeliverableReasons).map(([name, value], idx) => ({
                      name,
                      value,
                      fill: `url(#undeliverable-${idx})`
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                    isAnimationActive={false}
                  />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {Object.entries(undeliverableReasons).map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 capitalize">{reason.replace(/_/g, " ")}</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-semibold text-white">{count}</span>
                    <span className="text-[10px] text-slate-500">
                      {((count / list.undeliverable_count) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Risky Breakdown */}
        {list.risky_count > 0 && (
          <Card className="p-4 bg-slate-900/50 border-slate-700/50 hover:border-amber-500/30 transition-all">
            <h3 className="text-base font-semibold mb-4 text-amber-400 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-amber-500 to-yellow-400" style={{ boxShadow: '0 0 8px rgba(245, 158, 11, 0.6)' }} />
              Risky
            </h3>
            
            <div className="flex items-center justify-center mb-4">
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <defs>
                    {Object.keys(riskyReasons).map((reason, idx) => (
                      <radialGradient key={reason} id={`risky-${idx}`}>
                        <stop offset="0%" stopColor={`hsl(${40 + idx * 30}, 90%, 60%)`} />
                        <stop offset="100%" stopColor={`hsl(${40 + idx * 30}, 90%, 50%)`} />
                      </radialGradient>
                    ))}
                  </defs>
                  <Pie
                    data={Object.entries(riskyReasons).map(([name, value], idx) => ({
                      name,
                      value,
                      fill: `url(#risky-${idx})`
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                    isAnimationActive={false}
                  />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {Object.entries(riskyReasons).map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 capitalize">{reason.replace(/_/g, " ")}</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-semibold text-white">{count}</span>
                    <span className="text-[10px] text-slate-500">
                      {((count / list.risky_count) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Unknown Breakdown */}
        {list.unknown_count > 0 && (
          <Card className="p-4 bg-slate-900/50 border-slate-700/50 hover:border-indigo-500/30 transition-all">
            <h3 className="text-base font-semibold mb-4 text-indigo-400 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600" style={{ boxShadow: '0 0 8px rgba(99, 102, 241, 0.6)' }} />
              Unknown
            </h3>
            
            <div className="flex items-center justify-center mb-4">
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <defs>
                    {Object.keys(unknownReasons).map((reason, idx) => (
                      <radialGradient key={reason} id={`unknown-${idx}`}>
                        <stop offset="0%" stopColor={`hsl(${240 + idx * 20}, 70%, 60%)`} />
                        <stop offset="100%" stopColor={`hsl(${240 + idx * 20}, 70%, 50%)`} />
                      </radialGradient>
                    ))}
                  </defs>
                  <Pie
                    data={Object.entries(unknownReasons).map(([name, value], idx) => ({
                      name,
                      value,
                      fill: `url(#unknown-${idx})`
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={50}
                    paddingAngle={2}
                    dataKey="value"
                    strokeWidth={0}
                    isAnimationActive={false}
                  />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '6px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2">
              {Object.entries(unknownReasons).map(([reason, count]) => (
                <div key={reason} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 capitalize">{reason.replace(/_/g, " ")}</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-semibold text-white">{count}</span>
                    <span className="text-[10px] text-slate-500">
                      {((count / list.unknown_count) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
};
