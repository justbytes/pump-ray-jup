import { address, Address, getAddressEncoder, getProgramDerivedAddress } from 'gill';

import {
  RAY_LEGACY_AMM_V4,
  AUTHORITY_AMM,
  TARGET_ASSOCIATED_SEED,
  OPEN_ORDER_ASSOCIATED_SEED,
  COIN_VAULT_ASSOCIATED_SEED,
  PC_VAULT_ASSOCIATED_SEED,
  LP_MINT_ASSOCIATED_SEED,
} from '../constants';

import axios from 'axios';

/**
 * None of this is used right now but this should be built out
 * so we don't rely on the raydium sdk
 */

/**
 * Derives all necessary PDAs for Raydium AMM swap
 */
export async function deriveRaydiumAmmPdas(poolId: string, marketId?: string) {
  const poolAddress = address(poolId);
  const ammProgramId = address(RAY_LEGACY_AMM_V4);

  // AMM Authority PDA
  const ammAuthority = await getProgramDerivedAddress({
    seeds: [AUTHORITY_AMM],
    programAddress: ammProgramId,
  });

  console.log(ammAuthority);

  // AMM Open Orders PDA
  const ammOpenOrders = await getProgramDerivedAddress({
    seeds: [OPEN_ORDER_ASSOCIATED_SEED],
    programAddress: ammProgramId,
  });

  console.log(ammOpenOrders);

  // AMM Target Orders PDA
  const ammTargetOrders = await getProgramDerivedAddress({
    seeds: [TARGET_ASSOCIATED_SEED],
    programAddress: ammProgramId,
  });

  console.log(ammTargetOrders);

  // Pool Coin Token Account (Base Vault) PDA
  const poolCoinTokenAccount = await getProgramDerivedAddress({
    seeds: [COIN_VAULT_ASSOCIATED_SEED],
    programAddress: ammProgramId,
  });

  console.log(poolCoinTokenAccount);

  // Pool PC Token Account (Quote Vault) PDA
  const poolPcTokenAccount = await getProgramDerivedAddress({
    seeds: [PC_VAULT_ASSOCIATED_SEED],
    programAddress: ammProgramId,
  });

  console.log(poolPcTokenAccount);

  // LP Mint PDA
  const lpMint = await getProgramDerivedAddress({
    seeds: [LP_MINT_ASSOCIATED_SEED],
    programAddress: ammProgramId,
  });

  console.log(lpMint);

  return {
    ammAuthority,
    ammOpenOrders,
    ammTargetOrders,
    poolCoinTokenAccount,
    poolPcTokenAccount,
    lpMint,
  };
}

/**
 * Gets pool data from Raydium API and extracts necessary addresses
 */
export async function getPoolAccountsFromApi(poolId: string) {
  try {
    const response = await axios.get(`https://api-v3.raydium.io/pools/info/ids?ids=${poolId}`);

    if (!response) {
      throw new Error('Pool not found');
    }

    const pool = response.data.data[0];

    return {
      poolId: pool.id,
      baseMint: pool.mintA.address,
      quoteMint: pool.mintB.address,
      lpMint: pool.lpMint.address,
      baseVault: pool.vaultA,
      quoteVault: pool.vaultB,
      marketId: pool.marketId,
      marketAuthority: pool.authority,
      marketBaseVault: pool.marketBaseVault,
      marketQuoteVault: pool.marketQuoteVault,
      marketBids: pool.marketBids,
      marketAsks: pool.marketAsks,
      marketEventQueue: pool.marketEventQueue,
    };
  } catch (error) {
    console.error('Error fetching pool data:', error);
    throw error;
  }
}

/**
 * Creates a complete account list for Raydium swap instruction
 */
export async function buildRaydiumSwapAccounts(
  poolId: string,
  userWallet: Address,
  userBaseAta: Address,
  userQuoteAta: Address
) {
  // Get pool data from API
  const poolData = await getPoolAccountsFromApi(poolId);

  // Derive PDAs
  const pdas = await deriveRaydiumAmmPdas(poolId, poolData.marketId);

  // For swapBaseIn instruction based on your IDL
  const swapAccounts = {
    tokenProgram: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
    amm: address(poolId),
    ammAuthority: pdas.ammAuthority,
    ammOpenOrders: pdas.ammOpenOrders,
    ammTargetOrders: pdas.ammTargetOrders,
    poolCoinTokenAccount: pdas.poolCoinTokenAccount,
    poolPcTokenAccount: pdas.poolPcTokenAccount,
    serumProgram: address('srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX'), // Serum DEX program ID
    serumMarket: address(poolData.marketId),
    serumBids: address(poolData.marketBids),
    serumAsks: address(poolData.marketAsks),
    serumEventQueue: address(poolData.marketEventQueue),
    serumCoinVaultAccount: address(poolData.marketBaseVault),
    serumPcVaultAccount: address(poolData.marketQuoteVault),
    serumVaultSigner: address(poolData.marketAuthority),
    userSourceTokenAccount: userQuoteAta, // The account we're swapping FROM
    userDestinationTokenAccount: userBaseAta, // The account we're swapping TO
    userSourceOwner: userWallet,
  };

  return {
    swapAccounts,
    poolData,
    pdas,
  };
}

/**
 * Format swap instruction data for swapBaseIn
 */
export function formatSwapBaseInData(amountIn: bigint, minimumAmountOut: bigint): Uint8Array {
  // Based on your IDL, swapBaseIn takes:
  // - amountIn: u64
  // - minimumAmountOut: u64

  const buffer = new ArrayBuffer(17); // 1 byte for instruction discriminator + 8 + 8 for u64s
  const view = new DataView(buffer);

  // Instruction discriminator for swapBaseIn (you'll need to find this)
  // This is typically the first 8 bytes of the SHA256 hash of "global:swapBaseIn"
  view.setUint8(0, 0x09); // This might need to be adjusted based on your program

  // Amount in (u64 little endian)
  view.setBigUint64(1, amountIn, true);

  // Minimum amount out (u64 little endian)
  view.setBigUint64(9, minimumAmountOut, true);

  return new Uint8Array(buffer);
}

/**
 * Calculate minimum amount out with slippage
 */
export function calculateMinimumAmountOut(
  expectedAmountOut: bigint,
  slippageBps: number // Basis points (100 = 1%)
): bigint {
  const slippageMultiplier = BigInt(10000 - slippageBps);
  return (expectedAmountOut * slippageMultiplier) / BigInt(10000);
}
