import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer 
} from 'recharts';
import { 
  LayoutDashboard, History, Edit3, Settings, Laptop, Smartphone, Trash2, Plus, Info 
} from 'lucide-react';
import './index.css';

const API_BASE = 'http://localhost:8933';

function App() {
  const [view, setView] = useState('activity');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [summary, setSummary] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [history, setHistory] = useState([]);
  const [categories, setCategories] = useState([]);
  const [status, setStatus] = useState({ status: 'connecting' });
  const [currentApp, setCurrentApp] = useState(null);
  
  // Tooltip state
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: null });

  const fetchData = async () => {
    try {
      const endpoints = [
        fetch(`${API_BASE}/api/summary?date=${date}`),
        fetch(`${API_BASE}/api/timeline?date=${date}`),
        fetch(`${API_BASE}/api/history?days=14`),
        fetch(`${API_BASE}/api/status`),
        fetch(`${API_BASE}/api/categories`),
      ];
      const [sumRes, timeRes, histRes, statusRes, catRes] = await Promise.all(endpoints);
      
      setSummary(await sumRes.json());
      const timelineData = await timeRes.json();
      setTimeline(Array.isArray(timelineData) ? timelineData : []);
      const statusData = await statusRes.json();
      setStatus(statusData);
      if (statusData.current) setCurrentApp(statusData.current);
      
      setHistory(await histRes.json());
      setCategories(await catRes.json());
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    
    const socket = new WebSocket(`ws://${window.location.host || 'localhost:8933'}/ws`);
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'activity') {
          setCurrentApp(msg);
          // Only refresh timeline/summary if today
          if (date === new Date().toISOString().split('T')[0]) {
             fetchData();
          }
        }
      } catch (e) {}
    };
    return () => { clearInterval(interval); socket.close(); };
  }, [date]);

  const totalTracked = useMemo(() => summary.reduce((acc, curr) => acc + curr.total_secs, 0), [summary]);

  const formatDuration = (secs) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${Math.round(secs)}s`;
  };

  const handleTimelineHover = (e, block) => {
    if (block.is_idle) return;
    setTooltip({
      visible: true,
      x: e.clientX,
      y: e.clientY - 40,
      content: (
        <div className="custom-tooltip">
          <strong>{block.wm_class}</strong>
          <p>{block.title}</p>
          <span>{formatDuration(block.duration_secs || 0)}</span>
        </div>
      )
    });
  };

  return (
    <div className="app-container">
      {tooltip.visible && (
        <div className="floating-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.content}
        </div>
      )}

      <nav className="sidebar">
        <div className="sidebar-brand">atracker <span className="brand-badge">RS</span></div>
        <div className="nav-group">
          <div className="nav-label">Devices</div>
          <div className="device-item active"><Laptop size={14} /> Local Desktop</div>
          <div className="device-item disabled"><Smartphone size={14} /> Android</div>
        </div>
        <div className="nav-group">
          <div className="nav-label">Views</div>
          <button onClick={() => setView('activity')} className={view === 'activity' ? 'nav-btn active' : 'nav-btn'}><LayoutDashboard size={18} /> Activity</button>
          <button onClick={() => setView('history')} className={view === 'history' ? 'nav-btn active' : 'nav-btn'}><History size={18} /> History</button>
          <button onClick={() => setView('settings')} className={view === 'settings' ? 'nav-btn active' : 'nav-btn'}><Settings size={18} /> Settings</button>
        </div>
        <div className="sidebar-footer">
          <div className="status-indicator">
            <span className={`status-dot ${status.status === 'running' ? 'running' : ''}`}></span>
            {status.engine ? `Rust Native` : 'Disconnected'}
          </div>
        </div>
      </nav>

      <main className="main-content">
        <header className="main-header">
          <div className="header-title">
            <h1>{view === 'activity' ? 'Real-time Activity' : view.charAt(0).toUpperCase() + view.slice(1)}</h1>
            <div className="header-meta">
               <span className="meta-date">{new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
               <span className="meta-total">Daily Total: {formatDuration(totalTracked)}</span>
            </div>
          </div>
          <div className="header-actions">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="date-picker" />
          </div>
        </header>

        {view === 'activity' && (
          <div className="view-content fade-in">
            <div className="activity-stats">
               {currentApp ? (
                 <div className="now-tracking-card glow">
                    <div className="stat-label">Currently Active</div>
                    <div className="now-tracking-details">
                       <div className="app-info">
                          <h3>{currentApp.wm_class}</h3>
                          <p>{currentApp.title}</p>
                       </div>
                    </div>
                 </div>
               ) : (
                 <div className="now-tracking-card idle">
                    <div className="stat-label">System State</div>
                    <div className="now-tracking-details"><h3>Idle</h3><p>Monitoring for activity...</p></div>
                 </div>
               )}
            </div>

            <section className="glass-card">
              <div className="section-header"><h3>Usage Timeline</h3></div>
              <div className="timeline-wrapper">
                <div className="timeline-container">
                  {timeline.length > 0 ? timeline.map((block, i) => (
                    <div 
                      key={i} 
                      className={`timeline-block ${block.is_idle ? 'idle' : ''}`}
                      style={{ 
                        flex: Math.max(block.duration_secs || 5, 5), 
                        backgroundColor: block.is_idle ? 'transparent' : (block.color || 'var(--accent-color)'),
                        opacity: block.is_idle ? 0.05 : 0.8 
                      }}
                      onMouseMove={(e) => handleTimelineHover(e, block)}
                      onMouseLeave={() => setTooltip({ ...tooltip, visible: false })}
                    ></div>
                  )) : (
                    <div className="timeline-empty">No activity recorded for this day yet.</div>
                  )}
                </div>
                <div className="timeline-labels"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:59</span></div>
              </div>
            </section>

            <section className="glass-card">
              <div className="usage-list-header"><h3>App Breakdown</h3><span className="usage-count">{summary.length} entries</span></div>
              <div className="usage-table">
                {summary.map((row, i) => (
                  <div key={i} className="usage-row">
                    <div className="usage-app"><span className="category-indicator" style={{ backgroundColor: row.color }}></span><div className="app-text"><span className="wm-class">{row.wm_class}</span><span className="title">{row.title}</span></div></div>
                    <div className="usage-progress"><div className="usage-bar-container"><div className="usage-bar" style={{ width: `${(row.total_secs / totalTracked) * 100}%`, backgroundColor: row.color }}></div></div><span className="usage-percentage">{Math.round((row.total_secs / totalTracked) * 100)}%</span></div>
                    <div className="usage-time">{formatDuration(row.total_secs)}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {view === 'history' && (
          <div className="view-content fade-in">
             <section className="glass-card">
                <h3>Last 14 Days</h3>
                <div style={{ height: 350, marginTop: '2rem' }}>
                   <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={history.slice().reverse()}>
                         <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                         <XAxis dataKey="day" stroke="var(--text-secondary)" fontSize={11} tickFormatter={(val) => val.split('-').slice(1).join('/')} />
                         <YAxis stroke="var(--text-secondary)" fontSize={11} tickFormatter={(val) => `${Math.round(val / 3600)}h`} />
                         <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#161b22', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '12px' }} />
                         <Bar dataKey="active_secs" fill="var(--accent-color)" radius={[4, 4, 0, 0]} name="Active Time (s)" />
                      </BarChart>
                   </ResponsiveContainer>
                </div>
             </section>
          </div>
        )}

        {view === 'settings' && (
          <div className="view-content fade-in">
             <section className="glass-card">
                <h3>Migration Status</h3>
                <p>Engine: <strong>Native Rust (Agnostic)</strong></p>
                <p>Data Source: <code>~/.local/share/atracker-rs/</code></p>
                <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>Settings and Category management modules are being ported to the new database schema.</p>
             </section>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
