import * as borsh from "@coral-xyz/borsh";
import {
  address,
  Address,
  getAddressEncoder,
  getProgramDerivedAddress,
  SolanaClient,
} from "gill";
import { PUMPFUN_PROGRAM_ID, PUMPSWAP_PROGRAM_ID } from "../constants";
import BN from "bn.js";
import { fetchMint } from "gill/programs/token";

// Index getting pool pda
export const CANONICAL_POOL_INDEX = 0;

// ATA layout
export const tokenAccountSchema = borsh.struct([
  borsh.publicKey("mint"),
  borsh.publicKey("owner"),
  borsh.u64("amount"),
  borsh.option(borsh.publicKey(), "delegate"),
  borsh.u8("state"),
  borsh.option(borsh.u64(), "isNative"),
  borsh.u64("delegatedAmount"),
  borsh.option(borsh.publicKey(), "closeAuthority"),
]);

// Structure of the Pool
export const poolDataSchema = borsh.struct([
  borsh.array(borsh.u8(), 8, "discriminator"),
  borsh.u8("pool_bump"),
  borsh.u16("index"),
  borsh.publicKey("creator"),
  borsh.publicKey("base_mint"),
  borsh.publicKey("quote_mint"),
  borsh.publicKey("lp_mint"),
  borsh.publicKey("pool_base_token_account"),
  borsh.publicKey("pool_quote_token_account"),
  borsh.u64("lp_supply"),
]);

export type Result<T, E> =
  | {
      success: true;
      value: T;
    }
  | {
      success: false;
      value: E;
    };

export type TokenAccount = {
  mint: string;
  owner: string;
  amount: bigint;
  delegate?: string;
  state: number;
  isNative?: bigint;
  delegatedAmount: bigint;
  closeAuthority?: string;
};

export type RawPoolData = {
  discriminator: Uint8Array;
  poolBump: number;
  index: number;
  creator: string;
  baseMint: string;
  quoteMint: string;
  lpMint: string;
  poolBaseTokenAccount: string;
  poolQuoteTokenAccount: string;
  lpSupply: bigint;
};

export type PoolData = {
  poolPda: string;
  poolAuthorityPda: string;
  quoteTokenAccountData: TokenAccount;
  baseTokenAccountData: TokenAccount;
  poolData: RawPoolData;
};

export type EstimateResult = {
  poolData: PoolData;
  amountRaw: bigint;
  tokensEstimate: bigint;
  minimumAmountOut: bigint;
};

/**
 * Gets the pumpswap pool authority pda
 * @param {Address} mint
 * @returns {string}
 */
export async function getPumpPoolAuthorityPda(mint: Address): Promise<string> {
  const [pumpPoolAuthorityPda, pumpPoolAuthorityPdaBump] =
    await getProgramDerivedAddress({
      seeds: ["pool-authority", getAddressEncoder().encode(mint)],
      programAddress: address(PUMPFUN_PROGRAM_ID),
    });

  return pumpPoolAuthorityPda;
}

/**
 * Gets the pumpswap pool pda
 * @param {Address} owner
 * @param {Address} baseMint
 * @param {Address} quoteMint
 * @returns {string}
 */
export const getPumpPoolPda = async (
  owner: Address,
  baseMint: Address,
  quoteMint: Address
): Promise<string> => {
  const [poolPda, _poolPdaBump] = await getProgramDerivedAddress({
    seeds: [
      "pool",
      new BN(CANONICAL_POOL_INDEX).toArrayLike(Buffer, "le", 2),
      getAddressEncoder().encode(owner),
      getAddressEncoder().encode(baseMint),
      getAddressEncoder().encode(quoteMint),
    ],
    programAddress: address(PUMPSWAP_PROGRAM_ID),
  });

  return poolPda;
};

/**
 * Gets the liquidity pool mint pda
 * @param {Address} pool
 * @returns {string}
 */
export async function getLpMintPda(pool: Address): Promise<string> {
  const [lpMintPda, lpMintPdaBump] = await getProgramDerivedAddress({
    seeds: ["pool_lp_mint", getAddressEncoder().encode(pool)],
    programAddress: address(PUMPSWAP_PROGRAM_ID),
  });
  return lpMintPda;
}

/**
 * Get the pools data refer to the poolDataSchema at top of page to see what the out put looks like
 * @param {Address} baseMint
 * @param {Address} quoteMint
 * @param {SolanaClient<string>} connection
 * @returns
 */
export const getPumpPoolData = async (
  baseMint: Address,
  quoteMint: Address,
  connection: SolanaClient<string>
): Promise<Result<PoolData, Error>> => {
  // Get pool authority owner
  const poolAuthorityPda = await getPumpPoolAuthorityPda(baseMint);

  // Get pool Pda
  const poolPda = await getPumpPoolPda(
    address(poolAuthorityPda),
    baseMint,
    quoteMint
  );

  // Get pumpPool account info
  const pumpPoolAccountInfo = await connection.rpc
    .getAccountInfo(address(poolPda), { encoding: "base64" })
    .send();

  // get the data field
  let base64Data = pumpPoolAccountInfo?.value?.data[0];

  // If theres no data return
  if (!base64Data)
    return {
      success: false,
      value: new Error("There was an error when getting pool account info."),
    };

  // Convert base64 Buffer
  let dataBuffer = Buffer.from(base64Data, "base64");

  // Use poolDataSchema to deocde the data from buffer
  const data = poolDataSchema.decode(dataBuffer);

  // Get the pools base mint account info
  const poolBaseMintAccountInfo = await connection.rpc
    .getAccountInfo(data.pool_base_token_account.toString(), {
      encoding: "base64",
    })
    .send();

  // get the data field
  base64Data = poolBaseMintAccountInfo?.value?.data[0];

  // if theres no data return
  if (!base64Data)
    return {
      success: false,
      value: new Error(
        "There was an error when getting pool base mint account info."
      ),
    };

  // Convert base64 Buffer
  dataBuffer = Buffer.from(base64Data, "base64");

  // Use the tokenAccountScema to decode data from buffer
  const baseTokenAccountData = tokenAccountSchema.decode(dataBuffer);

  // get the pools quote mint account info
  const poolQuoteMintAccountInfo = await connection.rpc
    .getAccountInfo(data.pool_quote_token_account.toString(), {
      encoding: "base64",
    })
    .send();

  // get the data field
  base64Data = poolQuoteMintAccountInfo?.value?.data[0];

  // Return if theres no data
  if (!base64Data)
    return {
      success: false,
      value: new Error(
        "There was an error when getting pool quote mint account info."
      ),
    };

  // Convert base64 Buffer
  dataBuffer = Buffer.from(base64Data, "base64");

  // Use the tokenAccountSchema to decode data from buffer
  const quoteTokenAccountData = tokenAccountSchema.decode(dataBuffer);

  return {
    success: true,
    value: {
      poolPda,
      poolAuthorityPda,
      quoteTokenAccountData,
      baseTokenAccountData,
      poolData: data,
    },
  };
};

/**
 * Gets an estimate amount out for the buy or sell of pool
 * @param {Boolean} buy
 * @param {SolanaClient<string>} connection
 * @param {Address} baseMint
 * @param {Address} quoteMint
 * @param {number} amount
 * @param {number} slippage
 * @returns poolData and estimate prices as an object
 */
export const getEstimatedAmountOut = async (
  buy: boolean,
  connection: SolanaClient<string>,
  baseMint: Address,
  quoteMint: Address,
  amount: number,
  slippage: number
) => {
  const results = await getPumpPoolData(baseMint, quoteMint, connection);

  if (!results.success) {
    return {
      success: false,
      value: new Error(
        "An error ocured when getting pool data for amount out estimate"
      ),
    };
  }

  const poolData = results.value;

  // Get the estimate out for the buy or sell
  if (buy) {
    return buying(amount, slippage);
  } else {
    //return selling(amount, slippage);
  }

  // Calculates the amount of the base token out with a given amount of quote token
  async function buying(
    amount: number,
    slippage: number
  ): Promise<Result<EstimateResult, Error>> {
    // Get decimal information
    const quoteMintAccountData = await fetchMint(
      connection.rpc,
      address(quoteMint)
    );
    const baseMintAccountData = await fetchMint(
      connection.rpc,
      address(baseMint)
    );

    // asign decimals
    const quoteDecimals = quoteMintAccountData.data.decimals;
    const baseDecimals = baseMintAccountData.data.decimals;

    // Convert BN to JavaScript numbers and adjust for decimals
    const quoteReserves = BigInt(poolData.quoteTokenAccountData.amount);
    const baseReserves = BigInt(poolData.baseTokenAccountData.amount);

    const quoteDecimalsFactor = 10n ** BigInt(quoteDecimals);

    // Convert input amount to raw amount with decimals
    const amountRaw = BigInt(Math.floor(amount * Number(quoteDecimalsFactor)));

    // Calculate the constant product
    const k = quoteReserves * baseReserves;

    // Calculate new reserves after swap
    const newQuoteReserves = amountRaw + quoteReserves;
    const newBaseReserves = k / newQuoteReserves;

    // Calculate token amount out
    const baseTokensEstimate = baseReserves - newBaseReserves;

    // Apply fee
    const feeBasisPoints = 25n;
    const feeFactorNumerator = 10000n - feeBasisPoints;
    const feeFactorDenominator = 10000n;

    const tokensAfterFee =
      (baseTokensEstimate * feeFactorNumerator) / feeFactorDenominator;

    const slippageBigInt = BigInt(Math.floor(slippage * 10000)) * 100n; // Convert to basis points (e.g., 0.01 -> 100 basis points)
    const slippageFactorNumerator = 1000000n - slippageBigInt;
    const slippageFactorDenominator = 1000000n;

    const minimumBaseAmountOut =
      (tokensAfterFee * slippageFactorNumerator) / slippageFactorDenominator;

    return {
      success: true,
      value: {
        poolData,
        amountRaw,
        tokensEstimate: tokensAfterFee,
        minimumAmountOut: minimumBaseAmountOut,
      },
    };
  }

  // // Calculate amount of quote token out for a base amount in
  // async function selling(
  //   amount: number,
  //   slippage: number
  // ): Promise<Result<EstimateResult, Error>> {
  //   // Get decimal information
  //   const baseMintAccountData = await fetchMint(
  //     connection.rpc,
  //     address(baseMint)
  //   );
  //   const baseDecimals = baseMintAccountData.data.decimals;

  //   // Convert BN to JavaScript numbers and adjust for decimals
  //   const quoteReservesAdjusted = Number(poolData.quoteTokenAccountData.amount);
  //   const baseReservesAdjusted = Number(poolData.baseTokenAccountData.amount);

  //   // Convert input amount to raw amount with decimals
  //   const amountRaw = amount * 10 ** baseDecimals;

  //   // Calculate the constant product
  //   const k = quoteReservesAdjusted * baseReservesAdjusted;
  //   const newBaseReservesAdjusted = amountRaw + baseReservesAdjusted;
  //   const newQuoteReservesAdjusted = k / newBaseReservesAdjusted;
  //   const quoteTokensEstimateAdjusted =
  //     quoteReservesAdjusted - newQuoteReservesAdjusted;

  //   // Apply fee
  //   const feeBasisPoints = 25;
  //   const feeFactor = 1 - feeBasisPoints / 10000;
  //   const tokensAfterFeeAdjusted = quoteTokensEstimateAdjusted * feeFactor;

  //   // Convert back to raw amounts
  //   //const tokensAfterFeeRaw = Math.floor(tokensAfterFeeAdjusted);
  //   const minimumBaseAmountOutRaw = Math.floor(
  //     tokensAfterFeeAdjusted * (1 - slippage)
  //   );

  //   return {
  //     success: true,
  //     value: {
  //       poolData,
  //       amountRaw,
  //       tokensEstimate: tokensAfterFeeAdjusted,
  //       minimumAmountOut: minimumBaseAmountOutRaw,
  //     },
  //   };
  // }
};
