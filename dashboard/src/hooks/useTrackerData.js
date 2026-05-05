import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { fetchAPI } from '../api';

export function useTrackerData(date, selectedDevices = []) {
  const [data, setData] = useState({
    timeline: [],
    usage: [],
    current: null,
    total_tracked: 0
  });
  const [loading, setLoading] = useState(true);

  const processSummary = (summary) => {
    if (!summary) return [];
    const grouped = {};
    let totalTracked = 0;

    summary.forEach(app => {
      const cat = app.category_name || 'Uncategorized';
      if (!grouped[cat]) {
        grouped[cat] = {
          name: cat,
          color: app.color,
          total_secs: 0,
          items: []
        };
      }
      grouped[cat].total_secs += app.total_secs;
      grouped[cat].items.push(app);
      totalTracked += app.total_secs;
    });

    return {
      usage: Object.values(grouped).sort((a, b) => b.total_secs - a.total_secs),
      totalTracked
    };
  };

  const extractCurrent = (timeline) => {
    if (!timeline || timeline.length === 0) return null;
    const last = timeline[timeline.length - 1];
    return {
      app: last.is_idle ? 'Idle' : last.wm_class,
      title: last.is_idle ? 'No active window' : last.window_title,
      duration: last.duration_secs,
      color: last.color,
      is_idle: last.is_idle
    };
  };

  const fetchTodayData = async () => {
    try {
      setLoading(true);
      const devicesParam = selectedDevices.length > 0 ? `&devices=${selectedDevices.join(',')}` : '';
      const [summaryRes, timelineRes] = await Promise.all([
        fetchAPI(`/api/summary?date=${date}${devicesParam}`),
        fetchAPI(`/api/timeline?date=${date}${devicesParam}`),
      ]);

      const { usage, totalTracked } = processSummary(summaryRes.summary);

      setData({
        timeline: timelineRes.timeline || [],
        usage: usage,
        current: extractCurrent(timelineRes.timeline),
        total_tracked: totalTracked
      });
    } catch (err) {
      console.error('Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTodayData();
  }, [date, selectedDevices]);

  useEffect(() => {
    const isToday = date === format(new Date(), 'yyyy-MM-dd');
    if (!isToday) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'activity' || msg.type === 'idle' || msg.type === 'resume') {
          if (selectedDevices.length > 0 && msg.data && msg.data.device_id && !selectedDevices.includes(msg.data.device_id)) {
             return;
          }
          fetchTodayData();
        }
      } catch (e) {
        console.error('WS parse error', e);
      }
    };

    return () => {
      ws.close();
    };
  }, [date, selectedDevices]);

  return { data, loading, refetch: fetchTodayData };
}
