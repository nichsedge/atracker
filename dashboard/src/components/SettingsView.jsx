import React, { useState, useEffect, useRef } from 'react';
import { fetchAPI } from '../api';

export default function SettingsView() {
  const [settings, setSettings] = useState({ poll_interval: 5, idle_threshold: 120, min_app_usage: 5 });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [categories, setCategories] = useState([]);
  const [rules, setRules] = useState([]);
  const [showCatModal, setShowCatModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);

  const [catForm, setCatForm] = useState({ name: '', pattern: '', title_pattern: '', color: '#3b82f6', case_sensitive: false, goal_mins: '', limit_mins: '' });
  const [ruleForm, setRuleForm] = useState({ type: 'ignore', wm_class: '', window_title: '' });
  const [notificationPermission, setNotificationPermission] = useState(Notification.permission);

  const fileInputRef = useRef(null);

  const fetchSettingsAndCategories = async () => {
    try {
      const res = await fetchAPI('/api/settings');
      setSettings({
        poll_interval: res.poll_interval || 5,
        idle_threshold: res.idle_threshold || 120,
        min_app_usage: res.min_app_usage || 5
      });
      const catRes = await fetchAPI('/api/categories');
      setCategories(catRes.categories || []);
      const rulesRes = await fetchAPI('/api/rules');
      setRules(rulesRes.rules || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSettingsAndCategories();
  }, []);

  const handleSaveTuning = async (e) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    try {
      await fetchAPI('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      setMsg({ type: 'success', text: 'Tuning settings saved.' });
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to save settings' });
    }
  };

  const handleSaveCat = async (e) => {
    e.preventDefault();
    try {
      await fetchAPI('/api/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: catForm.name,
          wm_class_pattern: catForm.pattern || '',
          title_pattern: catForm.title_pattern || '',
          color: catForm.color,
          is_case_sensitive: catForm.case_sensitive,
          daily_goal_secs: catForm.goal_mins ? parseInt(catForm.goal_mins) * 60 : 0,
          daily_limit_secs: catForm.limit_mins ? parseInt(catForm.limit_mins) * 60 : 0
        })
      });
      setShowCatModal(false);
      fetchSettingsAndCategories();
    } catch (err) {
      alert('Failed to save category: ' + err.message);
    }
  };

  const deleteCategory = async (id) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      await fetchAPI(`/api/categories/${id}`, { method: 'DELETE' });
      fetchSettingsAndCategories();
    } catch (err) {
      alert('Failed to delete category');
    }
  };

  const handleExportCategories = async () => {
    try {
      const res = await fetchAPI('/api/categories/export');
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('hidden', '');
      a.setAttribute('href', url);
      a.setAttribute('download', 'atracker_categories.json');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to export categories', err);
    }
  };

  const handleImportCategories = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const replace = confirm('Replace existing categories? (Cancel to append)');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const url = new URL(window.location.origin + '/api/categories/import');
        url.searchParams.append('replace', replace);

        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categories: data })
        });
        fetchSettingsAndCategories();
        alert('Categories imported successfully.');
      } catch (err) {
        alert('Import failed: ' + err.message);
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
          title_pattern: ruleForm.window_title
        })
      });
      setShowRuleModal(false);
      fetchSettingsAndCategories();
    } catch (err) {
      alert('Failed to save rule: ' + err.message);
    }
  };

  const deleteRule = async (id) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      await fetchAPI(`/api/rules/${id}`, { method: 'DELETE' });
      fetchSettingsAndCategories();
    } catch (err) {
      alert('Failed to delete rule');
    }
  };

  const requestNotificationPermission = async () => {
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    } catch (err) {
      console.error('Failed to request notification permission', err);
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Settings</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Configure tracker and dashboard experience.</p>
      </div>

      <div className="glass-card p-6">
        <div className="text-[12px] uppercase font-bold text-[var(--text-muted)] tracking-wider mb-4">General</div>
        <p className="text-sm text-[var(--text-secondary)] mb-4">Manage dashboard experience and alerts.</p>
        {notificationPermission !== 'granted' && (
          <button onClick={requestNotificationPermission} className="btn btn-secondary">Enable Desktop Notifications</button>
        )}
        {notificationPermission === 'granted' && (
           <p className="text-sm text-[var(--success)]">Desktop notifications enabled.</p>
        )}
      </div>

      <div className="glass-card p-6">
        <div className="text-[12px] uppercase font-bold text-[var(--text-muted)] tracking-wider mb-4">Tuning</div>
        <p className="text-sm text-[var(--text-secondary)] mb-4">Configure how often the tracker polls for activity and when it considers you idle.</p>

        {msg.text && (
          <div className={`p-3 mb-4 rounded text-sm ${msg.type === 'error' ? 'bg-[rgba(239,68,68,0.1)] text-[#fca5a5] border border-[rgba(239,68,68,0.2)]' : 'bg-[rgba(16,185,129,0.1)] text-[#6ee7b7] border border-[rgba(16,185,129,0.2)]'}`}>
            {msg.text}
          </div>
        )}

        <form onSubmit={handleSaveTuning} className="flex flex-col gap-4 max-w-md">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]">Poll Interval (seconds)</label>
            <input
              type="number" min="1" max="60" required
              value={settings.poll_interval}
              onChange={e => setSettings({...settings, poll_interval: parseInt(e.target.value)})}
              className="glass-input px-3 py-2 w-32"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]">Idle Threshold (seconds)</label>
            <input
              type="number" min="10" max="3600" required
              value={settings.idle_threshold}
              onChange={e => setSettings({...settings, idle_threshold: parseInt(e.target.value)})}
              className="glass-input px-3 py-2 w-32"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]">Min App Usage (seconds)</label>
            <input
              type="number" min="0" required
              value={settings.min_app_usage}
              onChange={e => setSettings({...settings, min_app_usage: parseInt(e.target.value)})}
              className="glass-input px-3 py-2 w-32"
            />
          </div>
          <button type="submit" className="btn btn-primary mt-2 self-start">Save Tuning</button>
        </form>
      </div>

      <div className="glass-card p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="text-[12px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Categories</div>
          <div className="flex gap-2">
            <button onClick={() => { setCatForm({ name: '', pattern: '', title_pattern: '', color: '#3b82f6', case_sensitive: false, goal_mins: '', limit_mins: '' }); setShowCatModal(true); }} className="btn btn-primary py-1.5">Add Category</button>
            <button onClick={handleExportCategories} className="btn btn-secondary py-1.5">Export</button>
            <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary py-1.5">Import</button>
            <input type="file" ref={fileInputRef} onChange={handleImportCategories} accept=".json" className="hidden" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center justify-between p-3 rounded bg-[rgba(255,255,255,0.02)] border border-[var(--border-subtle)]">
              <div className="flex items-center gap-3">
                 <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color }}></div>
                 <div className="flex flex-col">
                    <span className="font-medium text-white">{cat.name}</span>
                    <span className="text-xs text-[var(--text-muted)]">{cat.wm_class_pattern || '*'}</span>
                 </div>
              </div>
              <button onClick={() => deleteCategory(cat.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
            </div>
          ))}
          {categories.length === 0 && <div className="text-sm text-[var(--text-muted)]">No categories found.</div>}
        </div>
      </div>

      <div className="glass-card p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="text-[12px] uppercase font-bold text-[var(--text-muted)] tracking-wider">Privacy & Filters</div>
          <button onClick={() => { setRuleForm({ type: 'ignore', wm_class: '', window_title: '' }); setShowRuleModal(true); }} className="btn btn-primary py-1.5">Add Rule</button>
        </div>
        <div className="flex flex-col gap-2">
          {rules.map(rule => (
            <div key={rule.id} className="flex items-center justify-between p-3 rounded bg-[rgba(255,255,255,0.02)] border border-[var(--border-subtle)]">
              <div className="flex flex-col">
                 <span className="font-medium text-white">{rule.rule_type === 'ignore' ? 'Ignore' : 'Redact'}</span>
                 <span className="text-xs text-[var(--text-muted)]">App: {rule.wm_class_pattern || '*'} | Title: {rule.title_pattern || '*'}</span>
              </div>
              <button onClick={() => deleteRule(rule.id)} className="text-red-400 hover:text-red-300 text-xs">Delete</button>
            </div>
          ))}
          {rules.length === 0 && <div className="text-sm text-[var(--text-muted)]">No rules found.</div>}
        </div>
      </div>

      {showCatModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 rounded-xl w-full max-w-md shadow-2xl">
              <h2 className="text-xl font-bold mb-4">Add Category</h2>
              <form onSubmit={handleSaveCat} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Name</label>
                  <input type="text" required value={catForm.name} onChange={e => setCatForm({...catForm, name: e.target.value})} className="glass-input px-3 py-2" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">App Pattern (Regex)</label>
                  <input type="text" value={catForm.pattern} onChange={e => setCatForm({...catForm, pattern: e.target.value})} className="glass-input px-3 py-2" placeholder="e.g. firefox|chrome" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Color</label>
                  <input type="color" value={catForm.color} onChange={e => setCatForm({...catForm, color: e.target.value})} className="h-10 w-full rounded cursor-pointer" />
                </div>
                <div className="flex gap-4">
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-sm font-medium">Daily Goal (mins)</label>
                    <input type="number" min="0" value={catForm.goal_mins} onChange={e => setCatForm({...catForm, goal_mins: e.target.value})} className="glass-input px-3 py-2" />
                  </div>
                  <div className="flex flex-col gap-1.5 flex-1">
                    <label className="text-sm font-medium">Daily Limit (mins)</label>
                    <input type="number" min="0" value={catForm.limit_mins} onChange={e => setCatForm({...catForm, limit_mins: e.target.value})} className="glass-input px-3 py-2" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setShowCatModal(false)} className="btn btn-secondary">Cancel</button>
                  <button type="submit" className="btn btn-primary">Save</button>
                </div>
              </form>
           </div>
        </div>
      )}

      {showRuleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
           <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 rounded-xl w-full max-w-md shadow-2xl">
              <h2 className="text-xl font-bold mb-4">Add Privacy Rule</h2>
              <form onSubmit={handleSaveRule} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Action</label>
                  <select value={ruleForm.type} onChange={e => setRuleForm({...ruleForm, type: e.target.value})} className="glass-input px-3 py-2">
                    <option value="ignore">Ignore</option>
                    <option value="redact">Redact</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">App Pattern (Regex)</label>
                  <input type="text" value={ruleForm.wm_class} onChange={e => setRuleForm({...ruleForm, wm_class: e.target.value})} className="glass-input px-3 py-2" placeholder="e.g. firefox|chrome" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Title Pattern (Regex)</label>
                  <input type="text" value={ruleForm.window_title} onChange={e => setRuleForm({...ruleForm, window_title: e.target.value})} className="glass-input px-3 py-2" placeholder="e.g. Incognito" />
                </div>
                <div className="flex justify-end gap-2 mt-4">
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
