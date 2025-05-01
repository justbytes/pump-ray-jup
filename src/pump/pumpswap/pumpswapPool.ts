import * as borsh from '@coral-xyz/borsh';
import { address, Address, getAddressEncoder, getProgramDerivedAddress } from 'gill';
import { PUMPFUN_PROGRAM_ID, PUMPSWAP_PROGRAM_ID } from '../constants';
import BN from 'bn.js';

export const CANONICAL_POOL_INDEX = 0;

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

export const getPumpPoolData = async (baseMint: Address, quoteMint: Address, connection: any) => {
  // Get pool authority/ owner
  const pumpPoolAuthorityPda = await getPumpPoolAuthorityPda(baseMint);

  // Get pool Pda
  const pumpPoolPda = await getPumpPoolPda(pumpPoolAuthorityPda, baseMint, quoteMint);

  // Get pumpPool account info
  const pumpPoolAccountInfo = await connection.rpc
    .getAccountInfo(pumpPoolPda, { encoding: 'base64' })
    .send();

  const base64Data = pumpPoolAccountInfo.value.data[0];
  const dataBuffer = Buffer.from(base64Data, 'base64');

  const data = poolDataSchema.decode(dataBuffer);

  return { pumpPoolPda, ...data };
};

export const estimatePumpswapBaseAmountOut = async (
  connection: any,
  baseMint: Address,
  quoteMint: Address,
  quoteAmount: number,
  slippage: number
) => {
  const pumpPoolData = await getPumpPoolData(baseMint, quoteMint, connection);

  let success, message, poolData, estimatedBaseAmountOut, minimumBaseAmountOut;

  // TOD Calculate the amounts out for the given input
  return { success, message, poolData, estimatedBaseAmountOut, minimumBaseAmountOut };
};

export const estimatePumpswapMinSolOut = () => {};
