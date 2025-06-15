import { SYSTEM_PROGRAM_ADDRESS } from '@solana-program/system';
import { IInstruction, address, AccountRole } from 'gill';
import {
  TOKEN_PROGRAM_ADDRESS,
  TOKEN_2022_PROGRAM_ADDRESS,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
} from 'gill/programs/token';
import { RAY_AMM_ROUTER, RAY_LEGACY_AMM_V4 } from '../constants';

export function getAmmSwapIx(params: any, data: Uint8Array): IInstruction {
  return {
    programAddress: address(RAY_AMM_ROUTER), // Raydium router program id
    accounts: [
      {
        address: address(TOKEN_PROGRAM_ADDRESS), // Token program
        role: AccountRole.READONLY,
      },
      {
        address: address(TOKEN_2022_PROGRAM_ADDRESS), // Token2022 program
        role: AccountRole.READONLY,
      },
      {
        address: address(ASSOCIATED_TOKEN_PROGRAM_ADDRESS), // Assosiated token program address
        role: AccountRole.READONLY,
      },
      {
        address: address(SYSTEM_PROGRAM_ADDRESS), // System program address
        role: AccountRole.READONLY,
      },
      {
        address: params.signer.address, // Wallet signer
        role: AccountRole.WRITABLE_SIGNER,
      },
      {
        address: address(params.userBaseAta), // signers base ata
        role: AccountRole.WRITABLE,
      },
      {
        address: address(params.userQuoteAta), // singers quote ata
        role: AccountRole.WRITABLE,
      },
      {
        address: address(RAY_LEGACY_AMM_V4), // Raydium AAM Program
        role: AccountRole.WRITABLE,
      },
      {
        address: address(params.userQuoteAta), // signers quote ata
        role: AccountRole.WRITABLE,
      },
      {
        address: params.baseMintAddress, // base token
        role: AccountRole.WRITABLE,
      },
      {
        address: params.quoteMintAddress, // quote token
        role: AccountRole.WRITABLE,
      },
      {
        address: address(params.poolId), // Pool id
        role: AccountRole.WRITABLE,
      },
      {
        address: address(params.ammAuthority), // amm authority
        role: AccountRole.WRITABLE,
      },
      {
        address: address(params.poolId), // pool id
        role: AccountRole.WRITABLE,
      },
      {
        address: address(params.poolId), //pool id
        role: AccountRole.WRITABLE,
      },
      {
        address: address(params.poolId), // pool id
        role: AccountRole.WRITABLE,
      },
      {
        address: address(params.vaultA), // Vault for base tokens
        role: AccountRole.WRITABLE,
      },
      {
        address: address(params.vaultB), // Vault for quote tokens
        role: AccountRole.WRITABLE,
      },
      {
        address: address(params.poolId), // pool id
        role: AccountRole.WRITABLE,
      },
      {
        address: address(params.poolId), // pool id
        role: AccountRole.WRITABLE,
      },
      {
        address: address(params.poolId), // pool id
        role: AccountRole.WRITABLE,
      },
      {
        address: address(params.poolId), // pool id
        role: AccountRole.WRITABLE,
      },
      {
        address: address(params.poolId), // pool id
        role: AccountRole.WRITABLE,
      },

      {
        address: address(params.poolId), // pool id
        role: AccountRole.WRITABLE,
      },
    ],
    data,
  };
}
