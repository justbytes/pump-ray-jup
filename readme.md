# Overview

An API that makes swaping tokens on pumpfun, pumpswap, jupiter, and raydium exchanges all possible via a single function call. The api gets a quote from each exchange to ensure that it performs the an optimal swap. Each exchange has its own set of exportable funtions in the case someone wants to use a specific exchange.

## Current state

- PumpFun: ✅ - Currently implementing creator fee change so this one is broken atm.
- PumpSwap: ✅
- Raydium: In progress
- Jupiter: In progress

## Dependencies

Its recommended to use Helius as a node provider, it can be passed in the parameters of the swap functions and will auto calculate priority fees.

This project utilizies the Gill framework which runs @solana/kit under the hood.

```
pnpm install
```

To run commands out of the index.ts file run:

```

pnpm dev
```

Uses esrun instead of npm and

## Usage

See the index.js for usage examples.
