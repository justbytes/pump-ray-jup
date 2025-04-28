import { FullySignedTransaction, getBase64EncodedWireTransaction, Transaction } from 'gill';

/**
 * Bonding curve decoding function with detailed debugging
 * @param {Buffer} buffer The binary buffer containing the account data
 */
export const decodeBondingCurveAccount = (buffer: Buffer) => {
  if (buffer.length < 49) {
    console.error('Buffer too small for bonding curve data:', buffer.length);
    throw new Error('Buffer too small to contain bonding curve data');
  }

  // First 8 bytes are the Anchor discriminator
  const discriminator = buffer.slice(0, 8);

  // Read the u64 fields (8 bytes each, little-endian)
  const virtualTokenReserves = buffer.readBigUInt64LE(8);
  const virtualSolReserves = buffer.readBigUInt64LE(16);
  const realTokenReserves = buffer.readBigUInt64LE(24);
  const realSolReserves = buffer.readBigUInt64LE(32);
  const tokenTotalSupply = buffer.readBigUInt64LE(40);

  // Boolean field (1 byte)
  const complete = buffer[48] === 1;

  // Log the values for debugging
  // console.log('=== Bonding Curve Raw Values ===');
  // console.log('Discriminator (hex):', discriminator.toString('hex'));
  // console.log('virtualTokenReserves:', virtualTokenReserves.toString());
  // console.log('virtualSolReserves:', virtualSolReserves.toString());
  // console.log('realTokenReserves:', realTokenReserves.toString());
  // console.log('realSolReserves:', realSolReserves.toString());
  // console.log('tokenTotalSupply:', tokenTotalSupply.toString());
  // console.log('complete:', complete);

  return {
    discriminator: discriminator.toString('hex'),
    virtualTokenReserves,
    virtualSolReserves,
    realTokenReserves,
    realSolReserves,
    tokenTotalSupply,
    complete,
  };
};

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
  return await priorityFeeResponse.json();
};
