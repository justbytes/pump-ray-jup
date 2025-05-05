import * as borsh from '@coral-xyz/borsh';
import { address, Address, getAddressEncoder, getProgramDerivedAddress } from 'gill';
import { PUMPFUN_PROGRAM_ID, PUMPSWAP_PROGRAM_ID } from '../constants';
import BN from 'bn.js';
import { fetchMint } from 'gill/programs/token';

export const CANONICAL_POOL_INDEX = 0;

export const tokenAccountSchema = borsh.struct([
  borsh.publicKey('mint'),
  borsh.publicKey('owner'),
  borsh.u64('amount'),
  borsh.option(borsh.publicKey(), 'delegate'),
  borsh.u8('state'),
  borsh.option(borsh.u64(), 'isNative'),
  borsh.u64('delegatedAmount'),
  borsh.option(borsh.publicKey(), 'closeAuthority'),
]);

// Structure of the Pool
export const poolDataSchema = borsh.struct([
  borsh.array(borsh.u8(), 8, 'discriminator'),
  borsh.u8('pool_bump'),
  borsh.u16('index'),
  borsh.publicKey('creator'),
  borsh.publicKey('base_mint'),
  borsh.publicKey('quote_mint'),
  borsh.publicKey('lp_mint'),
  borsh.publicKey('pool_base_token_account'),
  borsh.publicKey('pool_quote_token_account'),
  borsh.u64('lp_supply'),
]);

export async function getPumpPoolAuthorityPda(mint: Address) {
  const [pumpPoolAuthorityPda, pumpPoolAuthorityPdaBump] = await getProgramDerivedAddress({
    seeds: ['pool-authority', getAddressEncoder().encode(mint)],
    programAddress: address(PUMPFUN_PROGRAM_ID),
  });

  return pumpPoolAuthorityPda;
}

export const getPumpPoolPda = async (owner: Address, baseMint: Address, quoteMint: Address) => {
  const [poolPda, _poolPdaBump] = await getProgramDerivedAddress({
    seeds: [
      'pool',
      new BN(CANONICAL_POOL_INDEX).toArrayLike(Buffer, 'le', 2),
      getAddressEncoder().encode(owner),
      getAddressEncoder().encode(baseMint),
      getAddressEncoder().encode(quoteMint),
    ],
    programAddress: address(PUMPSWAP_PROGRAM_ID),
  });

  return poolPda;
};

export async function getLpMintPda(pool: Address) {
  const [lpMintPda, lpMintPdaBump] = await getProgramDerivedAddress({
    seeds: ['pool_lp_mint', getAddressEncoder().encode(pool)],
    programAddress: address(PUMPSWAP_PROGRAM_ID),
  });
  return lpMintPda;
}

// Gets all of the pool data including token accounts and their data
export const getPumpPoolData = async (baseMint: Address, quoteMint: Address, connection: any) => {
  // Get pool authority/ owner
  const pumpPoolAuthorityPda = await getPumpPoolAuthorityPda(baseMint);

  // Get pool Pda
  const pumpPoolPda = await getPumpPoolPda(pumpPoolAuthorityPda, baseMint, quoteMint);

  // Get pumpPool account info
  const pumpPoolAccountInfo = await connection.rpc
    .getAccountInfo(pumpPoolPda, { encoding: 'base64' })
    .send();

  let base64Data = pumpPoolAccountInfo.value.data[0];
  let dataBuffer = Buffer.from(base64Data, 'base64');

  const data = poolDataSchema.decode(dataBuffer);

  const poolBaseMintAccountInfo = await connection.rpc
    .getAccountInfo(data.pool_base_token_account.toString(), { encoding: 'base64' })
    .send();

  base64Data = poolBaseMintAccountInfo.value.data[0];
  dataBuffer = Buffer.from(base64Data, 'base64');

  const baseTokenAccountData = tokenAccountSchema.decode(dataBuffer);

  const poolQuoteMintAccountInfo = await connection.rpc
    .getAccountInfo(data.pool_quote_token_account.toString(), { encoding: 'base64' })
    .send();

  base64Data = poolQuoteMintAccountInfo.value.data[0];
  dataBuffer = Buffer.from(base64Data, 'base64');

  const quoteTokenAccountData = tokenAccountSchema.decode(dataBuffer);

  return {
    pumpPoolPda,
    pumpPoolAuthorityPda,
    ...data,
    quoteTokenAccountData,
    baseTokenAccountData,
  };
};

export const getEstimatedAmountOut = async (
  buy: boolean,
  connection: any,
  baseMint: Address,
  quoteMint: Address,
  amount: number,
  slippage: number
) => {
  const poolData = await getPumpPoolData(baseMint, quoteMint, connection);

  if (!poolData) {
    return {
      success: false,
      message: 'There was an error getting pool data from pumpswap',
      poolData,
      amountRaw: null,
      tokensEstimate: 0,
      minimumAmountOut: 0,
    };
  }

  // Get the estimate out for the buy or sell
  if (buy) {
    return buying(amount, slippage);
  } else {
    return selling(amount, slippage);
  }

  async function buying(amount: number, slippage: number) {
    // Get decimal information
    const quoteMintAccountData = await fetchMint(connection.rpc, address(quoteMint));
    const quoteDecimals = quoteMintAccountData.data.decimals;

    const baseMintAccountData = await fetchMint(connection.rpc, address(baseMint));
    const baseDecimals = baseMintAccountData.data.decimals;

    // Convert BN to JavaScript numbers and adjust for decimals
    const quoteReservesAdjusted =
      Number(poolData.quoteTokenAccountData.amount.toString()) / 10 ** quoteDecimals;
    const baseReservesAdjusted =
      Number(poolData.baseTokenAccountData.amount.toString()) / 10 ** baseDecimals;

    // Convert input amount to raw amount with decimals
    const amountRaw = amount * 10 ** quoteDecimals;

    // Calculate the constant product
    const k = quoteReservesAdjusted * baseReservesAdjusted;

    // Calculate new reserves after swap
    const newQuoteReservesAdjusted = amount + quoteReservesAdjusted;
    const newBaseReservesAdjusted = k / newQuoteReservesAdjusted;

    // Calculate token amount out
    const baseTokensEstimateAdjusted = baseReservesAdjusted - newBaseReservesAdjusted;

    // Apply fee
    const feeBasisPoints = 25;
    const feeFactor = 1 - feeBasisPoints / 10000;
    const tokensAfterFeeAdjusted = baseTokensEstimateAdjusted * feeFactor;

    // Convert back to raw amounts
    const tokensAfterFeeRaw = Math.floor(tokensAfterFeeAdjusted * 10 ** baseDecimals);
    const minimumBaseAmountOutRaw = Math.floor(tokensAfterFeeRaw * (1 - slippage));

    return {
      success: true,
      message: '',
      poolData,
      amountRaw,
      tokensEstimate: tokensAfterFeeRaw,
      minimumAmountOut: minimumBaseAmountOutRaw,
    };
  }

  async function selling(amount: number, slippage: number) {
    // Get decimal information
    const baseMintAccountData = await fetchMint(connection.rpc, address(baseMint));
    const baseDecimals = baseMintAccountData.data.decimals;

    // Convert BN to JavaScript numbers and adjust for decimals
    const quoteReservesAdjusted = Number(poolData.quoteTokenAccountData.amount.toString());
    const baseReservesAdjusted = Number(poolData.baseTokenAccountData.amount.toString());

    // Convert input amount to raw amount with decimals
    const amountRaw = amount * 10 ** baseDecimals;

    // Calculate the constant product
    const k = quoteReservesAdjusted * baseReservesAdjusted;
    const newBaseReservesAdjusted = amountRaw + baseReservesAdjusted;
    const newQuoteReservesAdjusted = k / newBaseReservesAdjusted;
    const quoteTokensEstimateAdjusted = quoteReservesAdjusted - newQuoteReservesAdjusted;

    // Apply fee
    const feeBasisPoints = 25;
    const feeFactor = 1 - feeBasisPoints / 10000;
    const tokensAfterFeeAdjusted = quoteTokensEstimateAdjusted * feeFactor;

    // Convert back to raw amounts
    //const tokensAfterFeeRaw = Math.floor(tokensAfterFeeAdjusted);
    const minimumBaseAmountOutRaw = Math.floor(tokensAfterFeeAdjusted * (1 - slippage));

    return {
      success: true,
      message: '',
      poolData,
      amountRaw,
      tokensEstimate: tokensAfterFeeAdjusted,
      minimumAmountOut: minimumBaseAmountOutRaw,
    };
  }
};

// export const getSellEstimatedAmountOut = async (
//   connection: any,
//   baseMint: Address,
//   quoteMint: Address,
//   quoteAmount: number,
//   slippage: number
// ) => {
//   // flip the quote and base to find the correct pool
//   const poolData = await getPumpPoolData(quoteMint, baseMint, connection);

//   if (!poolData) {
//     return {
//       success: false,
//       message: 'There was an error getting pool data from pumpswap',
//       poolData,
//       baseTokensEstimate: 0,
//       minimumAmountOut: 0,
//     };
//   }

//   // Get decimal information
//   const quoteMintAccountData = await fetchMint(connection.rpc, address(baseMint));
//   const baseMintAccountData = await fetchMint(connection.rpc, address(quoteMint));
//   const quoteDecimals = baseMintAccountData.data.decimals; //pump
//   const baseDecimals = quoteMintAccountData.data.decimals; //sol

//   // console.log(quoteDecimals);
//   // console.log(baseDecimals);
//   // Convert BN to JavaScript numbers and adjust for decimals
//   const quoteReservesAdjusted = Number(poolData.baseTokenAccountData.amount.toString());
//   const baseReservesAdjusted = Number(poolData.quoteTokenAccountData.amount.toString());

//   // Convert input amount to raw amount with decimals
//   const quoteAmountRaw = quoteAmount * 10 ** quoteDecimals;

//   // console.log('quoteResservesAdjusted: ', quoteReservesAdjusted);
//   // console.log('baseReservesAdjusted: ', baseReservesAdjusted);
//   // console.log('quote amount raw: ', quoteAmountRaw);

//   // Calculate the constant product
//   const k = quoteReservesAdjusted * baseReservesAdjusted;

//   // console.log('k', k);

//   // Calculate new reserves after swap
//   const newQuoteReservesAdjusted = quoteAmountRaw + quoteReservesAdjusted;
//   const newBaseReservesAdjusted = k / newQuoteReservesAdjusted;

//   // console.log('newQuoteReservesAdjusted: ', newQuoteReservesAdjusted);
//   // console.log('newBaseReservesAdjusted: ', newBaseReservesAdjusted);

//   // Calculate token amount out
//   const baseTokensEstimateAdjusted = baseReservesAdjusted - newBaseReservesAdjusted;

//   // console.log('baseTokensEstimatedAdjusted: ', baseTokensEstimateAdjusted);

//   // Apply fee
//   const feeBasisPoints = 25;
//   const feeFactor = 1 - feeBasisPoints / 10000;
//   const tokensAfterFeeAdjusted = baseTokensEstimateAdjusted * feeFactor;
//   // console.log('feeFactor: ', feeFactor);
//   // console.log('tokensAfterFeeAdjusted: ', tokensAfterFeeAdjusted);

//   const minimumBaseAmountOutRaw = Math.floor(tokensAfterFeeAdjusted * (1 - slippage));

//   // console.log('tokensAfterFees: ', tokensAfterFeeAdjusted);
//   // console.log('minimumBaseAmountOutRaw: ', minimumBaseAmountOutRaw);

//   return {
//     success: true,
//     poolData,
//     quoteAmountRaw,
//     baseTokensEstimate: tokensAfterFeeAdjusted,
//     minimumBaseAmountOut: minimumBaseAmountOutRaw,
//   };
// };
