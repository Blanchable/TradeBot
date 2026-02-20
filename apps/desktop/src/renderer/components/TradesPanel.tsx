import React, { useCallback, useState } from 'react';
import { usePolling } from '../hooks/usePolling';

export default function TradesPanel() {
  const [sortField, setSortField] = useState<string>('entryTs');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchTrades = useCallback(async () => {
    if (!window.api) return [];
    return window.api.trades.list();
  }, []);

  const { data: trades } = usePolling(fetchTrades, 5000);
  const items = Array.isArray(trades) ? [...trades] : [];

  items.sort((a: any, b: any) => {
    const av = a[sortField] ?? 0;
    const bv = b[sortField] ?? 0;
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
  });

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const totalNet = items.reduce((s: number, t: any) => s + (t.netPnl || 0), 0);
  const totalFees = items.reduce((s: number, t: any) => s + (t.fees || 0), 0);
  const wins = items.filter((t: any) => (t.netPnl || 0) > 0).length;
  const winRate = items.length > 0 ? ((wins / items.length) * 100).toFixed(1) : '--';

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th style={styles.th} onClick={() => toggleSort(field)}>
      {label}
      {sortField === field && (sortDir === 'asc' ? ' ^' : ' v')}
    </th>
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Trade History</h3>
        <div style={styles.summary}>
          <span>{items.length} trades</span>
          <span>Win Rate: {winRate}%</span>
          <span style={{ color: totalNet >= 0 ? '#4caf50' : '#f44336' }}>
            Net: ${totalNet.toFixed(2)}
          </span>
          <span style={{ color: '#ff9800' }}>Fees: ${(totalFees / 100).toFixed(2)}</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div style={styles.empty}>No trade history yet.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <SortHeader field="ticker" label="Ticker" />
              <SortHeader field="side" label="Side" />
              <SortHeader field="entryPrice" label="Entry" />
              <SortHeader field="exitPrice" label="Exit" />
              <SortHeader field="qty" label="Qty" />
              <SortHeader field="netPnl" label="Net P&L" />
              <SortHeader field="fees" label="Fees" />
              <SortHeader field="rMultiple" label="R" />
              <SortHeader field="exitReason" label="Exit Reason" />
              <SortHeader field="entryTs" label="Time" />
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 100).map((t: any, i: number) => (
              <tr key={t.id || i}>
                <td style={styles.td}><strong>{t.ticker}</strong></td>
                <td style={{
                  ...styles.td,
                  color: t.side === 'yes' ? '#4caf50' : '#f44336',
                }}>{t.side?.toUpperCase()}</td>
                <td style={styles.tdMono}>{t.entryPrice?.toFixed(1)}</td>
                <td style={styles.tdMono}>{t.exitPrice?.toFixed(1)}</td>
                <td style={styles.td}>{t.qty}</td>
                <td style={{
                  ...styles.tdMono,
                  color: (t.netPnl || 0) >= 0 ? '#4caf50' : '#f44336',
                  fontWeight: 600,
                }}>${(t.netPnl || 0).toFixed(2)}</td>
                <td style={styles.tdMono}>${((t.fees || 0) / 100).toFixed(2)}</td>
                <td style={styles.tdMono}>{(t.rMultiple || 0).toFixed(2)}</td>
                <td style={styles.td}>{t.exitReason}</td>
                <td style={styles.td}>{t.entryTs ? new Date(t.entryTs).toLocaleTimeString() : '--'}</td>
              </tr>
            ))}
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
    flexWrap: 'wrap',
    gap: 8,
  },
  title: { fontSize: 14, fontWeight: 600, color: '#64ffda' },
  summary: {
    display: 'flex',
    gap: 16,
    fontSize: 12,
    color: '#888',
  },
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
    cursor: 'pointer',
    userSelect: 'none',
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
  },
};
