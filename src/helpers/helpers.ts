import { getBase64EncodedWireTransaction } from 'gill';

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
