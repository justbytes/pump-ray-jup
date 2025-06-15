import {
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
} from 'gill/programs/token';
import { getPriorityFees } from '../helpers/helpers';
import { getAmmSwapIx } from './instructions';
import { getSwapAccounts } from './pool';

// global.__GILL_DEBUG__ = true;
// global.__GILL_DEBUG_LEVEL__ = 'debug';

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

  // console.log('base: ', baseTokenProgram);
  // console.log('quote: ', quoteTokenProgram);

  // Determine user's ATA address for the token
  const userBaseAta = await getAssociatedTokenAccountAddress(
    baseMintAddress,
    signer.address,
    baseTokenProgram
  );

  // console.log('User base ata: ', userBaseAta); //amm auth

  // Determine user's ATA address for the token
  const userQuoteAta = await getAssociatedTokenAccountAddress(
    quoteMintAddress,
    signer.address,
    quoteTokenProgram
  );

  // console.log('User base ata: ', userQuoteAta); //amm auth

  // Gets the accounts for a given base quote mint
  const swapAccounts: any = await getSwapAccounts(baseMint, quoteMint);

  // Return an error if it failed
  if (!swapAccounts) {
    console.log(`Could not get pool id with ${baseMint} & ${quoteMint}`);

    return {
      success: false,
      data: null,
      error: `Could not get pool id with ${baseMint} & ${quoteMint}`,
    };
  }

  // console.log('Swap accounts built successfully:', swapAccounts);

  // Create the parameters for the swapIx accounts
  const swapAccountsConfig = {
    signer,
    baseMintAddress,
    quoteMintAddress,
    userBaseAta,
    userQuoteAta,
    ...swapAccounts,
  };

  // Initalize data variable
  let data: Uint8Array;

  // Get the buy or sell data
  if (buy) {
    data = formatRaydiumBuyData();
  } else {
    data = formatRaydiumSellData();
  }

  // Instruction to get or create the user base ATA
  const userBaseAtaIx = getCreateAssociatedTokenIdempotentInstruction({
    mint: baseMintAddress,
    owner: signer.address,
    payer: signer,
    ata: userBaseAta,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // Instruction to get or create user quote ATA
  const userQuoteAtaIx = getCreateAssociatedTokenIdempotentInstruction({
    mint: quoteMintAddress,
    owner: signer.address,
    payer: signer,
    ata: userQuoteAta,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // Shouldn't be hard coded
  const solAmountLamports = BigInt(0.001 * 1e9);

  // When using SOL setup transfer to quoteAta
  const transferSolIx = getTransferSolInstruction({
    source: signer,
    destination: userBaseAta,
    amount: solAmountLamports,
  });

  // "Convert" SOL to WSOL in th quoteAta
  const syncSolAccountsIx = getSyncNativeInstruction(
    {
      account: userBaseAta,
    },
    { programAddress: TOKEN_PROGRAM_ADDRESS }
  );

  // Close a WSOL quote ata
  const closeAccountIx = getCloseAccountInstruction(
    {
      account: userBaseAta,
      destination: signer.address,
      owner: signer,
    },
    {
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }
  );

  let swapIx: IInstruction;

  if (swapAccounts.type == 'amm') {
    // get the ray legacy amm v4 swap accounts
    console.log('getting legacy amm accounts');
    swapIx = getAmmSwapIx(swapAccountsConfig, data);
  } else {
    return;
  }

  let tx, signedTransaction;

  // If using SOL for the buy we need to send the SOL and convert it to WSOL for the buy tx to process it then we clean up
  if (baseMint == 'So11111111111111111111111111111111111111112' && buy) {
    console.log('baseMint sol buy true');

    instructions.push(
      userQuoteAtaIx,
      userBaseAtaIx,
      transferSolIx,
      syncSolAccountsIx,
      swapIx,
      closeAccountIx
    );
    // If we are selling for SOL we need to close the wsol account
  } else if (baseMint == 'So11111111111111111111111111111111111111112' && !buy) {
    console.log('Base Mint sol and !buy');

    instructions.push(userQuoteAtaIx, userBaseAtaIx, swapIx, closeAccountIx);
    // Otherwise the quote token will already be in the quoteAta and no need to do any transfers
  } else {
    console.log('default');

    instructions.push(userBaseAtaIx, userQuoteAtaIx, swapIx);
  }

  // Creates a transaction that will use the Helius api to get the estimated priority fee
  if (rpcUrl) {
    // Unoptomised tx
    tx = createTransaction({
      feePayer: signer,
      version: 'legacy',
      instructions,
      latestBlockhash,
      computeUnitLimit,
    });

    // Sign unoptomised transaction
    signedTransaction = await signTransactionMessageWithSigners(tx);

    // Use signed transaction to get priority fee
    const priorityFeeEstimate: number = await getPriorityFees(rpcUrl, signedTransaction);

    // The final optomised tx
    tx = createTransaction({
      feePayer: signer,
      version: 'legacy',
      instructions,
      latestBlockhash,
      computeUnitLimit,
      computeUnitPrice: priorityFeeEstimate,
    });
  } else {
    // Use default values or values user passed for computeUnitLimit and computeUnitPrice
    tx = createTransaction({
      feePayer: signer,
      version: 'legacy',
      instructions,
      latestBlockhash,
      computeUnitLimit,
      computeUnitPrice,
    });
  }

  // Sign the optomised tx
  signedTransaction = await signTransactionMessageWithSigners(tx);

  // Get the explorer link for debugging
  const explorerLink = getExplorerLink({
    transaction: getSignatureFromTransaction(signedTransaction),
  });

  console.log('| RAYDIUM | Transaction Explorer Link:\n', explorerLink);

  // Send and confirm the transaction or return the error
  try {
    const signature = await connection.sendAndConfirmTransaction(signedTransaction);
    return {
      success: true,
      data: {
        signature,
        explorerLink,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: 'There was an error with the sendAndConfirmTransaction',
      data: { error, explorerLink },
    };
  }
};

// Here we will format the instuction data to a uint8array
// placeholders for now
function formatRaydiumBuyData(): Uint8Array {
  const dataBuffer = Buffer.alloc(17);

  dataBuffer.write('0040420f0000000000a65d1ae000000000', 'hex');

  return new Uint8Array(dataBuffer);
}
function formatRaydiumSellData(): Uint8Array {
  console.log('Function not implemented.');
  let data: number = 0;
  return new Uint8Array(data);
}
