import {
  Address,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  LAMPORTS_PER_SOL,
} from 'gill';
import * as borsh from '@coral-xyz/borsh';
import { PUMPFUN_PROGRAM_ID } from '../constants';
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from 'gill/programs/token';

// Structure of the Bonding curve data
export const bondingCurveSchema = borsh.struct([
  borsh.array(borsh.u8(), 8, 'discriminator'),
  borsh.u64('virtualTokenReserves'),
  borsh.u64('virtualSolReserves'),
  borsh.u64('realTokenReserves'),
  borsh.u64('realSolReserves'),
  borsh.u64('tokenTotalSupply'),
  borsh.bool('complete'),
  borsh.publicKey('creator'),
]);

/**
 * Gets the state of a bonding curve
 */
export const getBondingCurveData = async (mint: Address, connection: any) => {
  const [bondingCurve, _bondingBump] = await getProgramDerivedAddress({
    seeds: ['bonding-curve', getAddressEncoder().encode(mint)],
    programAddress: address(PUMPFUN_PROGRAM_ID),
  });

  // Get the bonding curve ATA
  const [bondingCurveAta, _bondingCurveBump] = await findAssociatedTokenPda({
    mint,
    owner: bondingCurve,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // Get bonding curve account data
  const bondingCurveAccountInfo = await connection.rpc
    .getAccountInfo(bondingCurve, {
      encoding: 'base64',
    })
    .send();

  const base64Data = bondingCurveAccountInfo.value.data[0];
  const dataBuffer = Buffer.from(base64Data, 'base64');

  // Decode the bonding curve account data
  const bondingCurveData = bondingCurveSchema.decode(dataBuffer);

  return {
    address: bondingCurve,
    ata: bondingCurveAta,
    accountInfo: bondingCurveAccountInfo,
    data: bondingCurveData,
  };
};

/**
 * Calculate the current price for a PumpFun token
 *
 * @param {any} accountInfo The account info containing bonding curve data
 * @returns {Object} Object containing current price and market cap in SOL
 */
export const getPumpfunPrice = async (mint: string, connection: any) => {
  // Convert the mint address
  const mintAddress = address(mint);

  const bondingCurveData = await getBondingCurveData(mintAddress, connection);

  // Extract the bonding curve values
  const virtualTokenReserves = BigInt(bondingCurveData.data.virtualTokenReserves.toString());
  const virtualSolReserves = BigInt(bondingCurveData.data.virtualSolReserves.toString());
  const complete = Boolean(bondingCurveData.data.complete);

  if (complete) {
    return {
      success: false,
      message:
        " Token isn't trading on the the bonding curve please use getPumpswapPrice(mint, connection)",
      bondingCurveData,
    };
  }

  // PumpFun tokens typically have 6 decimal places
  const TOKEN_DECIMALS = BigInt(10 ** 6);

  // Calculate price correctly
  // Price = SOL reserves (in SOL) / token reserves (in tokens)
  const priceInSol =
    virtualSolReserves / BigInt(LAMPORTS_PER_SOL) / (virtualTokenReserves / TOKEN_DECIMALS);

  return { success: true, price: priceInSol, bondingCurveData };
};

/**
 * Function to estimate the minimum tokens a user will receive for a given SOL amount
 * PumpFun uses ONLY virtual reserves for bonding curve calculations
 * Uses the constant product formula: (x + dx) * (y - dy) = x * y
 * Where x = solReserves, y = tokenReserves, dx = solAmount, dy = tokensOut
 *
 * @param {any} accountInfo The account info containing bonding curve data
 * @param {number} solAmount Amount of SOL in lamports to spend
 * @param {number} slippage Slippage tolerance (0.01 = 1%)
 */
export const estimatePumpfunMinTokensOut = async (
  mint: Address,
  connection: any,
  solAmount: bigint,
  slippage: number
) => {
  // Get bonding curve data
  const bondingCurveData = await getBondingCurveData(mint, connection);

  // Convert BigInts to Numbers for calculation
  // Note: This could lose precision for very large numbers
  const virtualTokenReserves = BigInt(bondingCurveData.data.virtualTokenReserves.toString());
  const virtualSolReserves = BigInt(bondingCurveData.data.virtualSolReserves.toString());
  const complete = Boolean(bondingCurveData.data.complete);

  if (complete) {
    return {
      success: false,
      message:
        " Token isn't trading on the the bonding curve please use pumpswapMinAmountOut(mint, connection)",
      bondingCurveData,
      estimatedAmountOut: 0n,
      minimumAmountOut: 0n,
    };
  }

  // Calculate constant product k = virtualTokenReserves * virtualSolReserves
  const k = virtualTokenReserves * virtualSolReserves;

  // New virtual SOL reserves after purchase: x' = x + dx
  const newVirtualSolReserves = virtualSolReserves + solAmount;

  // New virtual token reserves to maintain constant product: y' = k / x'
  const newVirtualTokenReserves = k / newVirtualSolReserves;

  // Calculate tokens received: dy = y - y'
  const tokensReceived = virtualTokenReserves - newVirtualTokenReserves;

  // Apply fee (PumpFun charges a 1% fee for buying/selling on the bonding curve)
  const feeBasisPoints = 100n; // 1% = 100 basis points
  const feeFactorNumerator = 10000n - feeBasisPoints;
  const feeFactorDenominator = 10000n;
  const tokensAfterFee = (tokensReceived * feeFactorNumerator) / feeFactorDenominator;

  const slippageBigInt = BigInt(Math.floor(slippage * 10000)) * 100n; // Convert to basis points (e.g., 0.01 -> 100 basis points)
  const slippageFactorNumerator = 1000000n - slippageBigInt;
  const slippageFactorDenominator = 1000000n;

  const minAmountOut = (tokensAfterFee * slippageFactorNumerator) / slippageFactorDenominator;

  // Return the estimated amount out and the amount with the slippage
  return {
    success: true,
    bondingCurveData,
    estimatedAmountOut: tokensAfterFee,
    minimumAmountOut: minAmountOut,
  };
};

export const estimatePumpfunMinSolOut = async (
  mint: Address,
  connection: any,
  tokenAmount: bigint,
  slippage: number
) => {
  // Get bonding curve data
  const bondingCurveData = await getBondingCurveData(mint, connection);

  const virtualTokenReserves = BigInt(bondingCurveData.data.virtualTokenReserves.toString());
  const virtualSolReserves = BigInt(bondingCurveData.data.virtualSolReserves.toString());
  const complete = Boolean(bondingCurveData.data.complete);

  if (complete) {
    return {
      success: false,
      message:
        " Token isn't trading on the the bonding curve please use pumpswapMinAmountOut(mint, connection)",
      bondingCurveData,
      estimatedAmountOut: 0n,
      minimumAmountOut: 0n,
    };
  }

  // Calculate constant product k = virtualTokenReserves * virtualSolReserves
  const k = virtualTokenReserves * virtualSolReserves;

  const newVirtualTokenReserves = virtualTokenReserves + tokenAmount;

  // New virtual SOL reserves after purchase: x' = x + dx
  // const newVirtualSolReserves = virtualSolReserves + solAmount;

  // New virtual token reserves to maintain constant product: y' = k / x'
  const newVirtualSolReserves = k / newVirtualTokenReserves;

  // Calculate tokens received: dy = y - y'
  const solReceived = virtualSolReserves - newVirtualSolReserves;

  // Apply fee (PumpFun charges a 1% fee for buying/selling on the bonding curve)
  // const feeBasisPoints = 100; // 1% = 100 basis points
  // const feeFactor = 1 - feeBasisPoints / 10000;
  // const tokensAfterFee = solReceived * feeFactor;

  // Apply fee (PumpFun charges a 1% fee for buying/selling on the bonding curve)
  const feeBasisPoints = 100n; // 1% = 100 basis points
  const feeFactorNumerator = 10000n - feeBasisPoints;
  const feeFactorDenominator = 10000n;
  const tokensAfterFee = (solReceived * feeFactorNumerator) / feeFactorDenominator;

  const slippageBigInt = BigInt(Math.floor(slippage * 10000)) * 100n; // Convert to basis points (e.g., 0.01 -> 100 basis points)
  const slippageFactorNumerator = 1000000n - slippageBigInt;
  const slippageFactorDenominator = 1000000n;

  const minAmountOut = (tokensAfterFee * slippageFactorNumerator) / slippageFactorDenominator;

  return {
    success: true,
    bondingCurveData,
    estimatedAmountOut: tokensAfterFee,
    minimumAmountOut: minAmountOut,
  };
};

/**
 * An example of how to decode the bytes data
 * Bonding curve decoding function with detailed debugging
 * @param {Buffer} buffer The binary buffer containing the account data
 */
// export const decodeBondingCurveAccount = (buffer: Buffer) => {
//   if (buffer.length < 49) {
//     console.error('Buffer too small for bonding curve data:', buffer.length);
//     throw new Error('Buffer too small to contain bonding curve data');
//   }

//   // First 8 bytes are the Anchor discriminator
//   const discriminator = buffer.slice(0, 8);

//   // Read the u64 fields (8 bytes each, little-endian)
//   const virtualTokenReserves = buffer.readBigUInt64LE(8);
//   const virtualSolReserves = buffer.readBigUInt64LE(16);
//   const realTokenReserves = buffer.readBigUInt64LE(24);
//   const realSolReserves = buffer.readBigUInt64LE(32);
//   const tokenTotalSupply = buffer.readBigUInt64LE(40);

//   // Boolean field (1 byte)
//   const complete = buffer[48] === 1;

//   return {
//     discriminator: discriminator.toString('hex'),
//     virtualTokenReserves,
//     virtualSolReserves,
//     realTokenReserves,
//     realSolReserves,
//     tokenTotalSupply,
//     complete,
//   };
// };
