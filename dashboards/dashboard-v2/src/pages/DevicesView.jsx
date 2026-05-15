import { useState } from 'react';
import { Smartphone, GitMerge, Trash2, Plus, Info } from 'lucide-react';

const DevicesView = ({ devices, merges, mergeDevice, deleteMerge }) => {
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

  const getDeviceName = (id) => {
    const dev = devices.find(d => d.id === id);
    return dev ? dev.name : id;
  };

  return (
    <div className="view-content fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <header className="main-header" style={{ marginBottom: '2.5rem' }}>
        <div className="header-title">
          <h1 style={{ fontSize: '2.25rem', fontWeight: 900, letterSpacing: '-0.03em', color: '#0f172a' }}>Device Management</h1>
          <p style={{ fontSize: '1rem', color: '#64748b', fontWeight: 500 }}>Monitor active trackers and resolve duplicate identities</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <section className="glass-card" style={{ margin: 0 }}>
            <div className="section-label">ACTIVE TRACKING SOURCES</div>
            <div className="item-list">
              {Array.isArray(devices) && devices.map((dev) => (
                <div key={dev.id} className="item-row" style={{ padding: '1rem 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div className="item-info">
                    <div style={{ width: 40, height: 40, background: '#eff6ff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                      <Smartphone size={20} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, color: '#1e293b' }}>{dev.name}</div>
                      <div className="pattern" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{dev.platform} • ID: {dev.id}</div>
                    </div>
                  </div>
                  <div className="status-indicator">
                    <div className="status-dot running"></div>
                    <span style={{ fontWeight: 700, fontSize: '0.7rem', color: '#10b981', textTransform: 'uppercase' }}>Active</span>
                  </div>
                </div>
              ))}
              {devices.length === 0 && <p className="text-secondary" style={{ textAlign: 'center', padding: '2rem 0' }}>No devices detected.</p>}
            </div>
          </section>

          <section className="glass-card" style={{ margin: 0 }}>
            <div className="section-label">IDENTITIY MERGE RULES</div>
            <div className="item-list">
              {Array.isArray(merges) && merges.map((m) => (
                <div key={m.original_id} className="item-row" style={{ padding: '0.75rem 0', borderBottom: '1px dashed #e2e8f0' }}>
                  <div className="item-info">
                    <GitMerge size={16} className="text-secondary" />
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                      {getDeviceName(m.original_id)} <span style={{ color: '#94a3b8', margin: '0 4px' }}>→</span> {getDeviceName(m.target_id)}
                    </div>
                  </div>
                  <button className="btn-icon-soft" onClick={() => deleteMerge(m.original_id)} style={{ color: '#ef4444' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {merges.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem 0', background: '#f8fafc', borderRadius: 12, color: '#94a3b8' }}>
                  <Info size={24} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                  <p style={{ fontSize: '0.85rem' }}>No merge rules defined.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="glass-card" style={{ margin: 0, height: 'fit-content' }}>
          <div className="section-label" style={{ marginBottom: '1.5rem' }}>RESOLVE DUPLICATES</div>
          <p style={{ fontSize: '0.9rem', color: '#64748b', lineHeight: 1.5, marginBottom: '2rem' }}>
            If a single physical device appears with multiple IDs (e.g. after a reinstall), select them below to merge their history into one identity.
          </p>
          
          <form onSubmit={handleMerge} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="form-group">
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: '0.5rem', display: 'block' }}>MERGE FROM (LEGACY ID)</label>
              <select className="date-picker" value={originalId} onChange={(e) => setOriginalId(e.target.value)} style={{ width: '100%', height: '48px', fontWeight: 600 }}>
                <option value="">Select source device...</option>
                {Array.isArray(devices) && devices.map(d => <option key={d.id} value={d.id}>{d.name} ({d.id})</option>)}
              </select>
            </div>

            <div className="form-group">
              <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', marginBottom: '0.5rem', display: 'block' }}>MERGE INTO (PRIMARY ID)</label>
              <select className="date-picker" value={targetId} onChange={(e) => setTargetId(e.target.value)} style={{ width: '100%', height: '48px', fontWeight: 600 }}>
                <option value="">Select target device...</option>
                {Array.isArray(devices) && devices.map(d => <option key={d.id} value={d.id}>{d.name} ({d.id})</option>)}
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
      
      <style dangerouslySetInnerHTML={{ __html: `
        .btn-icon-soft { background: transparent; border: none; padding: 0.5rem; border-radius: 8px; cursor: pointer; color: #94a3b8; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .btn-icon-soft:hover { background: #f1f5f9; color: var(--accent-color); }
      `}} />
    </div>
  );
};

export default DevicesView;
