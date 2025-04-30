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
import { SYSTEM_PROGRAM_ADDRESS } from 'gill/programs';
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  getAssociatedTokenAccountAddress,
  getCreateAssociatedTokenIdempotentInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from 'gill/programs/token';

import { estimatePumpswapMinTokensOut } from '../pool';
import { getPriorityFees } from '../../helpers/helpers';
import { PUMPSWAP_PROGRAM_ID } from '../constants';
import { getGlobalConfigPda } from '../utils';

/**
 * Buys from PumpSwap after a token graduates
 */
export const pumpswapBuy = async (
  mint: string,
  solAmount: number,
  slippage: number,
  signer: KeyPairSigner,
  connection: any,
  rpcUrl?: string,
  computeUnitLimit?: number,
  computeUnitPrice?: number
) => {
  // Validate inputs
  if (solAmount <= 0) {
    return {
      success: false,
      message: 'Error: solAmount must be greater than zero',
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

  // Convert the mint address to type address
  const mintAddress = address(mint);

  // Get latest blockhash
  const { value: latestBlockhash } = await connection.rpc.getLatestBlockhash().send();
  // Get the user's ATA for the token
  const userAta = await getAssociatedTokenAccountAddress(
    mintAddress,
    signer.address,
    TOKEN_PROGRAM_ADDRESS
  );

  // Instruction to create the user's ATA
  const userAtaIx = getCreateAssociatedTokenIdempotentInstruction({
    mint: mintAddress,
    owner: signer.address,
    payer: signer,
    ata: userAta,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // Convert SOL to lamports
  const solAmountLamports = solAmount * 1e9;

  // ge
  // Get pool data

  // Calculate token output with slippage
  const { success, message, poolData, estimatedAmountOut, minimumAmountOut } =
    await estimatePumpswapMinTokensOut(mintAddress, connection, solAmountLamports, slippage);

  if (!success) {
    console.log('Response from esitmatePumpfunMinTokensOut success was false.');
    return { success, message, data: poolData };
  }

  // Format the instruction data
  let data: Uint8Array = formatPumpswapBuyData(0, 0);

  // Create the buy instruction
  const buyTokenIx: IInstruction = {
    programAddress: address(PUMPSWAP_PROGRAM_ID),
    accounts: [
      {
        address: address('GV7wvKpGPaZnv8tVLtAjyyPJbhreG4zpRcQXnFDqsBxh'), // Pool
        role: AccountRole.READONLY,
      },
      {
        address: signer.address, // User
        role: AccountRole.WRITABLE_SIGNER,
      },
      {
        address: address(await getGlobalConfigPda()), // global_config
        role: AccountRole.READONLY,
      },
      {
        address: address('7DasPgeC8TJVw4DY1EzcPSSrfCPhSzNmg4snjVuxpump'), // base_mint
        role: AccountRole.READONLY,
      },
      {
        address: address('So11111111111111111111111111111111111111112'), // quote_mint
        role: AccountRole.READONLY,
      },
      {
        address: address('2hvvCc3CzZD5rFdmdxZUbaegZYtzAP6Mu1oJAK9PjZrd'), // user_base_token_account
        role: AccountRole.WRITABLE,
      },
      {
        address: address('5N9Xb3iV7bgoZqWQXq9YNRqbcjooFcVrDHYXYhbrL3Cf'), // user_quote_token_account
        role: AccountRole.WRITABLE,
      },
      {
        address: address('CwWSm2bvyVUKro6HoNCeKwhxnsKKofF2zosDPoZNYXrH'), // pool_base_token_account
        role: AccountRole.WRITABLE,
      },
      {
        address: address('DSSZJPJgnW6HvVC7aqsuGXm7oEPJ9rVWAw1YCUKS35h7'), // pool_quote_token_account
        role: AccountRole.WRITABLE,
      },
      {
        address: address('JCRGumoE9Qi5BBgULTgdgTLjSgkCMSbF62ZZfGs84JeU'), // protocol_fee_recipient
        role: AccountRole.READONLY,
      },
      {
        address: address('DWpvfqzGWuVy9jVSKSShdM2733nrEsnnhsUStYbkj6Nn'), // protocol_fee_recipient_token_account
        role: AccountRole.WRITABLE,
      },
      {
        address: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // base_token_program
        role: AccountRole.READONLY,
      },
      {
        address: address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // quote_token_program
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
        address: address('GS4CU59F31iL7aR2Q8zVS8DRrcRnXX1yjQ66TqNVQnaR'), // event_authority
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

  // Creates a transaction that will use the Helius api to get the estimated priority fee
  if (rpcUrl) {
    tx = createTransaction({
      feePayer: signer,
      version: 'legacy',
      instructions: [userAtaIx, buyTokenIx],
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
      instructions: [userAtaIx, buyTokenIx],
      latestBlockhash,
      computeUnitLimit,
      computeUnitPrice: priorityFeeEstimate,
    });
  } else {
    // Use default values or values user passed for computeUnitLimit and computeUnitPrice
    tx = createTransaction({
      feePayer: signer,
      version: 'legacy',
      instructions: [userAtaIx, buyTokenIx],
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

  //   // Send and confirm the transaction or return the error
  //   try {
  //     const signature = await connection.sendAndConfirmTransaction(signedTransaction);
  //     return {
  //       success: true,
  //       data: {
  //         signature,
  //         explorerLink,
  //       },
  //     };
  //   } catch (error) {
  //     return {
  //       success: false,
  //       message: 'There was an error with the sendAndConfirmTransaction',
  //       data: { error, explorerLink },
  //     };
  //   }
};

/**
 * Format the data for the buy instruction
 * @param {number} minTokenAmount Minimum amount of tokens to receive
 * @param {number} maxSolToSpend Maximum amount of SOL to spend
 */
export function formatPumpswapBuyData(baseAmountOut: number, maxQuoteAmountIn: number) {
  // Create the data buffer
  const dataBuffer = Buffer.alloc(24);

  // Write the discriminator for the 'buy' instruction
  dataBuffer.write('66063d1201daebea', 'hex'); // Anchor discriminator for 'buy'

  // Write the amounts to the buffer
  dataBuffer.writeBigUInt64LE(BigInt(baseAmountOut), 8);
  dataBuffer.writeBigInt64LE(BigInt(maxQuoteAmountIn), 16);

  return new Uint8Array(dataBuffer);
}
