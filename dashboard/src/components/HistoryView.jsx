import React, { useState, useEffect, useRef } from 'react';
import { format, subDays } from 'date-fns';
import { fetchAPI } from '../api';

export default function HistoryView({ selectedDevices }) {
  const [period, setPeriod] = useState('7');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const handleExport = async () => {
    try {
      const devicesParam = selectedDevices.length > 0 ? `&devices=${selectedDevices.join(',')}` : '';
      let res;
      if (period === 'custom') {
        res = await fetchAPI(`/api/range/export?start=${customStart}&end=${customEnd}${devicesParam}`);
      } else {
        res = await fetchAPI(`/api/export?days=${period}${devicesParam}`);
      }

      const blob = new Blob([res], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('hidden', '');
      a.setAttribute('href', url);
      a.setAttribute('download', 'atracker_export.csv');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export failed', err);
    }
  };

  const maxDuration = Math.max(...historyData.map(d => d.total_duration), 1);

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Activity History</h1>
        </div>
        <div className="flex items-center gap-4">
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
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="glass-input px-2 py-1 text-sm" />
              <span className="text-[var(--text-muted)]">to</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="glass-input px-2 py-1 text-sm" />
              <button onClick={fetchHistory} className="btn btn-primary py-1 px-3">Apply</button>
            </div>
          )}

          <button onClick={handleExport} className="btn btn-secondary">Export</button>
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="text-[12px] uppercase font-bold text-[var(--text-muted)] tracking-wider mb-4">Daily Active Time</div>
        <div className="h-[200px] flex items-end gap-2 pb-6 relative border-b border-[var(--border-subtle)]">
          {loading ? (
             <div className="w-full text-center text-[var(--text-muted)]">Loading history...</div>
          ) : historyData.length > 0 ? (
             historyData.map((day, idx) => {
               const heightPct = (day.total_duration / maxDuration) * 100;
               return (
                 <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative">
                   <div
                     className="w-full max-w-[40px] bg-[var(--accent-indigo)] rounded-t-sm transition-all hover:bg-[var(--accent-violet)]"
                     style={{ height: `${Math.max(heightPct, 1)}%` }}
                   ></div>
                   <span className="text-[10px] text-[var(--text-muted)] absolute -bottom-6 whitespace-nowrap">
                     {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                   </span>
                   {/* Tooltip */}
                   <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10 shadow-lg">
                     {Math.round(day.total_duration / 60)} mins
                   </div>
                 </div>
               )
             })
          ) : (
            <div className="w-full text-center text-[var(--text-muted)]">No history data found</div>
          )}
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="text-[12px] uppercase font-bold text-[var(--text-muted)] tracking-wider p-6 pb-2">Daily Breakdown</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[rgba(0,0,0,0.2)]">
                <th className="p-4 text-xs font-semibold text-[var(--text-muted)]">Date</th>
                <th className="p-4 text-xs font-semibold text-[var(--text-muted)]">Total Time</th>
                <th className="p-4 text-xs font-semibold text-[var(--text-muted)]">Top Apps</th>
              </tr>
            </thead>
            <tbody>
              {historyData.map((day, idx) => (
                <tr key={idx} className="border-b border-[var(--border-subtle)] hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                  <td className="p-4 text-sm font-medium text-white whitespace-nowrap">{day.date}</td>
                  <td className="p-4 text-sm text-[var(--text-secondary)] font-mono">{Math.round(day.total_duration / 60)}m</td>
                  <td className="p-4 text-sm text-[var(--text-secondary)]">
                    <div className="flex flex-wrap gap-2">
                      {day.apps.slice(0, 3).map((app, i) => (
                        <span key={i} className="px-2 py-1 bg-[rgba(255,255,255,0.05)] rounded text-xs border border-[var(--border-subtle)]">
                          {app.app} ({Math.round(app.duration / 60)}m)
                        </span>
                      ))}
                      {day.apps.length > 3 && <span className="px-2 py-1 text-xs">+{day.apps.length - 3} more</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {historyData.length === 0 && !loading && (
                <tr>
                  <td colSpan="3" className="p-8 text-center text-[var(--text-muted)] text-sm">No daily breakdown available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
