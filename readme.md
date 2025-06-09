![pump ray jup banner](/assets/pumprayjup_banner.png)

# 🚀 PumpRayJup - Multi-DEX Solana Trading Aggregator
A comprehensive TypeScript SDK and API that unifies token swapping across multiple Solana decentralized exchanges through a single interface. The system routes trades by fetching quotes from each DEX and executing swaps through the optimal exchange for best pricing.

## 🌐 Live Demo
[Watch demo]()

## ✨ Features
**Multi-DEX Integration**
- Seamlessly connects to PumpFun bonding curves and PumpSwap AMM
- Jupiter and Raydium integration in development

**Intelligent Route Optimization**
- Automatically compares quotes across exchanges
- Executes through the most favorable DEX for optimal pricing

**Advanced Mathematics**
- Sophisticated constant product formulas and bonding curve calculations
- Accurate price estimation with slippage protection

**Priority Fee Optimization**
- Integrates with Helius RPC for dynamic priority fee estimation
- Automatic transaction optimization for faster execution

**Native SOL/WSOL Handling**
- Automatic SOL-to-WSOL conversion and cleanup
- Seamless native token trading experience

**Robust Architecture**
- Modular design allowing both unified and exchange-specific functions
- Comprehensive error handling and transaction validation

## 🛠 Tech Stack
**Core Technologies**
- TypeScript
- Node.js
- Gill (Solana development framework)

**Blockchain Integration**
- Solana Kit
- Solana SPL-Token
- @coral-xyz/borsh (data serialization)
- Helius RPC API

## 🏗 Architecture
**Multi-Exchange Architecture**
This SDK has plans for multi-exchange approach:

**Exchange Support**
- ✅ **PumpFun**: Bonding curve trading for newly launched tokens
- ✅ **PumpSwap**: AMM trading for graduated tokens
- 🚧 **Raydium**: Advanced AMM with concentrated liquidity (in progress)
- 🚧 **Jupiter**: Cross-DEX aggregation and routing (in progress)

**Smart Routing System**
The aggregator should fetch quotes from all supported exchanges and automatically routes trades through the most favorable option, ensuring users always get the best possible price with minimal slippage.

**Program Derived Address (PDA) Management**
Advanced PDA calculations for seamless Solana program interactions, including automatic Associated Token Account (ATA) creation and cleanup.

## 🚀 Quick Start
**Prerequisites**
- Node.js 18+
- Solana CLI installed and configured for mainnet
- SOL balance in your wallet
- Helius RPC endpoint (recommended)

**1. Environment Setup**
Create a `.env` file:
```env
HELIUS_URL=your_helius_rpc_endpoint
```

**2. Install Dependencies**
```bash
pnpm install
```

**3. Configure Solana CLI Wallet**
Ensure your Solana CLI is configured for mainnet with a SOL balance:
```bash
solana config set --url mainnet-beta
solana balance
```

**4. Test the Integration**
```bash
pnpm dev
```

## 🔧 Usage Examples

**PumpFun Trading (Bonding Curve)**
```typescript
import { pumpfunBuy, pumpfunSell } from './src/pump/pumpfun/index';

// Buy tokens with SOL
const buyResponse = await pumpfunBuy(
  'TOKEN_MINT_ADDRESS',
  0.01, // SOL amount
  0.01, // 1% slippage
  signer,
  connection,
  process.env.HELIUS_URL
);

// Sell tokens for SOL
const sellResponse = await pumpfunSell(
  'TOKEN_MINT_ADDRESS',
  1000, // token amount
  0.01, // 1% slippage
  signer,
  connection,
  process.env.HELIUS_URL
);
```

**PumpSwap Trading (AMM)**
```typescript
import { pumpswapSwap } from './src/pump/pumpswap/index';

// Buy base token with quote token
const swapResponse = await pumpswapSwap(
  'BASE_TOKEN_MINT', // Token to receive
  'So11111111111111111111111111111111111111112', // SOL mint (paying with)
  0.01, // Amount to spend
  0.01, // 1% slippage
  true, // buy = true, sell = false
  signer,
  connection,
  process.env.HELIUS_URL
);
```

**Advanced Configuration**
```typescript
// Custom compute unit settings
const response = await pumpfunBuy(
  targetAddress,
  solAmount,
  slippage,
  signer,
  connection,
  undefined, // Skip Helius priority fees
  300000, // Custom compute unit limit
  1000 // Custom compute unit price in micro-lamports
);
```

## 🔧 Exchange Status
- **PumpFun**: ✅ Full implementation with bonding curve 
- **PumpSwap**: ✅ Complete AMM integration 
- **Raydium**: 🚧 In development 
- **Jupiter**: 🚧 In development 

## 🔮 Roadmap
**Phase 1 (Current)**
- ✅ PumpFun bonding curve integration
- ✅ PumpSwap AMM support
- ✅ Priority fee optimization

**Phase 2 (In Progress)**
- 🚧 Raydium integration 
- 🚧 Jupiter integration

**Phase 3 (Planned)**
- 📋 Unified quote comparison across all exchanges
- 📋 Advanced order types (limit orders, DCA)
- 📋 Telegram support with single line buy and sell commands

**Phase 4 (Future)**
- 📋 Web interface for non-technical users
- 📋 Real-time price monitoring and alerts
- 📋 MEV protection mechanisms
