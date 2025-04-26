// index.ts
import { createSolanaClient } from "gill";
import { loadKeypairSignerFromFile } from "gill/node";

// src/buy.ts
import {
  AccountRole,
  address,
  createTransaction,
  getExplorerLink,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  signTransactionMessageWithSigners
} from "gill";
import { SYSTEM_PROGRAM_ADDRESS } from "gill/programs";
import {
  findAssociatedTokenPda,
  getAssociatedTokenAccountAddress,
  getCreateAssociatedTokenIdempotentInstruction,
  TOKEN_PROGRAM_ADDRESS
} from "gill/programs/token";

// src/constants.js
var PUMPFUN_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
var PUMPFUN_GLOBAL = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf";
var PUMPFUN_FEE_RECIPIENT = "FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz";
var PUMPFUN_EVENT_AUTHORITY = "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1";
var SYSVAR_RENT = "SysvarRent111111111111111111111111111111111";

// src/utils.ts
var formatPumpfunBuyAmount = (amountInTokens, maxSolToSpend) => {
  if (maxSolToSpend === 0) {
    maxSolToSpend = -1;
  }
  if (amountInTokens === 0) {
    amountInTokens = -1;
  }
  const dataBuffer = Buffer.alloc(24);
  dataBuffer.write("66063d1201daebea", "hex");
  dataBuffer.writeBigUInt64LE(BigInt(amountInTokens), 8);
  dataBuffer.writeBigUInt64LE(BigInt(maxSolToSpend), 16);
  return new Uint8Array(dataBuffer);
};
formatPumpfunBuyAmount(0, 0);

// src/buy.ts
var pumpfunBuy = async (mint, amountInTokens, maxSolToSpend, signer, connection) => {
  if (maxSolToSpend === 0 && amountInTokens === 0) {
    return {
      success: false,
      data: "Both maxSolToSpend and amountInTokens cannot be zero"
    };
  }
  const data = formatPumpfunBuyAmount(
    amountInTokens,
    maxSolToSpend
  );
  const { value: latestBlockhash } = await connection.rpc.getLatestBlockhash().send();
  const mintAddress = address(mint);
  const [bondingCurve, _bondingBump] = await getProgramDerivedAddress({
    seeds: ["bonding-curve", mintAddress],
    programAddress: address(PUMPFUN_PROGRAM_ID)
  });
  console.log("Bonding Curve: ", bondingCurve);
  const [bondingCurveAta, _bondingCurveBump] = await findAssociatedTokenPda({
    mint: mintAddress,
    owner: bondingCurve,
    tokenProgram: TOKEN_PROGRAM_ADDRESS
  });
  const userAta = await getAssociatedTokenAccountAddress(
    mintAddress,
    signer.address,
    TOKEN_PROGRAM_ADDRESS
  );
  console.log("userATA: ", userAta);
  const userAtaIx = getCreateAssociatedTokenIdempotentInstruction({
    mint: mintAddress,
    owner: signer.address,
    payer: signer,
    ata: userAta
  });
  console.log("get user ata: ", userAtaIx);
  const buyTokenIx = {
    programAddress: address(PUMPFUN_PROGRAM_ID),
    accounts: [
      {
        address: address(PUMPFUN_GLOBAL),
        // global address
        role: AccountRole.READONLY
      },
      {
        address: address(PUMPFUN_FEE_RECIPIENT),
        // Pump fun fee recipent/account
        role: AccountRole.WRITABLE
      },
      { address: mintAddress, role: AccountRole.READONLY },
      // Target mint token
      {
        address: address(bondingCurve),
        // Bonding curve
        role: AccountRole.WRITABLE
      },
      {
        address: address(bondingCurveAta),
        // Bonding curve ata
        role: AccountRole.WRITABLE
      },
      {
        address: address(userAta),
        // User ata
        role: AccountRole.WRITABLE
      },
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER },
      // User/signer
      { address: address(SYSTEM_PROGRAM_ADDRESS), role: AccountRole.READONLY },
      // System program
      { address: address(TOKEN_PROGRAM_ADDRESS), role: AccountRole.READONLY },
      // Token program
      {
        address: address(SYSVAR_RENT),
        // Sysvar Rent
        role: AccountRole.READONLY
      },
      {
        address: address(PUMPFUN_EVENT_AUTHORITY),
        // Event authority
        role: AccountRole.READONLY
      },
      { address: address(PUMPFUN_PROGRAM_ID), role: AccountRole.READONLY }
      // Pumpfun program id
    ],
    data
  };
  const tx = createTransaction({
    feePayer: signer,
    version: "legacy",
    instructions: [userAtaIx, buyTokenIx],
    latestBlockhash
  });
  const signedTransaction = await signTransactionMessageWithSigners(tx);
  console.log(
    "Explorer: ",
    getExplorerLink({
      transaction: getSignatureFromTransaction(signedTransaction)
    })
  );
  try {
    const results = await connection.sendAndConfirmTransaction(
      signedTransaction
    );
    return { success: true, data: results };
  } catch (error) {
    console.log("Error with sending and confirming transaction", error);
    return { success: false, data: error };
  }
};

// index.ts
async function main() {
  const mint = "BPHxyGCk3LAmQCMWUdgXQjadoee8N7b2LGoHXkhpump";
  const connection = createSolanaClient({
    urlOrMoniker: "mainnet"
  });
  const signer = await loadKeypairSignerFromFile();
  const amountInTokens = 100;
  const maxSolToSpend = 1e-4;
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
//# sourceMappingURL=bundle.js.map
