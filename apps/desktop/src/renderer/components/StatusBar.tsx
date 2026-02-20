import React from 'react';

interface StatusBarProps {
  botState: string;
  health: any;
}

const stateColors: Record<string, string> = {
  INIT: '#888',
  CONNECTING: '#ff9800',
  READY: '#2196f3',
  TRADING: '#4caf50',
  PAUSED: '#ff9800',
  STOPPING: '#f44336',
  ERROR: '#f44336',
};

export default function StatusBar({ botState, health }: StatusBarProps) {
  const wsStatus = health?.wsConnected ? 'Connected' : 'Disconnected';
  const wsColor = health?.wsConnected ? '#4caf50' : '#f44336';

  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        <span style={styles.title}>Kalshi Trend Trader</span>
        <div style={styles.statusGroup}>
          <div
            style={{ ...styles.dot, backgroundColor: stateColors[botState] || '#888' }}
          />
          <span style={{ color: stateColors[botState] || '#888', fontWeight: 600 }}>
            {botState}
          </span>
        </div>
        <div style={styles.statusGroup}>
          <div style={{ ...styles.dot, backgroundColor: wsColor }} />
          <span style={{ color: wsColor, fontSize: 12 }}>{wsStatus}</span>
        </div>
      </div>
      <div style={styles.right}>
        {health?.killSwitchActive && (
          <span style={styles.killSwitch}>KILL SWITCH ACTIVE</span>
        )}
        <span style={styles.uptime}>
          Uptime: {health?.uptime ? formatUptime(health.uptime) : '--'}
        </span>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    background: '#16213e',
    borderBottom: '1px solid #2a2a4a',
    minHeight: 40,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: 700,
    color: '#64ffda',
    letterSpacing: 0.5,
  },
  statusGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  killSwitch: {
    background: '#f44336',
    color: '#fff',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 700,
  },
  uptime: {
    fontSize: 12,
    color: '#888',
  },
};
