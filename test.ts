import raydium_amm_idl from './idls/raydium_amm.json';

const hexData = '0040420f00000000004df6d0e000000000';
const instructionData = Buffer.from(hexData, 'hex');

function decodeRaydiumInstruction(data) {
  const view = new DataView(data.buffer);

  if (data.length === 17) {
    const discriminator = data[0];
    const amountIn = view.getBigUint64(1, true);
    const minimumAmountOut = view.getBigUint64(9, true);

    return {
      instructionType: discriminator === 0 ? 'swap' : `instruction_${discriminator}`,
      discriminator,
      amountIn: amountIn.toString(),
      minimumAmountOut: minimumAmountOut.toString(),
      // Format with different decimal assumptions
      formatted: {
        amountIn6: Number(amountIn) / 1e6,
        minimumAmountOut6: Number(minimumAmountOut) / 1e6,
        amountIn9: Number(amountIn) / 1e9,
        minimumAmountOut9: Number(minimumAmountOut) / 1e9,
      },
    };
  }

  throw new Error(`Unsupported instruction data length: ${data.length}`);
}

// Use it
const result = decodeRaydiumInstruction(instructionData);
console.log('Decoded:', result);
