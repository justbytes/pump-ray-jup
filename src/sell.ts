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

export const pumpfunSell = async (
  mint: string,
  solAmount: number,
  slippage: number,
  signer: KeyPairSigner,
  connection: any
) => {
  // Validate inputs
  if (solAmount <= 0) {
    return {
      success: false,
      data: 'Error: solAmount must be greater than zero',
    };
  }

  if (slippage < 0 || slippage > 1) {
    return {
      success: false,
      data: 'Error: slippage must be between 0 and 1',
    };
  }

  // Get latest blockhash
  const { value: latestBlockhash } = await connection.rpc.getLatestBlockhash().send();

  // Convert the mint address to type address for ease of use
  const mintAddress = address(mint);

  // Get the bondingCurve PDA
  const ADDRESS_ENCODER = getAddressEncoder();
  const [bondingCurve, _bondingBump] = await getProgramDerivedAddress({
    seeds: ['bonding-curve', ADDRESS_ENCODER.encode(mintAddress)],
    programAddress: address(PUMPFUN_PROGRAM_ID),
  });

  // Get the bonding curve ATA
  const [bondingCurveAta, _bondingCurveBump] = await findAssociatedTokenPda({
    mint: mintAddress,
    owner: bondingCurve,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // Get the user's ATA for the token
  const userAta = await getAssociatedTokenAccountAddress(
    mintAddress,
    signer.address,
    TOKEN_PROGRAM_ADDRESS
  );

  // Instruction to create the user's ATA (idempotent)
  const userAtaIx = getCreateAssociatedTokenIdempotentInstruction({
    mint: mintAddress,
    owner: signer.address,
    payer: signer,
    ata: userAta,
    systemProgram: SYSTEM_PROGRAM_ADDRESS,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // Get bonding curve account data
  const accountInfo = await connection.rpc
    .getAccountInfo(bondingCurve, {
      encoding: 'base64',
    })
    .send();

  // Make sure bonding curve account info is there
  if (!accountInfo || !accountInfo.value) {
    return {
      success: false,
      data: 'Error: Bonding curve account not found',
    };
  }

  // Convert SOL to lamports
  const solAmountLamports = solAmount * 1e9;

  // Calculate token output with slippage
  const { estimatedAmountOut, minimumAmountOut } = estimatePumpfunMinAmountOut(
    accountInfo,
    solAmountLamports,
    slippage
  );

  // Format the instruction data
  const data: Uint8Array = formatPumpfunSellData(minimumAmountOut, solAmountLamports);

  // console.log('=== Buy Details ===');
  // console.log('Mint Address:', mintAddress);
  // console.log('Bonding Curve PDA:', bondingCurve);
  // console.log('Bonding Curve ATA:', bondingCurveAta);
  // console.log('User ATA:', userAta);
  // console.log('Bonding Curve Account Info:', accountInfo);
  // console.log('SOL Amount in Lamports:', solAmountLamports);
  // console.log('Estimated Tokens Out:', estimatedAmountOut);
  // console.log('Minimum Tokens Out (with slippage):', minimumAmountOut);

  // Create the buy instruction
  const buyTokenIx: IInstruction = {
    programAddress: address(PUMPFUN_PROGRAM_ID),
    accounts: [
      {
        address: address(PUMPFUN_GLOBAL), // global address
        role: AccountRole.READONLY,
      },
      {
        address: address(PUMPFUN_FEE_RECIPIENT), // Pump fun fee recipient
        role: AccountRole.WRITABLE,
      },
      {
        address: mintAddress, // Target mint token
        role: AccountRole.READONLY,
      },
      {
        address: address(bondingCurve), // Bonding curve
        role: AccountRole.WRITABLE,
      },
      {
        address: address(bondingCurveAta), // Bonding curve ATA
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
        address: address(TOKEN_PROGRAM_ADDRESS), // Token program
        role: AccountRole.READONLY,
      },
      {
        address: address(SYSVAR_RENT), // Sysvar Rent
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

  // Build the transaction
  const tx = createTransaction({
    feePayer: signer,
    version: 'legacy',
    instructions: [userAtaIx, sellTokenIx],
    latestBlockhash,
  });

  // Sign the transaction
  const signedTransaction = await signTransactionMessageWithSigners(tx);

  // Get the explorer link for debugging
  const explorerLink = getExplorerLink({
    transaction: getSignatureFromTransaction(signedTransaction),
  });

  console.log('Transaction Explorer Link:\n', explorerLink);

  try {
    // Send and confirm the transaction
    const signature = await connection.sendAndConfirmTransaction(signedTransaction);

    return {
      success: true,
      data: {
        signature,
        explorerLink,
      },
    };
  } catch (error) {
    console.error('Error executing sendAndConfirmTransaction:', error);
    return { success: false, data: { explorerLink, error } };
  }
};
