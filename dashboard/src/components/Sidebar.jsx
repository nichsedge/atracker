import React from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, History, PlusSquare, Settings, CircleDot } from 'lucide-react';

export default function Sidebar({ daemonStatus, devices, selectedDevices, onDeviceToggle }) {
  return (
    <nav className="w-[var(--sidebar-width)] flex-shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] backdrop-blur-xl flex flex-col z-20 transition-all duration-300">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[var(--accent-indigo)] to-[var(--accent-violet)] shadow-[0_0_15px_var(--glow-violet)] flex items-center justify-center text-white">
          <CircleDot size={18} strokeWidth={2.5} />
        </div>
        <span className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-[var(--text-secondary)]">atracker</span>
      </div>

      <div className="px-6 py-2 uppercase text-[10px] font-bold text-[var(--text-muted)] tracking-wider">
        Views
      </div>
      <div className="px-3 flex flex-col gap-1">
        <NavLink to="/" className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-all ${isActive ? 'bg-[var(--border-active)] text-[var(--text-accent)]' : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]'}`}>
          <Activity size={18} />
          <span>Activity</span>
        </NavLink>
        <NavLink to="/history" className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-all ${isActive ? 'bg-[var(--border-active)] text-[var(--text-accent)]' : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]'}`}>
          <History size={18} />
          <span>History</span>
        </NavLink>
        <NavLink to="/manual" className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-all ${isActive ? 'bg-[var(--border-active)] text-[var(--text-accent)]' : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]'}`}>
          <PlusSquare size={18} />
          <span>Add Manual</span>
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-[var(--radius-sm)] text-sm font-medium transition-all ${isActive ? 'bg-[var(--border-active)] text-[var(--text-accent)]' : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)]'}`}>
          <Settings size={18} />
          <span>Settings</span>
        </NavLink>
      </div>

      {devices && devices.length > 0 && (
        <>
          <div className="px-6 py-2 mt-6 uppercase text-[10px] font-bold text-[var(--text-muted)] tracking-wider">
            Devices
          </div>
          <div className="px-3 flex flex-col gap-1">
            {devices.map(device => (
              <label key={device.device_id} className="flex items-center gap-3 px-3 py-1.5 rounded-[var(--radius-sm)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[var(--text-primary)] cursor-pointer transition-all">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-[var(--border-subtle)] bg-[rgba(0,0,0,0.2)] text-[var(--accent-indigo)] focus:ring-[var(--accent-indigo)] focus:ring-offset-0 focus:ring-offset-transparent"
                  checked={selectedDevices.includes(device.device_id)}
                  onChange={(e) => onDeviceToggle(device.device_id, e.target.checked)}
                />
                <span className="truncate">{device.name || device.device_id.substring(0,8)}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <div className="mt-auto p-6">
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
          <span className={`w-2 h-2 rounded-full ${daemonStatus === 'Connected' ? 'bg-[var(--success)] shadow-[0_0_8px_var(--success)]' : 'bg-[var(--danger)] shadow-[0_0_8px_var(--danger)]'}`}></span>
          {daemonStatus}
        </div>
      </div>
    </nav>
  );
}
