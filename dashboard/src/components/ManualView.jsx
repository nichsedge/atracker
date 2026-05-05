import React, { useState } from 'react';
import { fetchAPI } from '../api';

export default function ManualView({ onAdded }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [app, setApp] = useState('');
  const [title, setTitle] = useState('');
  const [msg, setMsg] = useState({ type: '', text: '' });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });

    if (!start || !end || !app) {
      setMsg({ type: 'error', text: 'Please fill in all required fields' });
      return;
    }

    try {
      await fetchAPI('/api/events/manual', {
        method: 'POST',
        body: JSON.stringify({
          start_time: new Date(start).toISOString(),
          end_time: new Date(end).toISOString(),
          wm_class: app,
          window_title: title
        })
      });
      setMsg({ type: 'success', text: 'Manual activity logged successfully!' });
      setStart('');
      setEnd('');
      setApp('');
      setTitle('');
      if (onAdded) onAdded();
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to save activity' });
    }
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6 pb-20">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white">Add Manual</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Log time away from the computer or missed tracking.</p>
      </div>
      <div className="glass-card p-6">
        {msg.text && (
          <div className={`p-3 mb-4 rounded text-sm ${msg.type === 'error' ? 'bg-[rgba(239,68,68,0.1)] text-[#fca5a5] border border-[rgba(239,68,68,0.2)]' : 'bg-[rgba(16,185,129,0.1)] text-[#6ee7b7] border border-[rgba(16,185,129,0.2)]'}`}>
            {msg.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]">Start Date & Time *</label>
            <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} required className="glass-input px-3 py-2 [color-scheme:dark]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]">End Date & Time *</label>
            <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} required className="glass-input px-3 py-2 [color-scheme:dark]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]">Application Name *</label>
            <input type="text" value={app} onChange={e => setApp(e.target.value)} required className="glass-input px-3 py-2" placeholder="e.g. Reading, Meeting" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-[var(--text-secondary)]">Window Title Details (Optional)</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} className="glass-input px-3 py-2" placeholder="e.g. Project brainstorm" />
          </div>
          <button type="submit" className="btn btn-primary mt-2 self-start">Save Activity</button>
        </form>
      </div>
    </div>
  );
}
