import { address, getProgramDerivedAddress } from 'gill';
import { PUMPFUN_PROGRAM_ID, PUMPSWAP_PROGRAM_ID } from '../constants';
import * as borsh from '@coral-xyz/borsh';

export const globalSchema = borsh.struct([
  borsh.array(borsh.u8(), 8, 'discriminator'),
  borsh.bool('initialized'),
  borsh.publicKey('authority'),
  borsh.publicKey('feeRecipient'),
  borsh.u64('initialVirtualTokenReserves'),
  borsh.u64('initialVirtualSolReserves'),
  borsh.u64('initialRealTokenReserves'),
  borsh.u64('tokenTotalSupply'),
  borsh.u64('feeBasisPoints'),
]);

export const getGlobalData = async (connection: any) => {
  // Get the global account address
  const [globalAddress] = await getProgramDerivedAddress({
    seeds: ['global'],
    programAddress: address(PUMPFUN_PROGRAM_ID),
  });

  // Fetch the account data
  const accountInfo = await connection.rpc
    .getAccountInfo(globalAddress, {
      encoding: 'base64',
    })
    .send();

  const base64Data = accountInfo.value.data[0];
  const dataBuffer = Buffer.from(base64Data, 'base64');

  return globalSchema.decode(dataBuffer);
};
