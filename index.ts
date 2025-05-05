import dotenv from 'dotenv';
import {
  Address,
  address,
  createSolanaClient,
  createSolanaRpc,
  KeyPairSigner,
  SolanaClient,
} from 'gill';
import { loadKeypairSignerFromFile } from 'gill/node';

import { pumpfunBuy } from './src/pump/pumpfun/pumpfunBuy';
import { pumpfunSell } from './src/pump/pumpfun/pumpfunSell';
import { getBondingCurveData, getPumpfunPrice } from './src/pump/pumpfun/pumpfunBondingCurve';

import { pumpswapSwap } from './src/pump/pumpswap/pumpswapSwap';
import {
  fetchMint,
  getAssociatedTokenAccountAddress,
  getSyncNativeInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from 'gill/programs/token';
import { getGlobalData } from './src/pump/pumpfun/pumpfunGlobal';
import {
  getGlobalConfigData,
  getProtocolFeeRecipientTokenAccount,
} from './src/pump/pumpswap/pumpswapGlobalConfig';

dotenv.config();

async function main() {
  const slippage = 0.01; // 1% slippage
  const solAmount = 0.0001; // Buy 0.0001 sol worth
  const tokenAmount = 0.0001;

  // Creates connection to Solana
  const connection: SolanaClient<string> = createSolanaClient({
    urlOrMoniker: `${process.env.HELIUS_URL}`,
  });

  // Load signer from config
  const signer: KeyPairSigner = await loadKeypairSignerFromFile();

  const testBondingCurveMintAddress = 'BuWEZfRc1vQFhTf7dVUeaia62ZTe6g9rSo1vkBqipump';

  // // Test PumpFun buy
  // let response = await pumpfunBuy(
  //   testBondingCurveMintAddress,
  //   solAmount,
  //   slippage,
  //   signer,
  //   connection,
  //   process.env.HELIUS_URL?.toString()
  // );
  // console.log('Buy transaction response', response);

  // // Test PumpFun sell
  // response = await pumpfunSell(
  //   testBondingCurveMintAddress,
  //   tokenAmount,
  //   slippage,
  //   signer,
  //   connection,
  //   process.env.HELIUS_URL?.toString()
  // );

  // console.log('Sell transaction response', response);

  const quote = 'So11111111111111111111111111111111111111112'; // PumpSwap token to buy with
  const base = '7DasPgeC8TJVw4DY1EzcPSSrfCPhSzNmg4snjVuxpump'; // PumpSwap token to recieve
  const amount = 1000; // Buy 0.0001 sol worth

  // Test PumpSwap buy
  let response = await pumpswapSwap(
    base,
    quote,
    amount,
    slippage,
    false,
    signer,
    connection,
    process.env.HELIUS_URL?.toString()
  );

  if (!response?.success) {
    console.log(response?.data.error.context);
    console.log(response?.data.error.content);
  } else {
    console.log(response);
  }
}

main();
