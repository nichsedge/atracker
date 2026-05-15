import { Smartphone } from 'lucide-react';
import { formatTime } from '../utils/formatters';

const DevicesView = ({ devices }) => {
  return (
    <div className="view-content fade-in">
      <header className="main-header">
        <div className="header-title">
          <h1>Devices</h1>
          <p>Sync status for linked tracking sources</p>
        </div>
      </header>

      <section className="glass-card">
        <div className="item-list">
          {devices.map((dev) => (
            <div key={dev.id} className="item-row">
              <div className="item-info">
                <Smartphone size={24} className="text-secondary" />
                <div>
                  <div style={{ fontWeight: 600 }}>{dev.name}</div>
                  <div className="pattern">{dev.platform} — Last seen: {formatTime(dev.last_seen)}</div>
                </div>
              </div>
              <div className="status-indicator">
                <div className="status-dot running"></div>
                <span>Linked</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default DevicesView;
