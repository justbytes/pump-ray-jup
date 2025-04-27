import { address, createSolanaClient, KeyPairSigner } from 'gill';
import { loadKeypairSignerFromFile } from 'gill/node';

import { pumpfunBuy } from './src/buy';
import { pumpfunSell } from './src/sell';

async function main() {
  // target mint address hardcoded for testing
  const mint = 'BuWEZfRc1vQFhTf7dVUeaia62ZTe6g9rSo1vkBqipump';

  // Creates connection to Solana
  const connection = createSolanaClient({
    urlOrMoniker: 'mainnet',
  });

  // Load signer from config
  const signer: KeyPairSigner = await loadKeypairSignerFromFile();

  // For testing
  const slippage = 0.01; // 1% slippage
  const solAmount = 0.0001; // Buy 0.0001 sol worth
  const tokenAmount = 1000;

  // Test the buy
  // const response = await pumpfunBuy(mint, solAmount, slippage, signer, connection);

  // Test the sell
  const response = await pumpfunSell(mint, tokenAmount, slippage, signer, connection);

  console.log('Buy transaction response', response);
}

main();
