![pump ray jup banner](/assets/pumprayjup_banner.png)

# Overview

An API that makes swaping tokens on pumpfun, pumpswap, jupiter, and raydium exchanges all possible via a single function call. The function gets a quote from each exchange and then performs the optimal swap. Each exchange has its own set of exportable funtions in the case you want to use a specific exchange.

## Current state

- PumpFun: ✅
- PumpSwap: ✅
- Raydium: In progress
- Jupiter: In progress

## Setup

Its recommended to use Helius as a node provider, it can be passed in the parameters of the swap functions and will auto calculate priority fees.

This project utilizies the Gill framework which runs @solana/kit under the hood.

```
pnpm install
```

To run commands out of the index.ts file run:

```

pnpm dev
```

## Usage

See `index.ts` for the full examples.

### SOLANA CLI WALLET
#### Ensure that you have the Solana CLI installed on your machine and ensure it is configured for mainnet and has a SOL balance.

### PUMPFUN BUY

```
let response = await pumpfunBuy(
    targetAddress,
    solAmount,
    slippage,
    signer,
    connection,
    process.env.HELIUS_URL?.toString() // can be left blank
);
```

### PUMPFUN SELL

```
  let response = await pumpfunSell(
    targetAddress,
    tokenAmount,
    slippage,
    signer,
    connection,
    process.env.HELIUS_URL?.toString() // can be left blank
);
```

### PUMPSWAP BUY/SELL

```
let response = await pumpswapSwap(
      base,
      quote,
      amount,
      slippage,
      false, // buy = true || sell = false
      signer,
      connection,
      process.env.HELIUS_URL?.toString()
);
```
