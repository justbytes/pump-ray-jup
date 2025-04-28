/**
 * Bonding curve decoding function with detailed debugging
 * @param {Buffer} buffer The binary buffer containing the account data
 */
export const decodeBondingCurveAccount = (buffer: Buffer) => {
  if (buffer.length < 49) {
    console.error("Buffer too small for bonding curve data:", buffer.length);
    throw new Error("Buffer too small to contain bonding curve data");
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
    discriminator: discriminator.toString("hex"),
    virtualTokenReserves,
    virtualSolReserves,
    realTokenReserves,
    realSolReserves,
    tokenTotalSupply,
    complete,
  };
};

// /**
//  * Helper to handle BigInt to Number conversions safely
//  * @param {BigInt} bigIntValue The BigInt value to convert
//  * @returns {number} The number value, or MAX_SAFE_INTEGER if too large
//  */
// export const safeNumberFromBigInt = (bigIntValue: bigint): number => {
//   // Convert Number.MAX_SAFE_INTEGER to bigint for proper comparison
//   const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);

//   if (bigIntValue > maxSafeInteger) {
//     console.warn('BigInt value too large for Number, using MAX_SAFE_INTEGER');
//     return Number.MAX_SAFE_INTEGER;
//   }
//   return Number(bigIntValue);
// };

// /**
//  * Get global parameters from the PumpFun program
//  * This should be called to get the actual fee basis points
//  */
// export const fetchGlobalParams = async (connection: any, globalAddress: string) => {
//   try {
//     const accountInfo = await connection.rpc
//       .getAccountInfo(globalAddress, {
//         encoding: 'base64',
//       })
//       .send();

//     if (!accountInfo || !accountInfo.value) {
//       throw new Error('Global account not found');
//     }

//     const data = Buffer.from(accountInfo.value.data[0], 'base64');

//     // Global struct fields according to the IDL
//     const initialized = data[8] === 1; // boolean at offset 8

//     // authority: publicKey (32 bytes)
//     const authority = data.slice(9, 41).toString('hex');

//     // feeRecipient: publicKey (32 bytes)
//     const feeRecipient = data.slice(41, 73).toString('hex');

//     // The rest are u64 values (8 bytes each)
//     const initialVirtualTokenReserves = data.readBigUInt64LE(73);
//     const initialVirtualSolReserves = data.readBigUInt64LE(81);
//     const initialRealTokenReserves = data.readBigUInt64LE(89);
//     const tokenTotalSupply = data.readBigUInt64LE(97);
//     const feeBasisPoints = data.readBigUInt64LE(105);

//     return {
//       initialized,
//       authority,
//       feeRecipient,
//       initialVirtualTokenReserves,
//       initialVirtualSolReserves,
//       initialRealTokenReserves,
//       tokenTotalSupply,
//       feeBasisPoints: Number(feeBasisPoints),
//     };
//   } catch (error) {
//     console.error('Error fetching global params:', error);
//     // Default to 0.5% (50 basis points) if we can't fetch
//     return { feeBasisPoints: 50 };
//   }
// };

// /**
//  * Calculate tokens out from SOL in based on the bonding curve formula
//  *
//  * IMPORTANT: Based on our debug logs, PumpFun appears to use only the VIRTUAL
//  * reserves for the bonding curve calculation, not the total reserves.
//  *
//  * @param {any} bondingCurveData Decoded bonding curve data
//  * @param {number} solAmountLamports SOL amount in lamports
//  * @param {number} feeBasisPoints Fee in basis points (e.g., 100 = 1%)
//  * @returns {number} Expected token amount out
//  */
// export const calculateTokensOut = (
//   bondingCurveData: any,
//   solAmountLamports: number,
//   feeBasisPoints: number
// ): number => {
//   // Get reserves from bonding curve data
//   const virtualTokenReserves = safeNumberFromBigInt(bondingCurveData.virtualTokenReserves);
//   const virtualSolReserves = safeNumberFromBigInt(bondingCurveData.virtualSolReserves);
//   const realTokenReserves = safeNumberFromBigInt(bondingCurveData.realTokenReserves);
//   const realSolReserves = safeNumberFromBigInt(bondingCurveData.realSolReserves);

//   console.log('=== Token Out Calculation ===');
//   console.log('Virtual Token Reserves:', virtualTokenReserves);
//   console.log('Virtual SOL Reserves:', virtualSolReserves);
//   console.log('Real Token Reserves:', realTokenReserves);
//   console.log('Real SOL Reserves:', realSolReserves);
//   console.log('SOL Amount (lamports):', solAmountLamports);

//   // IMPORTANT: Based on our debug logs, PumpFun uses only the VIRTUAL reserves for calculation

//   // Calculate using constant product formula with VIRTUAL reserves only
//   // (x + dx) * (y - dy) = x * y
//   // Where x = virtualSolReserves, y = virtualTokenReserves
//   const k = virtualSolReserves * virtualTokenReserves;
//   console.log('Constant product k (using virtual reserves):', k);

//   // New SOL reserves: x' = x + dx
//   const newSolReserves = virtualSolReserves + solAmountLamports;
//   console.log('New Virtual SOL Reserves:', newSolReserves);

//   // New token reserves: y' = k / x'
//   const newTokenReserves = k / newSolReserves;
//   console.log('New Virtual Token Reserves:', newTokenReserves);

//   // Tokens out before fee: dy = y - y'
//   const tokensOut = virtualTokenReserves - newTokenReserves;
//   console.log('Tokens Out (before fee):', tokensOut);

//   // Apply fee (PumpFun charges a 1% fee = 100 basis points)
//   const feeFactor = 1 - feeBasisPoints / 10000;
//   const tokensAfterFee = tokensOut * feeFactor;
//   console.log('Fee Basis Points:', feeBasisPoints);
//   console.log('Fee Factor:', feeFactor);
//   console.log('Tokens Out (after fee):', tokensAfterFee);

//   // Convert to an integer to match PumpFun's behavior
//   return Math.floor(tokensAfterFee);
// };
