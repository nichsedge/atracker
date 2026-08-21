import { useState } from 'react';
import { X } from 'lucide-react';

const ManualActivityModal = ({ isOpen, onClose, categories, onSubmit }) => {
  const [formData, setFormData] = useState({
    start_time: '',
    end_time: '',
    wm_class: '',
    title: ''
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const start = new Date(formData.start_time);
    const end = new Date(formData.end_time);
    
    if (start >= end) {
      alert("Start time must be before end time.");
      return;
    }

    onSubmit({
      ...formData,
      start_time: start.toISOString(),
      end_time: end.toISOString()
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Log Manual Activity</h2>
          <button onClick={onClose} className="btn-close"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="manual-form" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="form-group">
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Start Time</label>
            <input 
              type="datetime-local" 
              required 
              value={formData.start_time}
              onChange={e => setFormData({...formData, start_time: e.target.value})}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '1rem' }}
            />
          </div>
          <div className="form-group">
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>End Time</label>
            <input 
              type="datetime-local" 
              required 
              value={formData.end_time}
              onChange={e => setFormData({...formData, end_time: e.target.value})}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '1rem' }}
            />
          </div>
          <div className="form-group">
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>App / Category</label>
            <input 
              type="text" 
              placeholder="e.g. Reading, Gym, Meeting" 
              required 
              value={formData.wm_class}
              onChange={e => setFormData({...formData, wm_class: e.target.value})}
              list="manual-app-suggestions"
              style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '1rem' }}
            />
            <datalist id="manual-app-suggestions">
              {categories.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>
          <div className="form-group">
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Title / Description (Optional)</label>
            <input 
              type="text" 
              placeholder="What were you doing?" 
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '1rem' }}
            />
          </div>
          <div className="modal-footer" style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" onClick={onClose} className="btn-outline" style={{ padding: '0.75rem 1.5rem' }}>Cancel</button>
            <button type="submit" className="btn-primary" style={{ padding: '0.75rem 2rem', borderRadius: 10 }}>Save Activity</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ManualActivityModal;
