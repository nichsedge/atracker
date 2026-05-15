import { useState } from 'react';
import { X } from 'lucide-react';

const RuleModal = ({ isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    rule_type: 'ignore',
    wm_class_pattern: '',
    title_pattern: ''
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onClose();
    setFormData({ rule_type: 'ignore', wm_class_pattern: '', title_pattern: '' });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>New Privacy Rule</h2>
          <button onClick={onClose} className="btn-close"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="form-group">
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', display: 'block' }}>Rule Type</label>
            <select 
              value={formData.rule_type}
              onChange={e => setFormData({...formData, rule_type: e.target.value})}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem' }}
            >
              <option value="ignore">Ignore (Don't track at all)</option>
              <option value="redact">Redact (Track app but hide title)</option>
            </select>
          </div>
          <div className="form-group">
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', display: 'block' }}>Class Pattern (Regex)</label>
            <input 
              type="text" 
              placeholder="e.g. Incognito|Private"
              value={formData.wm_class_pattern}
              onChange={e => setFormData({...formData, wm_class_pattern: e.target.value})}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', fontFamily: 'monospace' }}
            />
          </div>
          <div className="form-group">
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '0.5rem', display: 'block' }}>Title Pattern (Regex)</label>
            <input 
              type="text" 
              placeholder="e.g. Secret.*Project"
              value={formData.title_pattern}
              onChange={e => setFormData({...formData, title_pattern: e.target.value})}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', fontSize: '1rem', fontFamily: 'monospace' }}
            />
          </div>
          <div className="modal-footer" style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
            <button type="submit" className="btn-primary" style={{ padding: '0.75rem 2rem', borderRadius: '10px' }}>Add Rule</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RuleModal;
