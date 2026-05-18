import { useState, useRef, useEffect } from 'react';
import { Smartphone, ChevronDown } from 'lucide-react';

const DeviceFilterPill = ({ devices = [], selectedDevices = [], setSelectedDevices }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const selectAll = () => {
    setSelectedDevices([]);
  };

  const selectNone = () => {
    setSelectedDevices(['__none__']);
  };

  const isChecked = (id) => {
    if (selectedDevices.includes('__none__')) return false;
    return selectedDevices.length === 0 || selectedDevices.includes(id);
  };

  const handleDeviceToggle = (id) => {
    if (selectedDevices.includes('__none__')) {
      setSelectedDevices([id]);
      return;
    }

    if (selectedDevices.length === 0) {
      // If none explicitly selected in list (meaning all are active), unchecking one means selecting all others
      setSelectedDevices(devices.map(d => d.id).filter(dId => dId !== id));
    } else {
      if (selectedDevices.includes(id)) {
        const next = selectedDevices.filter(dId => dId !== id);
        setSelectedDevices(next.length === 0 ? ['__none__'] : next);
      } else {
        const next = [...selectedDevices, id];
        // If we select all devices explicitly, reset to empty array (all active)
        if (next.length === devices.length) {
          setSelectedDevices([]);
        } else {
          setSelectedDevices(next);
        }
      }
    }
  };

  return (
    <div className="device-dropdown-container" ref={dropdownRef} style={{ position: 'relative' }}>
      <button 
        type="button"
        className="device-filter-pill"
        onClick={() => setIsOpen(!isOpen)}
        style={{ 
          cursor: 'pointer', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.6rem', 
          padding: '0.6rem 1.2rem', 
          background: 'var(--bg-secondary)', 
          border: '1px solid var(--border-color)', 
          borderRadius: '24px',
          color: 'var(--text-primary)',
          fontSize: '0.85rem',
          fontWeight: 700,
          outline: 'none',
          transition: 'all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}
      >
        <Smartphone size={16} style={{ color: 'var(--accent-color)' }} />
        <span>
          {selectedDevices.includes('__none__') 
            ? 'No Devices' 
            : selectedDevices.length === 0 
              ? 'All Devices' 
              : `${selectedDevices.length} Selected`}
        </span>
        <ChevronDown size={14} style={{ color: 'var(--text-secondary)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(180deg)' : 'none' }} />
      </button>

      {isOpen && (
        <div className="device-dropdown-popover" style={{
          position: 'absolute',
          top: '120%',
          right: 0,
          zIndex: 1000,
          width: '280px',
          background: 'rgba(13, 20, 35, 0.95)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          padding: '1rem',
          boxShadow: '0 15px 35px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          backdropFilter: 'blur(16px)',
          animation: 'tooltipFade 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-secondary)', letterSpacing: '0.05em' }}>FILTER DEVICES</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                type="button" 
                onClick={selectAll} 
                style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}
              >
                All
              </button>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', opacity: 0.3 }}>|</span>
              <button 
                type="button" 
                onClick={selectNone} 
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
            {devices.map(dev => {
              const active = isChecked(dev.id);
              return (
                <label 
                  key={dev.id} 
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: active ? 'var(--accent-light)' : 'rgba(255,255,255,0.01)',
                    border: `1px solid ${active ? 'rgba(99,102,241,0.25)' : 'var(--border-subtle)'}`,
                    transition: 'all 0.15s'
                  }}
                  className="device-dropdown-item"
                >
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, marginRight: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {dev.name || dev.id}
                    </span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', opacity: 0.5 }}>
                      {dev.platform || 'Unknown'}
                    </span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={active} 
                    onChange={() => handleDeviceToggle(dev.id)}
                    style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent-color)' }}
                  />
                </label>
              );
            })}
            {devices.length === 0 && (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem' }}>No devices detected</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DeviceFilterPill;
