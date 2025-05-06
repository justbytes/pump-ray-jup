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
  data: RawPoolData;
};

export type EstimateResult = {
  poolData: PoolData;
  amountRaw: bigint;
  tokensEstimate: bigint;
  minimumAmountOut: bigint;
};
