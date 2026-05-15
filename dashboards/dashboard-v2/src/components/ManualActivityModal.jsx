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
      <div className="modal-content glass-card fade-in">
        <div className="modal-header">
          <h2>Log Manual Activity</h2>
          <button onClick={onClose} className="btn-close"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="manual-form">
          <div className="form-group">
            <label>Start Time</label>
            <input 
              type="datetime-local" 
              required 
              value={formData.start_time}
              onChange={e => setFormData({...formData, start_time: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>End Time</label>
            <input 
              type="datetime-local" 
              required 
              value={formData.end_time}
              onChange={e => setFormData({...formData, end_time: e.target.value})}
            />
          </div>
          <div className="form-group">
            <label>App / Category</label>
            <input 
              type="text" 
              placeholder="e.g. Reading, Gym, Meeting" 
              required 
              value={formData.wm_class}
              onChange={e => setFormData({...formData, wm_class: e.target.value})}
              list="manual-app-suggestions"
            />
            <datalist id="manual-app-suggestions">
              {categories.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
          </div>
          <div className="form-group">
            <label>Title / Description (Optional)</label>
            <input 
              type="text" 
              placeholder="What were you doing?" 
              value={formData.title}
              onChange={e => setFormData({...formData, title: e.target.value})}
            />
          </div>
          <div className="modal-footer">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Save Activity</button>
          </div>
        </form>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          backdrop-filter: blur(4px);
        }
        .modal-content {
          width: 100%;
          max-width: 500px;
          padding: 2rem;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        .manual-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .form-group label {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .form-group input {
          padding: 0.75rem;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          font-family: inherit;
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          margin-top: 1rem;
        }
        .btn-secondary {
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          border: 1px solid var(--border-color);
          background: white;
          cursor: pointer;
          font-weight: 600;
        }
        .btn-close {
          background: none;
          border: none;
          cursor: pointer;
          color: var(--text-secondary);
        }
      `}} />
    </div>
  );
};

export default ManualActivityModal;
