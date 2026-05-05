import React from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, History, PlusSquare, Settings, CircleDot } from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', icon: Activity, label: 'Activity' },
  { to: '/history', icon: History, label: 'History' },
  { to: '/manual', icon: PlusSquare, label: 'Add Manual' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar({ daemonStatus, devices, selectedDevices, onDeviceToggle }) {
  const isConnected = daemonStatus === 'Connected';

  return (
    <nav className="w-[var(--sidebar-width)] flex-shrink-0 border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] flex flex-col z-20">
      {/* Logo */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[var(--accent-indigo)] to-[var(--accent-violet)] shadow-[0_0_14px_var(--glow-violet)] flex items-center justify-center text-white flex-shrink-0">
          <CircleDot size={14} strokeWidth={2.5} />
        </div>
        <span className="text-base font-bold tracking-tight text-white">atracker</span>
      </div>

      {/* Nav */}
      <div className="px-2 flex flex-col gap-0.5">
        <p className="section-label px-3 pb-2 pt-1">Views</p>
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `relative flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--radius-sm)] text-sm font-medium transition-all overflow-hidden
               ${isActive
                 ? 'bg-[rgba(99,102,241,0.13)] text-[var(--text-accent)]'
                 : 'text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]'}`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[var(--accent-indigo)] rounded-r-full" />
                )}
                <Icon size={15} strokeWidth={1.9} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* Devices */}
      {devices && devices.length > 0 && (
        <div className="px-2 mt-5">
          <p className="section-label px-3 pb-2">Devices</p>
          <div className="flex flex-col gap-0.5">
            {devices.map(device => (
              <label
                key={device.device_id}
                className="flex items-center gap-2.5 px-3 py-2 rounded-[var(--radius-sm)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)] cursor-pointer transition-all"
              >
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 rounded accent-[var(--accent-indigo)] flex-shrink-0 cursor-pointer"
                  checked={selectedDevices.includes(device.device_id)}
                  onChange={(e) => onDeviceToggle(device.device_id, e.target.checked)}
                />
                <span className="truncate">{device.name || device.device_id.substring(0, 10)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Status */}
      <div className="mt-auto px-5 py-4 border-t border-[var(--border-subtle)]">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isConnected
                ? 'bg-[var(--success)] shadow-[0_0_6px_var(--success)]'
                : 'bg-[var(--danger)] shadow-[0_0_6px_var(--danger)]'
            }`}
            style={isConnected ? { animation: 'pulse-status 2.5s ease-in-out infinite' } : {}}
          />
          <span className={isConnected ? 'text-[var(--text-secondary)]' : 'text-[var(--danger)]'}>
            {daemonStatus}
          </span>
        </div>
      </div>
    </nav>
  );
}
