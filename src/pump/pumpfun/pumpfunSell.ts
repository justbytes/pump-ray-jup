import {
  AccountRole,
  address,
  createTransaction,
  getAddressEncoder,
  getExplorerLink,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  IInstruction,
  KeyPairSigner,
  signTransactionMessageWithSigners,
} from 'gill';
import { SYSTEM_PROGRAM_ADDRESS } from 'gill/programs';
import {
  getAssociatedTokenAccountAddress,
  getCreateAssociatedTokenIdempotentInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from 'gill/programs/token';

// Local Imports
import { PUMPFUN_EVENT_AUTHORITY, PUMPFUN_GLOBAL, PUMPFUN_PROGRAM_ID } from '../../constants';
import { getGlobalData } from './pumpfunGlobal';
import { estimatePumpfunMinSolOut } from './pumpfunBondingCurve';
import { getPriorityFees } from '../../helpers/helpers';

// Custom type of reponse from calling pumpfunSell
export type SwapResponse = {
  sucess: boolean;
  message?: string;
  data?: Object;
};

// global.__GILL_DEBUG__ = true;
// global.__GILL_DEBUG_LEVEL__ = 'debug';

/**
 * Sells a token from pumpfun with a given sol amount and a slippage tolerance
 * @param {string} mint
 * @param {number} tokenAmount
 * @param {number} slippage
 * @param {KeyPairSigner} signer
 * @param {any} connection
 * @param {string?} rpcUrl?
 * @param {number?} computeUnitLimit
 * @param {number?} computeUnitPrice
 * @returns
 */
export const pumpfunSell = async (
  mint: string,
  tokenAmount: number,
  slippage: number,
  signer: KeyPairSigner,
  connection: any,
  rpcUrl?: string,
  computeUnitLimit?: number,
  computeUnitPrice?: number
) => {
  // Validate inputs
  if (tokenAmount <= 0) {
    return {
      success: false,
      message: 'Error: tokenAmount must be greater than zero',
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

  const globalData = await getGlobalData(connection);

  // Convert SOL to lamports
  const tokenAmountInDecimals = BigInt(tokenAmount * 1e6);

  // Calculate token output with slippage
  const { success, message, bondingCurveData, estimatedAmountOut, minimumAmountOut } =
    await estimatePumpfunMinSolOut(mintAddress, connection, tokenAmountInDecimals, slippage);

  if (!success) {
    console.log('Response from esitmatePumpfunMinTokensOut success was false.');
    return { success, message, data: bondingCurveData };
  }

  const [creatorVault, _creatorVaultBump] = await getProgramDerivedAddress({
    seeds: ['creator-vault', getAddressEncoder().encode(bondingCurveData.data.creator.toString())],
    programAddress: address(PUMPFUN_PROGRAM_ID),
  });

  // Format the instruction data
  const data: Uint8Array = formatPumpfunSellData(minimumAmountOut, tokenAmountInDecimals);

  // Create the Sell instruction
  const sellTokenIx: IInstruction = {
    programAddress: address(PUMPFUN_PROGRAM_ID),
    accounts: [
      {
        address: address(PUMPFUN_GLOBAL), // global address
        role: AccountRole.READONLY,
      },
      {
        address: address(globalData.feeRecipient.toString()), // Pump fun fee recipient
        role: AccountRole.WRITABLE,
      },
      {
        address: mintAddress, // Target mint token
        role: AccountRole.READONLY,
      },
      {
        address: address(bondingCurveData.address), // Bonding curve
        role: AccountRole.WRITABLE,
      },
      {
        address: address(bondingCurveData.ata), // Bonding curve ATA
        role: AccountRole.WRITABLE,
      },
      {
        address: address(userAta), // User ATA
        role: AccountRole.WRITABLE,
      },
      {
        address: signer.address, // User/signer
        role: AccountRole.WRITABLE_SIGNER,
      },
      {
        address: address(SYSTEM_PROGRAM_ADDRESS), // System program
        role: AccountRole.READONLY,
      },
      {
        address: creatorVault, // Creator Vault
        role: AccountRole.WRITABLE,
      },
      {
        address: address(TOKEN_PROGRAM_ADDRESS), // Token program
        role: AccountRole.READONLY,
      },
      {
        address: address(PUMPFUN_EVENT_AUTHORITY), // Event authority
        role: AccountRole.READONLY,
      },
      {
        address: address(PUMPFUN_PROGRAM_ID), // Pumpfun program id
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
      instructions: [userAtaIx, sellTokenIx],
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
      instructions: [userAtaIx, sellTokenIx],
      latestBlockhash,
      computeUnitLimit,
      computeUnitPrice: priorityFeeEstimate,
    });
  } else {
    // Use default values or values user passed for computeUnitLimit and computeUnitPrice
    tx = createTransaction({
      feePayer: signer,
      version: 'legacy',
      instructions: [userAtaIx, sellTokenIx],
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

  console.log('| SELL | Transaction Explorer Link:\n', explorerLink);

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
 * Format the data for the sell instruction
 * @param {number} minTokenAmount Minimum amount of tokens to receive
 * @param {number} maxSolToSpend Maximum amount of SOL to spend
 */
export function formatPumpfunSellData(minSolAmount: bigint, maxTokensToSpend: bigint) {
  // Create the data buffer
  const dataBuffer = Buffer.alloc(24);

  // Write the discriminator for the 'sell' instruction
  dataBuffer.write('33e685a4017f83ad', 'hex'); // Anchor discriminator for 'buy'

  // Write the amounts to the buffer
  dataBuffer.writeBigUInt64LE(maxTokensToSpend, 8); // amount to sell
  dataBuffer.writeBigInt64LE(minSolAmount, 16);
  return new Uint8Array(dataBuffer);
}
