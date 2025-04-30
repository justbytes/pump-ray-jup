import BN from 'bn.js';
import { address, Address, getAddressEncoder, getProgramDerivedAddress } from 'gill';
import { PUMPSWAP_PROGRAM_ID } from './constants';

export const CANONICAL_POOL_INDEX = 0;

export async function getPumpPoolAuthorityPda(mint: Address) {
  const [pumpPoolAuthorityPda, pumpPoolAuthorityPdaBump] = await getProgramDerivedAddress({
    seeds: ['pool-authority', getAddressEncoder().encode(mint)],
    programAddress: address(PUMPSWAP_PROGRAM_ID),
  });

  return pumpPoolAuthorityPda;
}

export const getPoolPda = async (owner: Address, baseMint: Address, quoteMint: Address) => {
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

export const getPoolData = async (mint: Address, connection: any) => {
  const [pool, _poolBump] = await getProgramDerivedAddress({
    seeds: ['pool', getAddressEncoder().encode(mint)],
    programAddress: address(PUMPSWAP_PROGRAM_ID),
  });

  return pool;
};

export const estimatePumpswapMinTokensOut = (
  mint: Address,
  connection: any,
  solAmount: number,
  slippage: number
) => {
  let success, message, poolData, estimatedAmountOut, minimumAmountOut;

  // TOD Calculate the amounts out for the given input
  return { success, message, poolData, estimatedAmountOut, minimumAmountOut };
};

export const estimatePumpswapMinSolOut = () => {};
