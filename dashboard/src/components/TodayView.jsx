import React, { useState, useRef } from 'react';
import { Play, Pause, ChevronDown, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

function formatDuration(secs) {
  if (!secs || secs < 0) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m === 0 && secs > 0) return '<1m';
  return `${m}m`;
}

function buildTimeRange(timeline) {
  const firstMs = new Date(timeline[0].timestamp).getTime();
  const lastMs = new Date(timeline[timeline.length - 1].end_timestamp).getTime();
  const startTime = new Date(firstMs);
  startTime.setMinutes(0, 0, 0);
  const endTime = new Date(lastMs);
  if (endTime.getMinutes() > 0 || endTime.getSeconds() > 0) {
    endTime.setHours(endTime.getHours() + 1);
  }
  endTime.setMinutes(0, 0, 0);
  const rangeMs = endTime.getTime() - startTime.getTime();
  return { startTime, endTime, rangeMs };
}

function buildTimeLabels(startTime, endTime) {
  const rangeMs = endTime.getTime() - startTime.getTime();
  const rangeHours = rangeMs / 3600000;
  const step = rangeHours <= 4 ? 1 : rangeHours <= 8 ? 2 : rangeHours <= 16 ? 3 : 4;
  const labels = [];
  for (let t = startTime.getTime(); t <= endTime.getTime(); t += step * 3600000) {
    const pct = ((t - startTime.getTime()) / rangeMs) * 100;
    labels.push({
      pct,
      label: new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    });
  }
  return labels;
}

export default function TodayView({ data, date, setDate, onPause, onResume, isPaused }) {
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [tooltip, setTooltip] = useState(null);
  const timelineRef = useRef(null);

  const isToday = date === format(new Date(), 'yyyy-MM-dd');
  const totalTracked = data?.total_tracked;

  const toggleCategory = (name) =>
    setExpandedCategories(prev => ({ ...prev, [name]: !prev[name] }));

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-5 pb-20 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Activity</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Your digital footprint for the day.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date picker */}
          <div className="flex items-center gap-1.5 bg-[rgba(255,255,255,0.04)] px-3 py-1.5 rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent border-none text-sm text-[var(--text-primary)] outline-none [color-scheme:dark] w-[130px]"
            />
          </div>
          {!isToday && (
            <button onClick={() => setDate(format(new Date(), 'yyyy-MM-dd'))} className="btn btn-secondary py-1.5 px-3 text-xs">
              Today
            </button>
          )}

          <div className="h-6 w-px bg-[var(--border-subtle)]" />

          {/* Total */}
          <div className="text-right">
            <p className="section-label">Total</p>
            <p className="text-base font-bold text-white leading-tight mt-0.5">
              {totalTracked ? formatDuration(totalTracked) : '—'}
            </p>
          </div>

          <div className="h-6 w-px bg-[var(--border-subtle)]" />

          {/* Pause / Resume */}
          <div className="relative">
            {isPaused ? (
              <button onClick={onResume} className="btn btn-primary py-1.5 px-3">
                <Play size={13} /> Resume
              </button>
            ) : (
              <button onClick={() => setShowPauseMenu(!showPauseMenu)} className="btn btn-secondary py-1.5 px-3">
                <Pause size={13} /> Pause <ChevronDown size={12} className="text-[var(--text-muted)]" />
              </button>
            )}
            {showPauseMenu && !isPaused && (
              <div className="absolute right-0 top-full mt-1.5 w-36 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] py-1 z-50 shadow-2xl">
                {[15, 30, 60, 0].map(mins => (
                  <button
                    key={mins}
                    className="w-full text-left px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] hover:text-white transition-colors"
                    onClick={() => { onPause(mins); setShowPauseMenu(false); }}
                  >
                    {mins === 0 ? 'Indefinitely' : `${mins} min`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Now Tracking ── */}
      {isToday && (
        <div className="glass-card p-4 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-[3px] h-full bg-gradient-to-b from-[var(--accent-indigo)] to-[var(--accent-violet)]" />
          <div className="ml-3">
            <p className="section-label text-[var(--text-accent)] mb-3">Now Tracking</p>
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold border border-[var(--border-subtle)]"
                  style={{
                    backgroundColor: data?.current?.color ? data.current.color + '22' : 'rgba(255,255,255,0.05)',
                    color: data?.current?.color || 'var(--text-primary)',
                  }}
                >
                  {data?.current?.is_idle ? '💤' : (data?.current?.app ? data.current.app[0].toUpperCase() : '·')}
                </div>
                {data?.current?.app && !data?.current?.is_idle && (
                  <span
                    className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[var(--success)] rounded-full shadow-[0_0_7px_var(--success)]"
                    style={{ animation: 'pulse-status 2s ease-in-out infinite' }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-base font-semibold text-white truncate leading-snug">
                  {data?.current?.app || 'Waiting for data…'}
                </div>
                <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                  {data?.current?.title || '—'}
                </div>
              </div>
              <div className="font-mono text-xl font-bold text-white tabular-nums flex-shrink-0">
                {data?.current?.duration
                  ? new Date(data.current.duration * 1000).toISOString().substr(11, 8)
                  : '00:00:00'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Timeline ── */}
      <div className="glass-card p-5">
        <p className="section-label mb-4">Timeline</p>
        <div className="relative" ref={timelineRef}>
          {/* Tooltip */}
          {tooltip && (
            <div
              className="absolute -top-[60px] pointer-events-none z-50 bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xl rounded-[var(--radius-sm)] px-3 py-2 text-xs min-w-[130px]"
              style={{ left: Math.min(tooltip.x, (timelineRef.current?.offsetWidth || 500) - 160) }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tooltip.color }} />
                <span className="font-semibold text-white truncate max-w-[130px]">{tooltip.label}</span>
              </div>
              <div className="text-[var(--text-muted)]">{tooltip.startLabel} – {tooltip.endLabel}</div>
              <div className="text-[var(--text-accent)] font-medium mt-0.5">{tooltip.duration}</div>
            </div>
          )}

          {/* Bar */}
          <div className="h-24 bg-[rgba(0,0,0,0.25)] rounded-lg border border-[var(--border-subtle)] relative overflow-hidden">
            {data?.timeline?.length > 0 ? (() => {
              const { startTime, rangeMs } = buildTimeRange(data.timeline);
              return data.timeline.map((block, idx) => {
                const blockStart = new Date(block.timestamp).getTime();
                const blockEnd = new Date(block.end_timestamp).getTime();
                const left = ((blockStart - startTime.getTime()) / rangeMs) * 100;
                const width = Math.max(((blockEnd - blockStart) / rangeMs) * 100, 0.25);
                const isIdle = block.is_idle;
                const color = block.color || '#475569';
                const label = isIdle ? 'Idle' : (block.wm_class || 'Unknown');
                const startLabel = new Date(block.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const endLabel = new Date(block.end_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const durationMin = Math.round(block.duration_secs / 60);

                return (
                  <div
                    key={idx}
                    className={`absolute top-0 bottom-0 cursor-crosshair transition-opacity ${isIdle ? 'opacity-20' : 'hover:opacity-75'}`}
                    style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
                    onMouseEnter={(e) => {
                      const rect = timelineRef.current?.getBoundingClientRect();
                      setTooltip({
                        label, startLabel, endLabel, color,
                        duration: durationMin < 1 ? '<1m' : `${durationMin}m`,
                        x: e.clientX - (rect?.left || 0),
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              });
            })() : (
              <div className="w-full h-full flex items-center justify-center text-sm text-[var(--text-muted)]">
                No activity recorded yet
              </div>
            )}
          </div>

          {/* Hour labels */}
          {data?.timeline?.length > 0 && (() => {
            const { startTime, endTime } = buildTimeRange(data.timeline);
            const labels = buildTimeLabels(startTime, endTime);
            return (
              <div className="relative mt-2 h-4">
                {labels.map(({ pct, label }, i) => (
                  <span
                    key={i}
                    className="absolute text-[10px] text-[var(--text-muted)] -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${pct}%` }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── App Usage ── */}
      <div className="glass-card p-5">
        <p className="section-label mb-4">App Usage</p>
        {data?.usage?.length > 0 ? (
          <div className="flex flex-col divide-y divide-[var(--border-subtle)]">
            {data.usage.map((group, idx) => {
              const pct = totalTracked && totalTracked > 0
                ? Math.round((group.total_secs / totalTracked) * 100)
                : 0;
              const isExpanded = expandedCategories[group.name];

              return (
                <div key={idx}>
                  <div
                    className="flex items-center gap-3 py-3 px-2 rounded-[var(--radius-sm)] hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition-colors"
                    onClick={() => toggleCategory(group.name)}
                  >
                    <span className="text-[var(--text-muted)] flex-shrink-0 w-4">
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: group.color || 'var(--text-muted)' }}
                    />
                    <span className="font-medium text-white text-sm flex-1 truncate">{group.name}</span>

                    {/* Proportion bar */}
                    <div className="hidden sm:flex items-center gap-2 mr-1">
                      <div className="w-20 h-1.5 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: group.color || 'var(--accent-indigo)' }}
                        />
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)] w-7 text-right tabular-nums">{pct}%</span>
                    </div>

                    <span className="text-sm font-mono font-semibold text-[var(--text-secondary)] w-16 text-right tabular-nums flex-shrink-0">
                      {formatDuration(group.total_secs)}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="pl-9 pr-2 pb-3 flex flex-col gap-2">
                      {group.items.map((item, i) => (
                        <div key={i} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="text-[var(--text-secondary)] truncate">{item.wm_class}</span>
                            <span className="text-[var(--text-muted)] font-mono tabular-nums flex-shrink-0">
                              {formatDuration(item.total_secs)}
                            </span>
                          </div>
                          {(item.daily_goal_secs > 0 || item.daily_limit_secs > 0) && (
                            <div className="w-full h-[3px] bg-[rgba(0,0,0,0.25)] rounded-full overflow-hidden">
                              {item.daily_goal_secs > 0 && (
                                <div
                                  className="h-full rounded-full bg-[var(--success)]"
                                  style={{ width: `${Math.min((item.total_secs / item.daily_goal_secs) * 100, 100)}%` }}
                                />
                              )}
                              {item.daily_limit_secs > 0 && item.daily_goal_secs === 0 && (
                                <div
                                  className="h-full rounded-full bg-[var(--danger)]"
                                  style={{ width: `${Math.min((item.total_secs / item.daily_limit_secs) * 100, 100)}%` }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center">
            <div className="text-4xl mb-3 opacity-50">📊</div>
            <div className="text-sm font-medium text-[var(--text-secondary)]">No activity recorded yet</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">Start using your computer to see usage here.</div>
          </div>
        )}
      </div>
    </div>
  );
}
