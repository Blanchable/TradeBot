import React, { useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';

export default function PositionsPanel() {
  const fetchPositions = useCallback(async () => {
    if (!window.api) return [];
    return window.api.positions.list();
  }, []);

  const { data: positions, refresh } = usePolling(fetchPositions, 2000);
  const items = Array.isArray(positions) ? positions : [];

  const handleClose = async (ticker: string) => {
    if (!window.api) return;
    if (confirm(`Close position on ${ticker}?`)) {
      await window.api.positions.close(ticker);
      refresh();
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Live Positions</h3>
        <span style={styles.count}>{items.length} open</span>
      </div>

      {items.length === 0 ? (
        <div style={styles.empty}>No open positions.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Ticker</th>
              <th style={styles.th}>Side</th>
              <th style={styles.th}>Qty</th>
              <th style={styles.th}>Avg Price</th>
              <th style={styles.th}>Current</th>
              <th style={styles.th}>Unrealized</th>
              <th style={styles.th}>Realized</th>
              <th style={styles.th}>Stop</th>
              <th style={styles.th}>TP1</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p: any) => {
              const unrealColor = (p.unrealizedPnl || 0) >= 0 ? '#4caf50' : '#f44336';
              return (
                <tr key={p.ticker}>
                  <td style={styles.td}><strong>{p.ticker}</strong></td>
                  <td style={{
                    ...styles.td,
                    color: p.side === 'yes' ? '#4caf50' : '#f44336',
                  }}>{p.side?.toUpperCase()}</td>
                  <td style={styles.td}>{p.qty}</td>
                  <td style={styles.tdMono}>{p.avgPrice?.toFixed(1)}</td>
                  <td style={styles.tdMono}>{p.currentPrice?.toFixed(1)}</td>
                  <td style={{ ...styles.tdMono, color: unrealColor }}>
                    ${((p.unrealizedPnl || 0) / 100).toFixed(2)}
                  </td>
                  <td style={styles.tdMono}>
                    ${((p.realizedPnl || 0) / 100).toFixed(2)}
                  </td>
                  <td style={{ ...styles.tdMono, color: '#f44336' }}>
                    {p.stopPrice?.toFixed(1)}
                  </td>
                  <td style={{ ...styles.tdMono, color: '#4caf50' }}>
                    {p.tp1Price?.toFixed(1)}
                  </td>
                  <td style={styles.td}>
                    <button
                      onClick={() => handleClose(p.ticker)}
                      style={styles.closeBtn}
                    >
                      Close
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
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
    marginBottom: 12,
  },
  title: { fontSize: 14, fontWeight: 600, color: '#64ffda' },
  count: { fontSize: 12, color: '#888' },
  empty: { color: '#666', fontSize: 13, padding: 30, textAlign: 'center' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    padding: '8px 10px',
    borderBottom: '1px solid #2a2a4a',
    color: '#888',
    fontWeight: 600,
    textAlign: 'left',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid #16213e',
    color: '#e0e0e0',
  },
  tdMono: {
    padding: '8px 10px',
    borderBottom: '1px solid #16213e',
    color: '#e0e0e0',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
  },
  closeBtn: {
    padding: '3px 10px',
    background: '#c62828',
    border: '1px solid #f44336',
    borderRadius: 3,
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
