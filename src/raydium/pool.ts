import axios from 'axios';
import { RAY_LEGACY_AMM_V4 } from '../constants';

/**
 * Returns all of the pool data for two given mint addresses
 */
export async function getPoolDataByMint(mintA: string, mintB: string) {
  // Get token data by mint
  const response = await axios.get('https://api-v3.raydium.io/pools/info/mint', {
    params: {
      mint1: mintA,
      mint2: mintB,
      poolType: 'standard',
      poolSortField: 'default',
      sortType: 'desc',
      pageSize: 1000,
      page: 1,
    },
    headers: {
      accept: 'application/json',
    },
  });

  // Return if we didn't get any pools
  if (!response) {
    return false;
  }

  // Return data
  return response.data.data;
}

export async function getPoolDataById(id: string) {
  // Get token data by mint
  const response = await axios.get(`https://api-v3.raydium.io/pools/info/ids?ids=${id}`);

  // Return if we didn't get any pools
  if (!response) {
    return false;
  }

  // Return data
  return response.data.data;
}

/**
 * Gets the pool id based on which has the highest amount of base token liquidity.
 * baseMint should be a token like sol, wsol, usdt, usdc, etc
 */
export async function getPoolIds(baseMint: string, quoteMint: string) {
  // Get the pool data using the two tokenMints from parameters
  const poolData = await getPoolDataByMint(baseMint, quoteMint);

  // Stop if we don't have any data
  if (!poolData) {
    return null;
  }

  // Parse to pools
  const pools = poolData.data;

  // Return the id of the first index if we only have 1
  if (pools.length <= 1) {
    return { poolId: pools[0].id, programId: pools[0].programId };
  }

  // Sorting variables
  let poolId;
  let programId;
  let highest = 0;

  // Loop through the pools and find the one with the most liquidity in baseTokens
  for (let i = 0; i < pools.length; i++) {
    // Pool
    const pool = pools[i];

    // If the baseMint is mint A get the amount and see if its the highest
    if (pool.mintA.address == baseMint) {
      if (pool.mintAmountA > highest) {
        highest = pool.mintAmountA;
        poolId = pool.id;
        programId = pool.programId;
      }
    } else {
      if (pool.mintAmountB > highest) {
        highest = pool.mintAmountB;
        poolId = pool.id;
        programId = pool.programId;
      }
    }
  }

  return { poolId, programId };
}

/**
 * gets pool key data like auth, vaultA, vaultB, ect.
 */
export async function getPoolKeys(id: string) {
  // Get the keys data using alchemy sdk
  const response = await axios.get(`https://api-v3.raydium.io/pools/key/ids?ids=${id}`);

  if (!response) return null;

  return response.data.data[0];
}

/**
 *  Gets formats the accounts for amm ixs
 */
export async function getLegacyAmmAccounts(keyData: any, baseMint: string, qutoeMint: string) {
  let vaultA;
  let vaultB;

  if (keyData.mintA.address == baseMint) {
    vaultA = keyData.vault.A;
    vaultB = keyData.vault.B;
  } else {
    vaultA = keyData.vault.B;
    vaultB = keyData.vault.A;
  }

  return {
    type: 'amm',
    programId: keyData.programId,
    poolId: keyData.id,
    ammAuthority: keyData.authority,
    vaultA,
    vaultB,
  };
}

/**
 * Gets all of the accounts for the given pools program id
 */
export async function getSwapAccounts(baseMint: string, quoteMint: string) {
  // Get the pool id
  const ids = await getPoolIds(baseMint, quoteMint);

  if (!ids) {
    return { success: false, data: null, reason: "Couldn't get pool id" };
  }

  const keyData = await getPoolKeys(ids.poolId);

  if (!keyData) {
    return { success: false, data: null, reason: "Couldn't get pool keys with id" };
  }

  switch (ids.programId) {
    case RAY_LEGACY_AMM_V4:
      return getLegacyAmmAccounts(keyData, baseMint, quoteMint);

    default:
      break;
  }
}

export async function getBaseAmountOut(amount: number, baseMint: string, id: string) {
  const poolData = await getPoolDataById(id);

  if (!poolData) return null;

  console.log(poolData);
}

export async function getQuoteAmountOut(
  baseIn: number,
  slippageTolerance: number,
  baseMint: string,
  id: string
) {
  // Get pool data using the pool id
  const data = await getPoolDataById(id);

  // Return early if no data
  if (!data) return null;

  // Get the first and only pool by index
  const poolData = data[0];

  // Initialize variables
  let baseReserves, quoteReserves, baseDecimals, quoteDecimals;
  console.log(poolData.mintAmountA);

  // Here we ensure that we know what mintA and mintB are
  if (poolData.mintA.address == baseMint) {
    baseReserves = poolData.mintAmountA;
    quoteReserves = poolData.mintAmountB;
    baseDecimals = poolData.mintA.decimals;
    quoteDecimals = poolData.mintB.decimals;
  } else {
    baseReserves = poolData.mintAmountB;
    quoteReserves = poolData.mintAmountA;
    baseDecimals = poolData.mintB.decimals;
    quoteDecimals = poolData.mintA.decimals;
  }

  // Constant product formal get amount out in quote token
  const k = baseReserves * quoteReserves;
  const newBaseReserves = baseIn + baseReserves;
  const newQuoteReserves = k / newBaseReserves;

  const quoteTokensEstimate = quoteReserves - newQuoteReserves;

  // Calculate fee
  const feeBasisPoints = 25;
  const feeFactorNumerator = 10000 - feeBasisPoints;
  const feeFactorDenominator = 10000;

  // Amount of tokens out
  const tokensAfterFee = (quoteTokensEstimate * feeFactorNumerator) / feeFactorDenominator;
  console.log(tokensAfterFee);

  // Calculate slippage
  const slippage = Math.floor(slippageTolerance * 10000) * 100;
  const slippageFactorNumerator = 1000000 - slippage;
  const slippageFactorDenominator = 1000000;

  // Min amount out of to recieve
  const minimumQuoteAmountOut =
    (tokensAfterFee * slippageFactorNumerator) / slippageFactorDenominator;

  console.log(minimumQuoteAmountOut);
  // Convert to BigInt for blockchain transactions (accept tiny precision errors)
  const maxBaseIn = BigInt(Math.floor(baseIn * Math.pow(10, baseDecimals)));
  const estimatedAmountOutRaw = BigInt(Math.floor(tokensAfterFee * Math.pow(10, quoteDecimals)));
  const minimumAmountOutRaw = BigInt(
    Math.floor(minimumQuoteAmountOut * Math.pow(10, quoteDecimals))
  );

  console.log(maxBaseIn);
  console.log(estimatedAmountOutRaw);
  console.log(minimumAmountOutRaw);

  return {
    maxBaseIn,
    amountOut: estimatedAmountOutRaw,
    minAmountOut: minimumAmountOutRaw,
  };
}

// getQuoteAmountOut(
//   0.001,
//   0.01,
//   'So11111111111111111111111111111111111111112',
//   '5AFrQHMgSBxAovKbR3n1fsjmJsEARWzrHzxJJDWhPs6A'
// );
