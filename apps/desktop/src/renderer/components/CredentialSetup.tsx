import React, { useState, useEffect } from 'react';

interface CredentialSetupProps {
  onComplete: () => void;
  forceShow?: boolean;
}

export default function CredentialSetup({ onComplete, forceShow }: CredentialSetupProps) {
  const [apiKeyId, setApiKeyId] = useState('');
  const [apiPrivateKey, setApiPrivateKey] = useState('');
  const [env, setEnv] = useState('demo');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    loadExisting();
  }, []);

  const loadExisting = async () => {
    if (!window.api) return;
    try {
      const creds = await window.api.credentials.get();
      if (creds.apiKeyId) setApiKeyId(creds.apiKeyId);
      if (creds.env) setEnv(creds.env);
    } catch { /* first run, no creds yet */ }
  };

  const handleSave = async () => {
    if (!window.api) return;
    if (!apiKeyId.trim()) {
      setError('API Key ID is required');
      return;
    }
    if (!apiPrivateKey.trim()) {
      setError('Private Key is required');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const result = await window.api.credentials.save({
        apiKeyId: apiKeyId.trim(),
        apiPrivateKey: apiPrivateKey.trim(),
        env,
      });
      if (result.success) {
        onComplete();
      } else {
        setError(result.error || 'Failed to save credentials');
      }
    } catch (err: any) {
      setError(err.message || 'Save failed');
    }
    setSaving(false);
  };

  const handleTest = async () => {
    if (!window.api) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.api.credentials.test();
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Test failed' });
    }
    setTesting(false);
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Kalshi API Setup</h2>
          <p style={styles.subtitle}>
            Enter your Kalshi API credentials to connect the bot.
            Get your keys from{' '}
            <span
              style={styles.link}
              onClick={() => window.api?.openExternal('https://kalshi.com/account/api-keys')}
            >
              kalshi.com/account/api-keys
            </span>
          </p>
        </div>

        <div style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Environment</label>
            <div style={styles.envToggle}>
              <button
                onClick={() => setEnv('demo')}
                style={{
                  ...styles.envBtn,
                  ...(env === 'demo' ? styles.envBtnActive : {}),
                }}
              >
                Demo (Paper Trading)
              </button>
              <button
                onClick={() => setEnv('prod')}
                style={{
                  ...styles.envBtn,
                  ...(env === 'prod' ? styles.envBtnActiveDanger : {}),
                }}
              >
                Production (Real Money)
              </button>
            </div>
            {env === 'prod' && (
              <p style={styles.warning}>
                Production mode uses real money. Start with Demo to test first.
              </p>
            )}
          </div>

          <div style={styles.field}>
            <label style={styles.label}>API Key ID</label>
            <input
              type="text"
              value={apiKeyId}
              onChange={(e) => { setApiKeyId(e.target.value); setError(null); }}
              placeholder="Paste your API key ID here"
              style={styles.input}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>
              Private Key
              <button
                onClick={() => setShowKey(!showKey)}
                style={styles.toggleBtn}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </label>
            <textarea
              value={apiPrivateKey}
              onChange={(e) => { setApiPrivateKey(e.target.value); setError(null); }}
              placeholder="Paste your private key here (base64 encoded)"
              style={{
                ...styles.input,
                ...styles.textarea,
                ...(!showKey && apiPrivateKey ? { color: '#1a1a2e', textShadow: '0 0 8px #64ffda' } : {}),
              }}
              spellCheck={false}
              autoComplete="off"
              rows={3}
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          {testResult && (
            <div style={{
              ...styles.testResult,
              borderColor: testResult.success ? '#4caf50' : '#f44336',
              background: testResult.success ? '#1b3a1b' : '#3a1b1b',
            }}>
              {testResult.success ? 'Connected' : 'Failed'}: {testResult.message}
            </div>
          )}
        </div>

        <div style={styles.actions}>
          <button onClick={handleSkip} style={styles.btnSkip}>
            Skip for now
          </button>
          <div style={styles.rightActions}>
            <button
              onClick={handleTest}
              disabled={testing}
              style={styles.btnTest}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !apiKeyId.trim() || !apiPrivateKey.trim()}
              style={{
                ...styles.btnSave,
                opacity: (!apiKeyId.trim() || !apiPrivateKey.trim()) ? 0.5 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    background: '#1a1a2e',
    borderRadius: 12,
    border: '1px solid #2a2a4a',
    padding: 32,
    width: '100%',
    maxWidth: 560,
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  },
  header: { marginBottom: 24 },
  title: {
    fontSize: 22,
    fontWeight: 700,
    color: '#64ffda',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    margin: 0,
    lineHeight: '1.5',
  },
  link: {
    color: '#64ffda',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: '#ccc',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  input: {
    padding: '10px 14px',
    background: '#0f0f1a',
    border: '1px solid #2a2a4a',
    borderRadius: 6,
    color: '#e0e0e0',
    fontSize: 14,
    fontFamily: "'Fira Code', 'Cascadia Code', monospace",
    outline: 'none',
    transition: 'border-color 0.2s',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    resize: 'vertical' as const,
    minHeight: 60,
    lineHeight: '1.4',
  },
  envToggle: {
    display: 'flex',
    gap: 8,
  },
  envBtn: {
    flex: 1,
    padding: '8px 16px',
    background: '#16213e',
    border: '1px solid #2a2a4a',
    borderRadius: 6,
    color: '#888',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  envBtnActive: {
    background: '#1b3a1b',
    borderColor: '#4caf50',
    color: '#4caf50',
  },
  envBtnActiveDanger: {
    background: '#3a1b1b',
    borderColor: '#f44336',
    color: '#f44336',
  },
  warning: {
    fontSize: 11,
    color: '#f44336',
    margin: '4px 0 0 0',
    fontStyle: 'italic' as const,
  },
  toggleBtn: {
    background: 'none',
    border: 'none',
    color: '#64ffda',
    fontSize: 11,
    cursor: 'pointer',
    padding: 0,
  },
  error: {
    padding: '8px 12px',
    background: '#3a1b1b',
    border: '1px solid #f44336',
    borderRadius: 6,
    color: '#ef9a9a',
    fontSize: 12,
  },
  testResult: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: 12,
    color: '#e0e0e0',
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
  },
  rightActions: {
    display: 'flex',
    gap: 8,
  },
  btnSkip: {
    padding: '8px 16px',
    background: 'transparent',
    border: '1px solid #2a2a4a',
    borderRadius: 6,
    color: '#888',
    fontSize: 12,
    cursor: 'pointer',
  },
  btnTest: {
    padding: '8px 20px',
    background: '#16213e',
    border: '1px solid #2196f3',
    borderRadius: 6,
    color: '#2196f3',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSave: {
    padding: '8px 24px',
    background: '#2e7d32',
    border: '1px solid #4caf50',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
};
