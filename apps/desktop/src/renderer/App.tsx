import React, { useState, useCallback, useEffect } from 'react';
import StatusBar from './components/StatusBar';
import Controls from './components/Controls';
import Dashboard from './components/Dashboard';
import PositionsPanel from './components/PositionsPanel';
import OrdersPanel from './components/OrdersPanel';
import MarketMonitor from './components/MarketMonitor';
import TradesPanel from './components/TradesPanel';
import SettingsPanel from './components/SettingsPanel';
import LogsViewer from './components/LogsViewer';
import CredentialSetup from './components/CredentialSetup';

type TabId = 'dashboard' | 'positions' | 'orders' | 'markets' | 'trades' | 'settings' | 'logs';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'positions', label: 'Positions' },
  { id: 'orders', label: 'Orders' },
  { id: 'markets', label: 'Markets' },
  { id: 'trades', label: 'Trades' },
  { id: 'settings', label: 'Settings' },
  { id: 'logs', label: 'Logs' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [botState, setBotState] = useState<string>('INIT');
  const [health, setHealth] = useState<any>(null);
  const [showCredentialSetup, setShowCredentialSetup] = useState(false);
  const [checkedCreds, setCheckedCreds] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      if (window.api) {
        const state = await window.api.bot.getState();
        setBotState(state?.state || 'INIT');
        const h = await window.api.health.status();
        setHealth(h);
      }
    } catch { /* API not available yet */ }
  }, []);

  useEffect(() => {
    checkCredentials();
    fetchState();
    const timer = setInterval(fetchState, 3000);
    return () => clearInterval(timer);
  }, [fetchState]);

  const checkCredentials = async () => {
    try {
      if (window.api) {
        const creds = await window.api.credentials.get();
        if (!creds.configured) {
          setShowCredentialSetup(true);
        }
      }
    } catch { /* will show setup on retry */ }
    setCheckedCreds(true);
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'positions': return <PositionsPanel />;
      case 'orders': return <OrdersPanel />;
      case 'markets': return <MarketMonitor />;
      case 'trades': return <TradesPanel />;
      case 'settings': return <SettingsPanel onOpenCredentials={() => setShowCredentialSetup(true)} />;
      case 'logs': return <LogsViewer />;
    }
  };

  return (
    <div style={styles.container}>
      <StatusBar botState={botState} health={health} />
      <Controls botState={botState} onStateChange={fetchState} />
      <div style={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tab,
              ...(activeTab === tab.id ? styles.tabActive : {}),
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div style={styles.content}>{renderTab()}</div>

      {showCredentialSetup && (
        <CredentialSetup onComplete={() => setShowCredentialSetup(false)} />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#0f0f1a',
  },
  tabBar: {
    display: 'flex',
    gap: 0,
    padding: '0 16px',
    background: '#1a1a2e',
    borderBottom: '1px solid #2a2a4a',
  },
  tab: {
    padding: '10px 20px',
    background: 'transparent',
    border: 'none',
    color: '#888',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: '#64ffda',
    borderBottomColor: '#64ffda',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: 16,
  },
};
