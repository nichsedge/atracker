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
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
            <div className="form-group">
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Category Name</label>
              <input 
                type="text" 
                required 
                placeholder="e.g. Work, Entertainment"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '1rem' }}
              />
            </div>
            <div className="form-group">
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Color</label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', background: 'var(--bg-secondary)', padding: '0.4rem', borderRadius: 10, border: '1px solid var(--border-color)' }}>
                <input 
                  type="color" 
                  value={formData.color}
                  onChange={e => setFormData({...formData, color: e.target.value})}
                  style={{ padding: 0, height: '32px', width: '32px', border: 'none', background: 'none', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-secondary)' }}>{formData.color.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Class Pattern (Regex)</label>
            <input 
              type="text" 
              placeholder="e.g. Chrome|Firefox|code"
              value={formData.wm_class_pattern}
              onChange={e => {
                setFormData({...formData, wm_class_pattern: e.target.value});
                validateRegex(e.target.value, 'wm_class');
              }}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: `1px solid ${regexErrors.wm_class ? '#ef4444' : 'var(--border-color)'}`, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '1rem', fontFamily: 'monospace' }}
            />
            {regexErrors.wm_class && <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.4rem', fontWeight: 500 }}>{regexErrors.wm_class}</div>}
          </div>

          <div className="form-group">
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Title Pattern (Regex)</label>
            <input 
              type="text" 
              placeholder="e.g. Gmail|GitHub|.*Google Search.*"
              value={formData.title_pattern}
              onChange={e => {
                setFormData({...formData, title_pattern: e.target.value});
                validateRegex(e.target.value, 'title');
              }}
              style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: `1px solid ${regexErrors.title ? '#ef4444' : 'var(--border-color)'}`, background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '1rem', fontFamily: 'monospace' }}
            />
            {regexErrors.title && <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '0.4rem', fontWeight: 500 }}>{regexErrors.title}</div>}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div className="form-group">
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'block' }}>Daily Goal (minutes)</label>
              <input 
                type="number" 
                placeholder="0"
                value={formData.daily_goal_secs}
                onChange={e => setFormData({...formData, daily_goal_secs: e.target.value})}
                style={{ width: '100%', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '1rem' }}
              />
            </div>
            <div className="form-group">
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

          <div className="modal-footer" style={{ marginTop: '1rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
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
