import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle, Trash2, Pencil, X } from 'lucide-react';
import { fetchAPI } from '../api';

function Feedback({ msg }) {
  if (!msg?.text) return null;
  return (
    <div className={`mb-4 ${msg.type === 'error' ? 'feedback-error' : 'feedback-success'}`}>
      {msg.type === 'error'
        ? <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
        : <CheckCircle size={15} className="flex-shrink-0 mt-0.5" />
      }
      {msg.text}
    </div>
  );
}

export default function SettingsView() {
  const [settings, setSettings] = useState({ poll_interval: 5, idle_threshold: 120, min_app_usage_secs: 120 });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [categories, setCategories] = useState([]);
  const [rules, setRules] = useState([]);
  const [showCatModal, setShowCatModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingCatId, setEditingCatId] = useState(null);
  const [deletingCatId, setDeletingCatId] = useState(null);
  const [deletingRuleId, setDeletingRuleId] = useState(null);
  const [opMsg, setOpMsg] = useState({ type: '', text: '' });

  const [catForm, setCatForm] = useState({
    name: '', pattern: '', title_pattern: '', color: '#6366f1',
    case_sensitive: false, goal_mins: '', limit_mins: '',
  });
  const [ruleForm, setRuleForm] = useState({ type: 'ignore', wm_class: '', window_title: '' });
  const [notificationPermission, setNotificationPermission] = useState(Notification.permission);

  const fileInputRef = useRef(null);

  const fetchAll = async () => {
    try {
      const [res, catRes, rulesRes] = await Promise.all([
        fetchAPI('/api/settings'),
        fetchAPI('/api/categories'),
        fetchAPI('/api/rules'),
      ]);
      setSettings({
        poll_interval: parseInt(res.poll_interval) || 5,
        idle_threshold: parseInt(res.idle_threshold) || 120,
        min_app_usage_secs: parseInt(res.min_app_usage_secs) || 120,
      });
      setCategories(catRes.categories || []);
      setRules(rulesRes.rules || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const showOpMsg = (type, text) => {
    setOpMsg({ type, text });
    setTimeout(() => setOpMsg({ type: '', text: '' }), 4000);
  };

  const handleSaveTuning = async (e) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    try {
      await fetchAPI('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          poll_interval: settings.poll_interval,
          idle_threshold: settings.idle_threshold,
          min_app_usage_secs: settings.min_app_usage_secs,
        }),
      });
      setMsg({ type: 'success', text: 'Tuning settings saved.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to save settings.' });
    }
  };

  const openEditCat = (cat) => {
    setCatForm({
      name: cat.name,
      pattern: cat.wm_class_pattern || '',
      title_pattern: cat.title_pattern || '',
      color: cat.color || '#6366f1',
      case_sensitive: cat.is_case_sensitive || false,
      goal_mins: cat.daily_goal_secs > 0 ? String(Math.round(cat.daily_goal_secs / 60)) : '',
      limit_mins: cat.daily_limit_secs > 0 ? String(Math.round(cat.daily_limit_secs / 60)) : '',
    });
    setEditingCatId(cat.id);
    setShowCatModal(true);
  };

  const handleSaveCat = async (e) => {
    e.preventDefault();
    const payload = {
      name: catForm.name,
      wm_class_pattern: catForm.pattern || '',
      title_pattern: catForm.title_pattern || '',
      color: catForm.color,
      is_case_sensitive: catForm.case_sensitive,
      daily_goal_secs: catForm.goal_mins ? parseInt(catForm.goal_mins) * 60 : 0,
      daily_limit_secs: catForm.limit_mins ? parseInt(catForm.limit_mins) * 60 : 0,
    };
    try {
      if (editingCatId) {
        await fetchAPI(`/api/categories/${editingCatId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await fetchAPI('/api/categories', { method: 'POST', body: JSON.stringify(payload) });
      }
      setShowCatModal(false);
      setEditingCatId(null);
      fetchAll();
    } catch (err) {
      showOpMsg('error', 'Failed to save category: ' + err.message);
    }
  };

  const confirmDeleteCategory = async (id) => {
    try {
      await fetchAPI(`/api/categories/${id}`, { method: 'DELETE' });
      setDeletingCatId(null);
      fetchAll();
    } catch (err) {
      showOpMsg('error', 'Failed to delete category.');
    }
  };

  const handleExportCategories = async () => {
    try {
      const res = await fetchAPI('/api/categories/export');
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: 'atracker_categories.json' });
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showOpMsg('error', 'Failed to export categories.');
    }
  };

  const handleImportCategories = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        const payload = data.categories ? data : { categories: data };
        const url = new URL(window.location.origin + '/api/categories/import');
        url.searchParams.append('replace', 'false');
        await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        fetchAll();
        showOpMsg('success', 'Categories imported successfully.');
      } catch (err) {
        showOpMsg('error', 'Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSaveRule = async (e) => {
    e.preventDefault();
    try {
      await fetchAPI('/api/rules', {
        method: 'POST',
        body: JSON.stringify({
          rule_type: ruleForm.type,
          wm_class_pattern: ruleForm.wm_class,
          title_pattern: ruleForm.window_title,
        }),
      });
      setShowRuleModal(false);
      fetchAll();
    } catch (err) {
      showOpMsg('error', 'Failed to save rule: ' + err.message);
    }
  };

  const confirmDeleteRule = async (id) => {
    try {
      await fetchAPI(`/api/rules/${id}`, { method: 'DELETE' });
      setDeletingRuleId(null);
      fetchAll();
    } catch (err) {
      showOpMsg('error', 'Failed to delete rule.');
    }
  };

  const requestNotificationPermission = async () => {
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-5 pb-20 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Settings</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Configure tracker and dashboard experience.</p>
      </div>

      {/* Global op feedback */}
      {opMsg.text && (
        <div className={opMsg.type === 'error' ? 'feedback-error' : 'feedback-success'}>
          {opMsg.type === 'error' ? <AlertCircle size={15} className="flex-shrink-0" /> : <CheckCircle size={15} className="flex-shrink-0" />}
          {opMsg.text}
        </div>
      )}

      {/* General */}
      <div className="glass-card p-5">
        <p className="section-label mb-4">General</p>
        {notificationPermission !== 'granted' ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-secondary)]">Enable desktop alerts for goal/limit notifications.</p>
            <button onClick={requestNotificationPermission} className="btn btn-secondary text-sm flex-shrink-0 ml-4">
              Enable Notifications
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-[var(--success)]">
            <CheckCircle size={15} />
            Desktop notifications enabled
          </div>
        )}
      </div>

      {/* Tuning */}
      <div className="glass-card p-5">
        <p className="section-label mb-1">Tuning</p>
        <p className="text-xs text-[var(--text-muted)] mb-4">Configure polling rate and idle detection thresholds.</p>

        <Feedback msg={msg} />

        <form onSubmit={handleSaveTuning} className="flex flex-col gap-4 max-w-sm">
          {[
            { label: 'Poll Interval', key: 'poll_interval', unit: 'seconds', min: 1, max: 60 },
            { label: 'Idle Threshold', key: 'idle_threshold', unit: 'seconds', min: 10, max: 3600 },
            { label: 'Min App Usage', key: 'min_app_usage_secs', unit: 'seconds', min: 0 },
          ].map(({ label, key, unit, min, max }) => (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5">
                <label className="text-sm font-medium text-[var(--text-secondary)]">{label}</label>
                <span className="text-xs text-[var(--text-muted)]">{unit}</span>
              </div>
              <input
                type="number"
                min={min}
                max={max}
                required
                value={settings[key]}
                onChange={e => setSettings({ ...settings, [key]: parseInt(e.target.value) })}
                className="glass-input px-3 py-2 w-24 text-sm text-right tabular-nums"
              />
            </div>
          ))}
          <button type="submit" className="btn btn-primary mt-1 self-start">Save Tuning</button>
        </form>
      </div>

      {/* Categories */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="section-label">Categories</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setCatForm({ name: '', pattern: '', title_pattern: '', color: '#6366f1', case_sensitive: false, goal_mins: '', limit_mins: '' });
                setEditingCatId(null);
                setShowCatModal(true);
              }}
              className="btn btn-primary py-1.5 px-3 text-xs"
            >
              Add
            </button>
            <button onClick={handleExportCategories} className="btn btn-secondary py-1.5 px-3 text-xs">Export</button>
            <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary py-1.5 px-3 text-xs">Import</button>
            <input type="file" ref={fileInputRef} onChange={handleImportCategories} accept=".json" className="hidden" />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center justify-between p-3 rounded-[var(--radius-sm)] bg-[rgba(255,255,255,0.02)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-[rgba(255,255,255,0.1)]" style={{ backgroundColor: cat.color }} />
                <div className="min-w-0">
                  <div className="font-medium text-white text-sm leading-snug truncate">{cat.name}</div>
                  <div className="text-xs text-[var(--text-muted)] truncate">{cat.wm_class_pattern || '*'}</div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                {deletingCatId === cat.id ? (
                  <>
                    <span className="text-xs text-[var(--text-muted)]">Delete?</span>
                    <button onClick={() => confirmDeleteCategory(cat.id)} className="text-xs text-[var(--danger)] hover:text-red-300 font-medium transition-colors px-1">Yes</button>
                    <button onClick={() => setDeletingCatId(null)} className="text-xs text-[var(--text-muted)] hover:text-white transition-colors px-1">No</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => openEditCat(cat)} className="text-[var(--text-muted)] hover:text-[var(--text-accent)] transition-colors p-1" title="Edit">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeletingCatId(cat.id)} className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors p-1" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-[var(--text-muted)] py-2">No categories configured.</p>
          )}
        </div>
      </div>

      {/* Privacy & Filters */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="section-label">Privacy & Filters</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">Ignore or redact specific apps and windows from tracking.</p>
          </div>
          <button
            onClick={() => { setRuleForm({ type: 'ignore', wm_class: '', window_title: '' }); setShowRuleModal(true); }}
            className="btn btn-primary py-1.5 px-3 text-xs flex-shrink-0 ml-4"
          >
            Add Rule
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {rules.map(rule => (
            <div key={rule.id} className="flex items-center justify-between p-3 rounded-[var(--radius-sm)] bg-[rgba(255,255,255,0.02)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                  rule.rule_type === 'ignore'
                    ? 'bg-[rgba(100,116,139,0.2)] text-[var(--text-secondary)]'
                    : 'bg-[rgba(239,68,68,0.12)] text-[#fca5a5]'
                }`}>
                  {rule.rule_type === 'ignore' ? 'Ignore' : 'Redact'}
                </span>
                <div className="text-xs text-[var(--text-muted)] truncate">
                  {rule.wm_class_pattern || '*'} · {rule.title_pattern || '*'}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                {deletingRuleId === rule.id ? (
                  <>
                    <span className="text-xs text-[var(--text-muted)]">Delete?</span>
                    <button onClick={() => confirmDeleteRule(rule.id)} className="text-xs text-[var(--danger)] hover:text-red-300 font-medium transition-colors">Yes</button>
                    <button onClick={() => setDeletingRuleId(null)} className="text-xs text-[var(--text-muted)] hover:text-white transition-colors">No</button>
                  </>
                ) : (
                  <button onClick={() => setDeletingRuleId(rule.id)} className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors p-1">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {rules.length === 0 && (
            <p className="text-sm text-[var(--text-muted)] py-2">No rules configured.</p>
          )}
        </div>
      </div>

      {/* ── Category Modal ── */}
      {showCatModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 rounded-[var(--radius)] w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">{editingCatId ? 'Edit Category' : 'Add Category'}</h2>
              <button onClick={() => { setShowCatModal(false); setEditingCatId(null); }} className="text-[var(--text-muted)] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveCat} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">Name *</label>
                <input type="text" required value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} className="glass-input px-3 py-2 text-sm" placeholder="e.g. Browser" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">App Pattern <span className="text-[var(--text-muted)] font-normal">(regex)</span></label>
                <input type="text" value={catForm.pattern} onChange={e => setCatForm({ ...catForm, pattern: e.target.value })} className="glass-input px-3 py-2 text-sm" placeholder="e.g. firefox|chrome" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">Title Pattern <span className="text-[var(--text-muted)] font-normal">(optional)</span></label>
                <input type="text" value={catForm.title_pattern} onChange={e => setCatForm({ ...catForm, title_pattern: e.target.value })} className="glass-input px-3 py-2 text-sm" placeholder="e.g. GitHub" />
              </div>
              <div className="flex gap-4">
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">Daily Goal <span className="text-[var(--text-muted)]">(min)</span></label>
                  <input type="number" min="0" value={catForm.goal_mins} onChange={e => setCatForm({ ...catForm, goal_mins: e.target.value })} className="glass-input px-3 py-2 text-sm" placeholder="0" />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">Daily Limit <span className="text-[var(--text-muted)]">(min)</span></label>
                  <input type="number" min="0" value={catForm.limit_mins} onChange={e => setCatForm({ ...catForm, limit_mins: e.target.value })} className="glass-input px-3 py-2 text-sm" placeholder="0" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={catForm.color} onChange={e => setCatForm({ ...catForm, color: e.target.value })} className="w-10 h-10 rounded-lg cursor-pointer border border-[var(--border-subtle)] bg-transparent" />
                  <span className="text-sm text-[var(--text-muted)] font-mono">{catForm.color}</span>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => { setShowCatModal(false); setEditingCatId(null); }} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">{editingCatId ? 'Update' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Rule Modal ── */}
      {showRuleModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 rounded-[var(--radius)] w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Add Privacy Rule</h2>
              <button onClick={() => setShowRuleModal(false)} className="text-[var(--text-muted)] hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveRule} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">Action</label>
                <select value={ruleForm.type} onChange={e => setRuleForm({ ...ruleForm, type: e.target.value })} className="glass-input px-3 py-2 text-sm">
                  <option value="ignore">Ignore — skip tracking entirely</option>
                  <option value="redact">Redact — track duration, hide title</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">App Pattern <span className="text-[var(--text-muted)] font-normal">(regex)</span></label>
                <input type="text" value={ruleForm.wm_class} onChange={e => setRuleForm({ ...ruleForm, wm_class: e.target.value })} className="glass-input px-3 py-2 text-sm" placeholder="e.g. signal|telegram" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-[var(--text-secondary)]">Title Pattern <span className="text-[var(--text-muted)] font-normal">(optional)</span></label>
                <input type="text" value={ruleForm.window_title} onChange={e => setRuleForm({ ...ruleForm, window_title: e.target.value })} className="glass-input px-3 py-2 text-sm" placeholder="e.g. Incognito" />
              </div>
              <div className="flex justify-end gap-2 mt-2">
                <button type="button" onClick={() => setShowRuleModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
