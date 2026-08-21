import { useState, useEffect, useCallback, useRef } from 'react';
import { formatLocalDateISO } from '../utils/formatters';

const API_BASE = window.location.origin;

export const useTracker = (initialDate) => {
  const [date, setDate] = useState(initialDate);
  const [summary, setSummary] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState({ is_tracking: false });
  const [categories, setCategories] = useState([]);
  const [rules, setRules] = useState([]);
  const [devices, setDevices] = useState([]);
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [currentApp, setCurrentApp] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [settings, setSettings] = useState({});
  const [merges, setMerges] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const hasLoadedRef = useRef(false);
  const isFetchingRef = useRef(false);
  const lastWsRefreshMsRef = useRef(0);

  const fetchStaticData = useCallback(async () => {
    try {
      const cacheBust = `?_t=${Date.now()}`;
      const [catRes, rulesRes, devRes, settingsRes, mergeRes] = await Promise.all([
        fetch(`${API_BASE}/api/categories${cacheBust}`),
        fetch(`${API_BASE}/api/rules${cacheBust}`),
        fetch(`${API_BASE}/api/devices${cacheBust}`),
        fetch(`${API_BASE}/api/settings${cacheBust}`),
        fetch(`${API_BASE}/api/devices/merges${cacheBust}`)
      ]);
      
      const [cats, rls, devs, sets, mrgs] = await Promise.all([
        catRes.json(), rulesRes.json(), devRes.json(), settingsRes.json(), mergeRes.json()
      ]);
      
      setCategories(cats.categories || []);
      setRules(Array.isArray(rls) ? rls : []);
      setDevices(Array.isArray(devs) ? devs : []);
      setSettings(sets && typeof sets === 'object' ? sets : {});
      setMerges(Array.isArray(mrgs) ? mrgs : []);
    } catch (err) {
      console.error('Static fetch error:', err);
    }
  }, []);

  const fetchData = useCallback(async (isSilent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    
    if (!isSilent && !hasLoadedRef.current) {
      setLoading(true);
    }

    try {
      const devicesParam = selectedDevices.length > 0 ? `&devices=${selectedDevices.join(',')}` : '';
      const endpoints = [
        fetch(`${API_BASE}/api/summary?date=${date}${devicesParam}`),
        fetch(`${API_BASE}/api/timeline?date=${date}${devicesParam}`),
        fetch(`${API_BASE}/api/status`),
        fetch(`${API_BASE}/api/pause_status`)
      ];

      const responses = await Promise.all(endpoints);
      if (responses.some(r => !r.ok)) throw new Error('API request failed');
      
      const [sumData, timeData, statusData, pauseData] = await Promise.all(responses.map(r => r.json()));

      setSummary(sumData.summary || []);
      setTimeline(timeData.timeline || []);
      setStatus(statusData);
      setIsPaused(pauseData.is_paused);
      if (statusData.current) setCurrentApp(statusData.current);
      
      hasLoadedRef.current = true;
    } catch (err) {
      console.error('Dynamic fetch error:', err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [date, selectedDevices]);

  const fetchHistory = useCallback(async () => {
    try {
      const devicesParam = selectedDevices.length > 0 ? `&devices=${selectedDevices.join(',')}` : '';
      const res = await fetch(`${API_BASE}/api/history?days=14${devicesParam}`);
      if (!res.ok) throw new Error('History API request failed');
      const data = await res.json();
      setHistory(data.history || []);
    } catch (err) {
      console.error('History fetch error:', err);
    }
  }, [selectedDevices]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!ignore) await fetchStaticData();
    })();
    return () => { ignore = true; };
  }, [fetchStaticData]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      if (!ignore) await fetchHistory();
    })();
    return () => { ignore = true; };
  }, [fetchHistory]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [date, selectedDevices, fetchData]);

  useEffect(() => {
    const interval = setInterval(() => fetchData(true), 30000);
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pause_state') {
          setIsPaused(data.is_paused);
        } else if (data.timestamp) {
          setCurrentApp(data);
          // Refresh data if looking at today
          const today = formatLocalDateISO();
          if (date === today) {
            const now = Date.now();
            if (now - lastWsRefreshMsRef.current >= 3000) {
              lastWsRefreshMsRef.current = now;
              fetchData(true);
            }
          }
        }
      } catch (e) { console.error('WS Error:', e); }
    };

    return () => {
      clearInterval(interval);
      ws.close();
    };
  }, [date, fetchData]);

  useEffect(() => {
    const interval = setInterval(() => fetchHistory(), 60000);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const togglePause = async (minutes = 0) => {
    const endpoint = isPaused ? '/api/resume' : '/api/pause';
    const body = !isPaused && minutes > 0 ? JSON.stringify({ duration_mins: minutes }) : null;
    try {
      await fetch(`${API_BASE}${endpoint}`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body 
      });
      setIsPaused(!isPaused);
    } catch (err) { console.error(err); }
  };

  const saveCategory = async (cat) => {
    const method = cat.id ? 'PUT' : 'POST';
    const url = cat.id ? `${API_BASE}/api/categories/${cat.id}` : `${API_BASE}/api/categories`;
    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cat)
    });
    fetchStaticData();
  };

  const deleteCategory = async (id) => {
    await fetch(`${API_BASE}/api/categories/${id}`, { method: 'DELETE' });
    fetchStaticData();
  };

  const saveRule = async (rule) => {
    await fetch(`${API_BASE}/api/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rule)
    });
    fetchStaticData();
  };

  const deleteRule = async (id) => {
    await fetch(`${API_BASE}/api/rules/${id}`, { method: 'DELETE' });
    fetchStaticData();
  };

  const saveSettings = async (newSettings) => {
    await fetch(`${API_BASE}/api/update_settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
    });
    fetchStaticData();
  };

  const mergeDevice = async (originalId, targetId) => {
    await fetch(`${API_BASE}/api/devices/merges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_id: originalId, target_id: targetId })
    });
    fetchStaticData();
  };

  const deleteMerge = async (originalId) => {
    await fetch(`${API_BASE}/api/devices/merges/${originalId}`, { method: 'DELETE' });
    fetchStaticData();
  };

  const renameDevice = async (id, name) => {
    await fetch(`${API_BASE}/api/devices/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });
    fetchStaticData();
  };

  const submitManualEvent = async (event) => {
    await fetch(`${API_BASE}/api/events/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
    });
    fetchData(true);
  };

  return {
    date, setDate,
    summary, timeline, history, status,
    categories, rules, devices, selectedDevices, setSelectedDevices,
    currentApp, isPaused, togglePause,
    settings, saveSettings,
    merges, mergeDevice, deleteMerge, renameDevice,
    loading, saveCategory, deleteCategory, saveRule, deleteRule,
    submitManualEvent
  };
};
