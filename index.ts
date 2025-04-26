import { createSolanaClient, KeyPairSigner } from "gill";
import { loadKeypairSignerFromFile } from "gill/node";

import { pumpfunBuy } from "./src/buy";

async function main() {
  // target mint address hardcoded for testing
  const mint = "BPHxyGCk3LAmQCMWUdgXQjadoee8N7b2LGoHXkhpump";

  // Creates connection to Solana
  const connection = createSolanaClient({
    urlOrMoniker: "mainnet",
  });

  // Load signer from config
  const signer: KeyPairSigner = await loadKeypairSignerFromFile();

  // For testing purposes
  const amountInTokens = 100;
  const maxSolToSpend = 0.0001;

  // Test the buy
  const response = await pumpfunBuy(
    mint,
    amountInTokens,
    maxSolToSpend,
    signer,
    connection
  );

  console.log("Buy transaction response", response);
}

main();
