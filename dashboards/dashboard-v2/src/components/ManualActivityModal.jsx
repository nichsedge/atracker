import { useState, useEffect } from 'react';
import { X, AlertCircle, Clock, Sparkles } from 'lucide-react';

const toLocalISOString = (d) => {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const ManualActivityModal = ({ isOpen, onClose, categories = [], onSubmit }) => {
  const [formData, setFormData] = useState({
    start_time: '',
    end_time: '',
    wm_class: '',
    title: ''
  });
  const [error, setError] = useState(null);

  // Initialize with sensible defaults when opening modal
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
      setFormData(prev => ({
        ...prev,
        start_time: prev.start_time || toLocalISOString(thirtyMinsAgo),
        end_time: prev.end_time || toLocalISOString(now),
      }));
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const setQuickPreset = (minutes) => {
    const now = new Date();
    const past = new Date(now.getTime() - minutes * 60 * 1000);
    setFormData(prev => ({
      ...prev,
      start_time: toLocalISOString(past),
      end_time: toLocalISOString(now)
    }));
    setError(null);
  };

  const validateTimes = (startVal, endVal) => {
    if (!startVal || !endVal) return null;
    const start = new Date(startVal);
    const end = new Date(endVal);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return "Invalid date format.";
    }
    if (start >= end) {
      return "Start time must be strictly before end time.";
    }
    return null;
  };

  const handleStartTimeChange = (val) => {
    setFormData(prev => ({ ...prev, start_time: val }));
    setError(validateTimes(val, formData.end_time));
  };

  const handleEndTimeChange = (val) => {
    setFormData(prev => ({ ...prev, end_time: val }));
    setError(validateTimes(formData.start_time, val));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const timeErr = validateTimes(formData.start_time, formData.end_time);
    if (timeErr) {
      setError(timeErr);
      return;
    }

    if (!formData.wm_class.trim()) {
      setError("Please specify an app or category.");
      return;
    }

    const start = new Date(formData.start_time);
    const end = new Date(formData.end_time);

    onSubmit({
      ...formData,
      start_time: start.toISOString(),
      end_time: end.toISOString()
    });
    onClose();
  };

  const hasTimeError = Boolean(error);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '580px' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Clock size={20} style={{ color: 'var(--accent-color)' }} />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Log Manual Activity</h2>
          </div>
          <button onClick={onClose} className="btn-close" aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="manual-form" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
          
          {/* Quick Preset Chips */}
          <div>
            <div className="form-label">
              <span>Quick Presets</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Auto-fill duration</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="quick-time-chip" onClick={() => setQuickPreset(15)}>Last 15m</button>
              <button type="button" className="quick-time-chip" onClick={() => setQuickPreset(30)}>Last 30m</button>
              <button type="button" className="quick-time-chip" onClick={() => setQuickPreset(60)}>Last 1 hour</button>
              <button type="button" className="quick-time-chip" onClick={() => setQuickPreset(120)}>Last 2 hours</button>
            </div>
          </div>

          {/* Time Fields Grid */}
          <div className="time-fields-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1rem', width: '100%', boxSizing: 'border-box' }}>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label" htmlFor="manual-start-time">Start Time</label>
              <input 
                id="manual-start-time"
                type="datetime-local" 
                required 
                value={formData.start_time}
                onChange={e => handleStartTimeChange(e.target.value)}
                className={`form-input input-datetime ${hasTimeError ? 'has-error' : ''}`}
              />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label" htmlFor="manual-end-time">End Time</label>
              <input 
                id="manual-end-time"
                type="datetime-local" 
                required 
                value={formData.end_time}
                onChange={e => handleEndTimeChange(e.target.value)}
                className={`form-input input-datetime ${hasTimeError ? 'has-error' : ''}`}
              />
            </div>
          </div>

          {error && (
            <div className="form-error-inline" style={{ marginTop: '-0.5rem' }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* App / Category Field */}
          <div className="form-group">
            <div className="form-label">
              <label htmlFor="manual-wm-class">App / Category Name</label>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Select existing or type custom</span>
            </div>
            <input 
              id="manual-wm-class"
              type="text" 
              placeholder="e.g. Reading, Deep Work, Gym, Meeting" 
              required 
              value={formData.wm_class}
              onChange={e => setFormData({ ...formData, wm_class: e.target.value })}
              list="manual-app-suggestions"
              className="form-input"
            />
            <datalist id="manual-app-suggestions">
              {categories.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>

          {/* Title / Description */}
          <div className="form-group">
            <label className="form-label" htmlFor="manual-title">
              <span>Title / Description</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Optional</span>
            </label>
            <input 
              id="manual-title"
              type="text" 
              placeholder="What specific task or project were you doing?" 
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              className="form-input"
            />
          </div>

          {/* Modal Actions */}
          <div className="modal-footer" style={{ marginTop: '0.75rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            <button 
              type="button" 
              onClick={onClose} 
              className="btn-outline" 
              style={{ height: '42px', padding: '0.6rem 1.25rem' }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={hasTimeError}
              style={{ 
                height: '42px', 
                padding: '0.6rem 1.75rem',
                opacity: hasTimeError ? 0.6 : 1,
                cursor: hasTimeError ? 'not-allowed' : 'pointer'
              }}
            >
              <Sparkles size={16} />
              <span>Save Activity</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualActivityModal;
