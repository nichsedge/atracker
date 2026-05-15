import { useState, useEffect, useCallback } from 'react';

const API_BASE = window.location.origin;

export const useTracker = (date) => {
  const [summary, setSummary] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [history, setHistory] = useState([]);
  const [status, setStatus] = useState({});
  const [categories, setCategories] = useState([]);
  const [rules, setRules] = useState([]);
  const [devices, setDevices] = useState([]);
  const [currentApp, setCurrentApp] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const endpoints = [
        fetch(`${API_BASE}/api/summary?date=${date}`),
        fetch(`${API_BASE}/api/timeline?date=${date}`),
        fetch(`${API_BASE}/api/history?days=14`),
        fetch(`${API_BASE}/api/status`),
        fetch(`${API_BASE}/api/categories`),
        fetch(`${API_BASE}/api/rules`),
        fetch(`${API_BASE}/api/devices`),
      ];
      const [sumRes, timeRes, histRes, statusRes, catRes, ruleRes, devRes] = await Promise.all(endpoints);
      
      setSummary(await sumRes.json());
      const timeData = await timeRes.json();
      setTimeline(Array.isArray(timeData) ? timeData : []);
      setHistory(await histRes.json());
      
      const statusData = await statusRes.json();
      setStatus(statusData);
      if (statusData.current) setCurrentApp(statusData.current);
      
      const catData = await catRes.json();
      setCategories(catData.categories || []);
      
      setRules(await ruleRes.json());
      setDevices(await devRes.json());
      setLoading(false);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  }, [date]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Background fallback

    // Real-time WebSockets
    const wsUrl = `ws://${window.location.host}/ws`;
    let ws;
    let reconnectTimer;

    const connect = () => {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'activity') {
            setCurrentApp(data);
            fetchData(); // Refresh summary on change
          }
        } catch (e) { console.error('WS Error:', e); }
      };
      ws.onclose = () => {
        reconnectTimer = setTimeout(connect, 5000);
      };
      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      clearInterval(interval);
      if (ws) ws.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [fetchData]);

  return { summary, timeline, history, status, categories, rules, devices, currentApp, loading, refresh: fetchData };
};
