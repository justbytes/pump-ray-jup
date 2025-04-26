export const formatPumpfunBuyAmount = (
  amountInTokens: number,
  maxSolToSpend: number
) => {
  // If maxSolToSpend is zero set maxSolToSpend slippage to 100%
  // "Buy the amountInTokens no matter the price"
  if (maxSolToSpend === 0) {
    maxSolToSpend = -1;
    amountInTokens = amountInTokens * 1e6; // Multiply by token decimals
  }

  // If amountInTokens is zero set amountInToken slippage to 100%
  // "Expect no minimum amount of tokens recieved for amount of maxsolToSpend"
  if (amountInTokens === 0) {
    amountInTokens = -1;
    maxSolToSpend = maxSolToSpend * 1e9;
  }

  // Create the data buffer
  const dataBuffer = Buffer.alloc(24);
  dataBuffer.write("66063d1201daebea", "hex");
  dataBuffer.writeBigUInt64LE(BigInt(amountInTokens), 8);
  dataBuffer.writeBigUInt64LE(BigInt(maxSolToSpend), 16);

  return new Uint8Array(dataBuffer);
};

formatPumpfunBuyAmount(0, 0);
