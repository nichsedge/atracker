/* ============================================================
   atracker — Dashboard Client
   ============================================================ */

const API = '';  // Same origin
const REFRESH_INTERVAL = 15_000; // 15 seconds

// State
let currentView = 'today';
let refreshTimer = null;

// ============ Init ============

document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupCategoryEvents();
    setCurrentDate();
    loadView('today');
    startAutoRefresh();
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

    document.getElementById('history-period')?.addEventListener('change', () => {
        loadHistory();
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
            break;
    }
}


// ============ Today View ============

async function loadToday() {
    try {
        const [summaryRes, timelineRes, statusRes] = await Promise.all([
            fetchAPI('/api/summary'),
            fetchAPI('/api/timeline'),
            fetchAPI('/api/status'),
        ]);

        updateDaemonStatus(true);
        renderSummary(summaryRes.summary);
        renderTimeline(timelineRes.timeline);
        updateTotalTracked(summaryRes.summary);
        updateNowTracking(timelineRes.timeline);
    } catch (err) {
        console.error('Failed to load today:', err);
        updateDaemonStatus(false);
    }
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

    // Calculate total duration for proportional widths
    const totalDuration = timeline.reduce((sum, t) => sum + t.duration_secs, 0);
    if (totalDuration === 0) {
        container.innerHTML = '<div class="timeline-empty">No activity recorded yet</div>';
        return;
    }

    container.innerHTML = timeline.map(block => {
        const pct = (block.duration_secs / totalDuration * 100).toFixed(2);
        const startTime = formatTime(block.timestamp);
        const endTime = formatTime(block.end_timestamp);
        const durationMin = Math.round(block.duration_secs / 60);
        const isIdle = block.is_idle;
        const label = isIdle ? 'Idle' : block.wm_class;

        return `
            <div class="timeline-block ${isIdle ? 'idle' : ''}"
                 style="width: ${pct}%; background: ${block.color || '#64748b'}"
                 title="${label}">
                <div class="timeline-tooltip">
                    <div class="tt-app">${escapeHtml(label)}</div>
                    <div class="tt-time">${startTime} — ${endTime} (${durationMin}m)</div>
                </div>
            </div>
        `;
    }).join('');

    // Time labels
    if (timeline.length > 0) {
        const firstTime = formatTime(timeline[0].timestamp);
        const lastTime = formatTime(timeline[timeline.length - 1].end_timestamp);
        labelsContainer.innerHTML = `<span>${firstTime}</span><span>${lastTime}</span>`;
    }
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
        const days = parseInt(document.getElementById('history-period')?.value || '7');
        const res = await fetchAPI(`/api/history?days=${days}`);
        renderHistoryChart(res.history);
        renderHistoryTable(res.history);
    } catch (err) {
        console.error('Failed to load history:', err);
    }
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
        const [catRes, statusRes] = await Promise.all([
            fetchAPI('/api/categories'),
            fetchAPI('/api/status'),
        ]);

        renderCategories(catRes.categories);
        document.getElementById('info-status').textContent = statusRes.status;
        document.getElementById('info-db').textContent = statusRes.db_path;
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
                <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="editCategory('${cat.id}', '${escapeHtml(cat.name).replace(/'/g, "\\'")}', '${escapeHtml(cat.wm_class_pattern).replace(/'/g, "\\'")}', '${cat.color}')">Edit</button>
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
            color: document.getElementById('cat-color').value
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

window.editCategory = function (id, name, pattern, color) {
    document.getElementById('modal-title').textContent = 'Edit Category';
    document.getElementById('cat-id').value = id;
    document.getElementById('cat-name').value = name;
    document.getElementById('cat-pattern').value = pattern;
    document.getElementById('cat-color').value = color;
    document.getElementById('cat-color-hex').textContent = color;
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


// ============ Auto Refresh ============

function startAutoRefresh() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
        if (currentView === 'today') {
            loadToday();
        }
    }, REFRESH_INTERVAL);
}


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
