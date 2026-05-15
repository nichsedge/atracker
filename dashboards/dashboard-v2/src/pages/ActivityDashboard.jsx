import { useMemo, useState, useEffect, useCallback, Fragment } from 'react';
import { formatDuration, formatTime } from '../utils/formatters';
import { Plus, Calendar, Target, AlertCircle, RefreshCw } from 'lucide-react';
import Flatpickr from 'react-flatpickr';
import 'flatpickr/dist/themes/light.css';
import ManualActivityModal from '../components/ManualActivityModal';

const ActivityDashboard = ({ summary = [], timeline = [], currentApp, date, setDate, loading, categories = [], submitManualEvent }) => {
  const [expandedCategories, setExpandedCategories] = useState({});
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: null });
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [localElapsed, setLocalElapsed] = useState(0);

  useEffect(() => {
    if (!currentApp || currentApp.is_idle) {
      setLocalElapsed(0);
      return;
    }

    const start = new Date(currentApp.timestamp).getTime();
    const update = () => {
      const now = Date.now();
      setLocalElapsed(Math.floor((now - start) / 1000));
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [currentApp]);

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
      labels.push(`${i}:00`);
    }
    return labels;
  }, []);

  const toggleCategory = (catName) => {
    setExpandedCategories(prev => ({ ...prev, [catName]: !prev[catName] }));
  };

  const handleTimelineHover = (e, block) => {
    if (block.is_idle) return;
    setTooltip({
      visible: true,
      x: e.clientX,
      y: e.clientY - 20,
      content: (
        <div className="custom-tooltip">
          <strong>{block.wm_class}</strong>
          <p className="tooltip-time">{formatTime(block.timestamp)} — {formatTime(block.end_timestamp)} ({formatDuration(block.duration_secs || 0)})</p>
        </div>
      )
    });
  };

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

  return (
    <div className="view-content fade-in">
      <header className="main-header">
        <div className="header-title">
          <h1>Activity Dashboard</h1>
          <div className="header-meta">
            <div className="date-picker-pill" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={16} />
                <Flatpickr 
                    value={date} 
                    onChange={([d]) => {
                      if (d) {
                        const localDate = d.toLocaleDateString('en-CA');
                        setDate(localDate);
                      }
                    }}
                    options={{
                      altInput: true,
                      altFormat: "F j, Y",
                      dateFormat: "Y-m-d",
                      disableMobile: true
                    }}
                    className="flatpickr-input-custom"
                />
            </div>
            <div className="total-time-pill">
              {loading && <RefreshCw size={14} className="spin" style={{ marginRight: 6 }} />}
              {formatDuration(totalTracked)} tracked
            </div>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setIsManualModalOpen(true)}>
          <Plus size={18} /> Log Activity
        </button>
      </header>

      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: goals.length > 0 ? '2fr 1fr' : '1fr', gap: '1.5rem' }}>
        <div className="main-column" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <section className="glass-card now-tracking-section">
            <div className="section-label">NOW TRACKING</div>
            {currentApp ? (
              <div className="now-tracking-card-light">
                <div className="app-icon-large">🌐</div>
                <div className="app-details">
                  <h3>{currentApp.wm_class}</h3>
                  <p>{currentApp.title}</p>
                </div>
                <div className="now-tracking-timer">{formatDuration(localElapsed)}</div>
                </div>
            ) : (
              <div className="now-tracking-card-light idle"><h3>System Idle</h3></div>
            )}
          </section>

          <section className="glass-card">
            <div className="section-label">TIMELINE</div>
            <div className="timeline-outer">
              <div className="timeline-labels">
                {timelineLabels.map(l => <span key={l}>{l}</span>)}
              </div>
              <div className="timeline-track">
                {timeline.length === 0 && <div className="timeline-empty">No activity recorded for this day</div>}
                {timeline.map((block, i) => (
                  <div 
                    key={i} 
                    className="timeline-block-absolute"
                    onMouseMove={(e) => handleTimelineHover(e, block)}
                    onMouseLeave={() => setTooltip({ ...tooltip, visible: false })}
                    style={getBlockStyles(block)}
                  ></div>
                ))}
              </div>
            </div>
          </section>

          <section className="glass-card">
            <div className="section-label">APP USAGE</div>
            <div className="usage-table-modern">
              {summary.length === 0 && <div className="empty-container">No activity recorded for {date}</div>}
              {categoryBreakdown.map((cat, i) => (
                <Fragment key={i}>
                  <div className="usage-row-modern" onClick={() => toggleCategory(cat.name)} style={{ cursor: 'pointer' }}>
                    <span className={`expand-icon ${expandedCategories[cat.name] ? 'open' : ''}`} style={{ transition: 'transform 0.2s', display: 'inline-block', transform: expandedCategories[cat.name] ? 'rotate(90deg)' : 'none' }}>›</span>
                    <div className="cat-dot" style={{ backgroundColor: cat.color, width: '12px', height: '12px', borderRadius: '50%' }}></div>
                    <div className="cat-name">{cat.name}</div>
                    <div className="cat-progress-track">
                      <div className="cat-progress-fill" style={{ width: `${(cat.total_secs / totalTracked) * 100}%`, backgroundColor: cat.color }}></div>
                    </div>
                    <div className="cat-time">{formatDuration(cat.total_secs)}</div>
                  </div>
                  {expandedCategories[cat.name] && cat.apps.map((app, j) => (
                    <div key={`${i}-${j}`} className="app-detail-row-modern" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 0 0.75rem 3rem', borderBottom: '1px solid #f8fafc', fontSize: '0.9rem' }}>
                      <div className="app-name-cell">
                        <div style={{ fontWeight: 500 }}>{app.wm_class}</div>
                        {app.title && <div style={{ fontSize: '0.75rem', color: '#94a3b8', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.title}</div>}
                      </div>
                      <div className="app-time-cell" style={{ fontWeight: 600, color: '#64748b' }}>{formatDuration(app.total_secs)}</div>
                    </div>
                  ))}
                </Fragment>
              ))}
            </div>
          </section>
        </div>

        {goals.length > 0 && (
          <aside className="goals-column">
            <section className="glass-card">
              <div className="section-label">GOALS & LIMITS</div>
              <div className="goals-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {goals.map(goal => (
                  <div key={goal.id} className="goal-item">
                    <div className="goal-info" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem' }}>
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: goal.color }}></div>
                        {goal.name}
                      </div>
                      <div style={{ color: goal.isOverLimit ? '#ef4444' : '#64748b', fontWeight: 600 }}>
                        {goal.isGoal ? <Target size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} /> : <AlertCircle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />}
                        {Math.round(goal.pct)}%
                      </div>
                    </div>
                    <div className="goal-progress" style={{ height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, overflow: 'hidden', marginBottom: '0.25rem' }}>
                      <div style={{ height: '100%', width: `${goal.pct}%`, backgroundColor: goal.isOverLimit ? '#ef4444' : (goal.pct >= 100 && goal.isGoal ? '#10b981' : goal.color), borderRadius: 4 }}></div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', justifyContent: 'space-between' }}>
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
