import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, History, Settings, Pause, Play, Smartphone } from 'lucide-react';

const Sidebar = ({ status = {}, devices = [], selectedDevices, setSelectedDevices, isPaused, togglePause }) => {
  const [deviceSearch, setDeviceSearch] = useState('');

  const handleDeviceToggle = (deviceId) => {
    setSelectedDevices(prev => 
      prev.includes(deviceId) 
    ? prev.filter(id => id !== deviceId)
        : [...prev, deviceId]
    );
  };

  const selectAll = () => {
    setSelectedDevices(devices.map(d => d.id));
  };

  const selectNone = () => {
    setSelectedDevices([]);
  };

  const filteredDevices = devices.filter(d => 
    (d?.name || '').toLowerCase().includes(deviceSearch.toLowerCase()) || 
    (d?.platform || '').toLowerCase().includes(deviceSearch.toLowerCase())
  );

  return (
    <aside className="sidebar" style={{ background: '#ffffff', boxShadow: '1px 0 10px rgba(0,0,0,0.02)' }}>
      <div className="sidebar-brand" style={{ padding: '2rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <img src="/logo.png" style={{ width: 32, height: 32, borderRadius: 8 }} alt="Atracker Logo" />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>Atracker</span>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em' }}>QUANTIFIED SELF</span>
        </div>
      </div>
      
      <nav className="sidebar-nav" style={{ flex: 1, padding: '0 1rem', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 0.5rem 0.75rem' }}>
          <p className="nav-label" style={{ margin: 0, fontSize: '0.7rem', fontWeight: 800, opacity: 0.5 }}>DEVICES</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={selectAll} className="text-btn" style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent-color)', background: 'none', border: 'none', cursor: 'pointer' }}>All</button>
            <button onClick={selectNone} className="text-btn" style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>None</button>
          </div>
        </div>

        {devices.length > 5 && (
          <div style={{ padding: '0 0.5rem 1rem' }}>
            <input 
              type="text" 
              placeholder="Filter devices..." 
              value={deviceSearch}
              onChange={e => setDeviceSearch(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.8rem', outline: 'none' }}
            />
          </div>
        )}

        <div className="devices-list" style={{ padding: '0 0.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {filteredDevices.map(dev => {
            const isActive = selectedDevices.length === 0 || selectedDevices.includes(dev.id);
            return (
              <label key={dev.id} className={`device-item ${isActive ? 'active' : ''}`} style={{ 
                  display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', borderRadius: 10, cursor: 'pointer', transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
                  background: isActive ? '#f1f5f9' : 'transparent',
                  border: isActive ? '1px solid #e2e8f0' : '1px solid transparent',
                  transform: isActive ? 'scale(1)' : 'scale(0.98)',
                  opacity: isActive ? 1 : 0.6
              }}>
                <input 
                  type="checkbox" 
                  checked={isActive} 
                  onChange={() => handleDeviceToggle(dev.id)}
                  style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent-color)' }}
                />
                <div className="device-info">
                  <div className="device-name" style={{ fontSize: '0.8rem', fontWeight: 600, color: isActive ? '#1e293b' : '#64748b' }}>{dev.name || dev.id || 'Unknown Device'}</div>
                  <div className="device-id-hint" style={{ fontSize: '0.65rem', opacity: 0.5 }}>{dev.platform || 'Unknown'}</div>
                </div>
              </label>
            );
          })}
          {filteredDevices.length === 0 && <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', padding: '1rem' }}>No matches</div>}
        </div>

        <p className="nav-label" style={{ padding: '1rem 0.5rem 0.75rem', fontSize: '0.7rem', fontWeight: 800, opacity: 0.5 }}>ANALYTICS</p>
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

      <div className="sidebar-footer" style={{ padding: '1.5rem', borderTop: '1px solid #f1f5f9' }}>
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

        <div className="status-indicator" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
          <div className={`status-dot ${status.status === 'running' && !isPaused ? 'running' : ''}`} style={{ width: 8, height: 8, borderRadius: '50%', background: status.status === 'running' && !isPaused ? '#10b981' : '#94a3b8', boxShadow: status.status === 'running' && !isPaused ? '0 0 8px #10b981' : 'none' }}></div>
          <span>{isPaused ? 'Paused' : (status.status === 'running' ? 'Tracking Active' : 'Offline')}</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
