import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatDuration } from '../utils/formatters';
import { Calendar, Download, RefreshCw } from 'lucide-react';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip light" style={{ background: 'white', padding: '0.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
        <strong style={{ display: 'block', fontSize: '0.85rem' }}>{payload[0].payload.name}</strong>
        <p style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 700 }}>Active: {payload[0].payload.displayTime}</p>
        <p style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Idle: {formatDuration(payload[0].payload.idle_secs)}</p>
      </div>
    );
  }
  return null;
};

const HistoryView = ({ history }) => {
  const [range, setRange] = useState({ start: '', end: '' });
  const [isCustomRange, setIsCustomRange] = useState(false);
  const [customHistory, setCustomHistory] = useState(null);
  const [loading, setLoading] = useState(false);

  const dataToRender = Array.isArray(customHistory || history) ? (customHistory || history) : [];

  const chartData = dataToRender.map(item => ({
    name: new Date(item.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    seconds: item.active_secs || 0,
    idle_secs: item.idle_secs || 0,
    displayTime: formatDuration(item.active_secs || 0),
    raw: item.day
  })).reverse(); // Recharts likes chronological order

  const handleApplyRange = async () => {
    if (!range.start || !range.end) return;
    setLoading(true);
    try {
      const res = await fetch(`${window.location.origin}/api/range/history?start=${range.start}&end=${range.end}`);
      const data = await res.json();
      setCustomHistory(data.history);
      setIsCustomRange(true);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleExportCSV = () => {
    let start = range.start;
    let end = range.end;
    if (!isCustomRange) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 14);
        start = startDate.toISOString().split('T')[0];
        end = endDate.toISOString().split('T')[0];
    }
    window.location.href = `${window.location.origin}/api/export?start=${start}&end=${end}&format=csv`;
  };

  const resetRange = () => {
    setCustomHistory(null);
    setIsCustomRange(false);
    setRange({ start: '', end: '' });
  };

  return (
    <div className="view-content fade-in">
      <header className="main-header">
        <div className="header-title">
          <h1>Tracking History</h1>
          <p>{isCustomRange ? `Viewing ${range.start} to ${range.end}` : 'Activity trends over the last 14 days'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {isCustomRange && <button className="btn-secondary" onClick={resetRange}><RefreshCw size={18} /></button>}
          <button className="btn-secondary" onClick={handleExportCSV} title="Export CSV"><Download size={18} /> Export</button>
        </div>
      </header>

      <section className="glass-card" style={{ marginBottom: '2rem' }}>
        <div className="section-label">DATE RANGE</div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="date-input-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#f8fafc', padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <Calendar size={16} color="#64748b" />
                <input 
                    type="date" 
                    value={range.start} 
                    onChange={e => setRange({...range, start: e.target.value})}
                    style={{ background: 'none', border: 'none', outline: 'none', fontSize: '0.85rem' }}
                />
                <span style={{ color: '#cbd5e1' }}>to</span>
                <input 
                    type="date" 
                    value={range.end} 
                    onChange={e => setRange({...range, end: e.target.value})}
                    style={{ background: 'none', border: 'none', outline: 'none', fontSize: '0.85rem' }}
                />
            </div>
            <button className="btn-primary" onClick={handleApplyRange} disabled={loading || !range.start || !range.end}>
                {loading ? 'Loading...' : 'Apply Range'}
            </button>
        </div>
      </section>

      <section className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <div className="section-label">ACTIVITY TRENDS</div>
        <div style={{ width: '100%', height: '300px', minHeight: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#8b949e', fontSize: 11 }} 
              />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
              <Bar dataKey="seconds" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.seconds > 28800 ? '#10b981' : '#3b82f6'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="history-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem', marginTop: '2rem' }}>
        {dataToRender.map((item) => (
          <div key={item.day} className="stat-card" style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '1.25rem' }}>
            <div className="stat-label" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.5rem' }}>
                {new Date(item.day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
            <div className="stat-value" style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>{formatDuration(item.active_secs || 0)}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', fontSize: '0.75rem', color: '#64748b' }}>
                <span>Idle: {formatDuration(item.idle_secs || 0)}</span>
                <span>{item.event_count || 0} events</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryView;
