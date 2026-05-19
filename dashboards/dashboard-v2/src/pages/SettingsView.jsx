import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Shield, Download, Upload, Smartphone, Cpu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CategoryModal from '../components/CategoryModal';
import RuleModal from '../components/RuleModal';

const SettingsView = ({ 
  categories, saveCategory, deleteCategory, 
  rules, saveRule, deleteRule, 
  settings, saveSettings
}) => {
  const navigate = useNavigate();
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [tuningData, setTuningData] = useState(settings);

  useEffect(() => {
    setTuningData(settings);
  }, [settings]);

  const handleEditCategory = (cat) => {
    setEditingCategory(cat);
    setIsCatModalOpen(true);
  };

  const handleAddCategory = () => {
    setEditingCategory(null);
    setIsCatModalOpen(true);
  };

  const handleExportCategories = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(categories, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "atracker_categories.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportCategories = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);
          const replace = confirm("Replace existing categories?");
          await fetch(`${window.location.origin}/api/categories/import?replace=${replace}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          window.location.reload();
        } catch (err) { alert("Import failed"); }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleTuningSubmit = (e) => {
    e.preventDefault();
    saveSettings(tuningData);
    alert("Settings saved!");
  };

  return (
    <div className="view-content fade-in" style={{ paddingBottom: '5rem' }}>
      <header className="main-header" style={{ marginBottom: '2.5rem' }}>
        <div className="header-title">
          <h1 style={{ fontSize: '2.25rem', fontWeight: 900, fontFamily: "'Outfit', sans-serif", letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>Configuration</h1>
          <p style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>System tuning, activity rules, and device management</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
            <button className="btn-ghost" onClick={handleExportCategories} title="Export JSON"><Download size={18} /></button>
            <button className="btn-ghost" onClick={handleImportCategories} title="Import JSON"><Upload size={18} /></button>
          </div>
          <button className="btn-primary" onClick={handleAddCategory} style={{ padding: '0 1.5rem', height: '48px', borderRadius: '12px', fontSize: '0.95rem' }}>
            <Plus size={20} /> Add Category
          </button>
        </div>
      </header>

      <div className="settings-grid">
        {/* Left Column: Categories & Rules */}
        <div style={{ minWidth: 0 }}>
          <section className="glass-card" style={{ margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div className="section-label" style={{ margin: 0 }}>ACTIVITY CATEGORIES</div>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-color)', background: 'var(--accent-light)', border: '1px solid rgba(99, 102, 241, 0.15)', padding: '3px 10px', borderRadius: '20px' }}>
                {categories.length} total
              </span>
            </div>
            
            <div className="item-list">
              {categories.map((cat) => (
                <div key={cat.id} className="item-row" style={{ minWidth: 0, padding: '1rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="item-info" style={{ flex: 1, minWidth: 0 }}>
                    <div className="color-dot" style={{ width: 12, height: 12, backgroundColor: cat.color, flexShrink: 0, boxShadow: `0 0 10px ${cat.color}aa` }}></div>
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cat.name}
                      </div>
                      <div className="pattern" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cat.wm_class_pattern || '*'}
                        {cat.title_pattern && ` • ${cat.title_pattern}`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button className="btn-icon-soft" onClick={() => handleEditCategory(cat)}><Edit2 size={16} /></button>
                    <button className="btn-icon-soft" style={{ color: '#ef4444' }} onClick={() => deleteCategory(cat.id)}><Trash2 size={16} /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-card" style={{ margin: 0 }}>
            <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <Shield size={16} color="var(--text-secondary)" /> PRIVACY RULES
            </div>
            <div className="item-list">
              {rules.map((rule) => (
                <div key={rule.id} className="item-row" style={{ minWidth: 0, padding: '0.75rem 0' }}>
                  <div className="item-info" style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase',
                      background: rule.rule_type === 'ignore' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(217, 119, 6, 0.15)',
                      color: rule.rule_type === 'ignore' ? '#ef4444' : '#fbbf24',
                      padding: '2px 6px', borderRadius: '4px', flexShrink: 0
                    }}>{rule.rule_type}</span>
                    <div className="pattern" style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rule.wm_class_pattern || '*Any App*'}</div>
                  </div>
                  <button className="btn-icon-soft" onClick={() => deleteRule(rule.id)} style={{ color: '#ef4444' }}><Trash2 size={16} /></button>
                </div>
              ))}
            </div>
            <button className="btn-outline" style={{ width: '100%', marginTop: '1rem', justifyContent: 'center', padding: '0.75rem' }} onClick={() => setIsRuleModalOpen(true)}>
              <Plus size={16} /> Add Rule
            </button>
          </section>
        </div>

        {/* Right Column: Devices & Engine */}
        <div style={{ minWidth: 0 }}>
          <section className="glass-card" style={{ margin: 0 }}>
            <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
              <Smartphone size={16} color="var(--text-secondary)" /> DEVICES & MERGING
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
              Device identity resolution is managed in a dedicated view.
            </p>
            <button className="btn-outline" onClick={() => navigate('/devices')} style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}>
              Open Device Management
            </button>
          </section>

          <section className="glass-card" style={{ margin: 0 }}>
            <div className="section-label" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
              <Cpu size={16} color="var(--text-secondary)" /> ENGINE TUNING
            </div>
            <form onSubmit={handleTuningSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>POLL INTERVAL</label>
                  <div style={{ position: 'relative' }}>
                    <input type="number" className="date-picker" value={tuningData.poll_interval || ''} onChange={e => setTuningData({...tuningData, poll_interval: e.target.value})} style={{ width: '100%', paddingRight: '2.5rem', fontWeight: 700 }} />
                    <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.65rem', fontWeight: 800, opacity: 0.4, color: 'var(--text-secondary)' }}>SEC</span>
                  </div>
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>IDLE THRESHOLD</label>
                  <div style={{ position: 'relative' }}>
                    <input type="number" className="date-picker" value={tuningData.idle_threshold || ''} onChange={e => setTuningData({...tuningData, idle_threshold: e.target.value})} style={{ width: '100%', paddingRight: '2.5rem', fontWeight: 700 }} />
                    <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.65rem', fontWeight: 800, opacity: 0.4, color: 'var(--text-secondary)' }}>SEC</span>
                  </div>
                </div>
              </div>
              <button type="submit" className="btn-primary" style={{ justifyContent: 'center', padding: '0.8rem', borderRadius: '12px' }}>
                Apply Engine Config
              </button>
            </form>
          </section>
        </div>
      </div>

      <CategoryModal isOpen={isCatModalOpen} onClose={() => setIsCatModalOpen(false)} category={editingCategory} onSave={saveCategory} />
      <RuleModal isOpen={isRuleModalOpen} onClose={() => setIsRuleModalOpen(false)} onSave={saveRule} />
      
    </div>
  );
};

export default SettingsView;
