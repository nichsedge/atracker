import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import ActivityDashboard from './pages/ActivityDashboard';
import SettingsView from './pages/SettingsView';
import HistoryView from './pages/HistoryView';
import DevicesView from './pages/DevicesView';
import { useTracker } from './hooks/useTracker';
import './index.css';

const App = () => {
  const [date] = useState(new Date().toLocaleDateString('en-CA')); // YYYY-MM-DD
  const tracker = useTracker(date);

  return (
    <Router>
      <div className="app-container">
        <Sidebar status={tracker.status} devices={tracker.devices} />
        
        <main className="main-content">
          <Routes>
            <Route path="/" element={
              <ActivityDashboard 
                summary={tracker.summary} 
                timeline={tracker.timeline} 
                currentApp={tracker.currentApp} 
                date={date}
                loading={tracker.loading}
              />
            } />
            <Route path="/categories" element={<SettingsView categories={tracker.categories} />} />
            <Route path="/history" element={<HistoryView history={tracker.history} />} />
            <Route path="/devices" element={<DevicesView devices={tracker.devices} />} />
            {/* Placeholder for other routes */}
            <Route path="*" element={<div className="placeholder-view">Coming Soon</div>} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
