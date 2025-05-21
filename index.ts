import dotenv from 'dotenv';
import { createSolanaClient, KeyPairSigner, SolanaClient } from 'gill';
import { loadKeypairSignerFromFile } from 'gill/node';

// Swaping functions
import { pumpfunBuy } from './src/pump/pumpfun/pumpfunBuy';
import { pumpfunSell } from './src/pump/pumpfun/pumpfunSell';
import { pumpswapSwap } from './src/pump/pumpswap/pumpswapSwap';

dotenv.config();

/**
 * Eample usage / testing grounds
 * Below shows some examples of how to use the pumpfun/pumpswap buy and sell functions
 */

async function main() {
  // Creates connection to Solana
  const connection: SolanaClient<string> = createSolanaClient({
    urlOrMoniker: `${process.env.HELIUS_URL}`,
  });

  // Load signer from config
  const signer: KeyPairSigner = await loadKeypairSignerFromFile();

  // Example token from pump
  let targetAddress = 'GuEhGYBW3DjfoESa5z6eQs2uoauQdP62QDotHzMppump';

  let solAmount = 0.0001;
  let tokenAmount = 10;
  const slippage = 0.01; // 1% slippage

  // Test PumpFun buy
  let response = await pumpfunBuy(
    targetAddress,
    solAmount,
    slippage,
    signer,
    connection,
    process.env.HELIUS_URL?.toString()
  );
  console.log('Buy transaction response', response);

  // // Test PumpFun sell
  // response = await pumpfunSell(
  //   targetAddress,
  //   tokenAmount,
  //   slippage,
  //   signer,
  //   connection,
  //   process.env.HELIUS_URL?.toString()
  // );

  console.log('Sell transaction response', response);

  // const quote = 'So11111111111111111111111111111111111111112'; // PumpSwap token to buy with
  // const base = 'GkyPYa7NnCFbduLknCfBfP7p8564X1VZhwZYJ6CZpump'; // PumpSwap token to recieve
  // const amount = 1; // Amount to swap of tokens to swap

  // // Test PumpSwap swap
  // // set 5th param to true if you want to buy the base using quote tokens
  // // set 5th param to false if you want to sell the base for quote tokens
  // response = await pumpswapSwap(
  //   base,
  //   quote,
  //   amount,
  //   slippage,
  //   false, // buy = true | sell = false
  //   signer,
  //   connection,
  //   process.env.HELIUS_URL?.toString()
  // );
}

main();
