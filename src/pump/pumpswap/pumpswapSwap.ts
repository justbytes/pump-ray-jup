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
import { getTransferSolInstruction, SYSTEM_PROGRAM_ADDRESS } from 'gill/programs';
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  fetchMint,
  getAssociatedTokenAccountAddress,
  getCloseAccountInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  getSyncNativeInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from 'gill/programs/token';
import { getEstimatedAmountOut } from './pumpswapPool';
import { getPriorityFees } from '../../helpers/helpers';
import { PUMPSWAP_PROGRAM_ID } from '../constants';
import { getGlobalConfigData, getProtocolFeeRecipientTokenAccount } from './pumpswapGlobalConfig';
import { pumpAmmEventAuthorityPda } from './utils';

// global.__GILL_DEBUG__ = true;
// global.__GILL_DEBUG_LEVEL__ = 'debug';

/**
 * Buys from PumpSwap after a token graduates
 */
export const pumpswapSwap = async (
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

  // Get latest blockhash
  const { value: latestBlockhash } = await connection.rpc.getLatestBlockhash().send();

  // Determine user's ATA address for the token
  const userBaseAta = await getAssociatedTokenAccountAddress(
    baseMintAddress,
    signer.address,
    TOKEN_PROGRAM_ADDRESS
  );

  console.log('User base ata: ', userBaseAta);

  // Determine user's ATA address for the token
  const userQuoteAta = await getAssociatedTokenAccountAddress(
    quoteMintAddress,
    signer.address,
    TOKEN_PROGRAM_ADDRESS
  );

  // Get global config data and assign the protocol fee recipient
  const globalConfigData = await getGlobalConfigData(connection);
  const protocolFeeRecipient = globalConfigData.protocol_fee_recipients[1];

  // Get the token account for the fee recipient
  const protocolFeeRecipientTokenAccount = await getProtocolFeeRecipientTokenAccount(
    address(protocolFeeRecipient.toString()),
    address(quoteTokenProgram),
    quoteMintAddress
  );

  let pool, data: Uint8Array;

  // Calculate base token output with slippage and get pool data
  const { success, message, poolData, amountRaw, tokensEstimate, minimumAmountOut } =
    await getEstimatedAmountOut(
      buy,
      connection,
      baseMintAddress,
      quoteMintAddress,
      amount,
      slippage
    );

  // Validate response from getBaseEstimatedAmountOut function
  if (!success || amountRaw == undefined) {
    console.log('Response from esitmatePumpfunMinTokensOut success was false.');
    return { success, message, data: poolData };
  }

  // Format the instruction data
  if (buy) {
    data = formatPumpswapBuyData(minimumAmountOut, amountRaw);
    pool = poolData;
  } else {
    data = formatPumpswapSellData(amountRaw, minimumAmountOut);
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

  // When using SOL setup transfer to quoteAta
  const transferSolIx = getTransferSolInstruction({
    source: signer,
    destination: userQuoteAta,
    amount: amountRaw,
  });

  // "Convert" SOL to WSOL in th quoteAta
  const syncSolAccountsIx = getSyncNativeInstruction(
    {
      account: userQuoteAta,
    },
    { programAddress: TOKEN_PROGRAM_ADDRESS }
  );

  // Close a WSOL quote ata
  const closeAccountIx = getCloseAccountInstruction(
    {
      account: userQuoteAta,
      destination: signer.address,
      owner: signer,
    },
    {
      programAddress: TOKEN_PROGRAM_ADDRESS,
    }
  );

  // Buy instruction for PumpSwap
  const swapIx: IInstruction = {
    programAddress: address(PUMPSWAP_PROGRAM_ID),
    accounts: [
      {
        address: address(poolData.pumpPoolPda.toString()), // Pool
        role: AccountRole.READONLY,
      },
      {
        address: signer.address, // User
        role: AccountRole.WRITABLE_SIGNER,
      },
      {
        address: address(globalConfigData.globalConfigPda.toString()), // global_config
        role: AccountRole.READONLY,
      },
      {
        address: baseMintAddress, // base_mint
        role: AccountRole.READONLY,
      },
      {
        address: quoteMintAddress, // quote_mint
        role: AccountRole.READONLY,
      },
      {
        address: address(userBaseAta), // user_base_token_account
        role: AccountRole.WRITABLE,
      },
      {
        address: address(userQuoteAta), // user_quote_token_account
        role: AccountRole.WRITABLE,
      },
      {
        address: address(poolData.pool_base_token_account.toString()), // pool_base_token_account
        role: AccountRole.WRITABLE,
      },
      {
        address: address(poolData.pool_quote_token_account.toString()), // pool_quote_token_account
        role: AccountRole.WRITABLE,
      },
      {
        address: address(protocolFeeRecipient.toString()), // protocol_fee_recipient
        role: AccountRole.READONLY,
      },
      {
        address: address(protocolFeeRecipientTokenAccount.toString()), // protocol_fee_recipient_token_account
        role: AccountRole.WRITABLE,
      },
      {
        address: address(baseTokenProgram), // base_token_program
        role: AccountRole.READONLY,
      },
      {
        address: address(quoteTokenProgram), // quote_token_program
        role: AccountRole.READONLY,
      },
      {
        address: address(SYSTEM_PROGRAM_ADDRESS), // system_program
        role: AccountRole.READONLY,
      },
      {
        address: address(ASSOCIATED_TOKEN_PROGRAM_ADDRESS), // associated_token_program
        role: AccountRole.READONLY,
      },
      {
        address: address(await pumpAmmEventAuthorityPda()), // event_authority
        role: AccountRole.READONLY,
      },
      {
        address: address(PUMPSWAP_PROGRAM_ID), // program_id
        role: AccountRole.READONLY,
      },
    ],
    data,
  };

  // Variables for tx
  let tx, signedTransaction;

  // If using SOL for the buy we need to send the SOL and convert it to WSOL for the buy tx to process it then we clean up
  // Otherwise the quote token will already be in the quoteAta and no need to do any transfers
  if (quoteMint == 'So11111111111111111111111111111111111111112' && buy) {
    console.log('****   BUYING   *****');

    instructions.push(
      userQuoteAtaIx,
      userBaseAtaIx,
      transferSolIx,
      syncSolAccountsIx,
      swapIx,
      closeAccountIx
    );
  } else if (quoteMint == 'So11111111111111111111111111111111111111112' && !buy) {
    console.log('****   SELLING   *****');

    instructions.push(userQuoteAtaIx, userBaseAtaIx, swapIx, closeAccountIx);
  } else {
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

  console.log('| SWAP | Transaction Explorer Link:\n', explorerLink);

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

/**
 * Format the data for the buy instruction
 * @param {number} minTokenAmount Minimum amount of tokens to receive
 * @param {number} maxSolToSpend Maximum amount of SOL to spend
 */
export function formatPumpswapBuyData(minBaseAmountOut: any, maxQuoteAmountIn: any) {
  // Create the data buffer
  const dataBuffer = Buffer.alloc(24);

  // Write the discriminator for the 'buy' instruction
  dataBuffer.write('66063d1201daebea', 'hex'); // Anchor discriminator for 'buy'

  // Write the amounts to the buffer
  dataBuffer.writeBigUInt64LE(BigInt(minBaseAmountOut), 8);
  dataBuffer.writeBigInt64LE(BigInt(maxQuoteAmountIn), 16);

  return new Uint8Array(dataBuffer);
}

/**
 * Format the data for the buy instruction
 * @param {number} minTokenAmount Minimum amount of tokens to receive
 * @param {number} maxSolToSpend Maximum amount of SOL to spend
 */
export function formatPumpswapSellData(maxBaseAmountIn: any, minQuoteAmounOut: any) {
  // Create the data buffer
  const dataBuffer = Buffer.alloc(24);

  // Write the discriminator for the 'buy' instruction
  dataBuffer.write('33e685a4017f83ad', 'hex'); // Anchor discriminator for 'buy'

  // Write the amounts to the buffer
  dataBuffer.writeBigUInt64LE(BigInt(maxBaseAmountIn), 8);
  dataBuffer.writeBigInt64LE(BigInt(minQuoteAmounOut), 16);

  return new Uint8Array(dataBuffer);
}
