import { useState } from 'react';
import { Smartphone, GitMerge, Trash2, Info, Edit2 } from 'lucide-react';

const DevicesView = ({ devices, merges, mergeDevice, deleteMerge, renameDevice }) => {
  const [originalId, setOriginalId] = useState('');
  const [targetId, setTargetId] = useState('');

  const handleMerge = (e) => {
    e.preventDefault();
    if (originalId && targetId && originalId !== targetId) {
      if (window.confirm(`Merge device mapping? This will unify the identity in all analytics.`)) {
        mergeDevice(originalId, targetId);
        setOriginalId('');
        setTargetId('');
      }
    }
  };

  const handleRename = (id, currentName) => {
    const defaultName = currentName.endsWith(' (*)') ? currentName.slice(0, -4) : currentName;
    const newName = window.prompt(`Rename device (ID: ${id}):`, defaultName);
    if (newName !== null) {
      const trimmed = newName.trim();
      if (trimmed) {
        renameDevice(id, trimmed);
      }
    }
  };

  const getDeviceName = (id) => {
    const dev = devices.find(d => d.id === id);
    return dev ? dev.name : id;
  };

  const formatLastSeen = (ts) => {
    if (!ts) return 'Never';
    try {
      const date = new Date(ts);
      if (isNaN(date.getTime())) return ts;
      return date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return ts;
    }
  };

  return (
    <div className="view-content fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header className="main-header">
        <div className="header-title">
          <h1 className="page-heading">Device Management</h1>
          <p className="page-subheading">Monitor active trackers and resolve duplicate identities</p>
        </div>
      </header>

      <div className="devices-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', minWidth: 0 }}>
          <section className="glass-card" style={{ margin: 0 }}>
            <div className="section-label">ACTIVE TRACKING SOURCES</div>
            <div className="item-list">
              {Array.isArray(devices) && devices.map((dev) => (
                <div key={dev.id} className="item-row device-management-row">
                  <div className="item-info" style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ width: 40, height: 40, flexShrink: 0, background: 'var(--accent-light)', border: '1px solid rgba(99, 102, 241, 0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-color)' }}>
                      <Smartphone size={20} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{dev.name}</div>
                        <button 
                          className="btn-icon-soft" 
                          onClick={() => handleRename(dev.id, dev.name)} 
                          title="Rename device"
                          style={{ padding: '2px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        >
                          <Edit2 size={12} />
                        </button>
                      </div>
                      <div className="pattern" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{dev.platform} • ID: {dev.id}</div>
                    </div>
                  </div>
                  <div className="device-status-col">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div className="status-dot running"></div>
                      <span style={{ fontWeight: 700, fontSize: '0.7rem', color: 'var(--success-color)', textTransform: 'uppercase' }}>Active</span>
                    </div>
                    {dev.last_seen && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500, opacity: 0.8 }}>
                        Last sync: {formatLastSeen(dev.last_seen)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {devices.length === 0 && <p className="text-secondary" style={{ textAlign: 'center', padding: '2rem 0' }}>No devices detected.</p>}
            </div>
          </section>

          <section className="glass-card" style={{ margin: 0 }}>
            <div className="section-label">IDENTITY MERGE RULES</div>
            <div className="item-list">
              {Array.isArray(merges) && merges.map((m) => (
                <div key={m.original_id} className="item-row" style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="item-info" style={{ minWidth: 0, flex: 1 }}>
                    <GitMerge size={16} className="text-secondary" style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getDeviceName(m.original_id)} <span style={{ color: 'var(--text-secondary)', margin: '0 4px', opacity: 0.5 }}>→</span> {getDeviceName(m.target_id)}
                    </div>
                  </div>
                  <button className="btn-icon-soft" onClick={() => deleteMerge(m.original_id)} style={{ color: '#ef4444', flexShrink: 0 }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {merges.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem 0', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-color)', borderRadius: 12, color: 'var(--text-secondary)' }}>
                  <Info size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                  <p style={{ fontSize: '0.85rem' }}>No merge rules defined.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="glass-card" style={{ margin: 0, height: 'fit-content' }}>
          <div className="section-label" style={{ marginBottom: '1.5rem' }}>RESOLVE DUPLICATES</div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '2rem' }}>
            If a single physical device appears with multiple IDs (e.g. after a reinstall), select them below to merge their history into one identity.
          </p>
          
          <form onSubmit={handleMerge} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="form-group">
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>MERGE FROM (LEGACY ID)</label>
              <select className="date-picker" value={originalId} onChange={(e) => setOriginalId(e.target.value)} style={{ width: '100%', height: '48px', fontWeight: 600, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0 1rem' }}>
                <option value="" style={{ background: 'var(--bg-main)', color: 'var(--text-secondary)' }}>Select source device...</option>
                {Array.isArray(devices) && devices.map(d => <option key={d.id} value={d.id} style={{ background: 'var(--bg-main)', color: 'var(--text-primary)' }}>{d.name} ({d.id})</option>)}
              </select>
            </div>

            <div className="form-group">
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>MERGE INTO (PRIMARY ID)</label>
              <select className="date-picker" value={targetId} onChange={(e) => setTargetId(e.target.value)} style={{ width: '100%', height: '48px', fontWeight: 600, background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '0 1rem' }}>
                <option value="" style={{ background: 'var(--bg-main)', color: 'var(--text-secondary)' }}>Select target device...</option>
                {Array.isArray(devices) && devices.map(d => <option key={d.id} value={d.id} style={{ background: 'var(--bg-main)', color: 'var(--text-primary)' }}>{d.name} ({d.id})</option>)}
              </select>
            </div>

            <button 
              type="submit" 
              className="btn-primary" 
              disabled={!originalId || !targetId || originalId === targetId}
              style={{ justifyContent: 'center', height: '52px', borderRadius: '12px', fontSize: '1rem' }}
            >
              <GitMerge size={20} />
              Link Identity
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default DevicesView;
