import { useMemo, useState, Fragment } from 'react';
import { formatDuration, formatTime } from '../utils/formatters';

const ActivityDashboard = ({ summary = [], timeline = [], currentApp, date, loading }) => {
  const [expandedCategories, setExpandedCategories] = useState({});
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: null });

  const totalTracked = useMemo(() => {
    return (summary || []).reduce((acc, curr) => acc + (curr.total_secs || 0), 0);
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

  if (loading) return <div className="loading-container">Loading track records...</div>;
  if (!summary || summary.length === 0) return <div className="empty-container">No activity recorded for {date}</div>;

  const getBlockStyles = (block) => {
    const start = new Date(block.timestamp);
    if (isNaN(start.getTime())) return { display: 'none' };
    
    // Get start of the day for this specific block
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);

    const diffMs = start.getTime() - dayStart.getTime();
    const startPct = (diffMs / (24 * 60 * 60 * 1000)) * 100;
    const durationPct = ((block.duration_secs || 1) / (24 * 60 * 60)) * 100;

    const cat = categoryBreakdown.find(c => c.apps.some(a => a.wm_class === block.wm_class));
    const blockColor = block.is_idle ? 'transparent' : (cat?.color || '#3b82f6');

    return {
      left: `${startPct}%`,
      width: `${Math.max(durationPct, 0.1)}%`,
      backgroundColor: blockColor,
      zIndex: block.duration_secs > 3600 ? 1 : 2
    };
  };

  return (
    <div className="view-content fade-in">
      <header className="main-header" style={{ padding: '1rem 2rem', borderBottom: '1px solid var(--border-color)', background: '#fff' }}>
        <div className="header-title">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>Activity</h1>
          <div className="header-meta">
            <div className="date-picker-pill">{new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            <div className="total-time-pill">{formatDuration(totalTracked)} tracked</div>
          </div>
        </div>
      </header>

      <div className="dashboard-grid" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <section className="glass-card now-tracking-section">
          <div className="section-label">NOW TRACKING</div>
          {currentApp ? (
            <div className="now-tracking-card-light">
              <div className="app-icon-large">🌐</div>
              <div className="app-details">
                <h3>{currentApp.wm_class}</h3>
                <p>{currentApp.title}</p>
              </div>
              <div className="now-tracking-timer">{formatDuration(currentApp.duration_secs || 0)}</div>
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
            {categoryBreakdown.map((cat, i) => (
              <Fragment key={i}>
                <div className="usage-row-modern" onClick={() => toggleCategory(cat.name)}>
                  <span className={`expand-icon ${expandedCategories[cat.name] ? 'open' : ''}`}>›</span>
                  <div className="cat-dot" style={{ backgroundColor: cat.color }}></div>
                  <div className="cat-name">{cat.name}</div>
                  <div className="cat-progress-track">
                    <div className="cat-progress-fill" style={{ width: `${(cat.total_secs / totalTracked) * 100}%`, backgroundColor: cat.color }}></div>
                  </div>
                  <div className="cat-time">{formatDuration(cat.total_secs)}</div>
                </div>
                {expandedCategories[cat.name] && cat.apps.map((app, j) => (
                  <div key={`${i}-${j}`} className="app-detail-row-modern">
                    <div className="app-name-cell">{app.wm_class}</div>
                    <div className="app-time-cell">{formatDuration(app.total_secs)}</div>
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </section>
      </div>

      {tooltip.visible && (
        <div className="floating-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.content}
        </div>
      )}
    </div>
  );
};

export default ActivityDashboard;
