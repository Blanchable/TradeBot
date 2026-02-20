export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface LogEntry {
  ts: number;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
}

type LogListener = (entry: LogEntry) => void;

class Logger {
  private minLevel: LogLevel = 'info';
  private listeners: LogListener[] = [];

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  onLog(listener: LogListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(
    level: LogLevel,
    module: string,
    message: string,
    data?: Record<string, unknown>
  ): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;

    const entry: LogEntry = { ts: Date.now(), level, module, message, data };

    const time = new Date(entry.ts).toISOString();
    const prefix = `[${time}] [${level.toUpperCase().padEnd(5)}] [${module}]`;
    const extra = data ? ` ${JSON.stringify(data)}` : '';
    const consoleLine = `${prefix} ${message}${extra}`;

    switch (level) {
      case 'debug':
        console.debug(consoleLine);
        break;
      case 'info':
        console.info(consoleLine);
        break;
      case 'warn':
        console.warn(consoleLine);
        break;
      case 'error':
        console.error(consoleLine);
        break;
    }

    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch {
        // don't let log listeners crash the logger
      }
    }
  }

  debug(module: string, message: string, data?: Record<string, unknown>): void {
    this.emit('debug', module, message, data);
  }

  info(module: string, message: string, data?: Record<string, unknown>): void {
    this.emit('info', module, message, data);
  }

  warn(module: string, message: string, data?: Record<string, unknown>): void {
    this.emit('warn', module, message, data);
  }

  error(module: string, message: string, data?: Record<string, unknown>): void {
    this.emit('error', module, message, data);
  }
}

export const logger = new Logger();
