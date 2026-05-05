import React, { useState } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
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
      setMsg({ type: 'error', text: 'Please fill in all required fields.' });
      return;
    }
    if (new Date(end) <= new Date(start)) {
      setMsg({ type: 'error', text: 'End time must be after start time.' });
      return;
    }

    try {
      await fetchAPI('/api/events/manual', {
        method: 'POST',
        body: JSON.stringify({
          start_time: new Date(start).toISOString(),
          end_time: new Date(end).toISOString(),
          wm_class: app,
          title: title,
        }),
      });
      setMsg({ type: 'success', text: 'Activity logged successfully.' });
      setStart('');
      setEnd('');
      setApp('');
      setTitle('');
      if (onAdded) onAdded();
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to save activity.' });
    }
  };

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-5 pb-20 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Add Manual</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Log time away from the computer or missed tracking.</p>
      </div>

      <div className="glass-card p-5">
        {msg.text && (
          <div className={`mb-4 ${msg.type === 'error' ? 'feedback-error' : 'feedback-success'}`}>
            {msg.type === 'error'
              ? <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              : <CheckCircle size={15} className="flex-shrink-0 mt-0.5" />
            }
            {msg.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                Start <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="datetime-local"
                value={start}
                onChange={e => setStart(e.target.value)}
                required
                className="glass-input px-3 py-2 text-sm [color-scheme:dark]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">
                End <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="datetime-local"
                value={end}
                onChange={e => setEnd(e.target.value)}
                required
                className="glass-input px-3 py-2 text-sm [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">
              Application <span className="text-[var(--danger)]">*</span>
            </label>
            <input
              type="text"
              value={app}
              onChange={e => setApp(e.target.value)}
              required
              placeholder="e.g. Reading, Meeting, Focus"
              className="glass-input px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--text-secondary)]">
              Details <span className="text-[var(--text-muted)]">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Project brainstorm"
              className="glass-input px-3 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button type="submit" className="btn btn-primary px-5">
              Save Activity
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
