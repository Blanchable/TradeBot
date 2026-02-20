import React, { useState, useEffect } from 'react';

interface CredentialSetupProps {
  onComplete: () => void;
}

export default function CredentialSetup({ onComplete }: CredentialSetupProps) {
  const [apiKeyId, setApiKeyId] = useState('');
  const [privateKeyPem, setPrivateKeyPem] = useState('');
  const [keyFileName, setKeyFileName] = useState('');
  const [env, setEnv] = useState('demo');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadExisting();
  }, []);

  const loadExisting = async () => {
    if (!window.api) return;
    try {
      const creds = await window.api.credentials.get();
      if (creds.apiKeyId) setApiKeyId(creds.apiKeyId);
      if (creds.env) setEnv(creds.env);
      if (creds.configured) setKeyFileName('(saved key on file)');
    } catch {}
  };

  const handleBrowseKey = async () => {
    if (!window.api) return;
    setError(null);
    setTestResult(null);
    const result = await window.api.credentials.browseKeyFile();
    if (!result.success) {
      if (result.error) setError(`Could not read file: ${result.error}`);
      return;
    }
    const content = result.content;
    if (!content.includes('PRIVATE KEY')) {
      setError('This file does not look like a PEM private key. It should start with -----BEGIN RSA PRIVATE KEY----- or -----BEGIN PRIVATE KEY-----');
      return;
    }
    setPrivateKeyPem(content);
    setKeyFileName(result.path?.split(/[/\\]/).pop() || 'key loaded');
  };

  const handleSave = async () => {
    if (!window.api) return;
    if (!apiKeyId.trim()) { setError('API Key ID is required'); return; }
    if (!privateKeyPem.trim()) { setError('Select your private key file first'); return; }

    setSaving(true);
    setError(null);
    try {
      const result = await window.api.credentials.save({
        apiKeyId: apiKeyId.trim(),
        apiPrivateKey: privateKeyPem.trim(),
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
    if (!apiKeyId.trim()) { setTestResult({ success: false, message: 'Enter your API Key ID first' }); return; }
    if (!privateKeyPem.trim()) { setTestResult({ success: false, message: 'Select your private key file first' }); return; }

    setTesting(true);
    setTestResult(null);
    try {
      const result = await window.api.credentials.test({
        apiKeyId: apiKeyId.trim(),
        apiPrivateKey: privateKeyPem.trim(),
        env,
      });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'Test failed' });
    }
    setTesting(false);
  };

  const keyLoaded = !!privateKeyPem;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>Kalshi API Setup</h2>
          <p style={styles.subtitle}>
            Connect your Kalshi account. You need your API Key ID and the
            private key <code>.key</code> file you downloaded from{' '}
            <span style={styles.link} onClick={() => window.api?.openExternal('https://kalshi.com/account/api-keys')}>
              kalshi.com/account/api-keys
            </span>
          </p>
        </div>

        <div style={styles.form}>
          {/* Step 1: Environment */}
          <div style={styles.step}>
            <div style={styles.stepLabel}>1. Environment</div>
            <div style={styles.envToggle}>
              <button onClick={() => setEnv('demo')} style={{ ...styles.envBtn, ...(env === 'demo' ? styles.envBtnActive : {}) }}>
                Demo (Paper)
              </button>
              <button onClick={() => setEnv('prod')} style={{ ...styles.envBtn, ...(env === 'prod' ? styles.envBtnActiveDanger : {}) }}>
                Production (Real $)
              </button>
            </div>
            {env === 'prod' && <p style={styles.warning}>Real money. Start with Demo first.</p>}
          </div>

          {/* Step 2: API Key ID */}
          <div style={styles.step}>
            <div style={styles.stepLabel}>2. API Key ID</div>
            <input
              type="text"
              value={apiKeyId}
              onChange={(e) => { setApiKeyId(e.target.value); setError(null); }}
              placeholder="e.g. a952bcbe-ec3b-4b5b-b8f9-11dae589608c"
              style={styles.input}
              spellCheck={false}
              autoComplete="off"
            />
          </div>

          {/* Step 3: Private Key File */}
          <div style={styles.step}>
            <div style={styles.stepLabel}>3. Private Key File</div>
            <button onClick={handleBrowseKey} style={styles.browseBtn}>
              {keyLoaded ? 'Change Key File...' : 'Browse for .key file...'}
            </button>
            {keyFileName && (
              <div style={styles.keyStatus}>
                <span style={{ color: keyLoaded ? '#4caf50' : '#888' }}>
                  {keyLoaded ? '\u2713' : '\u25CB'}{' '}
                </span>
                <span style={{ color: keyLoaded ? '#4caf50' : '#888' }}>
                  {keyFileName}
                </span>
                {keyLoaded && privateKeyPem.includes('RSA PRIVATE KEY') && (
                  <span style={styles.keyType}>RSA (PKCS#1)</span>
                )}
                {keyLoaded && privateKeyPem.includes('BEGIN PRIVATE KEY') && !privateKeyPem.includes('RSA') && (
                  <span style={styles.keyType}>PKCS#8</span>
                )}
              </div>
            )}
            <p style={styles.hint}>
              This is the <code>.key</code> file downloaded when you created your API key on Kalshi.
              It starts with <code>-----BEGIN RSA PRIVATE KEY-----</code>
            </p>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          {testResult && (
            <div style={{
              ...styles.result,
              borderColor: testResult.success ? '#4caf50' : '#f44336',
              background: testResult.success ? '#1b3a1b' : '#3a1b1b',
            }}>
              <strong>{testResult.success ? 'Success!' : 'Failed:'}</strong>{' '}
              {testResult.message}
            </div>
          )}
        </div>

        <div style={styles.actions}>
          <button onClick={onComplete} style={styles.btnSkip}>Skip for now</button>
          <div style={styles.rightActions}>
            <button onClick={handleTest} disabled={testing || !apiKeyId || !keyLoaded} style={{
              ...styles.btnTest, opacity: (!apiKeyId || !keyLoaded) ? 0.4 : 1
            }}>
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button onClick={handleSave} disabled={saving || !apiKeyId || !keyLoaded} style={{
              ...styles.btnSave, opacity: (!apiKeyId || !keyLoaded) ? 0.4 : 1
            }}>
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
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0, 0, 0, 0.85)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  },
  modal: {
    background: '#1a1a2e', borderRadius: 12, border: '1px solid #2a2a4a',
    padding: 32, width: '100%', maxWidth: 540,
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  },
  header: { marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: '#64ffda', margin: '0 0 8px 0' },
  subtitle: { fontSize: 13, color: '#888', margin: 0, lineHeight: '1.5' },
  link: { color: '#64ffda', cursor: 'pointer', textDecoration: 'underline' },
  form: { display: 'flex', flexDirection: 'column', gap: 20 },
  step: { display: 'flex', flexDirection: 'column', gap: 8 },
  stepLabel: {
    fontSize: 13, fontWeight: 700, color: '#e0e0e0',
    letterSpacing: 0.3,
  },
  input: {
    padding: '10px 14px', background: '#0f0f1a', border: '1px solid #2a2a4a',
    borderRadius: 6, color: '#e0e0e0', fontSize: 14,
    fontFamily: "'Fira Code', 'Cascadia Code', monospace",
    outline: 'none', width: '100%', boxSizing: 'border-box' as const,
  },
  browseBtn: {
    padding: '12px 20px', background: '#16213e', border: '2px dashed #3f51b5',
    borderRadius: 8, color: '#90caf9', fontSize: 14, fontWeight: 600,
    cursor: 'pointer', textAlign: 'center' as const, transition: 'all 0.2s',
    width: '100%',
  },
  keyStatus: {
    display: 'flex', alignItems: 'center', gap: 6,
    fontSize: 13, padding: '4px 0',
  },
  keyType: {
    fontSize: 10, color: '#888', background: '#16213e',
    padding: '1px 6px', borderRadius: 3, marginLeft: 6,
  },
  hint: { fontSize: 11, color: '#666', margin: 0, lineHeight: '1.4' },
  envToggle: { display: 'flex', gap: 8 },
  envBtn: {
    flex: 1, padding: '8px 16px', background: '#16213e', border: '1px solid #2a2a4a',
    borderRadius: 6, color: '#888', fontSize: 12, fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.2s',
  },
  envBtnActive: { background: '#1b3a1b', borderColor: '#4caf50', color: '#4caf50' },
  envBtnActiveDanger: { background: '#3a1b1b', borderColor: '#f44336', color: '#f44336' },
  warning: { fontSize: 11, color: '#f44336', margin: 0, fontStyle: 'italic' as const },
  error: {
    padding: '10px 14px', background: '#3a1b1b', border: '1px solid #f44336',
    borderRadius: 6, color: '#ef9a9a', fontSize: 12,
  },
  result: {
    padding: '10px 14px', borderRadius: 6, border: '1px solid',
    fontSize: 13, color: '#e0e0e0',
  },
  actions: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 24,
  },
  rightActions: { display: 'flex', gap: 8 },
  btnSkip: {
    padding: '8px 16px', background: 'transparent', border: '1px solid #2a2a4a',
    borderRadius: 6, color: '#888', fontSize: 12, cursor: 'pointer',
  },
  btnTest: {
    padding: '8px 20px', background: '#16213e', border: '1px solid #2196f3',
    borderRadius: 6, color: '#2196f3', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  btnSave: {
    padding: '8px 24px', background: '#2e7d32', border: '1px solid #4caf50',
    borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
};
