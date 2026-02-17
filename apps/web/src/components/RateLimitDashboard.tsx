// ============================================
// Rate Limit Dashboard - Monitor API usage
// ============================================
import React, { useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import { Gauge, RefreshCw, AlertTriangle } from 'lucide-react';

interface UsageRecord {
  minuteCount: number;
  minuteReset: number;
  dailyCount: number;
  dailyReset: number;
  concurrent: number;
}

interface RateLimits {
  requestsPerMinute: number;
  requestsPerDay: number;
  maxConcurrent: number;
}

interface ModelStatus {
  usage: UsageRecord;
  limits: RateLimits;
  tier: string;
}

interface StatusResponse {
  status: Record<string, ModelStatus>;
}

export function RateLimitDashboard() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await apiGet<StatusResponse>('/models/status');
      setData(res);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, []);

  const pct = (used: number, limit: number) => {
    if (limit === 0) return 0;
    return Math.round(((limit - used) / limit) * 100);
  };

  const barColor = (p: number) =>
    p > 50 ? 'bg-ide-success' : p > 20 ? 'bg-yellow-500' : 'bg-ide-error';

  if (!data) return null;

  const entries = Object.entries(data.status);

  return (
    <div className="bg-ide-sidebar border-t border-ide-border">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-ide-border">
        <div className="flex items-center gap-1.5">
          <Gauge className="w-3.5 h-3.5 text-ide-accent" />
          <span className="text-xs font-medium">Rate Limits</span>
        </div>
        <button onClick={refresh} disabled={loading} className="p-0.5 text-ide-text-dim hover:text-ide-text">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="p-2 space-y-2 max-h-48 overflow-y-auto">
        {entries.map(([modelId, m]) => {
          const minPct = pct(m.usage.minuteCount, m.limits.requestsPerMinute);
          const dayPct = pct(m.usage.dailyCount, m.limits.requestsPerDay);
          const isLow = minPct < 20 || dayPct < 20;
          const shortName = modelId.split('/').pop() || modelId;
          return (
            <div key={modelId} className="text-[10px] space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-ide-text truncate max-w-[120px]">{shortName}</span>
                {isLow && <AlertTriangle className="w-2.5 h-2.5 text-yellow-500" />}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-ide-text-dim w-6">min</span>
                <div className="flex-1 h-1 bg-ide-bg rounded-full overflow-hidden">
                  <div className={`h-full ${barColor(minPct)} rounded-full transition-all`} style={{ width: `${minPct}%` }} />
                </div>
                <span className="text-ide-text-dim w-12 text-right">
                  {m.limits.requestsPerMinute - m.usage.minuteCount}/{m.limits.requestsPerMinute}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-ide-text-dim w-6">day</span>
                <div className="flex-1 h-1 bg-ide-bg rounded-full overflow-hidden">
                  <div className={`h-full ${barColor(dayPct)} rounded-full transition-all`} style={{ width: `${dayPct}%` }} />
                </div>
                <span className="text-ide-text-dim w-12 text-right">
                  {m.limits.requestsPerDay - m.usage.dailyCount}/{m.limits.requestsPerDay}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
