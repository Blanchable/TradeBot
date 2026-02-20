import React, { useCallback, useState } from 'react';
import { usePolling } from '../hooks/usePolling';

export default function LogsViewer() {
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');

  const fetchLogs = useCallback(async () => {
    if (!window.api) return [];
    return window.api.logs.stream();
  }, []);

  const { data: logs } = usePolling(fetchLogs, 2000);
  const items = Array.isArray(logs) ? logs : [];

  const filteredLogs = items.filter((l: any) => {
    if (levelFilter !== 'all' && l.level !== levelFilter) return false;
    if (moduleFilter !== 'all' && l.module !== moduleFilter) return false;
    return true;
  });

  const modules = Array.from(new Set(items.map((l: any) => l.module))).sort();

  const levelColor = (level: string): string => {
    switch (level) {
      case 'debug': return '#888';
      case 'info': return '#2196f3';
      case 'warn': return '#ff9800';
      case 'error': return '#f44336';
      default: return '#888';
    }
  };

  const handleExport = () => {
    const text = filteredLogs
      .map((l: any) =>
        `[${new Date(l.ts).toISOString()}] [${l.level}] [${l.module}] ${l.message}${l.data_json ? ' ' + l.data_json : ''}`
      )
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Logs</h3>
        <div style={styles.filters}>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            style={styles.select}
          >
            <option value="all">All Levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            style={styles.select}
          >
            <option value="all">All Modules</option>
            {modules.map((m: string) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button onClick={handleExport} style={styles.exportBtn}>
            Export Logs
          </button>
        </div>
      </div>

      <div style={styles.logArea}>
        {filteredLogs.length === 0 ? (
          <div style={styles.empty}>No logs to display.</div>
        ) : (
          filteredLogs.slice(0, 500).map((l: any, i: number) => (
            <div key={i} style={styles.logLine}>
              <span style={styles.logTime}>
                {new Date(l.ts).toLocaleTimeString()}
              </span>
              <span style={{ ...styles.logLevel, color: levelColor(l.level) }}>
                {l.level.toUpperCase().padEnd(5)}
              </span>
              <span style={styles.logModule}>[{l.module}]</span>
              <span style={styles.logMessage}>{l.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: 'calc(100vh - 180px)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 14, fontWeight: 600, color: '#64ffda' },
  filters: { display: 'flex', gap: 8 },
  select: {
    padding: '4px 8px',
    background: '#16213e',
    border: '1px solid #2a2a4a',
    borderRadius: 4,
    color: '#e0e0e0',
    fontSize: 12,
  },
  exportBtn: {
    padding: '4px 12px',
    background: '#37474f',
    border: '1px solid #607d8b',
    borderRadius: 4,
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
  },
  logArea: {
    flex: 1,
    background: '#0a0a14',
    borderRadius: 6,
    padding: 12,
    overflow: 'auto',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    lineHeight: '18px',
    border: '1px solid #2a2a4a',
  },
  empty: { color: '#666', textAlign: 'center', padding: 30 },
  logLine: {
    display: 'flex',
    gap: 8,
    padding: '1px 0',
    whiteSpace: 'nowrap',
  },
  logTime: { color: '#555', minWidth: 70 },
  logLevel: { fontWeight: 600, minWidth: 45 },
  logModule: { color: '#64ffda', minWidth: 100 },
  logMessage: { color: '#e0e0e0' },
};
