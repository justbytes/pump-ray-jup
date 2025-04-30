import { address, getBase64EncodedWireTransaction, getProgramDerivedAddress } from 'gill';
import { PUMPFUN_PROGRAM_ID } from './constants';
import bs58 from 'bs58';

export const getPriorityFees = async (rpcUrl: string, signedTransaction: any) => {
  const priorityFeeResponse = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'helius-priority-fee',
      method: 'getPriorityFeeEstimate',
      params: [
        {
          transaction: getBase64EncodedWireTransaction(signedTransaction),
          options: {
            transactionEncoding: 'base64',
            recommended: true,
          },
        },
      ],
    }),
  });
  try {
    const response: any = await priorityFeeResponse.json();
    if (!response) {
      throw new Error('Something went wrong with getting compute unit price estimate from Helius');
    }
    return response.result.priorityFeeEstimate;
  } catch (error) {
    throw new Error('Helius priority fee call failed');
  }
};

export async function fetchGlobalState(connection: any) {
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
}
