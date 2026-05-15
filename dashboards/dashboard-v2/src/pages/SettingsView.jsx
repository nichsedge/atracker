import { Plus, Trash2 } from 'lucide-react';

const SettingsView = ({ categories }) => {
  return (
    <div className="view-content fade-in">
      <header className="main-header">
        <div className="header-title">
          <h1>Categories</h1>
          <p>Manage app classification and tracking goals</p>
        </div>
        <button className="btn-primary"><Plus size={18} /> New Category</button>
      </header>

      <section className="glass-card">
        <div className="item-list">
          {categories.map((cat) => (
            <div key={cat.id} className="item-row">
              <div className="item-info">
                <div className="color-dot" style={{ backgroundColor: cat.color }}></div>
                <div>
                  <div style={{ fontWeight: 600 }}>{cat.name}</div>
                  <div className="pattern">{cat.wm_class_pattern}</div>
                </div>
              </div>
              <button className="btn-icon"><Trash2 size={18} /></button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default SettingsView;
