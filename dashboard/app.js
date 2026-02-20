/* ============================================================
   atracker — Dashboard Client
   ============================================================ */

const API = '';  // Same origin
// REFRESH_INTERVAL removed in favor of WebSockets

// State
let currentView = 'today';
let ws = null;
let reconnectTimer = null;

// ============ Init ============

document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupCategoryEvents();
    setupSettingsEvents();
    setCurrentDate();
    loadView('today');
    initWebSocket();
    initPauseControls();
    checkNotificationPermission();
});



// ============ Navigation ============

function setupNavigation() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const view = link.dataset.view;
            switchView(view);
        });
    });

    document.getElementById('history-period')?.addEventListener('change', (e) => {
        const customControls = document.getElementById('custom-range-controls');
        if (e.target.value === 'custom') {
            customControls.style.display = 'flex';
        } else {
            customControls.style.display = 'none';
            loadHistory();
        }
    });

    document.getElementById('btn-apply-range')?.addEventListener('click', () => {
        loadHistory();
    });

    document.getElementById('btn-export-range')?.addEventListener('click', () => {
        exportRange();
    });

    document.getElementById('btn-close-comparison')?.addEventListener('click', () => {
        document.getElementById('comparison-card').style.display = 'none';
    });
}

function switchView(view) {
    currentView = view;

    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelector(`[data-view="${view}"]`)?.classList.add('active');

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`)?.classList.add('active');

    loadView(view);
}

function loadView(view) {
    switch (view) {
        case 'today':
            loadToday();
            break;
        case 'history':
            loadHistory();
            break;
        case 'settings':
            loadSettings();
            loadPrivacyRules();
            break;
    }
}


// ============ Today View ============

async function loadToday() {
    try {
        const [summaryRes, timelineRes, statusRes, metricsRes] = await Promise.all([
            fetchAPI('/api/summary'),
            fetchAPI('/api/timeline'),
            fetchAPI('/api/status'),
            fetchAPI('/api/metrics'),
        ]);

        updateDaemonStatus(true);
        renderSummary(summaryRes.summary);
        renderTimeline(timelineRes.timeline);
        updateTotalTracked(summaryRes.summary);
        updateNowTracking(timelineRes.timeline);
        renderMetrics(metricsRes);
        renderGoals(summaryRes.summary);

        // Setup initial pause button visibility
        const pauseRes = await fetchAPI('/api/pause_status');
        updatePauseUI(pauseRes.is_paused);
    } catch (err) {
        console.error('Failed to load today:', err);
        updateDaemonStatus(false);
    }
}

function renderMetrics(metrics) {
    const focusEl = document.getElementById('focus-score');
    const switchEl = document.getElementById('context-switches');
    if (focusEl) focusEl.textContent = metrics.focus_score;
    if (switchEl) switchEl.textContent = metrics.context_switches;
}

function renderGoals(summary) {
    const container = document.getElementById('goals-list');
    const goalsCard = document.getElementById('goals-card');

    // We need the category definitions to know the goals
    fetchAPI('/api/categories').then(res => {
        const categories = res.categories;
        const goalCats = categories.filter(c => c.daily_goal_secs > 0 || c.daily_limit_secs > 0);

        if (goalCats.length === 0) {
            goalsCard.style.display = 'none';
            return;
        }

        goalsCard.style.display = 'block';
        container.innerHTML = goalCats.map(cat => {
            const usage = summary.find(s => s.wm_class.toLowerCase().match(new RegExp(cat.wm_class_pattern, 'i')));
            const usageSecs = usage ? usage.total_secs : 0;

            let html = `<div class="goal-row">
                <div class="goal-header">
                    <div class="goal-name"><span class="category-color-small" style="background: ${cat.color}; width: 10px; height: 10px; border-radius: 50%; display: inline-block;"></span> ${cat.name}</div>
                    <div class="goal-status">`;

            if (cat.daily_goal_secs > 0) {
                const pct = Math.min(100, (usageSecs / cat.daily_goal_secs * 100)).toFixed(0);
                html += `Goal: ${formatDuration(usageSecs)} / ${formatDuration(cat.daily_goal_secs)} (${pct}%)`;
                const barColor = pct >= 100 ? '#10b981' : cat.color;
                html += `</div></div>
                    <div class="goal-bar-container">
                        <div class="goal-bar" style="width: ${pct}%; background: ${barColor}"></div>
                    </div>`;
            } else if (cat.daily_limit_secs > 0) {
                const pct = (usageSecs / cat.daily_limit_secs * 100).toFixed(0);
                const isOver = usageSecs > cat.daily_limit_secs;
                html += `Limit: ${formatDuration(usageSecs)} / ${formatDuration(cat.daily_limit_secs)} (${pct}%)`;
                const barColor = isOver ? '#ef4444' : cat.color;
                html += `</div></div>
                    <div class="goal-bar-container">
                        <div class="goal-bar ${isOver ? 'over-limit' : ''}" style="width: ${Math.min(100, pct)}%; background: ${barColor}"></div>
                    </div>`;
            }

            html += `</div>`;
            return html;
        }).join('');
    });
}

function renderSummary(summary) {
    const container = document.getElementById('usage-list');
    if (!summary || summary.length === 0) {
        container.innerHTML = '<div class="usage-empty">No data yet — start tracking!</div>';
        return;
    }

    const maxSecs = Math.max(...summary.map(s => s.total_secs));

    container.innerHTML = summary.map(app => `
        <div class="usage-row">
            <div class="usage-color" style="background: ${app.color}"></div>
            <div class="usage-info">
                <div class="usage-app-name">${escapeHtml(app.wm_class)}</div>
                <div class="usage-bar-container">
                    <div class="usage-bar" style="width: ${(app.total_secs / maxSecs * 100).toFixed(1)}%; background: ${app.color}"></div>
                </div>
            </div>
            <div class="usage-time">${app.total_formatted}</div>
        </div>
    `).join('');
}

function renderTimeline(timeline) {
    const container = document.getElementById('timeline-container');
    const labelsContainer = document.getElementById('timeline-labels');

    if (!timeline || timeline.length === 0) {
        container.innerHTML = '<div class="timeline-empty">No activity recorded yet</div>';
        labelsContainer.innerHTML = '';
        return;
    }

    // Modern 24h Timeline logic
    // We map blocks to their absolute position in the day
    // The view covers from the first event's hour to the last event's hour + 1
    const firstEvent = new Date(timeline[0].timestamp);
    const lastEvent = new Date(timeline[timeline.length - 1].end_timestamp);

    // Set view range: from start of first hour to end of last hour
    const startTime = new Date(firstEvent);
    startTime.setMinutes(0, 0, 0);
    const endTime = new Date(lastEvent);
    if (endTime.getMinutes() > 0) {
        endTime.setHours(endTime.getHours() + 1);
    }
    endTime.setMinutes(0, 0, 0);

    const rangeMs = endTime.getTime() - startTime.getTime();
    if (rangeMs <= 0) return;

    container.innerHTML = timeline.map(block => {
        const blockStart = new Date(block.timestamp).getTime();
        const blockEnd = new Date(block.end_timestamp).getTime();

        const left = ((blockStart - startTime.getTime()) / rangeMs * 100).toFixed(4);
        const width = ((blockEnd - blockStart) / rangeMs * 100).toFixed(4);

        const startLabel = formatTime(block.timestamp);
        const endLabel = formatTime(block.end_timestamp);
        const durationMin = Math.round(block.duration_secs / 60);
        const isIdle = block.is_idle;
        const label = isIdle ? 'Idle' : block.wm_class;

        return `
            <div class="timeline-block ${isIdle ? 'idle' : ''}"
                 style="left: ${left}%; width: ${width}%; background: ${block.color || '#64748b'}"
                 title="${label}">
                <div class="timeline-tooltip">
                    <div class="tt-app">${escapeHtml(label)}</div>
                    <div class="tt-time">${startLabel} — ${endLabel} (${durationMin}m)</div>
                </div>
            </div>
        `;
    }).join('');

    // Time labels (hourly)
    let labelsHtml = '';
    const startHour = startTime.getHours();
    const endHour = endTime.getHours() + (endTime.getDate() > startTime.getDate() ? 24 : 0);

    for (let h = startHour; h <= endHour; h++) {
        const pos = ((h - startHour) * 3600000 / rangeMs * 100).toFixed(2);
        if (pos > 100) break;
        const displayHour = h % 24;
        labelsHtml += `<span style="position: absolute; left: ${pos}%; transform: translateX(-50%);">${displayHour}:00</span>`;
    }
    labelsContainer.style.position = 'relative';
    labelsContainer.style.height = '20px';
    labelsContainer.innerHTML = labelsHtml;
}

function updateTotalTracked(summary) {
    const el = document.getElementById('total-tracked');
    if (!summary || summary.length === 0) {
        el.textContent = '0m tracked';
        return;
    }
    const totalSecs = summary.reduce((sum, s) => sum + s.total_secs, 0);
    el.textContent = formatDuration(totalSecs) + ' tracked';
}

function updateNowTracking(timeline) {
    if (!timeline || timeline.length === 0) {
        return;
    }
    const last = timeline[timeline.length - 1];

    if (last.is_idle) {
        document.getElementById('now-app').textContent = 'Idle';
        document.getElementById('now-title').textContent = 'No active window';
        document.getElementById('now-icon').textContent = '💤';
        document.getElementById('now-duration').textContent = formatDuration(last.duration_secs);
    } else {
        document.getElementById('now-app').textContent = last.wm_class || 'Unknown';
        document.getElementById('now-title').textContent = last.title || '—';
        document.getElementById('now-icon').textContent = getAppEmoji(last.wm_class);
        document.getElementById('now-icon').style.background = `linear-gradient(135deg, ${last.color || '#3b82f6'}, ${last.color || '#8b5cf6'}80)`;
        document.getElementById('now-duration').textContent = formatDuration(last.duration_secs);
    }
}


// ============ History View ============

async function loadHistory() {
    try {
        const period = document.getElementById('history-period')?.value || '7';
        let res;

        if (period === 'custom') {
            const start = document.getElementById('range-start').value;
            const end = document.getElementById('range-end').value;
            if (!start || !end) return;
            res = await fetchAPI(`/api/range/history?start=${start}&end=${end}`);
        } else {
            const days = parseInt(period);
            res = await fetchAPI(`/api/history?days=${days}`);
        }

        renderHistoryChart(res.history);
        renderHistoryTable(res.history);
    } catch (err) {
        console.error('Failed to load history:', err);
    }
}

async function exportRange() {
    const period = document.getElementById('history-period')?.value || '7';
    let start, end;

    if (period === 'custom') {
        start = document.getElementById('range-start').value;
        end = document.getElementById('range-end').value;
    } else {
        const days = parseInt(period);
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);
        start = startDate.toISOString().split('T')[0];
        end = endDate.toISOString().split('T')[0];
    }

    if (!start || !end) {
        alert('Please select a date range first');
        return;
    }

    window.location.href = `${API}/api/export?start=${start}&end=${end}&format=csv`;
}

window.prepareComparison = async function () {
    const period = document.getElementById('history-period')?.value || '7';
    let startA, endA;

    if (period === 'custom') {
        startA = document.getElementById('range-start').value;
        endA = document.getElementById('range-end').value;
    } else {
        const days = parseInt(period);
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);
        startA = startDate.toISOString().split('T')[0];
        endA = endDate.toISOString().split('T')[0];
    }

    if (!startA || !endA) {
        alert('Please select a range for Period A first');
        return;
    }

    const startB = prompt("Enter Start Date for Period B (YYYY-MM-DD)", "");
    if (!startB) return;
    const endB = prompt("Enter End Date for Period B (YYYY-MM-DD)", "");
    if (!endB) return;

    try {
        const [resA, resB] = await Promise.all([
            fetchAPI(`/api/range/summary?start=${startA}&end=${endA}`),
            fetchAPI(`/api/range/summary?start=${startB}&end=${endB}`)
        ]);

        document.getElementById('comparison-card').style.display = 'block';
        renderSummaryTo(resA.summary, 'comp-a-summary');
        renderSummaryTo(resB.summary, 'comp-b-summary');

        // Scroll to comparison
        document.getElementById('comparison-card').scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
        console.error('Comparison failed:', err);
        alert('Failed to load comparison data');
    }
};

function renderSummaryTo(summary, containerId) {
    const container = document.getElementById(containerId);
    if (!summary || summary.length === 0) {
        container.innerHTML = '<div class="usage-empty">No data</div>';
        return;
    }

    const maxSecs = Math.max(...summary.map(s => s.total_secs));

    container.innerHTML = summary.map(app => `
        <div class="usage-row">
            <div class="usage-color" style="background: ${app.color}"></div>
            <div class="usage-info">
                <div class="usage-app-name">${escapeHtml(app.wm_class)}</div>
                <div class="usage-bar-container">
                    <div class="usage-bar" style="width: ${(app.total_secs / maxSecs * 100).toFixed(1)}%; background: ${app.color}"></div>
                </div>
            </div>
            <div class="usage-time">${app.total_formatted}</div>
        </div>
    `).join('');
}

function renderHistoryChart(history) {
    const container = document.getElementById('history-chart');
    if (!history || history.length === 0) {
        container.innerHTML = '<div class="usage-empty">No history data yet</div>';
        return;
    }

    const maxSecs = Math.max(...history.map(h => h.active_secs || 0), 1);

    // Show most recent first -> reverse for left-to-right chronological
    const sorted = [...history].reverse();

    container.innerHTML = sorted.map(day => {
        const height = ((day.active_secs || 0) / maxSecs * 140).toFixed(0);
        const dayLabel = formatDayLabel(day.day);
        return `
            <div class="history-bar-wrapper">
                <div class="history-bar-value">${day.active_formatted || '0m'}</div>
                <div class="history-bar" style="height: ${height}px"></div>
                <div class="history-bar-label">${dayLabel}</div>
            </div>
        `;
    }).join('');
}

function renderHistoryTable(history) {
    const container = document.getElementById('history-table');
    if (!history || history.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = history.map(day => `
        <div class="history-row">
            <div class="history-day">${formatDayFull(day.day)}</div>
            <div class="history-stats">
                <span>Active: <span class="history-stat-value">${day.active_formatted || '0m'}</span></span>
                <span>Idle: <span class="history-stat-value">${day.idle_formatted || '0m'}</span></span>
                <span>Events: <span class="history-stat-value">${day.event_count || 0}</span></span>
            </div>
        </div>
    `).join('');
}


// ============ Settings View ============

async function loadSettings() {
    try {
        const [catRes, statusRes, settingsRes] = await Promise.all([
            fetchAPI('/api/categories'),
            fetchAPI('/api/status'),
            fetchAPI('/api/settings'),
        ]);

        renderCategories(catRes.categories);
        document.getElementById('info-status').textContent = statusRes.status;
        document.getElementById('info-db').textContent = statusRes.db_path;

        if (settingsRes.poll_interval) {
            document.getElementById('set-poll-interval').value = settingsRes.poll_interval;
        }
        if (settingsRes.idle_threshold) {
            document.getElementById('set-idle-threshold').value = settingsRes.idle_threshold;
        }
    } catch (err) {
        console.error('Failed to load settings:', err);
    }
}

function renderCategories(categories) {
    const container = document.getElementById('categories-list');
    if (!categories || categories.length === 0) {
        container.innerHTML = '<div class="usage-empty">No categories defined</div>';
        return;
    }

    container.innerHTML = categories.map(cat => `
        <div class="category-row">
            <div class="category-color" style="background: ${cat.color}"></div>
            <div class="category-name">${escapeHtml(cat.name)}</div>
            <div class="category-pattern">${escapeHtml(cat.wm_class_pattern)}</div>
            <div class="category-actions">
                <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="editCategory('${cat.id}', '${escapeHtml(cat.name).replace(/'/g, "\\'")}', '${escapeHtml(cat.wm_class_pattern).replace(/'/g, "\\'")}', '${cat.color}', ${cat.daily_goal_secs}, ${cat.daily_limit_secs})">Edit</button>
                <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="deleteCategory('${cat.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

// ============ Category Management ============

function setupCategoryEvents() {
    const modal = document.getElementById('category-modal');
    const form = document.getElementById('category-form');
    const colorInput = document.getElementById('cat-color');
    const colorHex = document.getElementById('cat-color-hex');
    const btnAdd = document.getElementById('btn-add-category');
    const btnExport = document.getElementById('btn-export-categories');
    const btnImport = document.getElementById('btn-import-categories');
    const fileImport = document.getElementById('file-import-categories');

    btnAdd?.addEventListener('click', () => {
        document.getElementById('modal-title').textContent = 'Add Category';
        form.reset();
        document.getElementById('cat-id').value = '';
        document.getElementById('cat-goal').value = '';
        document.getElementById('cat-limit').value = '';
        colorHex.textContent = colorInput.value;
        modal.style.display = 'flex';
    });

    document.getElementById('btn-close-modal')?.addEventListener('click', () => modal.style.display = 'none');
    document.getElementById('btn-cancel-modal')?.addEventListener('click', () => modal.style.display = 'none');

    colorInput?.addEventListener('input', (e) => {
        colorHex.textContent = e.target.value;
    });

    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('cat-id').value;
        const payload = {
            name: document.getElementById('cat-name').value,
            wm_class_pattern: document.getElementById('cat-pattern').value,
            color: document.getElementById('cat-color').value,
            daily_goal_secs: (parseInt(document.getElementById('cat-goal').value) || 0) * 60,
            daily_limit_secs: (parseInt(document.getElementById('cat-limit').value) || 0) * 60
        };

        try {
            if (id) {
                await fetchAPI(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
            } else {
                await fetchAPI(`/api/categories`, { method: 'POST', body: JSON.stringify(payload) });
            }
            modal.style.display = 'none';
            loadSettings(); // Reload categories
        } catch (err) {
            console.error('Failed to save category', err);
            alert('Error saving category');
        }
    });

    btnExport?.addEventListener('click', async () => {
        try {
            const res = await fetchAPI('/api/categories/export');
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res, null, 2));
            const downloadAnchorNode = document.createElement('a');
            downloadAnchorNode.setAttribute("href", dataStr);
            downloadAnchorNode.setAttribute("download", "atracker_categories.json");
            document.body.appendChild(downloadAnchorNode);
            downloadAnchorNode.click();
            downloadAnchorNode.remove();
        } catch (err) {
            console.error('Export failed', err);
            alert('Failed to export categories');
        }
    });

    btnImport?.addEventListener('click', () => {
        fileImport.click();
    });

    fileImport?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = JSON.parse(event.target.result);
                const replace = confirm("Do you want to replace all existing categories? (Cancel to just add/merge)");

                await fetch(`${API}/api/categories/import?replace=${replace}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                alert('Categories imported successfully');
                loadSettings();
            } catch (err) {
                console.error('Import failed', err);
                alert('Invalid JSON file or import failed');
            }
            fileImport.value = ''; // Reset
        };
        reader.readAsText(file);
    });
}

function setupSettingsEvents() {
    const tuningForm = document.getElementById('settings-tuning-form');
    tuningForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            poll_interval: document.getElementById('set-poll-interval').value,
            idle_threshold: document.getElementById('set-idle-threshold').value
        };

        try {
            await fetchAPI('/api/settings', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            alert('Settings saved successfully. The watcher will pick up changes within 60 seconds.');
        } catch (err) {
            console.error('Failed to save settings', err);
            alert('Failed to save settings');
        }
    });

    // Privacy Rules Modal Setup
    const ruleModal = document.getElementById('rule-modal');
    const ruleForm = document.getElementById('rule-form');
    document.getElementById('btn-add-rule')?.addEventListener('click', () => {
        ruleForm.reset();
        ruleModal.style.display = 'flex';
    });
    document.getElementById('btn-close-rule-modal')?.addEventListener('click', () => ruleModal.style.display = 'none');
    document.getElementById('btn-cancel-rule-modal')?.addEventListener('click', () => ruleModal.style.display = 'none');

    ruleForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            rule_type: document.getElementById('rule-type').value,
            wm_class_pattern: document.getElementById('rule-class').value,
            title_pattern: document.getElementById('rule-title').value
        };
        try {
            await fetchAPI('/api/rules', { method: 'POST', body: JSON.stringify(payload) });
            ruleModal.style.display = 'none';
            loadPrivacyRules();
        } catch (err) {
            console.error('Failed to save rule', err);
        }
    });
}

window.editCategory = function (id, name, pattern, color, goalSecs, limitSecs) {
    document.getElementById('modal-title').textContent = 'Edit Category';
    document.getElementById('cat-id').value = id;
    document.getElementById('cat-name').value = name;
    document.getElementById('cat-pattern').value = pattern;
    document.getElementById('cat-color').value = color;
    document.getElementById('cat-color-hex').textContent = color;
    document.getElementById('cat-goal').value = goalSecs ? Math.round(goalSecs / 60) : '';
    document.getElementById('cat-limit').value = limitSecs ? Math.round(limitSecs / 60) : '';
    document.getElementById('category-modal').style.display = 'flex';
};

window.deleteCategory = async function (id) {
    if (confirm('Are you sure you want to delete this category?')) {
        try {
            await fetchAPI(`/api/categories/${id}`, { method: 'DELETE' });
            loadSettings();
        } catch (err) {
            console.error('Failed to delete category', err);
            alert('Failed to delete category');
        }
    }
};



// ============ Daemon Status ============

function updateDaemonStatus(online) {
    const dot = document.querySelector('.status-dot');
    const text = document.querySelector('.status-text');
    if (online) {
        dot.className = 'status-dot online';
        text.textContent = 'Tracking';
    } else {
        dot.className = 'status-dot offline';
        text.textContent = 'Offline';
    }
}


// ============ WebSocket & Notifications ============

function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log('Connecting to WebSocket:', wsUrl);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connected');
        updateDaemonStatus(true);
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        // Refresh data on connect/reconnect
        if (currentView === 'today') loadToday();
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWsMessage(data);
        } catch (err) {
            console.error('Failed to parse WS message:', err);
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateDaemonStatus(false);
        scheduleReconnect();
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
    };
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        initWebSocket();
    }, 5000);
}

function handleWsMessage(data) {
    console.log('WS Message:', data);

    if (data.type === 'activity') {
        // Update "Now Tracking" immediately
        if (currentView === 'today') {
            loadToday(); // Refresh all summaries/timeline for the change
        }
    } else if (data.type === 'idle') {
        notify('Idle Detected', 'You have been marked as idle.');
        if (currentView === 'today') loadToday();
    } else if (data.type === 'resume') {
        notify('Active Again', 'Welcome back! Activity tracking resumed.');
        if (currentView === 'today') loadToday();
    } else if (data.type === 'pause_state') {
        updatePauseUI(data.is_paused);
        if (currentView === 'today') loadToday();
    }
}

function checkNotificationPermission() {
    if (!("Notification" in window)) return;

    const notifyBtn = document.getElementById('btn-enable-notifications');
    if (Notification.permission === 'granted') {
        if (notifyBtn) notifyBtn.style.display = 'none';
    } else if (Notification.permission !== 'denied') {
        if (notifyBtn) notifyBtn.style.display = 'inline-block';
    }
}

window.requestNotificationPermission = function () {
    if (!("Notification" in window)) return;

    Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
            const notifyBtn = document.getElementById('btn-enable-notifications');
            if (notifyBtn) notifyBtn.style.display = 'none';
            new Notification('Notifications Enabled', { body: 'You will now receive alerts for idle/resume events.' });
        }
    });
};

function notify(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/favicon.ico' });
    }
}


// ============ Pause & Rules Logic ============

function initPauseControls() {
    const dropdown = document.getElementById('pause-dropdown');
    const toggle = document.getElementById('btn-pause-toggle');
    const resumeBtn = document.getElementById('btn-resume-tracking');

    toggle?.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
    });

    document.addEventListener('click', () => dropdown?.classList.remove('show'));

    dropdown?.querySelectorAll('.dropdown-menu a').forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            const mins = parseInt(link.dataset.mins);
            try {
                await fetchAPI('/api/pause', {
                    method: 'POST',
                    body: JSON.stringify({ duration_mins: mins > 0 ? mins : null })
                });
                dropdown.classList.remove('show');
            } catch (err) {
                console.error('Failed to pause', err);
            }
        });
    });

    resumeBtn?.addEventListener('click', async () => {
        try {
            await fetchAPI('/api/resume', { method: 'POST' });
        } catch (err) {
            console.error('Failed to resume', err);
        }
    });
}

function updatePauseUI(isPaused) {
    const dropdown = document.getElementById('pause-dropdown');
    const resumeBtn = document.getElementById('btn-resume-tracking');
    if (isPaused) {
        if (dropdown) dropdown.style.display = 'none';
        if (resumeBtn) resumeBtn.style.display = 'flex';
        document.getElementById('daemon-status').querySelector('.status-text').textContent = 'Tracking Paused';
        document.getElementById('daemon-status').querySelector('.status-dot').style.background = '#f59e0b';
    } else {
        if (dropdown) dropdown.style.display = 'block';
        if (resumeBtn) resumeBtn.style.display = 'none';
        document.getElementById('daemon-status').querySelector('.status-text').textContent = 'Tracking';
        document.getElementById('daemon-status').querySelector('.status-dot').style.background = '';
    }
}

async function loadPrivacyRules() {
    try {
        const res = await fetchAPI('/api/rules');
        renderPrivacyRules(res);
    } catch (err) {
        console.error('Failed to load rules', err);
    }
}

function renderPrivacyRules(rules) {
    const container = document.getElementById('rules-list');
    if (!container) return;

    if (!rules || rules.length === 0) {
        container.innerHTML = '<div class="usage-empty">No rules defined</div>';
        return;
    }

    container.innerHTML = rules.map(rule => `
        <div class="rule-row">
            <span class="rule-type-tag ${rule.rule_type}">${rule.rule_type}</span>
            <div class="rule-details">
                <div class="rule-patterns">
                    ${rule.wm_class_pattern ? `<span>Class: <b>${escapeHtml(rule.wm_class_pattern)}</b></span>` : ''}
                    ${rule.title_pattern ? `<span>Title: <b>${escapeHtml(rule.title_pattern)}</b></span>` : ''}
                </div>
            </div>
            <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="deleteRule('${rule.id}')">Delete</button>
        </div>
    `).join('');
}

window.deleteRule = async function (id) {
    try {
        await fetchAPI(`/api/rules/${id}`, { method: 'DELETE' });
        loadPrivacyRules();
    } catch (err) {
        console.error('Failed to delete rule', err);
    }
}


// --- startAutoRefresh removed (WebSockets handle it) ---


// ============ Helpers ============

async function fetchAPI(path, options = {}) {
    const fetchOptions = { ...options };
    if (fetchOptions.body && typeof fetchOptions.body === 'string' && !fetchOptions.headers) {
        fetchOptions.headers = { 'Content-Type': 'application/json' };
    }
    const res = await fetch(`${API}${path}`, fetchOptions);
    if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
    return res.json();
}

function setCurrentDate() {
    const el = document.getElementById('current-date');
    if (el) {
        el.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
        });
    }
}

function formatTime(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDuration(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}


function formatDayLabel(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function formatDayFull(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function getAppEmoji(wmClass) {
    if (!wmClass) return '📱';
    const wm = wmClass.toLowerCase();
    if (/firefox|chrome|brave|zen/.test(wm)) return '🌐';
    if (/terminal|kitty|alacritty|wezterm|tilix/.test(wm)) return '⌨️';
    if (/code|cursor|neovim|emacs|sublime/.test(wm)) return '🧑‍💻';
    if (/slack|discord|telegram|signal|teams/.test(wm)) return '💬';
    if (/nautilus|thunar|dolphin|nemo/.test(wm)) return '📁';
    if (/vlc|mpv|spotify/.test(wm)) return '🎵';
    if (/libreoffice|evince|okular/.test(wm)) return '📄';
    return '📱';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
