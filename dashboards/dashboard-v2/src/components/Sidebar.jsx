import { NavLink } from 'react-router-dom';
import { LayoutDashboard, History, Settings, Pause, Play, Smartphone } from 'lucide-react';

const Sidebar = ({ status = {}, isPaused, togglePause }) => {
  return (
    <aside className="sidebar" style={{ background: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', boxShadow: '1px 0 10px rgba(0,0,0,0.2)' }}>
      <div className="sidebar-brand" style={{ padding: '2rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <img src="/logo.png" style={{ width: 32, height: 32, borderRadius: 8 }} alt="Atracker Logo" />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.02em', lineHeight: 1 }}>Atracker</span>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>QUANTIFIED SELF</span>
        </div>
      </div>
      
      <nav className="sidebar-nav" style={{ flex: 1, padding: '0 1rem', overflowY: 'auto' }}>
        <p className="nav-label" style={{ padding: '1rem 0.5rem 0.75rem', fontSize: '0.7rem', fontWeight: 800, opacity: 0.5, color: 'var(--text-secondary)' }}>ANALYTICS</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <NavLink to="/" className={({ isActive }) => isActive ? "nav-btn active" : "nav-btn"}>
            <LayoutDashboard size={18} /> <span>Dashboard</span>
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => isActive ? "nav-btn active" : "nav-btn"}>
            <History size={18} /> <span>History</span>
          </NavLink>
          <NavLink to="/categories" className={({ isActive }) => isActive ? "nav-btn active" : "nav-btn"}>
            <Settings size={18} /> <span>Configuration</span>
          </NavLink>
          <NavLink to="/devices" className={({ isActive }) => isActive ? "nav-btn active" : "nav-btn"}>
            <Smartphone size={18} /> <span>Devices</span>
          </NavLink>
        </div>
      </nav>

      <div className="sidebar-footer" style={{ padding: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
        <button 
          onClick={togglePause}
          className={`btn-pause ${isPaused ? 'paused' : ''}`}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.8rem',
            borderRadius: '12px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: 700,
            marginBottom: '1rem',
            backgroundColor: isPaused ? '#10b981' : '#f43f5e',
            boxShadow: isPaused ? '0 4px 12px rgba(16, 185, 129, 0.2)' : '0 4px 12px rgba(244, 63, 94, 0.2)',
            color: 'white',
            transition: 'all 0.2s'
          }}
        >
          {isPaused ? <Play size={18} fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
          {isPaused ? 'Resume' : 'Pause Tracking'}
        </button>

        <div className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          <div className={`status-dot ${status.status === 'running' && !isPaused ? 'running' : ''}`} style={{ width: 8, height: 8, borderRadius: '50%', background: status.status === 'running' && !isPaused ? '#10b981' : 'var(--text-secondary)', boxShadow: status.status === 'running' && !isPaused ? '0 0 8px #10b981' : 'none' }}></div>
          <span>{isPaused ? 'Paused' : (status.status === 'running' ? 'Tracking Active' : 'Offline')}</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
