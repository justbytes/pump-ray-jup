import { address, getProgramDerivedAddress } from 'gill';
import { PUMPSWAP_PROGRAM_ID } from '../constants';

export async function pumpAmmEventAuthorityPda() {
  const [eventAuthorityPda, _eventAuthorityBump] = await getProgramDerivedAddress({
    seeds: ['__event_authority'],
    programAddress: address(PUMPSWAP_PROGRAM_ID),
  });

  return eventAuthorityPda;
}
