// Get pool data

import { Address } from 'gill';

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
