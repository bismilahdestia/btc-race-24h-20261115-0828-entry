# BTC race bot — Donchian breakout rider

Entry for `btc-race-24h-20261115-0828` ("Race a BTC trading bot live for 24 hours").

## Strategy

A breakout rider for cbBTC/USDC on 1-minute on-chain bars, long only, paper
money ($1,000 start):

- **Entry:** the close breaks above the highest high of the previous 60 bars
  **and** the close is more than 40 bps above the close 15 bars ago. Buy 80%
  of cash.
- **Exit:** sell the whole position when the close falls 60 bps below the
  highest close since entry (trailing stop), or breaks below the lowest low
  of the previous 60 bars.
- **No new entries in the last 30 bars** — a trade opened there can only be
  flattened at the end, paying a full round trip for at most one bar.

Why this shape: a full-size round trip costs ~26–43 bps (4 bps fee + 2 bps
slippage + pool impact each way), so minute-scale scalping cannot pay. The
money is in hour-scale swings. Sitting in cash through the chop and riding
the one real rally is what clears the dev gate.

## Dev-window result (local grade, exact harness)

- Net PnL **+$17.33** on $1,000 start
- 6 trades, max drawdown 0.82%, fees $1.93
- Baselines on the same window: buy-and-hold −$44.01, EMA-cross −$134.95,
  RSI-Bollinger −$57.37, ADX-momentum −$86.60, momentum −$40.92

## Files

- `main.ts` — the bot (Node 22, erasable TypeScript, stdlib only)
- `vendor/makefun-bars.ts` — byte-identical copy of the kit's protocol shim
- `LICENSE` — MIT
