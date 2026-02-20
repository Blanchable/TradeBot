import React, { useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';

export default function MarketMonitor() {
  const fetchMarkets = useCallback(async () => {
    if (!window.api) return [];
    return window.api.markets.list();
  }, []);

  const { data: markets } = usePolling(fetchMarkets, 5000);
  const items = Array.isArray(markets) ? markets : [];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Market Monitor</h3>
        <span style={styles.count}>{items.length} tracked</span>
      </div>

      {items.length === 0 ? (
        <div style={styles.empty}>
          No markets tracked yet. Start the bot to begin scanning.
        </div>
      ) : (
        <div style={styles.grid}>
          {items.map((m: any) => (
            <div key={m.ticker} style={styles.card}>
              <div style={styles.cardHeader}>
                <strong style={styles.ticker}>{m.ticker}</strong>
                <span style={{
                  fontSize: 11,
                  color: m.score > 5 ? '#4caf50' : m.score > 2 ? '#ff9800' : '#888',
                }}>
                  Score: {(m.score || 0).toFixed(1)}
                </span>
              </div>
              <div style={styles.cardMetrics}>
                <div style={styles.metric}>
                  <span style={styles.metricLabel}>Spread</span>
                  <span style={{
                    ...styles.metricValue,
                    color: (m.spreadCents || 0) <= 5 ? '#4caf50' : '#ff9800',
                  }}>{m.spreadCents || '--'}c</span>
                </div>
                <div style={styles.metric}>
                  <span style={styles.metricLabel}>Vol 24h</span>
                  <span style={styles.metricValue}>{m.volume24h || '--'}</span>
                </div>
                <div style={styles.metric}>
                  <span style={styles.metricLabel}>Liquidity</span>
                  <span style={styles.metricValue}>{m.liquidity || '--'}</span>
                </div>
                <div style={styles.metric}>
                  <span style={styles.metricLabel}>OI</span>
                  <span style={styles.metricValue}>{m.openInterest || '--'}</span>
                </div>
                <div style={styles.metric}>
                  <span style={styles.metricLabel}>Close</span>
                  <span style={styles.metricValue}>{m.minutesToClose ? `${Math.floor(m.minutesToClose)}m` : '--'}</span>
                </div>
              </div>
              <div style={styles.miniChart}>
                <span style={{ color: '#555', fontSize: 11 }}>Signal analysis active</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#1a1a2e',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #2a2a4a',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 14, fontWeight: 600, color: '#64ffda' },
  count: { fontSize: 12, color: '#888' },
  empty: { color: '#666', fontSize: 13, padding: 30, textAlign: 'center' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 12,
  },
  card: {
    background: '#16213e',
    borderRadius: 6,
    padding: 12,
    border: '1px solid #2a2a4a',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  ticker: { fontSize: 13, color: '#64ffda' },
  cardMetrics: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
    marginBottom: 8,
  },
  metric: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  metricLabel: { fontSize: 10, color: '#888', textTransform: 'uppercase' },
  metricValue: {
    fontSize: 13,
    color: '#e0e0e0',
    fontFamily: 'var(--font-mono)',
  },
  miniChart: {
    height: 40,
    background: '#0f0f1a',
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
