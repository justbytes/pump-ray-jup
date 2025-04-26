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
  findAssociatedTokenPda,
  getAssociatedTokenAccountAddress,
  getCreateAssociatedTokenIdempotentInstruction,
  getCreateAssociatedTokenInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from 'gill/programs/token';

// Local Imports
import {
  PUMPFUN_EVENT_AUTHORITY,
  PUMPFUN_FEE_RECIPIENT,
  PUMPFUN_GLOBAL,
  PUMPFUN_PROGRAM_ID,
  SYSVAR_RENT,
} from './constants';
import { formatPumpfunBuyAmount } from './utils';

const ADDRESS_ENCODER = getAddressEncoder();

/**
 *
 * @param {string} mint
 * @param {number} amountInTokens
 * @param {number} maxSolToSpend
 * @param {KeyPairSigner} signer
 * @param {any} connection
 * @returns
 */
export const pumpfunBuy = async (
  mint: string,
  amountInTokens: number,
  maxSolToSpend: number,
  signer: KeyPairSigner,
  connection: any
) => {
  // Ensure we have a valid amount
  // If one of these is set to zero it will be treated as a max value
  if (maxSolToSpend === 0 && amountInTokens === 0) {
    return {
      success: false,
      data: 'Both maxSolToSpend and amountInTokens cannot be zero',
    };
  }

  // Get the Uint8Array of the amounts for the instruction
  const data: Uint8Array = formatPumpfunBuyAmount(amountInTokens, maxSolToSpend);

  // Get latest blockhash
  const { value: latestBlockhash } = await connection.rpc.getLatestBlockhash().send();

  // Convert the mint address to type address for ease of use
  const mintAddress = address(mint);

  // Get the bondingCurve account
  const [bondingCurve, _bondingBump] = await getProgramDerivedAddress({
    seeds: ['bonding-curve', ADDRESS_ENCODER.encode(mintAddress)],
    programAddress: address(PUMPFUN_PROGRAM_ID),
  });

  console.log('Bonding Curve: ', bondingCurve);

  // Get the bonding curve ata
  const [bondingCurveAta, _bondingCurveBump] = await findAssociatedTokenPda({
    mint: mintAddress,
    owner: bondingCurve,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  console.log('Bonding curve ata', bondingCurveAta);

  // Get the users ata for the mint
  const userAta = await getAssociatedTokenAccountAddress(
    mintAddress,
    signer.address,
    TOKEN_PROGRAM_ADDRESS
  );
  console.log(userAta);

  // Instruction to get the users ata
  const userAtaIx = getCreateAssociatedTokenIdempotentInstruction({
    mint: mintAddress,
    owner: signer.address,
    payer: signer,
    ata: userAta,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // Buy pumpfun token instruction
  const buyTokenIx: IInstruction = {
    programAddress: address(PUMPFUN_PROGRAM_ID),
    accounts: [
      {
        address: address(PUMPFUN_GLOBAL), // global address
        role: AccountRole.READONLY,
      },
      {
        address: address(PUMPFUN_FEE_RECIPIENT), // Pump fun fee recipent/account
        role: AccountRole.WRITABLE,
      },
      { address: mintAddress, role: AccountRole.READONLY }, // Target mint token
      {
        address: address(bondingCurve), // Bonding curve
        role: AccountRole.WRITABLE,
      },
      {
        address: address(bondingCurveAta), // Bonding curve ata
        role: AccountRole.WRITABLE,
      },
      {
        address: address(userAta), // User ata
        role: AccountRole.WRITABLE,
      },
      { address: signer.address, role: AccountRole.WRITABLE_SIGNER }, // User/signer
      { address: address(SYSTEM_PROGRAM_ADDRESS), role: AccountRole.READONLY }, // System program
      { address: address(TOKEN_PROGRAM_ADDRESS), role: AccountRole.READONLY }, // Token program
      {
        address: address(SYSVAR_RENT), // Sysvar Rent
        role: AccountRole.READONLY,
      },
      {
        address: address(PUMPFUN_EVENT_AUTHORITY), // Event authority
        role: AccountRole.READONLY,
      },
      { address: address(PUMPFUN_PROGRAM_ID), role: AccountRole.READONLY }, // Pumpfun program id
    ],
    data,
  };

  // Build buy transaction
  const tx = createTransaction({
    feePayer: signer,
    version: 'legacy',
    instructions: [userAtaIx, buyTokenIx],
    latestBlockhash,
  });

  // Sign the transaction
  const signedTransaction = await signTransactionMessageWithSigners(tx);

  // Returns the explorer link to the transaction
  console.log(
    'Explorer: ',
    getExplorerLink({
      transaction: getSignatureFromTransaction(signedTransaction),
    })
  );

  // Make sure the transaction lands and return any results
  try {
    const results = await connection.sendAndConfirmTransaction(signedTransaction);
    return { success: true, data: results };
  } catch (error) {
    console.log('Error with sending and confirming transaction', error);
    return { success: false, data: error };
  }
};
