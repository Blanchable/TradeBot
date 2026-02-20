import React, { useCallback } from 'react';
import { usePolling } from '../hooks/usePolling';

export default function OrdersPanel() {
  const fetchOrders = useCallback(async () => {
    if (!window.api) return [];
    return window.api.orders.list();
  }, []);

  const { data: orders, refresh } = usePolling(fetchOrders, 3000);
  const items = Array.isArray(orders) ? orders : [];

  const handleCancel = async (orderId: string) => {
    if (!window.api) return;
    await window.api.orders.cancel(orderId);
    refresh();
  };

  const statusColor = (status: string): string => {
    switch (status) {
      case 'filled': return '#4caf50';
      case 'canceled': return '#888';
      case 'rejected': return '#f44336';
      case 'open':
      case 'pending': return '#2196f3';
      case 'partial': return '#ff9800';
      default: return '#888';
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Orders</h3>
        <span style={styles.count}>{items.length} total</span>
      </div>

      {items.length === 0 ? (
        <div style={styles.empty}>No orders to display.</div>
      ) : (
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Order ID</th>
              <th style={styles.th}>Ticker</th>
              <th style={styles.th}>Side</th>
              <th style={styles.th}>Action</th>
              <th style={styles.th}>Type</th>
              <th style={styles.th}>Price</th>
              <th style={styles.th}>Qty</th>
              <th style={styles.th}>Filled</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o: any) => (
              <tr key={o.orderId}>
                <td style={styles.td}>{(o.orderId || '').slice(0, 12)}...</td>
                <td style={styles.td}><strong>{o.ticker}</strong></td>
                <td style={{
                  ...styles.td,
                  color: o.side === 'yes' ? '#4caf50' : '#f44336',
                }}>{o.side?.toUpperCase()}</td>
                <td style={styles.td}>{o.action}</td>
                <td style={styles.td}>{o.type}</td>
                <td style={styles.tdMono}>{o.price}</td>
                <td style={styles.td}>{o.qty}</td>
                <td style={styles.td}>{o.filledQty || 0}</td>
                <td style={{ ...styles.td, color: statusColor(o.status) }}>
                  {o.status?.toUpperCase()}
                </td>
                <td style={styles.td}>
                  {['pending', 'open', 'partial'].includes(o.status) && (
                    <button
                      onClick={() => handleCancel(o.orderId)}
                      style={styles.cancelBtn}
                    >
                      Cancel
                    </button>
                  )}
                </td>
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
  },
  cancelBtn: {
    padding: '3px 10px',
    background: '#37474f',
    border: '1px solid #607d8b',
    borderRadius: 3,
    color: '#fff',
    fontSize: 11,
    cursor: 'pointer',
  },
};
