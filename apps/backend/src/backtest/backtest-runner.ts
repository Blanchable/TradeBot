import {
  Candle, Signal, BacktestResult, TradeRecord, AppConfig,
  computeFeeCentsPerContract, passesMinimumMove,
} from '@kalshi-bot/shared';
import { computeIndicators } from '../strategy/indicators';
import { logger } from '../util/logger';
import * as fs from 'fs';
import * as path from 'path';

const MODULE = 'backtest';

interface SimPosition {
  ticker: string;
  side: 'yes' | 'no';
  qty: number;
  entryPrice: number;
  stopPrice: number;
  tp1Price: number;
  bestPrice: number;
  entryTs: number;
  tp1Hit: boolean;
  partialQty: number;
}

interface SimTrade {
  ticker: string;
  side: 'yes' | 'no';
  entryPrice: number;
  exitPrice: number;
  qty: number;
  entryTs: number;
  exitTs: number;
  fees: number;
  slippage: number;
  reason: string;
  exitReason: string;
}

export class BacktestRunner {
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
  }

  run(
    candles: Map<string, Candle[]>,
    options?: { slippageCents?: number; spreadPenaltyCents?: number }
  ): BacktestResult {
    const slippage = options?.slippageCents ?? this.config.execution.maxSlippageCents;
    const spreadPenalty = options?.spreadPenaltyCents ?? 2;

    const trades: SimTrade[] = [];
    let equity = this.config.risk.bankrollUSD * 100;
    const equityCurve: Array<{ ts: number; equity: number }> = [];
    const drawdownCurve: Array<{ ts: number; drawdown: number }> = [];
    let peakEquity = equity;
    let maxDrawdown = 0;

    for (const [ticker, tickerCandles] of candles) {
      const tickerTrades = this.simulateTicker(ticker, tickerCandles, slippage, spreadPenalty);
      trades.push(...tickerTrades);
    }

    trades.sort((a, b) => a.entryTs - b.entryTs);

    let totalFees = 0;
    let totalSlippage = 0;

    for (const trade of trades) {
      const netPnl = this.computeNetPnl(trade);
      equity += netPnl;
      totalFees += trade.fees;
      totalSlippage += trade.slippage;

      peakEquity = Math.max(peakEquity, equity);
      const dd = (peakEquity - equity) / peakEquity;
      maxDrawdown = Math.max(maxDrawdown, dd);

      equityCurve.push({ ts: trade.exitTs, equity: equity / 100 });
      drawdownCurve.push({ ts: trade.exitTs, drawdown: dd });
    }

    const wins = trades.filter((t) => this.computeNetPnl(t) > 0);
    const losses = trades.filter((t) => this.computeNetPnl(t) <= 0);

    const avgWin =
      wins.length > 0 ? wins.reduce((s, t) => s + this.computeNetPnl(t), 0) / wins.length / 100 : 0;
    const avgLoss =
      losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + this.computeNetPnl(t), 0) / losses.length) / 100 : 0;

    const grossWins = wins.reduce((s, t) => s + this.computeNetPnl(t), 0);
    const grossLosses = Math.abs(losses.reduce((s, t) => s + this.computeNetPnl(t), 0));
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : Infinity;

    const netPnl = (equity - this.config.risk.bankrollUSD * 100) / 100;

    const tradeRecords: TradeRecord[] = trades.map((t, i) => ({
      id: `bt-${i}`,
      ticker: t.ticker,
      side: t.side,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      qty: t.qty,
      entryTs: t.entryTs,
      exitTs: t.exitTs,
      grossPnl: this.computeGrossPnl(t),
      fees: t.fees,
      netPnl: this.computeNetPnl(t) / 100,
      reason: t.reason as any,
      exitReason: t.exitReason as any,
      rMultiple: 0,
    }));

    const result: BacktestResult = {
      startDate: trades.length > 0 ? new Date(trades[0].entryTs).toISOString() : '',
      endDate: trades.length > 0 ? new Date(trades[trades.length - 1].exitTs).toISOString() : '',
      totalTrades: trades.length,
      winRate: trades.length > 0 ? wins.length / trades.length : 0,
      avgWin,
      avgLoss,
      profitFactor,
      netPnl,
      maxDrawdown,
      expectancyPerTrade: trades.length > 0 ? netPnl / trades.length : 0,
      totalFees: totalFees / 100,
      totalSlippage: totalSlippage / 100,
      trades: tradeRecords,
      equityCurve,
      drawdownCurve,
    };

    return result;
  }

  private simulateTicker(
    ticker: string,
    candles: Candle[],
    slippageCents: number,
    spreadPenaltyCents: number
  ): SimTrade[] {
    const { strategy, risk, feeModel, execution } = this.config;
    const trades: SimTrade[] = [];
    let position: SimPosition | null = null;
    let cooldownUntil = 0;

    const breakoutLookback = Math.floor(strategy.breakoutLookbackMinutes / (strategy.candleIntervalSeconds / 60));

    for (let i = strategy.emaSlow + 5; i < candles.length; i++) {
      const window = candles.slice(0, i + 1);
      const indicators = computeIndicators(window, {
        emaFastPeriod: strategy.emaFast,
        emaSlowPeriod: strategy.emaSlow,
        atrPeriod: strategy.atrPeriod,
        breakoutLookback,
      });

      const n = indicators.emaFast.length - 1;
      const close = candles[i].close;
      const ts = candles[i].ts;

      if (position) {
        position.bestPrice =
          position.side === 'yes'
            ? Math.max(position.bestPrice, close)
            : Math.min(position.bestPrice, close);

        let exitPrice = 0;
        let exitReason = '';

        if (position.side === 'yes' && close <= position.stopPrice) {
          exitPrice = position.stopPrice - slippageCents;
          exitReason = 'stop_loss';
        } else if (position.side === 'no' && close >= position.stopPrice) {
          exitPrice = position.stopPrice + slippageCents;
          exitReason = 'stop_loss';
        } else if (position.side === 'yes' && close >= position.tp1Price && !position.tp1Hit) {
          const partialQty = Math.max(1, Math.floor(position.qty * (risk.partialTakePercent / 100)));
          const entryFee = computeFeeCentsPerContract(position.entryPrice, feeModel) * partialQty;
          const exitFee = computeFeeCentsPerContract(close, feeModel) * partialQty;

          trades.push({
            ticker, side: position.side, entryPrice: position.entryPrice,
            exitPrice: close - slippageCents, qty: partialQty,
            entryTs: position.entryTs, exitTs: ts,
            fees: entryFee + exitFee, slippage: slippageCents * partialQty,
            reason: 'breakout_up', exitReason: 'take_profit_1',
          });

          position.qty -= partialQty;
          position.partialQty += partialQty;
          position.tp1Hit = true;
          position.stopPrice = position.entryPrice;
          continue;
        } else if (position.side === 'no' && close <= position.tp1Price && !position.tp1Hit) {
          const partialQty = Math.max(1, Math.floor(position.qty * (risk.partialTakePercent / 100)));
          const entryFee = computeFeeCentsPerContract(100 - position.entryPrice, feeModel) * partialQty;
          const exitFee = computeFeeCentsPerContract(100 - close, feeModel) * partialQty;

          trades.push({
            ticker, side: position.side, entryPrice: position.entryPrice,
            exitPrice: close + slippageCents, qty: partialQty,
            entryTs: position.entryTs, exitTs: ts,
            fees: entryFee + exitFee, slippage: slippageCents * partialQty,
            reason: 'breakout_down', exitReason: 'take_profit_1',
          });

          position.qty -= partialQty;
          position.partialQty += partialQty;
          position.tp1Hit = true;
          position.stopPrice = position.entryPrice;
          continue;
        }

        if (!exitReason && position.tp1Hit) {
          const trailDist = indicators.currentATR * risk.trailStopAtrMultiplier;
          if (position.side === 'yes') {
            const trailStop = position.bestPrice - trailDist;
            if (close <= trailStop) {
              exitPrice = close - slippageCents;
              exitReason = 'take_profit_2';
            }
          } else {
            const trailStop = position.bestPrice + trailDist;
            if (close >= trailStop) {
              exitPrice = close + slippageCents;
              exitReason = 'take_profit_2';
            }
          }
        }

        if (!exitReason) {
          const elapsed = (ts - position.entryTs) / 60000;
          if (elapsed >= risk.timeStopMinutes) {
            const stopDist = Math.abs(position.entryPrice - position.stopPrice);
            const minReq = stopDist * 0.3;
            const pnl =
              position.side === 'yes'
                ? close - position.entryPrice
                : position.entryPrice - close;
            if (pnl < minReq) {
              exitPrice = close - (position.side === 'yes' ? slippageCents : -slippageCents);
              exitReason = 'time_stop';
            }
          }
        }

        if (exitReason && exitPrice) {
          const priceFee =
            position.side === 'yes'
              ? computeFeeCentsPerContract(exitPrice, feeModel)
              : computeFeeCentsPerContract(100 - exitPrice, feeModel);
          const entryPriceFee =
            position.side === 'yes'
              ? computeFeeCentsPerContract(position.entryPrice, feeModel)
              : computeFeeCentsPerContract(100 - position.entryPrice, feeModel);

          trades.push({
            ticker, side: position.side,
            entryPrice: position.entryPrice, exitPrice,
            qty: position.qty, entryTs: position.entryTs, exitTs: ts,
            fees: (priceFee + entryPriceFee) * position.qty,
            slippage: slippageCents * position.qty,
            reason: position.side === 'yes' ? 'breakout_up' : 'breakout_down',
            exitReason,
          });

          if (exitReason === 'stop_loss') {
            cooldownUntil = ts + strategy.signalCooldownSeconds * 1000;
          }
          position = null;
        }

        continue;
      }

      if (ts < cooldownUntil) continue;
      if (position) continue;

      const prevHigh = indicators.rollingHigh[n - 1];
      const prevLow = indicators.rollingLow[n - 1];
      const emaFastVal = indicators.emaFast[n];
      const emaSlowVal = indicators.emaSlow[n];
      const atrVal = indicators.currentATR;

      if (
        close > prevHigh + strategy.breakoutBufferCents &&
        emaFastVal > emaSlowVal &&
        indicators.emaFastSlope > 0
      ) {
        const stopDist = atrVal * strategy.atrStopMultiplier;
        const entryPrice = close + spreadPenaltyCents / 2 + slippageCents;
        const stopPrice = entryPrice - stopDist;
        const tp1Price = entryPrice + stopDist;

        if (!passesMinimumMove(stopDist, entryPrice, spreadPenaltyCents, slippageCents, feeModel)) continue;

        const contracts = Math.max(1, Math.floor((risk.maxRiskPerTradeUSD * 100) / stopDist));

        position = {
          ticker, side: 'yes', qty: Math.min(contracts, risk.maxContracts),
          entryPrice, stopPrice: Math.max(1, stopPrice),
          tp1Price: Math.min(99, tp1Price), bestPrice: entryPrice,
          entryTs: ts, tp1Hit: false, partialQty: 0,
        };
      } else if (
        close < prevLow - strategy.breakoutBufferCents &&
        emaFastVal < emaSlowVal &&
        indicators.emaFastSlope < 0
      ) {
        const stopDist = atrVal * strategy.atrStopMultiplier;
        const entryPrice = close - spreadPenaltyCents / 2 - slippageCents;
        const stopPrice = entryPrice + stopDist;
        const tp1Price = entryPrice - stopDist;

        const noPrice = 100 - entryPrice;
        if (!passesMinimumMove(stopDist, noPrice, spreadPenaltyCents, slippageCents, feeModel)) continue;

        const contracts = Math.max(1, Math.floor((risk.maxRiskPerTradeUSD * 100) / stopDist));

        position = {
          ticker, side: 'no', qty: Math.min(contracts, risk.maxContracts),
          entryPrice, stopPrice: Math.min(99, stopPrice),
          tp1Price: Math.max(1, tp1Price), bestPrice: entryPrice,
          entryTs: ts, tp1Hit: false, partialQty: 0,
        };
      }
    }

    if (position) {
      const lastCandle = candles[candles.length - 1];
      trades.push({
        ticker, side: position.side,
        entryPrice: position.entryPrice, exitPrice: lastCandle.close,
        qty: position.qty, entryTs: position.entryTs, exitTs: lastCandle.ts,
        fees: 0, slippage: 0,
        reason: position.side === 'yes' ? 'breakout_up' : 'breakout_down',
        exitReason: 'end_of_data',
      });
    }

    return trades;
  }

  private computeGrossPnl(t: SimTrade): number {
    return t.side === 'yes'
      ? (t.exitPrice - t.entryPrice) * t.qty
      : (t.entryPrice - t.exitPrice) * t.qty;
  }

  private computeNetPnl(t: SimTrade): number {
    return this.computeGrossPnl(t) - t.fees;
  }

  exportReport(result: BacktestResult, outputDir: string): void {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const csvLines = [
      'id,ticker,side,entry_price,exit_price,qty,entry_ts,exit_ts,gross_pnl,fees,net_pnl,exit_reason',
    ];
    for (const t of result.trades) {
      csvLines.push(
        `${t.id},${t.ticker},${t.side},${t.entryPrice},${t.exitPrice},${t.qty},` +
        `${t.entryTs},${t.exitTs},${t.grossPnl},${t.fees},${t.netPnl},${t.exitReason}`
      );
    }
    fs.writeFileSync(path.join(outputDir, `backtest_${date}.csv`), csvLines.join('\n'));

    const html = this.generateHtmlReport(result, date);
    fs.writeFileSync(path.join(outputDir, `backtest_${date}.html`), html);

    logger.info(MODULE, 'Backtest report exported', { outputDir });
  }

  private generateHtmlReport(result: BacktestResult, date: string): string {
    return `<!DOCTYPE html>
<html><head><title>Backtest Report ${date}</title>
<style>
body{font-family:system-ui;max-width:900px;margin:40px auto;padding:0 20px;background:#1a1a2e;color:#e0e0e0}
h1{color:#64ffda}table{width:100%;border-collapse:collapse;margin:20px 0}
th,td{padding:8px 12px;border:1px solid #333;text-align:left}
th{background:#16213e;color:#64ffda}tr:nth-child(even){background:#16213e}
.positive{color:#4caf50}.negative{color:#f44336}
.metric{display:inline-block;margin:10px 20px;padding:15px;background:#16213e;border-radius:8px;min-width:120px}
.metric-value{font-size:24px;font-weight:bold;color:#64ffda}
.metric-label{font-size:12px;color:#888;margin-top:5px}
</style></head><body>
<h1>Backtest Report - ${date}</h1>
<div>
<div class="metric"><div class="metric-value">${result.totalTrades}</div><div class="metric-label">Total Trades</div></div>
<div class="metric"><div class="metric-value">${(result.winRate*100).toFixed(1)}%</div><div class="metric-label">Win Rate</div></div>
<div class="metric"><div class="metric-value">$${result.netPnl.toFixed(2)}</div><div class="metric-label">Net P&L</div></div>
<div class="metric"><div class="metric-value">${result.profitFactor === Infinity ? '∞' : result.profitFactor.toFixed(2)}</div><div class="metric-label">Profit Factor</div></div>
<div class="metric"><div class="metric-value">${(result.maxDrawdown*100).toFixed(1)}%</div><div class="metric-label">Max Drawdown</div></div>
<div class="metric"><div class="metric-value">$${result.avgWin.toFixed(2)}</div><div class="metric-label">Avg Win</div></div>
<div class="metric"><div class="metric-value">$${result.avgLoss.toFixed(2)}</div><div class="metric-label">Avg Loss</div></div>
<div class="metric"><div class="metric-value">$${result.expectancyPerTrade.toFixed(2)}</div><div class="metric-label">Expectancy/Trade</div></div>
<div class="metric"><div class="metric-value">$${result.totalFees.toFixed(2)}</div><div class="metric-label">Total Fees</div></div>
<div class="metric"><div class="metric-value">$${result.totalSlippage.toFixed(2)}</div><div class="metric-label">Total Slippage</div></div>
</div>
<h2>Trade Log</h2>
<table><thead><tr><th>Ticker</th><th>Side</th><th>Entry</th><th>Exit</th><th>Qty</th><th>Net P&L</th><th>Exit Reason</th></tr></thead>
<tbody>
${result.trades.slice(0, 100).map(t =>
  `<tr><td>${t.ticker}</td><td>${t.side}</td><td>${t.entryPrice}</td><td>${t.exitPrice}</td><td>${t.qty}</td>` +
  `<td class="${t.netPnl >= 0 ? 'positive' : 'negative'}">$${t.netPnl.toFixed(2)}</td><td>${t.exitReason}</td></tr>`
).join('\n')}
</tbody></table>
</body></html>`;
  }
}
