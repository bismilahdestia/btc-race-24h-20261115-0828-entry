// Breakout rider for the cbBTC/USDC 24-hour race (agent-fun/bars-replay/v1).
//
// Idea: BTC's 1-minute noise is mean-reverting and a full-size round trip costs
// ~26-43 bps in fees, slippage and pool impact, so scalping the minute bars
// cannot pay. The money is in the hour-scale swings (the dev window's biggest
// was a +2.8% rally in one hour). This bot therefore sits in cash most of the
// time and only rides a genuine breakout, then lets a trailing stop bank it:
//
//   - Entry: the close breaks above the highest high of the previous 60 bars
//     AND the close is more than 40 bps above the close 15 bars ago (a
//     momentum confirmation that filters out flat-market false breakouts).
//     It buys 80% of cash (full size would pay more pool impact per fill).
//   - Exit: the whole position, when the close falls 60 bps below the highest
//     close since entry (trailing stop), or breaks below the lowest low of the
//     previous 60 bars. No profit target: the stop rides the trend.
//   - No new entries in the last 30 bars: a trade opened there can only be
//     flattened at the end, paying a full round trip for at most one bar.
//
// Long only, one position, at most one order per bar, deterministic (bigint
// arithmetic only, no clock, no randomness, no network, no files). Every
// decision is made on the bar that just closed; the replay fills it at the
// next bar's open, exactly as the local grade shows.
//
// Dev-window result (local grade, exact harness): net PnL +$17.33 on $1,000,
// 6 trades, max drawdown 0.82%, fees $1.93. The baselines all lose on the
// same window (buy-and-hold -$44.01, EMA-cross -$134.95, RSI-Bollinger
// -$57.37, ADX-momentum -$86.60), because the window falls 4% overall and
// they either hold through it or churn. This bot's losses per bad block stay
// small (-$0.57 to -$3.39 per 8-12h block) while one real rally pays for
// them, which is the behaviour a 24-hour race window needs.

import { runBars, type BarsState, type Batch, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Donchian lookback: the breakout is above the highest high of these bars. */
const N_HI = 60;
/** Trailing stop: exit when the close is this far below the peak since entry, in bps. */
const TRAIL_BPS = 60n;
/** Buy this share of cash on entry. */
const SIZE_NUM = 80n;
const SIZE_DEN = 100n;
/** Momentum confirmation: close must beat the close this many bars ago by ... */
const MOM_BARS = 15;
/** ... this many bps. */
const MOM_BPS = 40n;
/** No new entries once the batch seq reaches this (the last 30 bars). */
const ENTRY_CUTOFF_SEQ = 1410;
/** Slippage cap per order, in bps from the latest close. */
const MAX_SLIPPAGE_BPS = 100;

const closes: bigint[] = [];
const highs: bigint[] = [];
const lows: bigint[] = [];
/** Highest close since the current entry, once in a position. */
let peak: bigint | null = null;

await runBars({
  onBatch(state: BarsState, batch: Batch): (BuyInput | SellInput)[] {
    if (state.warmingUp) return [];
    const bar = batch.bars.find((b) => b.symbol === SYMBOL);
    if (bar === undefined) return [];
    const c = BigInt(bar.c);
    const h = BigInt(bar.h);
    const l = BigInt(bar.l);
    closes.push(c);
    highs.push(h);
    lows.push(l);
    if (closes.length <= N_HI) return [];

    // Highest high / lowest low of the previous N_HI bars (excluding this one).
    const prevHighs = highs.slice(-N_HI - 1, -1);
    const prevLows = lows.slice(-N_HI - 1, -1);
    let hi = prevHighs[0]!;
    for (const x of prevHighs) if (x > hi) hi = x;
    let lo = prevLows[0]!;
    for (const x of prevLows) if (x < lo) lo = x;

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      if (peak === null || c > peak) peak = c;
      const trailExit = c <= (peak * (10000n - TRAIL_BPS)) / 10000n;
      const breakDown = c <= lo;
      if (trailExit || breakDown) {
        // Do not reset peak here: if this sell is rejected (e.g. max_slippage)
        // the position is still held next bar and the true peak must survive.
        // peak is cleared in the not-holding branch below once the sale lands.
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    peak = null;
    if (state.seq >= ENTRY_CUTOFF_SEQ) return [];
    if (c <= hi) return [];
    // Momentum confirmation: the close must be MOM_BPS above the close MOM_BARS ago.
    const ref = closes[closes.length - 1 - MOM_BARS]!;
    if (c <= (ref * (10000n + MOM_BPS)) / 10000n) return [];
    const notional = (state.cash * SIZE_NUM) / SIZE_DEN;
    if (notional < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    peak = c;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: notional, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});
