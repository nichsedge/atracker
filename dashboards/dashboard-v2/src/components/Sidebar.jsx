import { NavLink } from 'react-router-dom';
import { LayoutDashboard, History, Settings } from 'lucide-react';

const Sidebar = ({ status = {}, devices = [] }) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        Atracker <span className="brand-badge">RS</span>
      </div>
      
      <nav className="sidebar-nav">
        <p className="nav-label">DEVICES</p>
        <div className="devices-list">
          {devices.map(dev => (
            <div key={dev.id} className="device-item">
              <input type="checkbox" defaultChecked />
              <div className="device-info">
                <div className="device-name">{dev.name}</div>
                <div className="device-id-hint">{dev.id.substring(0, 8)}...</div>
              </div>
            </div>
          ))}
        </div>

        <p className="nav-label" style={{ marginTop: '2rem' }}>VIEWS</p>
        <NavLink to="/" className={({ isActive }) => isActive ? "nav-btn active" : "nav-btn"}>
          <LayoutDashboard size={20} /> Activity
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => isActive ? "nav-btn active" : "nav-btn"}>
          <History size={20} /> History
        </NavLink>
        <NavLink to="/add" className={({ isActive }) => isActive ? "nav-btn active" : "nav-btn"}>
          <LayoutDashboard size={20} /> Add Manual
        </NavLink>
        <NavLink to="/categories" className={({ isActive }) => isActive ? "nav-btn active" : "nav-btn"}>
          <Settings size={20} /> Settings
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="status-indicator">
          <div className={`status-dot ${status.status === 'running' ? 'running' : ''}`}></div>
          <span>Rust Engine {status.status || 'Offline'}</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
