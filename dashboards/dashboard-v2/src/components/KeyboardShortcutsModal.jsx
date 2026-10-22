import { X, Command } from 'lucide-react';

const shortcuts = [
  { key: 'Space', desc: 'Pause / Resume background tracking' },
  { key: '← / [', desc: 'Navigate to previous day' },
  { key: '→ / ]', desc: 'Navigate to next day' },
  { key: 'T', desc: 'Jump to today' },
  { key: 'M', desc: 'Open manual activity logger' },
  { key: 'Esc', desc: 'Dismiss modals or unpin timeline block' },
  { key: '?', desc: 'Toggle keyboard shortcuts guide' },
];

const KeyboardShortcutsModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content keyboard-modal" 
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '480px' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Command size={20} style={{ color: 'var(--accent-color)' }} />
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Keyboard Shortcuts</h2>
          </div>
          <button onClick={onClose} className="btn-close" aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>

        <div className="shortcuts-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
          {shortcuts.map((s, idx) => (
            <div 
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.65rem 0.75rem',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: 500 }}>
                {s.desc}
              </span>
              <kbd className="keycap-pill">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
          <button className="btn-primary" onClick={onClose} style={{ height: '38px', padding: '0.4rem 1.25rem', fontSize: '0.85rem' }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default KeyboardShortcutsModal;
