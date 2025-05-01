import {
  Address,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  LAMPORTS_PER_SOL,
} from 'gill';
import { PUMPFUN_PROGRAM_ID } from '../constants';
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from 'gill/programs/token';

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
  const bondingCurveData = decodeBondingCurveAccount(dataBuffer);

  return {
    address: bondingCurve,
    ata: bondingCurveAta,
    accountInfo: bondingCurveAccountInfo,
    data: bondingCurveData,
  };
};

/**
 * Bonding curve decoding function with detailed debugging
 * @param {Buffer} buffer The binary buffer containing the account data
 */
export const decodeBondingCurveAccount = (buffer: Buffer) => {
  if (buffer.length < 49) {
    console.error('Buffer too small for bonding curve data:', buffer.length);
    throw new Error('Buffer too small to contain bonding curve data');
  }

  // First 8 bytes are the Anchor discriminator
  const discriminator = buffer.slice(0, 8);

  // Read the u64 fields (8 bytes each, little-endian)
  const virtualTokenReserves = buffer.readBigUInt64LE(8);
  const virtualSolReserves = buffer.readBigUInt64LE(16);
  const realTokenReserves = buffer.readBigUInt64LE(24);
  const realSolReserves = buffer.readBigUInt64LE(32);
  const tokenTotalSupply = buffer.readBigUInt64LE(40);

  // Boolean field (1 byte)
  const complete = buffer[48] === 1;

  // Log the values for debugging
  // console.log('=== Bonding Curve Raw Values ===');
  // console.log('Discriminator (hex):', discriminator.toString('hex'));
  // console.log('virtualTokenReserves:', virtualTokenReserves.toString());
  // console.log('virtualSolReserves:', virtualSolReserves.toString());
  // console.log('realTokenReserves:', realTokenReserves.toString());
  // console.log('realSolReserves:', realSolReserves.toString());
  // console.log('tokenTotalSupply:', tokenTotalSupply.toString());
  // console.log('complete:', complete);

  return {
    discriminator: discriminator.toString('hex'),
    virtualTokenReserves,
    virtualSolReserves,
    realTokenReserves,
    realSolReserves,
    tokenTotalSupply,
    complete,
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
  const virtualTokenReserves = Number(bondingCurveData.data.virtualTokenReserves);
  const virtualSolReserves = Number(bondingCurveData.data.virtualSolReserves);
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
  const TOKEN_DECIMALS = 6;

  // Calculate price correctly
  // Price = SOL reserves (in SOL) / token reserves (in tokens)
  const priceInSol =
    virtualSolReserves / LAMPORTS_PER_SOL / (virtualTokenReserves / 10 ** TOKEN_DECIMALS);

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
  solAmount: number,
  slippage: number
) => {
  // Get bonding curve data
  const bondingCurveData = await getBondingCurveData(mint, connection);

  // Convert BigInts to Numbers for calculation
  // Note: This could lose precision for very large numbers
  const virtualTokenReserves = Number(bondingCurveData.data.virtualTokenReserves);
  const virtualSolReserves = Number(bondingCurveData.data.virtualSolReserves);
  const complete = Boolean(bondingCurveData.data.complete);

  if (complete) {
    return {
      success: false,
      message:
        " Token isn't trading on the the bonding curve please use pumpswapMinAmountOut(mint, connection)",
      bondingCurveData,
      estimatedAmountOut: 0,
      minimumAmountOut: 0,
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
  const feeBasisPoints = 100; // 1% = 100 basis points
  const feeFactor = 1 - feeBasisPoints / 10000;
  const tokensAfterFee = tokensReceived * feeFactor;

  // Return the estimated amount out and the amount with the slippage
  return {
    success: true,
    bondingCurveData,
    estimatedAmountOut: Math.floor(tokensAfterFee),
    minimumAmountOut: Math.floor(tokensAfterFee * (1 - slippage)),
  };
};

export const estimatePumpfunMinSolOut = async (
  mint: Address,
  connection: any,
  tokenAmount: number,
  slippage: number
) => {
  // Get bonding curve data
  const bondingCurveData = await getBondingCurveData(mint, connection);

  // Convert BigInts to Numbers for calculation
  // Note: This could lose precision for very large numbers
  const virtualTokenReserves = Number(bondingCurveData.data.virtualTokenReserves);
  const virtualSolReserves = Number(bondingCurveData.data.virtualSolReserves);
  const complete = Boolean(bondingCurveData.data.complete);

  if (complete) {
    return {
      success: false,
      message:
        " Token isn't trading on the the bonding curve please use pumpswapMinAmountOut(mint, connection)",
      bondingCurveData,
      estimatedAmountOut: 0,
      minimumAmountOut: 0,
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
  const feeBasisPoints = 100; // 1% = 100 basis points
  const feeFactor = 1 - feeBasisPoints / 10000;
  const tokensAfterFee = solReceived * feeFactor;

  return {
    success: true,
    bondingCurveData,
    estimatedAmountOut: Math.floor(tokensAfterFee),
    minimumAmountOut: Math.floor(tokensAfterFee * (1 - slippage)),
  };
};
