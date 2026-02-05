import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

interface Stats {
  totalChecks: number;
  detections: number;
  byPlatform: Record<string, number>;
}

interface AppState {
  enabled: boolean;
  blockSubmissions: boolean;
  showWarnings: boolean;
  highlightAttacks: boolean;
}

const Popup: React.FC = () => {
  const [state, setState] = useState<AppState>({
    enabled: true,
    blockSubmissions: true,
    showWarnings: true,
    highlightAttacks: true
  });
  
  const [stats, setStats] = useState<Stats>({
    totalChecks: 0,
    detections: 0,
    byPlatform: {}
  });
  
  const [activeTab, setActiveTab] = useState<'status' | 'settings' | 'stats'>('status');

  useEffect(() => {
    // Load state from storage
    chrome.storage.local.get('promptArmorState', (result) => {
      if (result.promptArmorState) {
        setState({
          enabled: result.promptArmorState.enabled ?? true,
          blockSubmissions: result.promptArmorState.blockSubmissions ?? true,
          showWarnings: result.promptArmorState.showWarnings ?? true,
          highlightAttacks: result.promptArmorState.highlightAttacks ?? true
        });
        setStats(result.promptArmorState.stats ?? { totalChecks: 0, detections: 0, byPlatform: {} });
      }
    });
  }, []);

  const updateState = (updates: Partial<AppState>) => {
    const newState = { ...state, ...updates };
    setState(newState);
    chrome.storage.local.set({
      promptArmorState: { ...newState, stats }
    });
  };

  const resetStats = () => {
    const emptyStats = { totalChecks: 0, detections: 0, byPlatform: {} };
    setStats(emptyStats);
    chrome.storage.local.set({
      promptArmorState: { ...state, stats: emptyStats }
    });
  };

  const isProtected = state.enabled && stats.detections === 0;

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.logo}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7L12 12L22 7L12 2Z"/>
            <path d="M2 17L12 22L22 17"/>
            <path d="M2 12L12 17L22 12"/>
          </svg>
          <span>Prompt Armor</span>
        </div>
        <div style={{
          ...styles.status,
          background: isProtected ? '#4CAF50' : stats.detections > 0 ? '#ff4444' : '#FFA500'
        }}>
          {isProtected ? '🛡️ Protected' : stats.detections > 0 ? `⚠️ ${stats.detections} Blocked` : '⏸️ Paused'}
        </div>
      </header>

      <nav style={styles.nav}>
        <button 
          style={{...styles.navBtn, ...(activeTab === 'status' ? styles.navBtnActive : {})}}
          onClick={() => setActiveTab('status')}
        >
          Status
        </button>
        <button 
          style={{...styles.navBtn, ...(activeTab === 'settings' ? styles.navBtnActive : {})}}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
        <button 
          style={{...styles.navBtn, ...(activeTab === 'stats' ? styles.navBtnActive : {})}}
          onClick={() => setActiveTab('stats')}
        >
          Stats
        </button>
      </nav>

      <main style={styles.main}>
        {activeTab === 'status' && (
          <div style={styles.statusPanel}>
            <div style={styles.bigStat}>
              <span style={styles.bigStatNumber}>{stats.totalChecks}</span>
              <span style={styles.bigStatLabel}>Prompts Scanned</span>
            </div>
            <div style={styles.bigStat}>
              <span style={{...styles.bigStatNumber, color: stats.detections > 0 ? '#ff4444' : '#4CAF50'}}>
                {stats.detections}
              </span>
              <span style={styles.bigStatLabel}>Threats Blocked</span>
            </div>
            
            {Object.keys(stats.byPlatform).length > 0 && (
              <div style={styles.platforms}>
                <h4>Protected Platforms</h4>
                {Object.entries(stats.byPlatform).map(([platform, count]) => (
                  <div key={platform} style={styles.platformRow}>
                    <span>{platform}</span>
                    <span style={styles.platformCount}>{count} blocked</span>
                  </div>
                ))}
              </div>
            )}

            <div style={styles.platformsSupported}>
              <h4>Active On</h4>
              <div style={styles.platformTags}>
                <span style={styles.platformTag}>ChatGPT</span>
                <span style={styles.platformTag}>Claude</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div style={styles.settingsPanel}>
            <label style={styles.setting}>
              <span>Enable Protection</span>
              <input 
                type="checkbox" 
                checked={state.enabled}
                onChange={(e) => updateState({ enabled: e.target.checked })}
              />
            </label>
            
            <label style={styles.setting}>
              <span>Block Suspicious Submissions</span>
              <input 
                type="checkbox" 
                checked={state.blockSubmissions}
                onChange={(e) => updateState({ blockSubmissions: e.target.checked })}
                disabled={!state.enabled}
              />
            </label>
            
            <label style={styles.setting}>
              <span>Show Warning Popups</span>
              <input 
                type="checkbox" 
                checked={state.showWarnings}
                onChange={(e) => updateState({ showWarnings: e.target.checked })}
                disabled={!state.enabled}
              />
            </label>
            
            <label style={styles.setting}>
              <span>Highlight Attack Patterns</span>
              <input 
                type="checkbox" 
                checked={state.highlightAttacks}
                onChange={(e) => updateState({ highlightAttacks: e.target.checked })}
                disabled={!state.enabled}
              />
            </label>
          </div>
        )}

        {activeTab === 'stats' && (
          <div style={styles.statsPanel}>
            <div style={styles.statRow}>
              <span>Total Checks</span>
              <strong>{stats.totalChecks}</strong>
            </div>
            <div style={styles.statRow}>
              <span>Attacks Blocked</span>
              <strong style={{color: '#ff4444'}}>{stats.detections}</strong>
            </div>
            <div style={styles.statRow}>
              <span>Block Rate</span>
              <strong>
                {stats.totalChecks > 0 
                  ? ((stats.detections / stats.totalChecks) * 100).toFixed(2) 
                  : '0'}%
              </strong>
            </div>
            
            <button style={styles.resetBtn} onClick={resetStats}>
              Reset Statistics
            </button>
          </div>
        )}
      </main>

      <footer style={styles.footer}>
        <a href="https://prompt-armor.dev" target="_blank" rel="noopener" style={styles.link}>
          Documentation →
        </a>
      </footer>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '360px',
    minHeight: '400px',
    background: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  header: {
    padding: '20px',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '18px',
    fontWeight: 700
  },
  status: {
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    fontWeight: 600
  },
  nav: {
    display: 'flex',
    borderBottom: '1px solid #e0e0e0'
  },
  navBtn: {
    flex: 1,
    padding: '14px',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    color: '#666',
    transition: 'all 0.2s'
  },
  navBtnActive: {
    color: '#667eea',
    borderBottom: '2px solid #667eea',
    background: 'rgba(102, 126, 234, 0.05)'
  },
  main: {
    padding: '20px'
  },
  statusPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  bigStat: {
    textAlign: 'center',
    padding: '20px',
    background: '#f8f9fa',
    borderRadius: '12px'
  },
  bigStatNumber: {
    display: 'block',
    fontSize: '42px',
    fontWeight: 700,
    color: '#667eea'
  },
  bigStatLabel: {
    fontSize: '14px',
    color: '#666',
    marginTop: '4px'
  },
  platforms: {
    padding: '16px',
    background: '#fff5f5',
    borderRadius: '12px',
    border: '1px solid #ffcdd2'
  },
  platformsSupported: {
    padding: '16px',
    background: '#f5f5f5',
    borderRadius: '12px'
  },
  platformRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #eee'
  },
  platformCount: {
    color: '#ff4444',
    fontWeight: 600
  },
  platformTags: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px'
  },
  platformTag: {
    padding: '4px 12px',
    background: '#667eea',
    color: 'white',
    borderRadius: '20px',
    fontSize: '12px'
  },
  settingsPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  setting: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: '#f8f9fa',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  statsPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  statRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '16px',
    background: '#f8f9fa',
    borderRadius: '8px'
  },
  resetBtn: {
    marginTop: '16px',
    padding: '12px',
    background: '#ff4444',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 600
  },
  footer: {
    padding: '16px 20px',
    borderTop: '1px solid #e0e0e0',
    textAlign: 'center'
  },
  link: {
    color: '#667eea',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500
  }
};

// Mount React app
const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<Popup />);
}
