import dotenv from 'dotenv';
import { address, createSolanaClient, KeyPairSigner } from 'gill';
import { loadKeypairSignerFromFile } from 'gill/node';

import { pumpfunBuy } from './src/pump/pumpfun/pumpfunBuy';
import { pumpfunSell } from './src/pump/pumpfun/pumpfunSell';
import { getBondingCurveData, getPumpfunPrice } from './src/pump/bondingCurve';
import { fetchGlobalState, getGlobalConfigPda } from './src/pump/utils';
import { pumpswapBuy } from './src/pump/pumpswap/pumswapBuy';
import { getPumpPoolPda, getPumpPoolAuthorityPda, getPumpPoolData } from './src/pump/pool';
dotenv.config();

async function main() {
  // target mint address hardcoded for testing

  // Bonding Curve token
  //const mint = 'BuWEZfRc1vQFhTf7dVUeaia62ZTe6g9rSo1vkBqipump';

  // PumpSwap token
  const mint = '7DasPgeC8TJVw4DY1EzcPSSrfCPhSzNmg4snjVuxpump';

  // Creates connection to Solana
  const connection = createSolanaClient({
    urlOrMoniker: `${process.env.HELIUS_URL}`,
  });

  // Load signer from config
  const signer: KeyPairSigner = await loadKeypairSignerFromFile();

  // For testing
  const slippage = 0.01; // 1% slippage
  const solAmount = 0.0001; // Buy 0.0001 sol worth
  const tokenAmount = 10000;

  // const fee = await fetchGlobalState(connection);
  // console.log(fee);

  // // Test PumpFun buy
  // const response = await pumpfunBuy(
  //   mint,
  //   solAmount,
  //   slippage,
  //   signer,
  //   connection,
  //   process.env.HELIUS_URL?.toString()
  // );

  //Test PumpFun sell
  // const response = await pumpfunSell(
  //   mint,
  //   tokenAmount,
  //   slippage,
  //   signer,
  //   connection,
  //   process.env.HELIUS_URL?.toString()
  // );

  // Test PumpSwap buy
  // const response = await pumpswapBuy(
  //   mint,
  //   solAmount,
  //   slippage,
  //   signer,
  //   connection,
  //   process.env.HELIUS_URL?.toString()
  // );

  // const auth = await getPumpPoolAuthorityPda(address(mint));

  // const response = await getPumpPoolPda(
  //   auth,
  //   address(mint),
  //   address('So11111111111111111111111111111111111111112')
  // );

  // console.log(auth);

  const response = await getPumpPoolData(
    address(mint),
    address('So11111111111111111111111111111111111111112'),
    connection
  );

  console.log('Buy transaction response', response);
}

main();
