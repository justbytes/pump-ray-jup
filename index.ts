import {
  AccountRole,
  address,
  createSolanaClient,
  createTransaction,
  getExplorerLink,
  getSignatureFromTransaction,
  IInstruction,
  signTransactionMessageWithSigners,
} from 'gill';
import { loadKeypairSignerFromFile } from 'gill/node';
import { PUMPFUN_PROGRAM_ID } from './constants';
import { SYSTEM_PROGRAM_ADDRESS } from 'gill/programs';
import {
  getAssociatedTokenAccountAddress,
  getCreateAssociatedTokenIdempotentInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from 'gill/programs/token';

const { rpc, sendAndConfirmTransaction } = createSolanaClient({
  urlOrMoniker: 'devnet',
});

const signer = await loadKeypairSignerFromFile();
const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

const mint = address('EvYf1NzXCEYHvVhnpq2U36tTWXrUz9VrfavJm6agpump');

const userAta = await getAssociatedTokenAccountAddress(mint, signer.address, TOKEN_PROGRAM_ADDRESS);

const getUserAtaIx = getCreateAssociatedTokenIdempotentInstruction({
  mint,
  owner: signer.address,
  payer: signer,
  tokenProgram: TOKEN_PROGRAM_ADDRESS,
  ata: userAta,
});

console.log('get user ata: ', getUserAtaIx);

const buyTokenIx: IInstruction = {
  programAddress: address(PUMPFUN_PROGRAM_ID),
  accounts: [
    {
      address: address('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf'),
      role: AccountRole.READONLY,
    },
    {
      address: address('FWsW1xNtWscwNmKv6wVsU1iTzRN6wmmk3MjxRP5tT7hz'),
      role: AccountRole.WRITABLE,
    },
    { address: mint, role: AccountRole.READONLY },
    {
      address: address('E2JzPk2VaxJ3qF99rAYNtEi8p88q2zAWRs3EdqQAfFu5'), // Bonding curve
      role: AccountRole.WRITABLE,
    },
    {
      address: address('9CD6A5cXUFfKt4vJEYhCXQkNxhztM9ZerBiGNwJzKe8n'), // Bonding curve ata
      role: AccountRole.WRITABLE,
    },
    {
      address: address('E8fBSkQJXg2mZ652FL6QAShtbi5moLTKvNcNXMdNtHDZ'),
      role: AccountRole.WRITABLE,
    },
    { address: signer.address, role: AccountRole.WRITABLE_SIGNER },
    { address: address(SYSTEM_PROGRAM_ADDRESS), role: AccountRole.READONLY },
    { address: address(TOKEN_PROGRAM_ADDRESS), role: AccountRole.READONLY },
    { address: address('SysvarRent111111111111111111111111111111111'), role: AccountRole.READONLY },
    {
      address: address('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1'),
      role: AccountRole.READONLY,
    },
    { address: address(PUMPFUN_PROGRAM_ID), role: AccountRole.READONLY },
  ],
  data,
};

const tx = createTransaction({
  feePayer: signer,
  version: 'legacy',
  instructions: [getUserAtaIx, buyTokenIx],
  latestBlockhash,
});

const signedTransaction = await signTransactionMessageWithSigners(tx);

console.log(
  'Explorer: ',
  getExplorerLink({
    cluster: 'devnet',
    transaction: getSignatureFromTransaction(signedTransaction),
  })
);

await sendAndConfirmTransaction(signedTransaction);
