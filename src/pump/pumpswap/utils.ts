import { Address, address, getAddressEncoder, getProgramDerivedAddress } from 'gill';
import { PUMPFUN_PROGRAM_ID, PUMPSWAP_PROGRAM_ID } from '../constants';
import { fetchMint, findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from 'gill/programs/token';

export async function pumpAmmEventAuthorityPda() {
  const [eventAuthorityPda, _eventAuthorityBump] = await getProgramDerivedAddress({
    seeds: ['__event_authority'],
    programAddress: address(PUMPSWAP_PROGRAM_ID),
  });

  return eventAuthorityPda;
}

export const getPumpPoolQuoteTokenAccount = async (
  protocolFeeRecipient: Address,
  connection: any,
  quoteMint: Address
) => {
  const quoteMintAccountData = await fetchMint(connection.rpc, quoteMint);
  const quoteTokenProgram = quoteMintAccountData.programAddress;

  const [bondingCurveAta, _bondingCurveBump] = await findAssociatedTokenPda({
    mint: quoteMint,
    owner: quoteTokenProgram,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  //   const [poolPda, _poolPdaBump] = await getProgramDerivedAddress({
  //     seeds: [
  //       getAddressEncoder().encode(protocolFeeRecipient),
  //       getAddressEncoder().encode(quoteTokenProgram),
  //       getAddressEncoder().encode(quoteMint),
  //     ],
  //     programAddress: address(PUMPFUN_PROGRAM_ID),
  //   });

  return bondingCurveAta;
};
