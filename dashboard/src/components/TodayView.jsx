import React, { useState } from 'react';
import { Play, Pause, ChevronDown, ChevronRight, ChevronDown as ChevronDownIcon } from 'lucide-react';
import { format } from 'date-fns';

export default function TodayView({ data, date, setDate, onPause, onResume, isPaused }) {
  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});

  const totalTracked = data?.total_tracked ? Math.round(data.total_tracked / 60) + 'm' : '—';

  const toggleCategory = (catName) => {
    setExpandedCategories(prev => ({ ...prev, [catName]: !prev[catName] }));
  };

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Activity</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Monitor your daily digital footprint.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[rgba(255,255,255,0.03)] p-1 rounded-[var(--radius-sm)] border border-[var(--border-subtle)]">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent border-none text-sm px-2 text-[var(--text-primary)] outline-none [color-scheme:dark]"
            />
            <button onClick={() => setDate(format(new Date(), 'yyyy-MM-dd'))} className="btn btn-secondary py-1 px-3 text-xs">Today</button>
          </div>

          <div className="h-8 w-px bg-[var(--border-subtle)]"></div>

          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Total Tracked</div>
            <div className="text-lg font-bold text-white">{totalTracked}</div>
          </div>

          <div className="relative">
            {isPaused ? (
              <button onClick={onResume} className="btn btn-primary gap-1 pl-3 pr-4">
                <Play size={16} /> Resume
              </button>
            ) : (
              <button onClick={() => setShowPauseMenu(!showPauseMenu)} className="btn btn-secondary gap-1 pl-3 pr-2">
                <Pause size={16} /> Pause <ChevronDown size={14} className="ml-1 text-[var(--text-muted)]" />
              </button>
            )}

            {showPauseMenu && !isPaused && (
              <div className="absolute right-0 top-full mt-2 w-40 glass-card py-1 z-50 shadow-xl">
                {[15, 30, 60, 0].map(mins => (
                  <button
                    key={mins}
                    className="w-full text-left px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] hover:text-white transition-colors"
                    onClick={() => { onPause(mins); setShowPauseMenu(false); }}
                  >
                    {mins === 0 ? 'Indefinitely' : `${mins} mins`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Now Tracking */}
      {date === format(new Date(), 'yyyy-MM-dd') && (
        <div className="glass-card p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[var(--accent-indigo)] to-[var(--accent-violet)] shadow-[0_0_15px_var(--glow-violet)]"></div>
          <div className="text-[10px] uppercase font-bold text-[var(--text-accent)] tracking-wider mb-3 ml-2">Now Tracking</div>
          <div className="flex items-center gap-4 ml-2">
            <div className="w-12 h-12 rounded-xl bg-[rgba(255,255,255,0.05)] border border-[var(--border-subtle)] flex items-center justify-center text-xl" style={{ color: data?.current?.color || 'var(--text-primary)' }}>
              {data?.current?.is_idle ? '💤' : (data?.current?.app ? data.current.app.charAt(0).toUpperCase() : '—')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-lg font-bold text-white truncate">{data?.current?.app || 'Waiting for data...'}</div>
              <div className="text-sm text-[var(--text-secondary)] truncate">{data?.current?.title || '—'}</div>
            </div>
            <div className="text-2xl font-mono text-white tracking-tight">
              {data?.current?.duration ? new Date(data.current.duration * 1000).toISOString().substr(11, 8) : '00:00:00'}
            </div>
          </div>
        </div>
      )}

      {/* Timeline Placeholder */}
      <div className="glass-card p-6">
        <div className="text-[12px] uppercase font-bold text-[var(--text-muted)] tracking-wider mb-4">Timeline</div>
        <div className="h-16 bg-[rgba(0,0,0,0.3)] rounded-[var(--radius-sm)] border border-[var(--border-subtle)] relative overflow-hidden text-[var(--text-muted)] text-sm group">
          {data?.timeline?.length > 0 ? (
            (() => {
              const timeline = data.timeline;
              const firstEvent = new Date(timeline[0].timestamp);
              const lastEvent = new Date(timeline[timeline.length - 1].end_timestamp);

              const startTime = new Date(firstEvent);
              startTime.setMinutes(0, 0, 0);
              const endTime = new Date(lastEvent);
              if (endTime.getMinutes() > 0) {
                endTime.setHours(endTime.getHours() + 1);
              }
              endTime.setMinutes(0, 0, 0);

              const rangeMs = endTime.getTime() - startTime.getTime();

              return timeline.map((block, idx) => {
                const blockStart = new Date(block.timestamp).getTime();
                const blockEnd = new Date(block.end_timestamp).getTime();

                const left = ((blockStart - startTime.getTime()) / rangeMs * 100);
                const width = ((blockEnd - blockStart) / rangeMs * 100);

                const startLabel = new Date(block.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const endLabel = new Date(block.end_timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                const durationMin = Math.round(block.duration_secs / 60);
                const isIdle = block.is_idle;
                const label = isIdle ? 'Idle' : block.wm_class;
                const color = block.color || '#64748b';

                return (
                  <div key={idx} className={`absolute top-0 bottom-0 hover:opacity-80 transition-opacity cursor-crosshair ${isIdle ? 'opacity-30' : ''}`}
                       style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
                       title={`${label}\n${startLabel} — ${endLabel} (${durationMin}m)`}>
                  </div>
                );
              });
            })()
          ) : (
            <div className="w-full h-full flex items-center justify-center">No activity recorded yet</div>
          )}
        </div>
        <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-2">
          {data?.timeline?.length > 0 ? (() => {
             const timeline = data.timeline;
             const firstEvent = new Date(timeline[0].timestamp);
             const lastEvent = new Date(timeline[timeline.length - 1].end_timestamp);
             const startTime = new Date(firstEvent);
             startTime.setMinutes(0, 0, 0);
             const endTime = new Date(lastEvent);
             if (endTime.getMinutes() > 0) endTime.setHours(endTime.getHours() + 1);
             endTime.setMinutes(0, 0, 0);

             const labels = [];
             for (let time = startTime.getTime(); time <= endTime.getTime(); time += 3600000 * Math.max(1, Math.floor((endTime.getTime() - startTime.getTime()) / 3600000 / 5))) {
                 labels.push(<span key={time}>{new Date(time).toLocaleTimeString([], {hour: 'numeric', minute:'2-digit'})}</span>);
             }
             return labels;
          })() : (
             <><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11:59 PM</span></>
          )}
        </div>
      </div>

      {/* App Usage List */}
      <div className="glass-card p-6">
        <div className="text-[12px] uppercase font-bold text-[var(--text-muted)] tracking-wider mb-4">App Usage</div>
        <div className="flex flex-col gap-2">
          {data?.usage?.length > 0 ? data.usage.map((group, idx) => (
            <div key={idx} className="flex flex-col border-b border-[var(--border-subtle)] pb-2 mb-2 last:border-0 last:pb-0 last:mb-0">
              <div
                className="flex items-center justify-between p-2 rounded-[var(--radius-sm)] hover:bg-[rgba(255,255,255,0.02)] cursor-pointer transition-colors"
                onClick={() => toggleCategory(group.name)}
              >
                <div className="flex items-center gap-2">
                  <div className="text-[var(--text-muted)]">
                     {expandedCategories[group.name] ? <ChevronDownIcon size={16} /> : <ChevronRight size={16} />}
                  </div>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: group.color || 'var(--text-primary)' }}></div>
                  <span className="font-medium text-white">{group.name}</span>
                </div>
                <div className="text-sm text-[var(--text-secondary)] font-mono font-bold">
                  {Math.round(group.total_secs / 60)}m
                </div>
              </div>

              {expandedCategories[group.name] && (
                <div className="pl-10 pr-2 pt-2 flex flex-col gap-2">
                  {group.items.map((item, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-sm">
                         <span className="text-[var(--text-secondary)] truncate max-w-[70%]">{item.wm_class}</span>
                         <span className="text-[var(--text-muted)] font-mono">{Math.round(item.total_secs / 60)}m</span>
                      </div>
                      {(item.daily_goal_secs > 0 || item.daily_limit_secs > 0) && (
                        <div className="w-full h-1 bg-[rgba(0,0,0,0.2)] rounded overflow-hidden mt-1">
                          {item.daily_goal_secs > 0 && (
                             <div className="h-full bg-[var(--success)] transition-all" style={{ width: `${Math.min((item.total_secs / item.daily_goal_secs) * 100, 100)}%` }}></div>
                          )}
                          {item.daily_limit_secs > 0 && (
                             <div className="h-full bg-[var(--danger)] transition-all" style={{ width: `${Math.min((item.total_secs / item.daily_limit_secs) * 100, 100)}%` }}></div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )) : (
            <div className="py-8 text-center text-[var(--text-muted)] text-sm">No data yet — start tracking!</div>
          )}
        </div>
      </div>
    </div>
  );
}
