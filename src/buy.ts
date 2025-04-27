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

/**
 * Bonding curve decoding function that reads the account data
 * @param {Buffer} buffer The binary buffer containing the account data
 */
export const decodeBondingCurveAccount = (buffer: Buffer) => {
  // First 8 bytes are the Anchor discriminator
  const discriminator = buffer.slice(0, 8);

  // Next fields are u64 values (8 bytes each, little-endian)
  const virtualTokenReserves = buffer.readBigUInt64LE(8);
  const virtualSolReserves = buffer.readBigUInt64LE(16);
  const realTokenReserves = buffer.readBigUInt64LE(24);
  const realSolReserves = buffer.readBigUInt64LE(32);
  const tokenTotalSupply = buffer.readBigUInt64LE(40);

  // The last field is a boolean (1 byte)
  const complete = buffer[48] === 1;

  return {
    discriminator: discriminator.toString('hex'),
    virtualTokenReserves,
    virtualSolReserves,
    realTokenReserves,
    realSolReserves,
    tokenTotalSupply,
    complete,
  };
};

/**
 * Function to estimate the minimum tokens a user will receive for a given SOL amount
 * PumpFun uses ONLY virtual reserves for bonding curve calculations
 * Uses the constant product formula: (x + dx) * (y - dy) = x * y
 * Where x = solReserves, y = tokenReserves, dx = solAmount, dy = tokensOut
 *
 * @param {any} accountInfo The account info containing bonding curve data
 * @param {number} solAmount Amount of SOL in lamports to spend
 * @param {number} slippage Slippage tolerance (0.01 = 1%)
 */
export const estimatePumpfunMinAmountOut = (
  accountInfo: any,
  solAmount: number,
  slippage: number
) => {
  // Parse the account data
  const base64Data = accountInfo.value.data[0];
  const dataBuffer = Buffer.from(base64Data, 'base64');

  // Decode the bonding curve account data
  const bondingCurve = decodeBondingCurveAccount(dataBuffer);

  // Convert BigInts to Numbers for calculation
  // Note: This could lose precision for very large numbers
  const virtualTokenReserves = Number(bondingCurve.virtualTokenReserves);
  const virtualSolReserves = Number(bondingCurve.virtualSolReserves);
  const realTokenReserves = Number(bondingCurve.realTokenReserves);
  const realSolReserves = Number(bondingCurve.realSolReserves);

  // Calculate constant product k = virtualTokenReserves * virtualSolReserves
  const k = virtualTokenReserves * virtualSolReserves;

  // New virtual SOL reserves after purchase: x' = x + dx
  const newVirtualSolReserves = virtualSolReserves + solAmount;

  // New virtual token reserves to maintain constant product: y' = k / x'
  const newVirtualTokenReserves = k / newVirtualSolReserves;

  // Calculate tokens received: dy = y - y'
  const tokensReceived = virtualTokenReserves - newVirtualTokenReserves;

  // Apply fee (PumpFun charges a 1% fee for buying/selling on the bonding curve)
  const feeBasisPoints = 100; // 1% = 100 basis points
  const feeFactor = 1 - feeBasisPoints / 10000;
  const tokensAfterFee = tokensReceived * feeFactor;

  // console.log('=== Bonding Curve Details ===');
  // console.log('Virtual Token Reserves:', virtualTokenReserves);
  // console.log('Virtual SOL Reserves:', virtualSolReserves);
  // console.log('Real Token Reserves:', realTokenReserves);
  // console.log('Real SOL Reserves:', realSolReserves);
  // console.log('New Virtual SOL Reserves after purchase:', newVirtualSolReserves);
  // console.log('New Virtual Token Reserves to maintain k:', newVirtualTokenReserves);
  // console.log('Tokens Received (before fees):', tokensReceived);
  // console.log('Tokens Received (after 1% fee):', tokensAfterFee);

  // Return the estimated amount out and the amount with the slippage
  return {
    estimatedAmountOut: Math.floor(tokensAfterFee),
    minimumAmountOut: Math.floor(tokensAfterFee * (1 - slippage)),
  };
};

/**
 * Format the data for the buy instruction
 * @param {number} minTokenAmount Minimum amount of tokens to receive
 * @param {number} maxSolToSpend Maximum amount of SOL to spend
 */
export const formatPumpfunBuyData = (minTokenAmount: number, maxSolToSpend: number) => {
  // Create the data buffer
  const dataBuffer = Buffer.alloc(24);

  // Write the discriminator for the 'buy' instruction
  dataBuffer.write('66063d1201daebea', 'hex'); // Anchor discriminator for 'buy'

  // Write the amounts to the buffer
  dataBuffer.writeBigUInt64LE(BigInt(minTokenAmount), 8);
  dataBuffer.writeBigInt64LE(BigInt(maxSolToSpend), 16);

  return new Uint8Array(dataBuffer);
};

/**
 * Buys a token from pumpfun with a given sol amount and a slippage tolerance
 * @param {string} mint
 * @param {number} solAmount
 * @param {number} slippage
 * @param {KeyPairSigner} signer
 * @param {any} connection
 * @returns
 */
export const pumpfunBuy = async (
  mint: string,
  solAmount: number,
  slippage: number,
  signer: KeyPairSigner,
  connection: any
) => {
  // console.log(`Buying tokens with ${solAmount} SOL and ${slippage * 100}% slippage`);

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
  const data: Uint8Array = formatPumpfunBuyData(minimumAmountOut, solAmountLamports);

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
    instructions: [userAtaIx, buyTokenIx],
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
