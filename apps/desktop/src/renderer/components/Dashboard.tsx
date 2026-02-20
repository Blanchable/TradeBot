import React, { useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';

interface MetricCardProps {
  label: string;
  value: string;
  color?: string;
  subtext?: string;
}

function MetricCard({ label, value, color, subtext }: MetricCardProps) {
  return (
    <div style={cardStyles.card}>
      <div style={{ ...cardStyles.value, color: color || '#64ffda' }}>{value}</div>
      <div style={cardStyles.label}>{label}</div>
      {subtext && <div style={cardStyles.subtext}>{subtext}</div>}
    </div>
  );
}

const cardStyles: Record<string, React.CSSProperties> = {
  card: {
    background: '#1a1a2e',
    borderRadius: 8,
    padding: '16px 20px',
    border: '1px solid #2a2a4a',
    minWidth: 140,
  },
  value: {
    fontSize: 24,
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
  },
  label: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  subtext: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
};

export default function Dashboard() {
  const fetchPnl = useCallback(async () => {
    if (!window.api) return [];
    return window.api.pnl.daily();
  }, []);

  const fetchTrades = useCallback(async () => {
    if (!window.api) return [];
    return window.api.trades.list();
  }, []);

  const fetchPositions = useCallback(async () => {
    if (!window.api) return [];
    return window.api.positions.list();
  }, []);

  const { data: pnlData } = usePolling(fetchPnl, 5000);
  const { data: trades } = usePolling(fetchTrades, 5000);
  const { data: positions } = usePolling(fetchPositions, 3000);

  const todayPnl = Array.isArray(pnlData) && pnlData.length > 0 ? pnlData[pnlData.length - 1] : null;

  const netPnl = todayPnl?.net ? (todayPnl.net / 100).toFixed(2) : '0.00';
  const totalFees = todayPnl?.fees ? (todayPnl.fees / 100).toFixed(2) : '0.00';
  const tradeCount = todayPnl?.trades || 0;
  const wins = todayPnl?.wins || 0;
  const losses = todayPnl?.losses || 0;
  const winRate = tradeCount > 0 ? ((wins / tradeCount) * 100).toFixed(1) : '--';
  const openPositions = Array.isArray(positions) ? positions.length : 0;

  const netColor = parseFloat(netPnl) >= 0 ? '#4caf50' : '#f44336';

  const tradesList = Array.isArray(trades) ? trades.slice(0, 10) : [];

  return (
    <div style={styles.container}>
      <div style={styles.metrics}>
        <MetricCard label="Today Net P&L" value={`$${netPnl}`} color={netColor} />
        <MetricCard label="Trades Today" value={String(tradeCount)} />
        <MetricCard label="Win Rate" value={`${winRate}%`} color="#64ffda" />
        <MetricCard label="Total Fees" value={`$${totalFees}`} color="#ff9800" />
        <MetricCard label="Open Positions" value={String(openPositions)} color="#2196f3" />
        <MetricCard label="W / L" value={`${wins} / ${losses}`} />
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Equity Curve</h3>
        <div style={styles.chartPlaceholder}>
          <span style={{ color: '#666' }}>
            Equity chart updates when trades are recorded.
            Connect to Kalshi and start trading to see live data.
          </span>
        </div>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Recent Trades</h3>
        {tradesList.length === 0 ? (
          <div style={styles.empty}>No trades yet. Start the bot to begin trading.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Ticker</th>
                <th style={styles.th}>Side</th>
                <th style={styles.th}>Entry</th>
                <th style={styles.th}>Exit</th>
                <th style={styles.th}>Qty</th>
                <th style={styles.th}>Net P&L</th>
                <th style={styles.th}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {tradesList.map((t: any, i: number) => (
                <tr key={i}>
                  <td style={styles.td}>{t.ticker}</td>
                  <td style={styles.td}>{t.side}</td>
                  <td style={styles.td}>{t.entryPrice}</td>
                  <td style={styles.td}>{t.exitPrice}</td>
                  <td style={styles.td}>{t.qty}</td>
                  <td
                    style={{
                      ...styles.td,
                      color: t.netPnl >= 0 ? '#4caf50' : '#f44336',
                      fontWeight: 600,
                    }}
                  >
                    ${(t.netPnl || 0).toFixed(2)}
                  </td>
                  <td style={styles.td}>{t.exitReason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 16 },
  metrics: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  section: {
    background: '#1a1a2e',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #2a2a4a',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#64ffda',
    marginBottom: 12,
  },
  chartPlaceholder: {
    height: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#16213e',
    borderRadius: 6,
    fontSize: 13,
  },
  empty: { color: '#666', fontSize: 13, padding: 20, textAlign: 'center' },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
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
    borderBottom: '1px solid #1a1a2e',
    color: '#e0e0e0',
  },
};
