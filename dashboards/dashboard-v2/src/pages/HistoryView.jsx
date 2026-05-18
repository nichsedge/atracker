import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatDuration } from '../utils/formatters';
import { Calendar, Download, RefreshCw } from 'lucide-react';
import DeviceFilterPill from '../components/DeviceFilterPill';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip" style={{ background: 'rgba(13, 20, 35, 0.95)', padding: '0.75rem 1.25rem', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 15px 35px rgba(0,0,0,0.5)', backdropFilter: 'blur(10px)' }}>
        <strong style={{ display: 'block', fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '4px', fontFamily: "'Outfit', sans-serif" }}>{payload[0].payload.name}</strong>
        <p style={{ fontSize: '0.8rem', color: 'var(--accent-color)', fontWeight: 800 }}>Active: {payload[0].payload.displayTime}</p>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Idle: {formatDuration(payload[0].payload.idle_secs)}</p>
      </div>
    );
  }
  return null;
};

const HistoryView = ({ history, devices = [], selectedDevices = [], setSelectedDevices }) => {
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
      <header className="main-header" style={{ marginBottom: '2.5rem' }}>
        <div className="header-title">
          <h1 style={{ fontSize: '2.25rem', fontWeight: 900, fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>Tracking History</h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{isCustomRange ? `Viewing ${range.start} to ${range.end}` : 'Activity trends over the last 14 days'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {isCustomRange && <button className="btn-outline" style={{ padding: '0 1rem' }} onClick={resetRange}><RefreshCw size={18} /></button>}
          <button className="btn-outline" onClick={handleExportCSV} title="Export CSV"><Download size={18} /> Export</button>
        </div>
      </header>

      <section className="glass-card" style={{ marginBottom: '2rem', position: 'relative', zIndex: 10 }}>
        <div className="section-label">DATE RANGE & DEVICES</div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="date-input-group" style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: 'var(--bg-secondary)', padding: '0.6rem 1.2rem', borderRadius: 24, border: '1px solid var(--border-color)' }}>
                <Calendar size={16} color="var(--accent-color)" />
                <input 
                    type="date" 
                    value={range.start} 
                    onChange={e => setRange({...range, start: e.target.value})}
                    style={{ background: 'none', border: 'none', outline: 'none', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}
                />
                <span style={{ color: 'var(--text-secondary)', opacity: 0.5, fontWeight: 700 }}>to</span>
                <input 
                    type="date" 
                    value={range.end} 
                    onChange={e => setRange({...range, end: e.target.value})}
                    style={{ background: 'none', border: 'none', outline: 'none', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}
                />
            </div>

            <DeviceFilterPill 
              devices={devices} 
              selectedDevices={selectedDevices} 
              setSelectedDevices={setSelectedDevices} 
            />

            <button className="btn-primary" style={{ height: '42px', borderRadius: '21px', padding: '0 1.5rem' }} onClick={handleApplyRange} disabled={loading || !range.start || !range.end}>
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
                tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontWeight: 600 }} 
              />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
              <Bar dataKey="seconds" radius={[6, 6, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.seconds > 28800 ? 'var(--success-color)' : 'var(--accent-color)'} style={{ filter: `drop-shadow(0 0 8px ${entry.seconds > 28800 ? 'var(--success-color)' : 'var(--accent-color)'}33)` }} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="history-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.25rem', marginTop: '2rem' }}>
        {dataToRender.map((item) => (
          <div key={item.day} className="glass-card" style={{ padding: '1.5rem', margin: 0 }}>
            <div className="stat-label" style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.5rem', letterSpacing: '0.02em' }}>
                {new Date(item.day).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
            <div className="stat-value" style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em' }}>{formatDuration(item.active_secs || 0)}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, opacity: 0.8 }}>
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
