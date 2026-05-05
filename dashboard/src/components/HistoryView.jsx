import React, { useState, useEffect } from 'react';
import { format, subDays } from 'date-fns';
import { Download } from 'lucide-react';
import { fetchAPI } from '../api';

function formatDuration(secs) {
  if (!secs || secs < 0) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  if (m === 0 && secs > 0) return '<1m';
  return `${m}m`;
}

export default function HistoryView({ selectedDevices }) {
  const [period, setPeriod] = useState('7');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredBar, setHoveredBar] = useState(null);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const devicesParam = selectedDevices.length > 0 ? `&devices=${selectedDevices.join(',')}` : '';
      let res;
      if (period === 'custom') {
        res = await fetchAPI(`/api/range/history?start=${customStart}&end=${customEnd}${devicesParam}`);
      } else {
        res = await fetchAPI(`/api/history?days=${period}${devicesParam}`);
      }
      setHistoryData(res.history || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (period !== 'custom' || (customStart && customEnd)) {
      fetchHistory();
    }
  }, [period, selectedDevices]);

  const handleExport = () => {
    let start, end;
    if (period === 'custom') {
      if (!customStart || !customEnd) return;
      start = customStart;
      end = customEnd;
    } else {
      end = format(new Date(), 'yyyy-MM-dd');
      start = format(subDays(new Date(), parseInt(period)), 'yyyy-MM-dd');
    }
    window.location.href = `/api/export?start=${start}&end=${end}`;
  };

  const maxDuration = Math.max(...historyData.map(d => d.active_secs || 0), 1);
  const totalSecs = historyData.reduce((s, d) => s + (d.active_secs || 0), 0);
  const activeDays = historyData.filter(d => d.active_secs > 0).length;
  const avgSecs = activeDays > 0 ? Math.round(totalSecs / activeDays) : 0;

  // Y-axis grid: 4 intervals
  const gridLevels = [100, 75, 50, 25, 0];

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-5 pb-20 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">History</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Your tracked time over time.</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="glass-input px-3 py-1.5 text-sm"
          >
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="custom">Custom Range</option>
          </select>

          {period === 'custom' && (
            <>
              <input
                type="date" value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                className="glass-input px-2 py-1.5 text-sm [color-scheme:dark]"
              />
              <span className="text-[var(--text-muted)] text-sm">to</span>
              <input
                type="date" value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                className="glass-input px-2 py-1.5 text-sm [color-scheme:dark]"
              />
              <button onClick={fetchHistory} className="btn btn-primary py-1.5 px-3 text-sm">Apply</button>
            </>
          )}

          <button onClick={handleExport} className="btn btn-secondary py-1.5 px-3 text-sm">
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* ── Summary Stats ── */}
      {!loading && historyData.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Tracked', value: formatDuration(totalSecs) },
            { label: 'Daily Average', value: formatDuration(avgSecs) },
            { label: 'Days Active', value: `${activeDays} / ${historyData.length}` },
          ].map(({ label, value }) => (
            <div key={label} className="glass-card px-4 py-3.5">
              <p className="section-label">{label}</p>
              <p className="text-xl font-bold text-white mt-1.5">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Bar Chart ── */}
      <div className="glass-card p-5">
        <p className="section-label mb-5">Daily Active Time</p>

        {loading ? (
          <div className="h-44 flex items-center justify-center text-sm text-[var(--text-muted)]">Loading…</div>
        ) : historyData.length > 0 ? (
          <div className="flex gap-3">
            {/* Y-axis */}
            <div className="flex flex-col justify-between h-40 text-right pb-0 flex-shrink-0">
              {gridLevels.map(pct => (
                <span key={pct} className="text-[10px] text-[var(--text-muted)] tabular-nums leading-none">
                  {pct === 0 ? '' : formatDuration(Math.round(maxDuration * pct / 100))}
                </span>
              ))}
            </div>

            {/* Chart area */}
            <div className="flex-1 relative">
              {/* Grid lines */}
              <div className="absolute inset-x-0 top-0 h-40 flex flex-col justify-between pointer-events-none">
                {gridLevels.map(pct => (
                  <div key={pct} className="border-t border-[var(--border-subtle)] w-full" />
                ))}
              </div>

              {/* Bars */}
              <div className="flex items-end gap-1 h-40 mb-7 relative">
                {historyData.map((day, idx) => {
                  const heightPct = day.active_secs > 0 ? (day.active_secs / maxDuration) * 100 : 0;
                  const dateObj = new Date(day.day + 'T12:00:00');
                  const isHovered = hoveredBar === idx;
                  const showLabel = historyData.length <= 10 || idx % Math.ceil(historyData.length / 8) === 0;

                  return (
                    <div
                      key={idx}
                      className="flex-1 flex flex-col items-center justify-end h-full relative group cursor-default"
                      onMouseEnter={() => setHoveredBar(idx)}
                      onMouseLeave={() => setHoveredBar(null)}
                    >
                      {/* Hover tooltip */}
                      {isHovered && (
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xl rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs pointer-events-none z-10 whitespace-nowrap">
                          <div className="font-semibold text-white">
                            {dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                          </div>
                          <div className="text-[var(--text-accent)] mt-0.5">{formatDuration(day.active_secs)}</div>
                        </div>
                      )}

                      {/* Bar */}
                      <div
                        className={`w-full rounded-t transition-all duration-150 ${
                          day.active_secs === 0
                            ? 'bg-[rgba(255,255,255,0.04)] h-[2px]'
                            : isHovered
                              ? 'bg-[var(--accent-violet)]'
                              : 'bg-[var(--accent-indigo)]'
                        }`}
                        style={day.active_secs > 0 ? { height: `${Math.max(heightPct, 2)}%` } : {}}
                      />

                      {/* X-axis label */}
                      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-center pointer-events-none">
                        {showLabel && (
                          <span className={`text-[10px] whitespace-nowrap transition-colors ${isHovered ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                            {dateObj.toLocaleDateString(undefined, { weekday: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-44 flex items-center justify-center text-sm text-[var(--text-muted)]">
            No history data found
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div className="glass-card overflow-hidden">
        <p className="section-label p-5 pb-3">Daily Breakdown</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[rgba(0,0,0,0.15)]">
                {['Date', 'Active Time', 'Idle Time', 'Events'].map(h => (
                  <th key={h} className="px-5 py-2.5 text-xs font-semibold text-[var(--text-muted)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {historyData.map((day, idx) => {
                const dateObj = new Date(day.day + 'T12:00:00');
                return (
                  <tr key={idx} className="border-b border-[var(--border-subtle)] last:border-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-white whitespace-nowrap">
                      {dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono tabular-nums text-[var(--text-secondary)]">
                      {day.active_formatted || formatDuration(day.active_secs)}
                    </td>
                    <td className="px-5 py-3 text-sm font-mono tabular-nums text-[var(--text-muted)]">
                      {day.idle_formatted || formatDuration(day.idle_secs)}
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--text-muted)]">{day.event_count}</td>
                  </tr>
                );
              })}
              {historyData.length === 0 && !loading && (
                <tr>
                  <td colSpan="4" className="px-5 py-10 text-center text-sm text-[var(--text-muted)]">
                    No daily breakdown available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
