import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ActivityDashboard from './pages/ActivityDashboard';
import SettingsView from './pages/SettingsView';
import HistoryView from './pages/HistoryView';
import DevicesView from './pages/DevicesView';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import { useTracker } from './hooks/useTracker';
import { formatLocalDateISO } from './utils/formatters';
import './index.css';

const App = () => {
  const tracker = useTracker(formatLocalDateISO());
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Global Keyboard Accelerators
  useEffect(() => {
    const handleKeyDown = (e) => {
      const el = document.activeElement;
      if (el) {
        const tag = el.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable) {
          return;
        }
      }

      if (e.code === 'Space') {
        e.preventDefault();
        tracker.togglePause();
      } else if (e.key === '?') {
        e.preventDefault();
        setIsShortcutsOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setIsShortcutsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tracker]);

  return (
    <Router>
      <div className="app-container">
        <Sidebar 
            status={tracker.status} 
            isPaused={tracker.isPaused}
            togglePause={tracker.togglePause}
            theme={theme}
            setTheme={setTheme}
            onOpenShortcuts={() => setIsShortcutsOpen(true)}
        />
        
        <main className="main-content">
          <Routes>
            <Route path="/" element={
              <ActivityDashboard 
                summary={tracker.summary} 
                timeline={tracker.timeline} 
                currentApp={tracker.currentApp} 
                date={tracker.date}
                setDate={tracker.setDate}
                loading={tracker.loading}
                categories={tracker.categories}
                submitManualEvent={tracker.submitManualEvent}
                devices={tracker.devices}
                selectedDevices={tracker.selectedDevices}
                setSelectedDevices={tracker.setSelectedDevices}
                onOpenShortcuts={() => setIsShortcutsOpen(true)}
              />
            } />
            <Route path="/categories" element={
                <SettingsView 
                    categories={tracker.categories} 
                    saveCategory={tracker.saveCategory}
                    deleteCategory={tracker.deleteCategory}
                    rules={tracker.rules}
                    saveRule={tracker.saveRule}
                    deleteRule={tracker.deleteRule}
                    settings={tracker.settings}
                    saveSettings={tracker.saveSettings}
                    devices={tracker.devices}
                    merges={tracker.merges}
                    mergeDevice={tracker.mergeDevice}
                    deleteMerge={tracker.deleteMerge}
                />
            } />
            <Route path="/history" element={
              <HistoryView 
                history={tracker.history} 
                devices={tracker.devices}
                selectedDevices={tracker.selectedDevices}
                setSelectedDevices={tracker.setSelectedDevices}
              />
            } />
            <Route path="/devices" element={
              <DevicesView 
                devices={tracker.devices} 
                merges={tracker.merges}
                mergeDevice={tracker.mergeDevice}
                deleteMerge={tracker.deleteMerge}
                renameDevice={tracker.renameDevice}
              />
            } />
            <Route path="*" element={<div className="placeholder-view">Coming Soon</div>} />
          </Routes>
        </main>

        <KeyboardShortcutsModal 
          isOpen={isShortcutsOpen} 
          onClose={() => setIsShortcutsOpen(false)} 
        />
      </div>
    </Router>
  );
};

export default App;
