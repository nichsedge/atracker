import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { format } from 'date-fns';
import TodayView from './components/TodayView';
import HistoryView from './components/HistoryView';
import ManualView from './components/ManualView';
import SettingsView from './components/SettingsView';
import Sidebar from './components/Sidebar';
import { useTrackerData } from './hooks/useTrackerData';
import { fetchAPI } from './api';

function App() {
  const [daemonStatus, setDaemonStatus] = useState('Connecting...');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [devices, setDevices] = useState([]);
  const [selectedDevices, setSelectedDevices] = useState([]);
  const [isPaused, setIsPaused] = useState(false);

  const { data, loading, refetch } = useTrackerData(date, selectedDevices);

  useEffect(() => {
    fetchAPI('/api/devices')
      .then(res => setDevices(Array.isArray(res) ? res : (res.devices || [])))
      .catch(console.error);

    fetchAPI('/api/pause_status')
      .then(res => setIsPaused(res.is_paused))
      .catch(console.error);
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setDaemonStatus('Connected');
    ws.onclose = () => setDaemonStatus('Disconnected');

    return () => ws.close();
  }, []);

  const handleDeviceToggle = (deviceId, isChecked) => {
    if (isChecked) {
      setSelectedDevices(prev => [...prev, deviceId]);
    } else {
      setSelectedDevices(prev => prev.filter(d => d !== deviceId));
    }
  };

  const handlePause = async (mins) => {
    try {
      await fetchAPI('/api/pause', {
        method: 'POST',
        body: JSON.stringify({ duration_mins: mins })
      });
      setIsPaused(true);
    } catch (err) {
      console.error('Failed to pause', err);
    }
  };

  const handleResume = async () => {
    try {
      await fetchAPI('/api/resume', { method: 'POST' });
      setIsPaused(false);
    } catch (err) {
      console.error('Failed to resume', err);
    }
  };

  return (
    <BrowserRouter>
      <div className="flex h-screen w-full bg-[var(--bg-base)] text-[var(--text-primary)] font-sans overflow-hidden">
        <Sidebar
          daemonStatus={daemonStatus}
          devices={devices}
          selectedDevices={selectedDevices}
          onDeviceToggle={handleDeviceToggle}
        />

        <main className="flex-1 h-full overflow-y-auto p-8 relative">
          <Routes>
            <Route path="/" element={<TodayView data={data} date={date} setDate={setDate} isPaused={isPaused} onPause={handlePause} onResume={handleResume} />} />
            <Route path="/history" element={<HistoryView selectedDevices={selectedDevices} />} />
            <Route path="/manual" element={<ManualView onAdded={refetch} />} />
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
