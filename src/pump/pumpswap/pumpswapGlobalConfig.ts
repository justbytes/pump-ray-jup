import * as borsh from '@coral-xyz/borsh';
import { Address, address, getAddressEncoder, getProgramDerivedAddress } from 'gill';
import { PUMPSWAP_PROGRAM_ID } from '../../constants';

// Structure of the Pool
export const globalConfigSchema = borsh.struct([
  borsh.array(borsh.u8(), 8, 'discriminator'),
  // the admin pubkey
  borsh.publicKey('admin'),

  // Lp fee in basis points .01%
  borsh.u64('lp_fee_basis_points'),

  // protocol fee in basis points .01% allegedly
  borsh.u64('protocol_fee_basis_points'),

  /**
    "Flags to disable certain functionality",
    "bit 0 - Disable create pool",
    "bit 1 - Disable deposit",
    "bit 2 - Disable withdraw",
    "bit 3 - Disable buy",
    "bit 4 - Disable sell"
 */
  borsh.u8('disable_flags'),

  //Addresses of the protocol fee recipients
  borsh.array(borsh.publicKey(), 8, 'protocol_fee_recipients'),
]);

// Get pumpswap global_config
export async function getGlobalConfigPda() {
  const [globalConfig, _globalConfigBump] = await getProgramDerivedAddress({
    seeds: ['global_config'],
    programAddress: address(PUMPSWAP_PROGRAM_ID),
  });

  return globalConfig;
}

export async function getGlobalConfigData(connection: any) {
  const globalConfigPda = await getGlobalConfigPda();

  const globalConfigAccountInfo = await connection.rpc
    .getAccountInfo(globalConfigPda, { encoding: 'base64' })
    .send();

  const base64Data = globalConfigAccountInfo.value.data[0];
  const dataBuffer = Buffer.from(base64Data, 'base64');

  const data = globalConfigSchema.decode(dataBuffer);

  return { globalConfigPda, ...data };
}

export async function getProtocolFeeRecipientTokenAccount(
  protocolFeeRecipient: Address,
  quoteTokenProgram: Address,
  quoteMint: Address
) {
  // The ATA program constant from IDL
  const ATA_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

  // Find the PDA with the required seeds
  const [tokenAccountPda, _bump] = await getProgramDerivedAddress({
    seeds: [
      getAddressEncoder().encode(protocolFeeRecipient),
      getAddressEncoder().encode(quoteTokenProgram),
      getAddressEncoder().encode(quoteMint),
    ],
    programAddress: address(ATA_PROGRAM_ID),
  });

  return tokenAccountPda;
}
