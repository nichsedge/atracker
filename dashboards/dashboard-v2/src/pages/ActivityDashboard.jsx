import { useMemo, useState, useCallback, Fragment } from 'react';
import { formatDuration, formatTime } from '../utils/formatters';
import { Plus, Calendar, Target, AlertCircle, RefreshCw } from 'lucide-react';
import ManualActivityModal from '../components/ManualActivityModal';
import DeviceFilterPill from '../components/DeviceFilterPill';

const NowTrackingCard = ({ currentApp }) => {
  if (!currentApp) {
    return (
      <div className="now-tracking-card-light idle">
        <div className="pulse-dot" style={{ width: 12, height: 12, borderRadius: '50%', background: '#94a3b8', marginBottom: '0.75rem', opacity: 0.5 }}></div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>System Idle</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', opacity: 0.6, marginTop: '0.25rem' }}>No activity is currently being recorded</p>
      </div>
    );
  }

  const getAppIcon = (wm_class = '') => {
    const lower = wm_class.toLowerCase();
    if (lower.includes('chrome') || lower.includes('firefox') || lower.includes('browser') || lower.includes('safari') || lower.includes('brave')) return '🌐';
    if (lower.includes('terminal') || lower.includes('code') || lower.includes('kitty') || lower.includes('alacritty') || lower.includes('tmux') || lower.includes('nvim')) return '💻';
    if (lower.includes('slack') || lower.includes('discord') || lower.includes('signal') || lower.includes('telegram') || lower.includes('chat')) return '💬';
    if (lower.includes('spotify') || lower.includes('music') || lower.includes('player')) return '🎵';
    if (lower.includes('system') || lower.includes('setting')) return '⚙️';
    if (lower.includes('figma') || lower.includes('gimp') || lower.includes('inkscape') || lower.includes('paint')) return '🎨';
    return '📱';
  };

  return (
    <div className="now-tracking-card-light glow">
      <div className="live-badge">
        <span className="live-pulse-dot"></span>
        LIVE
        <span className="live-badge-divider">|</span>
        <span className="live-badge-time">SINCE {formatTime(currentApp.timestamp)}</span>
      </div>
      <div className="now-tracking-content">
        <div className="app-icon-large">
          {getAppIcon(currentApp.wm_class)}
        </div>
        <div className="app-details">
          <h3 className="app-title-text">
            {currentApp.wm_class}
          </h3>
          <p className="app-subtitle-text" title={currentApp.title}>
            {currentApp.title}
          </p>
        </div>
      </div>
    </div>
  );
};

const ActivityDashboard = ({ 
  summary = [], 
  timeline = [], 
  currentApp, 
  date, 
  setDate, 
  loading, 
  categories = [], 
  submitManualEvent,
  devices = [],
  selectedDevices = [],
  setSelectedDevices
}) => {
  const [expandedCategories, setExpandedCategories] = useState({});
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: null });
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  const totalTracked = useMemo(() => {
    if (!Array.isArray(summary)) return 0;
    return summary.reduce((acc, curr) => acc + (curr.total_secs || 0), 0);
  }, [summary]);

  const categoryBreakdown = useMemo(() => {
    const groups = {};
    (summary || []).forEach(item => {
      if (!item) return;
      const cat = item.category_name || 'Uncategorized';
      if (!groups[cat]) {
        groups[cat] = { name: cat, color: item.color || '#64748b', total_secs: 0, apps: [] };
      }
      groups[cat].total_secs += (item.total_secs || 0);
      groups[cat].apps.push(item);
    });
    return Object.values(groups).sort((a, b) => b.total_secs - a.total_secs);
  }, [summary]);

  const goals = useMemo(() => {
    if (!Array.isArray(categories) || !Array.isArray(summary)) return [];
    return categories.filter(c => c.daily_goal_secs > 0 || c.daily_limit_secs > 0).map(cat => {
      const usageItems = summary.filter(s => s.category_name === cat.name);
      const usageSecs = usageItems.reduce((acc, curr) => acc + curr.total_secs, 0);
      const isGoal = cat.daily_goal_secs > 0;
      const targetSecs = isGoal ? cat.daily_goal_secs : cat.daily_limit_secs;
      const pct = Math.min(100, (usageSecs / targetSecs * 100));
      return {
        ...cat,
        usageSecs,
        targetSecs,
        pct,
        isGoal,
        isOverLimit: !isGoal && usageSecs > cat.daily_limit_secs
      };
    });
  }, [categories, summary]);

  const timelineLabels = useMemo(() => {
    const labels = [];
    for (let i = 0; i <= 24; i += 2) {
      labels.push({ label: `${i}:00`, hour: i });
    }
    return labels;
  }, []);

  const toggleCategory = (catName) => {
    setExpandedCategories(prev => ({ ...prev, [catName]: !prev[catName] }));
  };

  const showTooltipForBlock = (e, block) => {
    if (block.is_idle) return;
    const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : window.innerWidth / 2);
    const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 100);
    setTooltip({
      visible: true,
      x: Math.min(Math.max(clientX, 80), window.innerWidth - 80),
      y: Math.max(clientY - 30, 40),
      content: (
        <div className="custom-tooltip">
          <strong>{block.wm_class}</strong>
          <p className="tooltip-time">{formatTime(block.timestamp)} — {formatTime(block.end_timestamp)} ({formatDuration(block.duration_secs || 0)})</p>
        </div>
      )
    });
  };

  // Pre-calculate app colors for fast lookup in timeline
  const appColorMap = useMemo(() => {
    const map = {};
    if (Array.isArray(categoryBreakdown)) {
      categoryBreakdown.forEach(cat => {
        if (cat.apps) {
          cat.apps.forEach(app => {
            map[app.wm_class] = app.color || cat.color;
          });
        }
      });
    }
    return map;
  }, [categoryBreakdown]);

  const getBlockStyles = useCallback((block) => {
    const start = new Date(block.timestamp);
    if (isNaN(start.getTime())) return { display: 'none' };
    
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);

    const diffMs = start.getTime() - dayStart.getTime();
    const startPct = (diffMs / (24 * 60 * 60 * 1000)) * 100;
    const durationPct = ((block.duration_secs || 1) / (24 * 60 * 60)) * 100;

    const blockColor = block.is_idle ? 'transparent' : (block.color || appColorMap[block.wm_class] || '#3b82f6');

    return {
      left: `${startPct}%`,
      width: `${Math.max(durationPct, 0.1)}%`,
      backgroundColor: blockColor,
      zIndex: block.duration_secs > 3600 ? 1 : 2
    };
  }, [appColorMap]);

  // Only show full loading if we have no data at all
  const isInitialLoad = loading && summary.length === 0 && timeline.length === 0 && Array.isArray(categories) && categories.length === 0;

  if (isInitialLoad) {
    return (
      <div className="loading-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '80vh', gap: '1rem' }}>
        <div style={{ fontSize: '1.2rem', color: '#64748b', fontWeight: 600 }}>Loading track records...</div>
        <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Establishing connection to Atracker service</p>
      </div>
    );
  }

  return (
    <div className="view-content fade-in">
      <header className="main-header">
        <div className="header-title">
          <h1 className="page-heading">Activity Dashboard</h1>
          <div className="header-meta">
            <div className="date-picker-pill">
              <Calendar size={16} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
              <input 
                type="date" 
                value={date} 
                onChange={e => {
                  if (e.target.value) setDate(e.target.value);
                }}
                style={{ background: 'none', border: 'none', outline: 'none', fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}
              />
            </div>

            <DeviceFilterPill 
              devices={devices} 
              selectedDevices={selectedDevices} 
              setSelectedDevices={setSelectedDevices} 
            />

            <div className="total-time-pill">
              {loading && <RefreshCw size={14} className="spin" style={{ marginRight: 6 }} />}
              {formatDuration(totalTracked)} tracked
            </div>
          </div>
        </div>
        <button className="btn-primary log-activity-btn" onClick={() => setIsManualModalOpen(true)}>
          <Plus size={18} /> <span>Log Activity</span>
        </button>
      </header>

      <div className={`dashboard-grid ${goals.length > 0 ? 'has-goals' : ''}`}>
        <div className="main-column">
          <section className="glass-card now-tracking-section" style={{ margin: 0 }}>
            <div className="section-label">NOW TRACKING</div>
            <NowTrackingCard currentApp={currentApp} />
          </section>

          <section className="glass-card" style={{ margin: 0 }}>
            <div className="section-label">TIMELINE</div>
            <div className="timeline-outer">
              <div className="timeline-labels">
                {timelineLabels.map(l => (
                  <span key={l.hour} className={`timeline-label-tick ${l.hour % 6 === 0 ? 'major' : (l.hour % 4 === 0 ? 'medium' : 'minor')}`}>
                    {l.label}
                  </span>
                ))}
              </div>
              <div className="timeline-track">
                {timeline.length === 0 && <div className="timeline-empty" style={{ background: 'transparent' }}>No activity recorded for this day</div>}
                {timeline.map((block, i) => (
                  <div 
                    key={i} 
                    className="timeline-block-absolute"
                    onMouseMove={(e) => showTooltipForBlock(e, block)}
                    onClick={(e) => showTooltipForBlock(e, block)}
                    onTouchStart={(e) => showTooltipForBlock(e, block)}
                    onMouseLeave={() => setTooltip({ ...tooltip, visible: false })}
                    style={getBlockStyles(block)}
                  ></div>
                ))}
              </div>
            </div>
          </section>

          <section className="glass-card" style={{ margin: 0 }}>
            <div className="section-label">APP USAGE</div>
            <div className="usage-table-modern">
              {summary.length === 0 && <div className="empty-container" style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem 0' }}>No activity recorded for {date}</div>}
              {categoryBreakdown.map((cat, i) => (
                <Fragment key={i}>
                  <div className="usage-row-modern" onClick={() => toggleCategory(cat.name)}>
                    <span className={`expand-icon ${expandedCategories[cat.name] ? 'open' : ''}`}>›</span>
                    <div className="cat-dot" style={{ backgroundColor: cat.color, width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0, boxShadow: `0 0 10px ${cat.color}66` }}></div>
                    <div className="cat-name">{cat.name}</div>
                    <div className="cat-progress-track">
                      <div className="cat-progress-fill" style={{ width: `${(cat.total_secs / totalTracked) * 100}%`, backgroundColor: cat.color, height: '100%', borderRadius: '5px', boxShadow: `0 0 8px ${cat.color}55` }}></div>
                    </div>
                    <div className="cat-time">{formatDuration(cat.total_secs)}</div>
                  </div>
                  {expandedCategories[cat.name] && cat.apps.map((app, j) => (
                    <div key={`${i}-${j}`} className="app-detail-row-modern">
                      <div className="app-name-cell">
                        <div className="app-name-title">
                          <span style={{ color: 'var(--text-secondary)', opacity: 0.3 }}>└</span> {app.wm_class}
                        </div>
                        {app.title && <div className="app-name-subtitle">{app.title}</div>}
                      </div>
                      <div className="app-time-cell">{formatDuration(app.total_secs)}</div>
                    </div>
                  ))}
                </Fragment>
              ))}
            </div>
          </section>
        </div>

        {goals.length > 0 && (
          <aside className="goals-column">
            <section className="glass-card" style={{ margin: 0 }}>
              <div className="section-label">GOALS & LIMITS</div>
              <div className="goals-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {goals.map(goal => (
                  <div key={goal.id} className="goal-item">
                    <div className="goal-info" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontFamily: "'Outfit', sans-serif" }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: goal.color, boxShadow: `0 0 8px ${goal.color}aa` }}></div>
                        {goal.name}
                      </div>
                      <div style={{ color: goal.isOverLimit ? '#ef4444' : 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {goal.isGoal ? <Target size={14} style={{ color: goal.pct >= 100 ? '#10b981' : 'var(--accent-color)' }} /> : <AlertCircle size={14} style={{ color: goal.isOverLimit ? '#ef4444' : 'var(--text-secondary)' }} />}
                        {Math.round(goal.pct)}%
                      </div>
                    </div>
                    <div className="goal-progress" style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', borderRadius: 4, overflow: 'hidden', marginBottom: '0.25rem' }}>
                      <div style={{ height: '100%', width: `${goal.pct}%`, backgroundColor: goal.isOverLimit ? '#ef4444' : (goal.pct >= 100 && goal.isGoal ? '#10b981' : goal.color), borderRadius: 4, boxShadow: `0 0 10px ${goal.isOverLimit ? '#ef4444' : goal.color}44` }}></div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', opacity: 0.8 }}>
                      <span>{formatDuration(goal.usageSecs)}</span>
                      <span>{goal.isGoal ? 'Goal' : 'Limit'}: {formatDuration(goal.targetSecs)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        )}
      </div>

      {tooltip.visible && (
        <div className="floating-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.content}
        </div>
      )}

      <ManualActivityModal 
        isOpen={isManualModalOpen} 
        onClose={() => setIsManualModalOpen(false)} 
        categories={categories}
        onSubmit={submitManualEvent}
      />
    </div>
  );
};

export default ActivityDashboard;
