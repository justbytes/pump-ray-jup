import {
  AccountRole,
  address,
  createTransaction,
  getExplorerLink,
  getSignatureFromTransaction,
  IInstruction,
  KeyPairSigner,
  signTransactionMessageWithSigners,
} from 'gill';
import { SYSTEM_PROGRAM_ADDRESS, getTransferSolInstruction } from 'gill/programs';
import {
  fetchMint,
  getAssociatedTokenAccountAddress,
  TOKEN_PROGRAM_ADDRESS,
  getCreateAssociatedTokenIdempotentInstruction,
  getSyncNativeInstruction,
  getCloseAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_2022_PROGRAM_ADDRESS,
} from 'gill/programs/token';
import { getPriorityFees } from '../helpers/helpers';
import { RAY_AMM_ROUTER, RAY_LEGACY_AMM_V4 } from '../constants';
import axios from 'axios';
import { buildRaydiumSwapAccounts } from './pda';

export const raydiumBuy = async (
  baseMint: string, // buying
  quoteMint: string, // paying with
  amount: number,
  slippage: number,
  buy: boolean,
  signer: KeyPairSigner,
  connection: any,
  rpcUrl?: string,
  computeUnitLimit?: number,
  computeUnitPrice?: number
) => {
  let quoteDecimals, quoteTokenProgram;
  let baseDecimals, baseTokenProgram;

  // Create an array that will contain the instructions for the tx
  let instructions: IInstruction[] = [];

  // Validate inputs
  if (amount <= 0) {
    return {
      success: false,
      message: 'Error: quoteAmount must be greater than zero',
    };
  }

  // Make sure we have a valid slippage value
  if (slippage < 0 || slippage > 1) {
    return {
      success: false,
      message: 'Error: slippage must be between 0 and 1',
    };
  }

  // rpcUrl isn't nessesary if we have computeUnitPrice already
  if (rpcUrl && computeUnitPrice) {
    return {
      success: false,
      message:
        'Error: cannot pass both rpcUrl and computeUnitPrice. One or the other, rpcUrl gets Helius computeUnitPrice estimate',
    };
  }

  // Get latest blockhash
  const { value: latestBlockhash } = await connection.rpc.getLatestBlockhash().send();

  // Convert the mint address to type address
  const baseMintAddress = address(baseMint);
  const quoteMintAddress = address(quoteMint);

  // Grab token mint data
  const baseMintAccountData = await fetchMint(connection.rpc, baseMintAddress);
  const quoteMintAccountData = await fetchMint(connection.rpc, quoteMintAddress);

  // Asign mint data
  quoteDecimals = quoteMintAccountData.data.decimals;
  quoteTokenProgram = quoteMintAccountData.programAddress;
  baseDecimals = baseMintAccountData.data.decimals;
  baseTokenProgram = baseMintAccountData.programAddress;

  console.log('base: ', baseTokenProgram);
  console.log('quote: ', quoteTokenProgram);

  // Determine user's ATA address for the token
  const userBaseAta = await getAssociatedTokenAccountAddress(
    baseMintAddress,
    signer.address,
    baseTokenProgram
  );

  console.log('User base ata: ', userBaseAta); //amm auth

  // Determine user's ATA address for the token
  const userQuoteAta = await getAssociatedTokenAccountAddress(
    quoteMintAddress,
    signer.address,
    quoteTokenProgram
  );

  console.log('User base ata: ', userQuoteAta); //amm auth

  // TODO: We need to first get the pool data and check which type it is. With that type we will hve to then decide how to build the ix
  // for now we will focus on getting the AMM to work first.

  const swapAccounts = await getSwapAccounts(baseMint, quoteMint);

  // Return an error if it failed
  if (!swapAccounts) {
    console.log(`Could not get pool id with ${baseMint} & ${quoteMint}`);

    return {
      success: false,
      data: null,
      error: `Could not get pool id with ${baseMint} & ${quoteMint}`,
    };
  }

  console.log('Swap accounts built successfully:', swapAccounts);

  // switch (swapAccounts.type) {
  //   case 'legacy_amm':
  //     // get the ray legacy amm v4 swap accounts
  //     console.log('getting legacy amm accounts');

  //   default:
  //     break;
  // }

  // // Data for the instruction should be uint8array
  // let data;

  // // Format the instruction data
  // if (buy) {
  //   data = formatRaydiumBuyData();
  // } else {
  //   data = formatRaydiumSellData();
  // }

  // // Instruction to get or create the user base ATA
  // const userBaseAtaIx = getCreateAssociatedTokenIdempotentInstruction({
  //   mint: baseMintAddress,
  //   owner: signer.address,
  //   payer: signer,
  //   ata: userBaseAta,
  //   systemProgram: SYSTEM_PROGRAM_ADDRESS,
  //   tokenProgram: baseTokenProgram,
  // });

  // // Instruction to get or create user quote ATA
  // const userQuoteAtaIx = getCreateAssociatedTokenIdempotentInstruction({
  //   mint: quoteMintAddress,
  //   owner: signer.address,
  //   payer: signer,
  //   ata: userQuoteAta,
  //   systemProgram: SYSTEM_PROGRAM_ADDRESS,
  //   tokenProgram: quoteTokenProgram,
  // });

  // // When using SOL setup transfer to quoteAta
  // const transferSolIx = getTransferSolInstruction({
  //   source: signer,
  //   destination: userQuoteAta,
  //   amount: amount,
  // });

  // // "Convert" SOL to WSOL in th quoteAta
  // const syncSolAccountsIx = getSyncNativeInstruction(
  //   {
  //     account: userQuoteAta,
  //   },
  //   { programAddress: TOKEN_PROGRAM_ADDRESS }
  // );

  // // Close a WSOL quote ata
  // const closeAccountIx = getCloseAccountInstruction(
  //   {
  //     account: userQuoteAta,
  //     destination: signer.address,
  //     owner: signer,
  //   },
  //   {
  //     programAddress: TOKEN_PROGRAM_ADDRESS,
  //   }
  // );

  // Swap instruction for Raydium swap

  // const swapIx: IInstruction = {
  //   programAddress: address(RAY_AMM_ROUTER), // Raydium router program id
  //   accounts: [
  //     {
  //       address: address(TOKEN_PROGRAM_ADDRESS), // Token program
  //       role: AccountRole.READONLY,
  //     },
  //     {
  //       address: address(TOKEN_2022_PROGRAM_ADDRESS), // Token2022 program
  //       role: AccountRole.READONLY,
  //     },
  //     {
  //       address: address(ASSOCIATED_TOKEN_PROGRAM_ADDRESS), // Assosiated token program address
  //       role: AccountRole.READONLY,
  //     },
  //     {
  //       address: address(SYSTEM_PROGRAM_ADDRESS), // System program address
  //       role: AccountRole.READONLY,
  //     },
  //     {
  //       address: signer.address, // Wallet signer
  //       role: AccountRole.WRITABLE_SIGNER,
  //     },
  //     {
  //       address: address(userBaseAta), // signers base ata
  //       role: AccountRole.WRITABLE,
  //     },
  //     {
  //       address: address(userQuoteAta), // singers quote ata
  //       role: AccountRole.WRITABLE,
  //     },
  //     {
  //       address: address(RAY_LEGACY_AMM_V4), // Raydium AAM Program
  //       role: AccountRole.WRITABLE,
  //     },
  //     {
  //       address: address(userQuoteAta), // signers quote ata
  //       role: AccountRole.WRITABLE,
  //     },
  //     {
  //       address: baseMintAddress, // base token
  //       role: AccountRole.WRITABLE,
  //     },
  //     {
  //       address: quoteMintAddress, // quote token
  //       role: AccountRole.WRITABLE,
  //     },
  //     {
  //       address: address(swapAccounts.poolId), // Pool id
  //       role: AccountRole.WRITABLE,
  //     },
  //     {
  //       address: address(''),
  //       role: AccountRole.READONLY,
  //     },
  //     {
  //       address: address(''),
  //       role: AccountRole.READONLY,
  //     },
  //     {
  //       address: address(''),
  //       role: AccountRole.READONLY,
  //     },
  //     {
  //       address: address(''),
  //       role: AccountRole.READONLY,
  //     },
  //     {
  //       address: address(''),
  //       role: AccountRole.READONLY,
  //     },
  //     {
  //       address: address(''),
  //       role: AccountRole.READONLY,
  //     },
  //   ],
  //   data,
  // };

  // // Variables for tx
  // let tx, signedTransaction;

  // If using SOL for the buy we need to send the SOL and convert it to WSOL for the buy tx to process it then we clean up
  // if (quoteMint == 'So11111111111111111111111111111111111111112' && buy) {
  //   instructions.push(
  //     userQuoteAtaIx,
  //     userBaseAtaIx,
  //     transferSolIx,
  //     syncSolAccountsIx,
  //     swapIx,
  //     closeAccountIx
  //   );
  //   // If we are selling for SOL we need to close the wsol account
  // } else if (quoteMint == 'So11111111111111111111111111111111111111112' && !buy) {
  //   instructions.push(userQuoteAtaIx, userBaseAtaIx, swapIx, closeAccountIx);
  //   // Otherwise the quote token will already be in the quoteAta and no need to do any transfers
  // } else {
  //   instructions.push(userBaseAtaIx, userQuoteAtaIx, swapIx);
  // }

  // // Creates a transaction that will use the Helius api to get the estimated priority fee
  // if (rpcUrl) {
  //   // Unoptomised tx
  //   tx = createTransaction({
  //     feePayer: signer,
  //     version: 'legacy',
  //     instructions,
  //     latestBlockhash,
  //     computeUnitLimit,
  //   });

  //   // Sign unoptomised transaction
  //   signedTransaction = await signTransactionMessageWithSigners(tx);

  //   // Use signed transaction to get priority fee
  //   const priorityFeeEstimate: number = await getPriorityFees(rpcUrl, signedTransaction);

  //   // The final optomised tx
  //   tx = createTransaction({
  //     feePayer: signer,
  //     version: 'legacy',
  //     instructions,
  //     latestBlockhash,
  //     computeUnitLimit,
  //     computeUnitPrice: priorityFeeEstimate,
  //   });
  // } else {
  //   // Use default values or values user passed for computeUnitLimit and computeUnitPrice
  //   tx = createTransaction({
  //     feePayer: signer,
  //     version: 'legacy',
  //     instructions,
  //     latestBlockhash,
  //     computeUnitLimit,
  //     computeUnitPrice,
  //   });
  // }

  // // Sign the optomised tx
  // signedTransaction = await signTransactionMessageWithSigners(tx);

  // // Get the explorer link for debugging
  // const explorerLink = getExplorerLink({
  //   transaction: getSignatureFromTransaction(signedTransaction),
  // });

  // console.log('| PUMPSWAP | Transaction Explorer Link:\n', explorerLink);

  // // Send and confirm the transaction or return the error
  // try {
  //   const signature = await connection.sendAndConfirmTransaction(signedTransaction);
  //   return {
  //     success: true,
  //     data: {
  //       signature,
  //       explorerLink,
  //     },
  //   };
  // } catch (error) {
  //   return {
  //     success: false,
  //     message: 'There was an error with the sendAndConfirmTransaction',
  //     data: { error, explorerLink },
  //   };
  // }
};

// Here we will format the instuction data to a uint8array
// placeholders for now
function formatRaydiumBuyData(): Uint8Array {
  console.log('Function not implemented.');
  let data: number = 0;
  return new Uint8Array(data);
}
function formatRaydiumSellData(): Uint8Array {
  console.log('Function not implemented.');
  let data: number = 0;
  return new Uint8Array(data);
}

/**
 * Returns all of the pool data for two given mint addresses
 */
async function getPoolDataByMint(mintA: string, mintB: string) {
  // Get token data by mint
  const response = await axios.get('https://api-v3.raydium.io/pools/info/mint', {
    params: {
      mint1: mintA,
      mint2: mintB,
      poolType: 'standard',
      poolSortField: 'default',
      sortType: 'desc',
      pageSize: 1000,
      page: 1,
    },
    headers: {
      accept: 'application/json',
    },
  });

  // Return if we didn't get any pools
  if (!response) {
    return false;
  }

  // Return data
  return response.data.data;
}

/**
 * Gets the pool id based on which has the highest amount of base token liquidity.
 * baseMint should be a token like sol, wsol, usdt, usdc, etc
 */
async function getPoolIds(baseMint: string, quoteMint: string) {
  // Get the pool data using the two tokenMints from parameters
  const poolData = await getPoolDataByMint(baseMint, quoteMint);

  // Stop if we don't have any data
  if (!poolData) {
    return null;
  }

  // Parse to pools
  const pools = poolData.data;

  // Return the id of the first index if we only have 1
  if (pools.length <= 1) {
    return { poolId: pools[0].id, programId: pools[0].programId };
  }

  // Sorting variables
  let poolId;
  let programId;
  let highest = 0;

  // Loop through the pools and find the one with the most liquidity in baseTokens
  for (let i = 0; i < pools.length; i++) {
    // Pool
    const pool = pools[i];

    // If the baseMint is mint A get the amount and see if its the highest
    if (pool.mintA.address == baseMint) {
      if (pool.mintAmountA > highest) {
        highest = pool.mintAmountA;
        poolId = pool.id;
        programId = pool.programId;
      }
    } else {
      if (pool.mintAmountB > highest) {
        highest = pool.mintAmountB;
        poolId = pool.id;
        programId = pool.programId;
      }
    }
  }

  return { poolId, programId };
}

async function getPoolKeys(id: string) {
  // Get the keys data using alchemy sdk
  const response = await axios.get(`https://api-v3.raydium.io/pools/key/ids?ids=${id}`);

  if (!response) return null;

  return response.data.data[0];
}

async function getSwapAccounts(baseMint: string, quoteMint: string) {
  // Get the pool id
  const ids = await getPoolIds(baseMint, quoteMint);

  if (!ids) {
    return { success: false, data: null, reason: "Couldn't get pool id" };
  }

  const keyData = await getPoolKeys(ids.poolId);

  if (!keyData) {
    return { success: false, data: null, reason: "Couldn't get pool keys with id" };
  }

  switch (ids.programId) {
    case RAY_LEGACY_AMM_V4:
      return getLegacyAmmAccounts(keyData, baseMint, quoteMint);

    default:
      break;
  }
}

/**
 * {
  "id": string,
  "success": boolean,
  "data": [
    {
      "programId": "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
      "id": string,
      "mintA": {
        "chainId": number,
        "address": string,
        "programId": string,
        "logoURI": string,
        "symbol": string,
        "name": string,
        "decimals": number,
        "tags": [],
        "extensions": {}
      },
      "mintB": {
        "chainId": number,
        "address": string,
        "programId": string,
        "logoURI": string,
        "symbol": string,
        "name": string,
        "decimals": number,
        "tags": [],
        "extensions": {}
      },
      "lookupTableAccount": string,
      "openTime": string,
      "vault": {
        "A": string,
        "B": string
      },
      "authority": "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1",
      "openOrders": string,
      "targetOrders": string,
      "mintLp": {
        "chainId": number,
        "address": string,
        "programId": string,
        "logoURI": "",
        "symbol": "",
        "name": "",
        "decimals": number,
        "tags": [],
        "extensions": {}
      },
      "marketProgramId": string,
      "marketId": string,
      "marketAuthority": string,
      "marketBaseVault": string,
      "marketQuoteVault": string,
      "marketBids": string,
      "marketAsks": string,
      "marketEventQueue": string
    }
  ]
}
 */
async function getLegacyAmmAccounts(keyData: any, baseMint: string, qutoeMint: string) {
  let vaultA;
  let vaultB;

  if (keyData.mintA.address == baseMint) {
    vaultA = keyData.vault.A;
    vaultB = keyData.vault.B;
  } else {
    vaultA = keyData.vault.B;
    vaultB = keyData.vault.A;
  }

  return {
    programId: keyData.programId,
    poolId: keyData.id,
    ammAuthority: keyData.authority,
    vaultA,
    vaultB,
  };
}
