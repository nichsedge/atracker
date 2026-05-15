import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ActivityDashboard from './pages/ActivityDashboard';
import SettingsView from './pages/SettingsView';
import HistoryView from './pages/HistoryView';
import DevicesView from './pages/DevicesView';
import { useTracker } from './hooks/useTracker';
import './index.css';

const App = () => {
  const tracker = useTracker(new Date().toLocaleDateString('en-CA')); // YYYY-MM-DD

  return (
    <Router>
      <div className="app-container">
        <Sidebar 
            status={tracker.status} 
            devices={tracker.devices} 
            selectedDevices={tracker.selectedDevices}
            setSelectedDevices={tracker.setSelectedDevices}
            isPaused={tracker.isPaused}
            togglePause={tracker.togglePause}
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
            <Route path="/history" element={<HistoryView history={tracker.history} />} />
            <Route path="/devices" element={
              <DevicesView 
                devices={tracker.devices} 
                merges={tracker.merges}
                mergeDevice={tracker.mergeDevice}
                deleteMerge={tracker.deleteMerge}
              />
            } />
            <Route path="*" element={<div className="placeholder-view">Coming Soon</div>} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
