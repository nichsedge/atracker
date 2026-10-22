import { useState, useMemo } from 'react';
import { X, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';

const testRegex = (pattern) => {
  if (!pattern) return { valid: true, regex: null, error: null };
  try {
    const reg = new RegExp(pattern, 'i');
    return { valid: true, regex: reg, error: null };
  } catch (err) {
    return { valid: false, regex: null, error: err.message };
  }
};

const RuleModal = ({ isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState({
    rule_type: 'ignore',
    wm_class_pattern: '',
    title_pattern: ''
  });
  const [testSample, setTestSample] = useState('');

  const wmValidation = useMemo(() => testRegex(formData.wm_class_pattern), [formData.wm_class_pattern]);
  const titleValidation = useMemo(() => testRegex(formData.title_pattern), [formData.title_pattern]);

  const hasSyntaxError = !wmValidation.valid || !titleValidation.valid;

  // Live match testing against the sample string
  const testMatchResult = useMemo(() => {
    if (!testSample) return null;
    const wmMatch = wmValidation.regex ? wmValidation.regex.test(testSample) : false;
    const titleMatch = titleValidation.regex ? titleValidation.regex.test(testSample) : false;
    return {
      wmMatch,
      titleMatch,
      matched: wmMatch || titleMatch
    };
  }, [testSample, wmValidation, titleValidation]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (hasSyntaxError) return;

    onSave(formData);
    onClose();
    setFormData({ rule_type: 'ignore', wm_class_pattern: '', title_pattern: '' });
    setTestSample('');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '540px' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <ShieldAlert size={20} style={{ color: 'var(--accent-color)' }} />
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>New Privacy & Tracking Rule</h2>
          </div>
          <button onClick={onClose} className="btn-close" aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="manual-form" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
          
          <div className="form-group">
            <label className="form-label" htmlFor="rule-type-select">Rule Type</label>
            <select 
              id="rule-type-select"
              value={formData.rule_type}
              onChange={e => setFormData({ ...formData, rule_type: e.target.value })}
              className="form-input"
              style={{ cursor: 'pointer' }}
            >
              <option value="ignore" style={{ background: '#0b1120', color: '#ffffff' }}>Ignore (Don't track at all)</option>
              <option value="redact" style={{ background: '#0b1120', color: '#ffffff' }}>Redact (Track app class but hide window title)</option>
            </select>
          </div>

          <div className="form-group">
            <div className="form-label">
              <label htmlFor="rule-wm-pattern">Application Class Pattern (Regex)</label>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>e.g. Incognito|Private|KeePass</span>
            </div>
            <input 
              id="rule-wm-pattern"
              type="text" 
              placeholder="e.g. com\\.whatsapp|cursor|private"
              value={formData.wm_class_pattern}
              onChange={e => setFormData({ ...formData, wm_class_pattern: e.target.value })}
              className={`form-input ${!wmValidation.valid ? 'has-error' : ''}`}
              style={{ fontFamily: 'monospace' }}
            />
            {!wmValidation.valid && (
              <div className="form-error-inline">
                <AlertCircle size={14} />
                <span>Invalid regex: {wmValidation.error}</span>
              </div>
            )}
          </div>

          <div className="form-group">
            <div className="form-label">
              <label htmlFor="rule-title-pattern">Window Title Pattern (Regex)</label>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>e.g. Secret.*Project|TradingView</span>
            </div>
            <input 
              id="rule-title-pattern"
              type="text" 
              placeholder="e.g. (Private Browsing|Bitwarden)"
              value={formData.title_pattern}
              onChange={e => setFormData({ ...formData, title_pattern: e.target.value })}
              className={`form-input ${!titleValidation.valid ? 'has-error' : ''}`}
              style={{ fontFamily: 'monospace' }}
            />
            {!titleValidation.valid && (
              <div className="form-error-inline">
                <AlertCircle size={14} />
                <span>Invalid regex: {titleValidation.error}</span>
              </div>
            )}
          </div>

          {/* Interactive Regex Match Tester */}
          <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <div className="form-label" style={{ marginBottom: '0.4rem' }}>
              <span>Live Pattern Tester</span>
              {testMatchResult && (
                testMatchResult.matched ? (
                  <span style={{ color: '#00FA9A', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}>
                    <CheckCircle2 size={13} /> Matches Rule
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    No Match
                  </span>
                )
              )}
            </div>
            <input 
              type="text" 
              placeholder="Type a sample app name or title to test..."
              value={testSample}
              onChange={e => setTestSample(e.target.value)}
              className="form-input"
              style={{ fontSize: '0.85rem', padding: '0.55rem 0.75rem' }}
            />
          </div>

          <div className="modal-footer" style={{ marginTop: '0.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
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
              disabled={hasSyntaxError}
              style={{ 
                height: '42px', 
                padding: '0.6rem 1.75rem',
                opacity: hasSyntaxError ? 0.6 : 1,
                cursor: hasSyntaxError ? 'not-allowed' : 'pointer'
              }}
            >
              Save Rule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RuleModal;
