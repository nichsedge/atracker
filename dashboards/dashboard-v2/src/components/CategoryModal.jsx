import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const CategoryModal = ({ isOpen, onClose, category, onSave }) => {
  const [formData, setFormData] = useState({
    name: '',
    wm_class_pattern: '',
    title_pattern: '',
    color: '#3b82f6',
    is_case_sensitive: false,
    daily_goal_secs: 0,
    daily_limit_secs: 0
  });

  const [regexErrors, setRegexErrors] = useState({ wm_class: '', title: '' });

  useEffect(() => {
    if (category) {
      setFormData({
        ...category,
        daily_goal_secs: Math.round(category.daily_goal_secs / 60) || 0,
        daily_limit_secs: Math.round(category.daily_limit_secs / 60) || 0
      });
    } else {
      setFormData({
        name: '',
        wm_class_pattern: '',
        title_pattern: '',
        color: '#3b82f6',
        is_case_sensitive: false,
        daily_goal_secs: 0,
        daily_limit_secs: 0
      });
    }
    setRegexErrors({ wm_class: '', title: '' });
  }, [category, isOpen]);

  if (!isOpen) return null;

  const validateRegex = (pattern, field) => {
    if (!pattern) {
      setRegexErrors(prev => ({ ...prev, [field]: '' }));
      return true;
    }
    try {
      new RegExp(pattern);
      setRegexErrors(prev => ({ ...prev, [field]: '' }));
      return true;
    } catch (e) {
      setRegexErrors(prev => ({ ...prev, [field]: e.message }));
      return false;
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (regexErrors.wm_class || regexErrors.title) return;

    onSave({
      ...formData,
      daily_goal_secs: Number(formData.daily_goal_secs) * 60,
      daily_limit_secs: Number(formData.daily_limit_secs) * 60
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{category ? 'Edit Category' : 'New Category'}</h2>
          <button onClick={onClose} className="btn-close"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="manual-form" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="modal-row-grid">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Category Name</label>
              <input 
                type="text" 
                required 
                placeholder="e.g. Work, Entertainment"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="form-input"
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Color</label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', background: 'rgba(26, 18, 48, 0.85)', padding: '0.45rem 0.65rem', borderRadius: 10, border: '1px solid rgba(255, 255, 255, 0.16)' }}>
                <input 
                  type="color" 
                  value={formData.color}
                  onChange={e => setFormData({...formData, color: e.target.value})}
                  style={{ padding: 0, height: '32px', width: '32px', border: 'none', background: 'none', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>{formData.color.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className="form-group">
            <div className="form-label">
              <span>Class Pattern (Regex)</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>e.g. Chrome|Firefox|code</span>
            </div>
            <input 
              type="text" 
              placeholder="e.g. Chrome|Firefox|code"
              value={formData.wm_class_pattern}
              onChange={e => {
                setFormData({...formData, wm_class_pattern: e.target.value});
                validateRegex(e.target.value, 'wm_class');
              }}
              className={`form-input ${regexErrors.wm_class ? 'has-error' : ''}`}
              style={{ fontFamily: 'monospace' }}
            />
            {regexErrors.wm_class && <div className="form-error-inline">{regexErrors.wm_class}</div>}
          </div>

          <div className="form-group">
            <div className="form-label">
              <span>Title Pattern (Regex)</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>e.g. Gmail|GitHub|.*Google Search.*</span>
            </div>
            <input 
              type="text" 
              placeholder="e.g. Gmail|GitHub|.*Google Search.*"
              value={formData.title_pattern}
              onChange={e => {
                setFormData({...formData, title_pattern: e.target.value});
                validateRegex(e.target.value, 'title');
              }}
              className={`form-input ${regexErrors.title ? 'has-error' : ''}`}
              style={{ fontFamily: 'monospace' }}
            />
            {regexErrors.title && <div className="form-error-inline">{regexErrors.title}</div>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--bg-secondary)', padding: '0.75rem 1rem', borderRadius: 10, border: '1px solid var(--border-color)' }}>
            <input 
              type="checkbox" 
              id="case-sensitive-cb"
              checked={formData.is_case_sensitive}
              onChange={e => setFormData({...formData, is_case_sensitive: e.target.checked})}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent-color)' }}
            />
            <label htmlFor="case-sensitive-cb" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', flex: 1 }}>
              Case Sensitive Matching
            </label>
          </div>

          <div className="modal-row-grid">
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Daily Goal (minutes)</label>
              <input 
                type="number" 
                placeholder="0"
                value={formData.daily_goal_secs}
                onChange={e => setFormData({...formData, daily_goal_secs: e.target.value})}
                style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '1rem' }}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Daily Limit (minutes)</label>
              <input 
                type="number" 
                placeholder="0"
                value={formData.daily_limit_secs}
                onChange={e => setFormData({...formData, daily_limit_secs: e.target.value})}
                style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '1rem' }}
              />
            </div>
          </div>

          <div className="modal-footer" style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" onClick={onClose} className="btn-outline" style={{ padding: '0.75rem 1.5rem' }}>Cancel</button>
            <button type="submit" className="btn-primary" style={{ padding: '0.75rem 2rem', borderRadius: 10 }} disabled={!!(regexErrors.wm_class || regexErrors.title)}>
              {category ? 'Update Category' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CategoryModal;
