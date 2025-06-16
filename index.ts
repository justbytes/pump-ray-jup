import dotenv from 'dotenv';
import { createSolanaClient, KeyPairSigner, SolanaClient } from 'gill';
import { loadKeypairSignerFromFile } from 'gill/node';

// Swaping functions
import { pumpfunBuy } from './src/pump/pumpfun/pumpfunBuy';
import { pumpfunSell } from './src/pump/pumpfun/pumpfunSell';
import { pumpswapSwap } from './src/pump/pumpswap/pumpswapSwap';
import { raydiumBuy } from './src/raydium/raydiumSwap';

dotenv.config();

/**
 * Eample usage / testing grounds
 * Below shows some examples of how to use the pumpfun/pumpswap buy and sell functions
 */

async function main() {
  // Creates connection to Solana with helius endpoint or you can switch it to the public rpc url
  const connection: SolanaClient<string> = createSolanaClient({
    urlOrMoniker: `${process.env.HELIUS_URL}`,
  });

  // Load default signer from config
  const signer: KeyPairSigner = await loadKeypairSignerFromFile();

  /**
   * PUMPFUN BUY/SELL example
   * The following functions are used to trade pumpfun tokens on the bonding curve
   */

  // Configure swap params
  const quoteMint = 'BjCmA9ZYwJ1BwusMGaSxe4pgaa9gfXTtdyX27NYEpump';
  const baseMint = 'So11111111111111111111111111111111111111112';

  let solAmount = 0.001;
  let tokenAmount = 11000;
  const slippage = 0.01; // 1% slippage

  let response = await raydiumBuy(
    baseMint,
    quoteMint,
    tokenAmount,
    slippage,
    false,
    signer,
    connection,
    `${process.env.HELIUS_URL}`
  );

  console.log('Response: ', response);

  // PumpFun buy
  // let response = await pumpfunBuy(
  //   targetAddress,
  //   solAmount,
  //   slippage,
  //   signer,
  //   connection,
  //   process.env.HELIUS_URL?.toString()
  // );

  // console.log('Buy transaction response', response);

  // // PumpFun sell
  // response = await pumpfunSell(
  //   targetAddress,
  //   tokenAmount,
  //   slippage,
  //   signer,
  //   connection,
  //   process.env.HELIUS_URL?.toString()
  // );

  // console.log('Sell transaction response', response);

  /**
   * PUMPSWAP BUY/SELL
   * To swap with pumpswap dex you only need to import one function and then set the buying to true
   * or false for the direction you want to swap with
   */

  // Configure pumpswap params for a pumpfun tokens off the bonding curve
  // const quote = 'So11111111111111111111111111111111111111112'; // PumpSwap token to buy with
  // const base = 'GkyPYa7NnCFbduLknCfBfP7p8564X1VZhwZYJ6CZpump'; // PumpSwap token to recieve
  // const amount = 0.0001; // Amount to swap of tokens to swap

  // Test PumpSwap swap
  // set 5th param to true if you want to buy the base using quote tokens
  // set 5th param to false if you want to sell the base for quote tokens
  // response = await pumpswapSwap(
  //   base,
  //   quote,
  //   amount,
  //   slippage,
  //   true, // buy = true || sell = false
  //   signer,
  //   connection,
  //   process.env.HELIUS_URL?.toString()
  // );
}

main();
