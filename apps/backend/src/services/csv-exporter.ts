import * as fs from 'fs';
import * as path from 'path';
import { TradeRecordRepo, DailyPnlRepo } from '../storage';
import { logger } from '../util/logger';

const MODULE = 'csv-export';
const DATA_DIR = path.resolve(__dirname, '../../../../data');

export function exportDailyTradesCSV(date?: string): string | null {
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const reportDir = path.join(DATA_DIR, 'reports');

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const trades = TradeRecordRepo.getAll(1000);
  const dayTrades = trades.filter((t) => {
    const d = new Date(t.entryTs).toISOString().slice(0, 10);
    return d === targetDate;
  });

  if (dayTrades.length === 0) {
    logger.debug(MODULE, 'No trades to export for ' + targetDate);
    return null;
  }

  const headers = [
    'id', 'ticker', 'side', 'entry_price', 'exit_price', 'qty',
    'entry_time', 'exit_time', 'gross_pnl', 'fees', 'net_pnl',
    'entry_reason', 'exit_reason', 'r_multiple',
  ];

  const lines = [headers.join(',')];
  for (const t of dayTrades) {
    lines.push([
      t.id, t.ticker, t.side, t.entryPrice, t.exitPrice, t.qty,
      new Date(t.entryTs).toISOString(), t.exitTs ? new Date(t.exitTs).toISOString() : '',
      t.grossPnl, t.fees, t.netPnl, t.reason, t.exitReason, t.rMultiple,
    ].join(','));
  }

  const filename = `trades_${targetDate.replace(/-/g, '')}.csv`;
  const filepath = path.join(reportDir, filename);
  fs.writeFileSync(filepath, lines.join('\n'));

  logger.info(MODULE, `Exported ${dayTrades.length} trades to ${filename}`);
  return filepath;
}

export function exportDailyPnlCSV(startDate: string, endDate: string): string | null {
  const reportDir = path.join(DATA_DIR, 'reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const pnlData = DailyPnlRepo.getRange(startDate, endDate);
  if (pnlData.length === 0) return null;

  const headers = ['date', 'realized', 'fees', 'net', 'trades', 'wins', 'losses', 'max_drawdown'];
  const lines = [headers.join(',')];

  for (const d of pnlData) {
    lines.push([
      d.date, d.realized, d.fees, d.net, d.trades, d.wins, d.losses, d.maxDrawdown,
    ].join(','));
  }

  const filename = `pnl_${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}.csv`;
  const filepath = path.join(reportDir, filename);
  fs.writeFileSync(filepath, lines.join('\n'));

  logger.info(MODULE, `Exported PnL data to ${filename}`);
  return filepath;
}
