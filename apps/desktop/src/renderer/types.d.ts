interface Window {
  api: {
    bot: {
      getState: () => Promise<any>;
      start: () => Promise<any>;
      pause: () => Promise<any>;
      stop: () => Promise<any>;
      flatten: () => Promise<any>;
      toggleSafeMode: () => Promise<any>;
    };
    config: {
      get: () => Promise<any>;
      update: (config: any) => Promise<any>;
      reload: () => Promise<any>;
    };
    credentials: {
      get: () => Promise<{ apiKeyId: string; apiPrivateKey: string; env: string; configured: boolean }>;
      save: (creds: { apiKeyId: string; apiPrivateKey: string; env: string }) => Promise<{ success: boolean; error?: string }>;
      test: (creds?: { apiKeyId: string; apiPrivateKey: string; env: string }) => Promise<{ success: boolean; message: string }>;
      browseKeyFile: () => Promise<{ success: boolean; content: string; path?: string; error?: string }>;
    };
    positions: {
      list: () => Promise<any[]>;
      close: (ticker: string) => Promise<any>;
    };
    orders: {
      list: () => Promise<any[]>;
      cancel: (orderId: string) => Promise<any>;
    };
    markets: {
      list: () => Promise<any[]>;
    };
    pnl: {
      daily: () => Promise<any[]>;
      equity: () => Promise<any[]>;
    };
    trades: {
      list: () => Promise<any[]>;
    };
    health: {
      status: () => Promise<any>;
    };
    logs: {
      stream: () => Promise<any[]>;
    };
    backtest: {
      run: (params: any) => Promise<any>;
      status: () => Promise<any>;
    };
    openExternal: (url: string) => Promise<void>;
    on: (channel: string, callback: (...args: any[]) => void) => () => void;
  };
}
