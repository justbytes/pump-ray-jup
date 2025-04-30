import { address, getBase64EncodedWireTransaction, getProgramDerivedAddress } from 'gill';
import { PUMPFUN_PROGRAM_ID } from './constants';
import bs58 from 'bs58';

export const fetchGlobalState = async (connection: any) => {
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
  // Extract the fee recipient bytes (32 bytes)
  const feeRecipientBytes = dataBuffer.slice(41, 73);

  // Convert bytes to base58 string format
  // This is how Solana addresses are normally represented
  const feeRecipientString = bs58.encode(feeRecipientBytes);

  // Use gill's address function to convert the string to its address type
  return address(feeRecipientString);
};
