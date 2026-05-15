import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatDuration } from '../utils/formatters';

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip light">
        <strong>{payload[0].payload.name}</strong>
        <p>{payload[0].payload.displayTime}</p>
      </div>
    );
  }
  return null;
};

const HistoryView = ({ history }) => {
  const chartData = history.map(item => ({
    name: new Date(item.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    seconds: item.active_secs || 0,
    displayTime: formatDuration(item.active_secs || 0),
    raw: item.day
  }));

  return (
    <div className="view-content fade-in">
      <header className="main-header">
        <div className="header-title">
          <h1>Tracking History</h1>
          <p>Activity trends over the last 14 days</p>
        </div>
      </header>

      <section className="glass-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <div style={{ width: '100%', height: '300px', minHeight: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#8b949e', fontSize: 12 }} 
                interval={1}
              />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
              <Bar dataKey="seconds" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.seconds > 28800 ? '#238636' : '#58a6ff'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="history-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginTop: '2rem' }}>
        {history.slice(0, 7).map((item) => (
          <div key={item.day} className="stat-card">
            <div className="stat-label">{new Date(item.day).toLocaleDateString('en-US', { weekday: 'long' })}</div>
            <div className="stat-value" style={{ fontSize: '1.5rem' }}>{formatDuration(item.active_secs || 0)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{item.day}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryView;
