import React, { useState, useEffect, useCallback } from 'react';

interface SettingsGroup {
  title: string;
  key: string;
  isRisk?: boolean;
  fields: Array<{
    key: string;
    label: string;
    type: 'number' | 'string' | 'boolean' | 'select';
    options?: string[];
    min?: number;
    max?: number;
    step?: number;
  }>;
}

const SETTINGS_SCHEMA: SettingsGroup[] = [
  {
    title: 'Market Universe',
    key: 'marketUniverse',
    fields: [
      { key: 'minVolume24h', label: 'Min Volume 24h', type: 'number', min: 0 },
      { key: 'minLiquidity', label: 'Min Liquidity', type: 'number', min: 0 },
      { key: 'minOpenInterest', label: 'Min Open Interest', type: 'number', min: 0 },
      { key: 'maxSpreadCents', label: 'Max Spread (cents)', type: 'number', min: 1, max: 50 },
      { key: 'maxMarketsTracked', label: 'Max Markets Tracked', type: 'number', min: 1, max: 100 },
      { key: 'scanIntervalSeconds', label: 'Scan Interval (sec)', type: 'number', min: 10 },
    ],
  },
  {
    title: 'Strategy',
    key: 'strategy',
    fields: [
      { key: 'emaFast', label: 'EMA Fast', type: 'number', min: 2 },
      { key: 'emaSlow', label: 'EMA Slow', type: 'number', min: 3 },
      { key: 'atrPeriod', label: 'ATR Period', type: 'number', min: 2 },
      { key: 'atrStopMultiplier', label: 'ATR Stop Multiplier', type: 'number', min: 0.5, step: 0.1 },
      { key: 'breakoutLookbackMinutes', label: 'Breakout Lookback (min)', type: 'number', min: 5 },
      { key: 'tapeConfirmMultiplier', label: 'Tape Confirm Multiplier', type: 'number', min: 1, step: 0.1 },
      { key: 'signalCooldownSeconds', label: 'Signal Cooldown (sec)', type: 'number', min: 0 },
    ],
  },
  {
    title: 'Execution',
    key: 'execution',
    fields: [
      { key: 'entryPatienceSeconds', label: 'Entry Patience (sec)', type: 'number', min: 5 },
      { key: 'cancelReplaceMaxCycles', label: 'Cancel/Replace Max Cycles', type: 'number', min: 1 },
      { key: 'maxSlippageCents', label: 'Max Slippage (cents)', type: 'number', min: 0 },
      { key: 'flattenOnDisconnect', label: 'Flatten on Disconnect', type: 'boolean' },
    ],
  },
  {
    title: 'Risk Parameters',
    key: 'risk',
    isRisk: true,
    fields: [
      { key: 'bankrollUSD', label: 'Bankroll (USD)', type: 'number', min: 10 },
      { key: 'maxRiskPerTradeUSD', label: 'Max Risk/Trade (USD)', type: 'number', min: 1 },
      { key: 'maxDailyLossUSD', label: 'Max Daily Loss (USD)', type: 'number', min: 1 },
      { key: 'maxConcurrentPositions', label: 'Max Concurrent Positions', type: 'number', min: 1, max: 50 },
      { key: 'cooldownAfterStopSeconds', label: 'Cooldown After Stop (sec)', type: 'number', min: 0 },
      { key: 'timeStopMinutes', label: 'Time Stop (min)', type: 'number', min: 1 },
      { key: 'partialTakePercent', label: 'Partial Take %', type: 'number', min: 10, max: 90 },
      { key: 'trailStopAtrMultiplier', label: 'Trail Stop ATR Multiplier', type: 'number', min: 0.5, step: 0.1 },
    ],
  },
  {
    title: 'Fee Model',
    key: 'feeModel',
    fields: [
      { key: 'feeSchedule', label: 'Fee Schedule', type: 'select', options: ['general', 'index_discount'] },
      { key: 'feeCoefficient', label: 'Fee Coefficient', type: 'number', min: 0, step: 0.001 },
    ],
  },
  {
    title: 'Telemetry',
    key: 'telemetry',
    fields: [
      { key: 'logLevel', label: 'Log Level', type: 'select', options: ['debug', 'info', 'warn', 'error'] },
      { key: 'persistLogsToDB', label: 'Persist Logs to DB', type: 'boolean' },
      { key: 'exportDailyCSV', label: 'Export Daily CSV', type: 'boolean' },
    ],
  },
];

export default function SettingsPanel() {
  const [config, setConfig] = useState<any>({});
  const [modified, setModified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingSave, setPendingSave] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      if (!window.api) {
        setLoadError('API bridge not available. Restart the app.');
        setLoading(false);
        return;
      }
      const c = await window.api.config.get();
      if (!c || Object.keys(c).length === 0) {
        setLoadError('Config returned empty. Check config/default.json exists.');
        setConfig({});
      } else {
        setConfig(c);
      }
    } catch (err: any) {
      setLoadError(`Failed to load config: ${err.message || err}`);
      setConfig({});
    }
    setModified(false);
    setLoading(false);
  };

  const handleChange = (group: string, field: string, value: any) => {
    setConfig((prev: any) => ({
      ...prev,
      [group]: { ...prev[group], [field]: value },
    }));
    setModified(true);
  };

  const handleSave = (isRiskGroup: boolean = false) => {
    if (isRiskGroup) {
      setShowConfirm(true);
      setPendingSave(config);
    } else {
      doSave(config);
    }
  };

  const doSave = async (cfg: any) => {
    if (!window.api) return;
    setSaving(true);
    await window.api.config.update(cfg);
    setSaving(false);
    setModified(false);
    setShowConfirm(false);
    setPendingSave(null);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Configuration</h3>
        <div style={styles.actions}>
          <button onClick={loadConfig} style={styles.btnSecondary}>Reset</button>
          <button
            onClick={() => handleSave(false)}
            style={{
              ...styles.btnPrimary,
              opacity: modified ? 1 : 0.5,
            }}
            disabled={!modified || saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ ...styles.confirmBar, borderColor: '#2196f3', background: '#0d47a1' }}>
          <span style={{ color: '#90caf9' }}>Loading configuration...</span>
        </div>
      )}

      {loadError && (
        <div style={{ ...styles.confirmBar, borderColor: '#f44336', background: '#4a0000' }}>
          <span style={{ color: '#ef9a9a' }}>{loadError}</span>
          <button onClick={loadConfig} style={styles.btnSecondary}>Retry</button>
        </div>
      )}

      {showConfirm && (
        <div style={styles.confirmBar}>
          <span style={{ color: '#ff9800' }}>
            You are modifying risk parameters. Confirm to apply changes.
          </span>
          <button onClick={() => doSave(pendingSave)} style={styles.btnDanger}>
            Confirm Risk Changes
          </button>
          <button onClick={() => setShowConfirm(false)} style={styles.btnSecondary}>
            Cancel
          </button>
        </div>
      )}

      <div style={styles.groups}>
        {SETTINGS_SCHEMA.map((group) => (
          <div key={group.key} style={styles.group}>
            <h4 style={styles.groupTitle}>
              {group.title}
              {group.isRisk && (
                <span style={styles.riskBadge}>RISK</span>
              )}
            </h4>
            <div style={styles.fields}>
              {group.fields.map((field) => {
                const value = config[group.key]?.[field.key] ?? '';
                return (
                  <div key={field.key} style={styles.field}>
                    <label style={styles.label}>{field.label}</label>
                    {field.type === 'boolean' ? (
                      <label style={styles.toggleContainer}>
                        <input
                          type="checkbox"
                          checked={!!value}
                          onChange={(e) =>
                            handleChange(group.key, field.key, e.target.checked)
                          }
                          style={styles.checkbox}
                        />
                        <span style={{ fontSize: 12, color: value ? '#4caf50' : '#888' }}>
                          {value ? 'Enabled' : 'Disabled'}
                        </span>
                      </label>
                    ) : field.type === 'select' ? (
                      <select
                        value={value}
                        onChange={(e) =>
                          handleChange(group.key, field.key, e.target.value)
                        }
                        style={styles.select}
                      >
                        {field.options?.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={value}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        onChange={(e) => {
                          const v = field.type === 'number'
                            ? parseFloat(e.target.value) || 0
                            : e.target.value;
                          handleChange(group.key, field.key, v);
                        }}
                        style={styles.input}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {group.isRisk && (
              <button
                onClick={() => handleSave(true)}
                style={{
                  ...styles.btnDanger,
                  marginTop: 8,
                  opacity: modified ? 1 : 0.5,
                }}
                disabled={!modified}
              >
                Save Risk Parameters (requires confirmation)
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { display: 'flex', flexDirection: 'column', gap: 16 },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { fontSize: 14, fontWeight: 600, color: '#64ffda' },
  actions: { display: 'flex', gap: 8 },
  confirmBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 16px',
    background: '#3e2723',
    borderRadius: 6,
    border: '1px solid #ff9800',
    fontSize: 13,
  },
  groups: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
    gap: 16,
  },
  group: {
    background: '#1a1a2e',
    borderRadius: 8,
    padding: 16,
    border: '1px solid #2a2a4a',
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#e0e0e0',
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  riskBadge: {
    background: '#c62828',
    color: '#fff',
    padding: '1px 6px',
    borderRadius: 3,
    fontSize: 9,
    fontWeight: 700,
  },
  fields: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  field: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: 12,
    color: '#888',
    minWidth: 160,
  },
  input: {
    width: 120,
    padding: '4px 8px',
    background: '#16213e',
    border: '1px solid #2a2a4a',
    borderRadius: 4,
    color: '#e0e0e0',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
  },
  select: {
    width: 120,
    padding: '4px 8px',
    background: '#16213e',
    border: '1px solid #2a2a4a',
    borderRadius: 4,
    color: '#e0e0e0',
    fontSize: 12,
  },
  toggleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    cursor: 'pointer',
  },
  checkbox: { cursor: 'pointer' },
  btnPrimary: {
    padding: '6px 16px',
    background: '#1565c0',
    border: '1px solid #2196f3',
    borderRadius: 4,
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSecondary: {
    padding: '6px 16px',
    background: '#37474f',
    border: '1px solid #607d8b',
    borderRadius: 4,
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
  },
  btnDanger: {
    padding: '6px 16px',
    background: '#c62828',
    border: '1px solid #f44336',
    borderRadius: 4,
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
