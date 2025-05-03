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
  getTransferInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from 'gill/programs/token';

import { getBaseEstimatedAmountOut } from './pumpswapPool';
import { getPriorityFees } from '../../helpers/helpers';
import { PUMPSWAP_PROGRAM_ID } from '../constants';
import { getGlobalData } from '../pumpfun/pumpfunGlobal';
import {
  getGlobalConfigData,
  getGlobalConfigPda,
  getProtocolFeeRecipientTokenAccount,
} from './pumpswapGlobalConfig';
import { pumpAmmEventAuthorityPda } from './utils';

global.__GILL_DEBUG__ = true;
global.__GILL_DEBUG_LEVEL__ = 'debug';

/**
 * Buys from PumpSwap after a token graduates
 */
export const pumpswapBuy = async (
  baseMint: string, // buying
  quoteMint: string, // paying with
  quoteAmount: number,
  slippage: number,
  signer: KeyPairSigner,
  connection: any,
  rpcUrl?: string,
  computeUnitLimit?: number,
  computeUnitPrice?: number
) => {
  let quoteDecimals, quoteTokenProgram;
  let baseDecimals, baseTokenProgram;

  let instructions: IInstruction[] = [];

  // Validate inputs
  if (quoteAmount <= 0) {
    return {
      success: false,
      message: 'Error: quoteAmount must be greater than zero',
    };
  }

  if (slippage < 0 || slippage > 1) {
    return {
      success: false,
      message: 'Error: slippage must be between 0 and 1',
    };
  }

  if (rpcUrl && computeUnitPrice) {
    return {
      success: false,
      message:
        'Error: cannot pass both rpcUrl and computeUnitPrice. One or the other, rpcUrl gets Helius computeUnitPrice estimate',
    };
  }

  const quoteMintAccountData = await fetchMint(connection.rpc, address(quoteMint));
  quoteDecimals = quoteMintAccountData.data.decimals;
  quoteTokenProgram = quoteMintAccountData.programAddress;

  const baseMintAccountData = await fetchMint(connection.rpc, address(baseMint));
  baseDecimals = baseMintAccountData.data.decimals;
  baseTokenProgram = baseMintAccountData.programAddress;

  // Convert the mint address to type address
  const baseMintAddress = address(baseMint);
  const quoteMintAddress = address(quoteMint);

  // Get latest blockhash
  const { value: latestBlockhash } = await connection.rpc.getLatestBlockhash().send();

  console.log('Latest block hash: ', latestBlockhash);

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

  console.log('User quote ata: ', userQuoteAta);

  const globalConfigData = await getGlobalConfigData(connection);

  console.log(globalConfigData.globalConfigPda.toString());

  const protocolFeeRecipient = globalConfigData.protocol_fee_recipients[1];

  console.log('Protocol fee recipient: ', protocolFeeRecipient.toString());

  const protocolFeeRecipientTokenAccount = await getProtocolFeeRecipientTokenAccount(
    address(protocolFeeRecipient.toString()),
    address(quoteTokenProgram),
    quoteMintAddress
  );

  console.log('Protocol fee recipient token account: ', protocolFeeRecipientTokenAccount);

  // Calculate token output with slippage
  const { success, message, poolData, quoteAmountRaw, baseTokensEstimate, minimumBaseAmountOut } =
    await getBaseEstimatedAmountOut(
      connection,
      baseMintAddress,
      quoteMintAddress,
      quoteAmount,
      slippage
    );

  if (!success || quoteAmountRaw == undefined) {
    console.log('Response from esitmatePumpfunMinTokensOut success was false.');
    return { success, message, data: poolData };
  }

  // Format the instruction data
  let data: Uint8Array = formatPumpswapBuyData(minimumBaseAmountOut, quoteAmountRaw);

  console.log('quote amount raw: ', quoteAmountRaw);

  console.log('EST: ', baseTokensEstimate);

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

  // // For transfering SPL tokens
  // const transferSolIx = getTransferInstruction({
  //   source: signer.address,
  //   destination: address(userQuoteAta),
  //   amount: quoteAmountRaw,
  //   authority: signer,
  // });
  const transferSolIx = getTransferSolInstruction({
    source: signer,
    destination: userQuoteAta,
    amount: quoteAmountRaw,
  });
  // const transferSolToAtaIx = getTransferInstruction({

  // })

  // const transferSolIx = getSystemTransferInstruction({
  //   source: signer, // This should be a signer, not just the address
  //   destination: userQuoteAta, // The destination token account
  //   lamports: quoteAmountRaw, // The amount in lamports
  // });

  const syncSolAccountsIx = getSyncNativeInstruction(
    {
      account: userQuoteAta,
    },
    { programAddress: TOKEN_PROGRAM_ADDRESS }
  );

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

  // Create the buy instruction
  const buyTokenIx: IInstruction = {
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
  let tx, signedTransaction;

  if (quoteMint == 'So11111111111111111111111111111111111111112') {
    instructions.push(
      userQuoteAtaIx,
      userBaseAtaIx,
      transferSolIx,
      syncSolAccountsIx,
      buyTokenIx,
      closeAccountIx
    );
  } else {
    instructions.push(userBaseAtaIx, userQuoteAtaIx, buyTokenIx);
  }

  // Creates a transaction that will use the Helius api to get the estimated priority fee
  if (rpcUrl) {
    tx = createTransaction({
      feePayer: signer,
      version: 'legacy',
      instructions,
      latestBlockhash,
      computeUnitLimit,
    });

    // Sign the transaction
    signedTransaction = await signTransactionMessageWithSigners(tx);

    // Use signed transaction to get priority fee
    const priorityFeeEstimate: number = await getPriorityFees(rpcUrl, signedTransaction);

    // The final tx
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

  signedTransaction = await signTransactionMessageWithSigners(tx);

  // Get the explorer link for debugging
  const explorerLink = getExplorerLink({
    transaction: getSignatureFromTransaction(signedTransaction),
  });

  console.log('| BUY | Transaction Explorer Link:\n', explorerLink);

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
  console.log('minBaseAmountOut: ', minBaseAmountOut);
  console.log('maxQuoteAmountIn: ', maxQuoteAmountIn);

  // Write the discriminator for the 'buy' instruction
  dataBuffer.write('66063d1201daebea', 'hex'); // Anchor discriminator for 'buy'

  // Write the amounts to the buffer
  dataBuffer.writeBigUInt64LE(BigInt(minBaseAmountOut), 8);
  dataBuffer.writeBigInt64LE(BigInt(maxQuoteAmountIn), 16);

  return new Uint8Array(dataBuffer);
}
