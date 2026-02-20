import React, { useState } from 'react';

interface ControlsProps {
  botState: string;
  onStateChange: () => void;
}

export default function Controls({ botState, onStateChange }: ControlsProps) {
  const [loading, setLoading] = useState('');

  const handleAction = async (action: string) => {
    if (!window.api) return;
    setLoading(action);
    try {
      switch (action) {
        case 'start':
          await window.api.bot.start();
          break;
        case 'pause':
          await window.api.bot.pause();
          break;
        case 'stop':
          await window.api.bot.stop();
          break;
        case 'flatten':
          if (confirm('Are you sure you want to FLATTEN ALL positions?')) {
            await window.api.bot.flatten();
          }
          break;
        case 'safe':
          await window.api.bot.toggleSafeMode();
          break;
      }
      onStateChange();
    } catch (err) {
      console.error('Action failed:', err);
    } finally {
      setLoading('');
    }
  };

  return (
    <div style={styles.bar}>
      <button
        style={{
          ...styles.btn,
          ...styles.btnSuccess,
          opacity: botState === 'TRADING' ? 0.5 : 1,
        }}
        disabled={botState === 'TRADING' || loading === 'start'}
        onClick={() => handleAction('start')}
      >
        {loading === 'start' ? '...' : 'Start Bot'}
      </button>

      <button
        style={{
          ...styles.btn,
          ...styles.btnWarning,
          opacity: botState !== 'TRADING' ? 0.5 : 1,
        }}
        disabled={botState !== 'TRADING' || loading === 'pause'}
        onClick={() => handleAction('pause')}
      >
        {loading === 'pause' ? '...' : 'Pause'}
      </button>

      <button
        style={{
          ...styles.btn,
          ...styles.btnDanger,
          opacity: botState === 'INIT' || botState === 'STOPPING' ? 0.5 : 1,
        }}
        disabled={botState === 'INIT' || botState === 'STOPPING'}
        onClick={() => handleAction('stop')}
      >
        {loading === 'stop' ? '...' : 'Stop Bot'}
      </button>

      <div style={styles.divider} />

      <button
        style={{ ...styles.btn, ...styles.btnFlatten }}
        onClick={() => handleAction('flatten')}
      >
        {loading === 'flatten' ? '...' : 'Flatten All'}
      </button>

      <button
        style={{ ...styles.btn, ...styles.btnSafe }}
        onClick={() => handleAction('safe')}
      >
        Safe Mode
      </button>

      <button
        style={{ ...styles.btn, ...styles.btnReload }}
        onClick={() => window.api?.config.reload()}
      >
        Reload Config
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    background: '#1a1a2e',
    borderBottom: '1px solid #2a2a4a',
  },
  btn: {
    padding: '6px 16px',
    borderRadius: 4,
    border: '1px solid transparent',
    fontSize: 12,
    fontWeight: 600,
    color: '#fff',
    transition: 'all 0.2s',
  },
  btnSuccess: { background: '#2e7d32', borderColor: '#4caf50' },
  btnWarning: { background: '#e65100', borderColor: '#ff9800' },
  btnDanger: { background: '#c62828', borderColor: '#f44336' },
  btnFlatten: { background: '#880e4f', borderColor: '#e91e63' },
  btnSafe: { background: '#1565c0', borderColor: '#2196f3' },
  btnReload: { background: '#37474f', borderColor: '#607d8b' },
  divider: {
    width: 1,
    height: 24,
    background: '#2a2a4a',
    margin: '0 8px',
  },
};
