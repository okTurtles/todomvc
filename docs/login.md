# Signup and login, step by step

This is for someone reading `src/chelonia/auth.js`. The README explains what
happens without any of this; start there if you have not.

## The two salts

The password never leaves the browser, and neither does anything that would let
the server work the password out. What the server keeps instead are two salts
and a hash, and which salt does what is worth knowing before reading the steps:

| name | kept by | used for |
| --- | --- | --- |
| authentication salt | the server, handed out on request | turning the password into the hash the server checks a login against |
| contract salt | the server, handed back only after a successful login | deriving the account's own keys |

The authentication salt is public in practice, since the server gives it to
anyone who asks for an account by name. The contract salt is not: the server
only releases it to someone who has just shown they know the password. That is
what keeps the account's keys out of reach of anyone guessing passwords offline,
because guessing is useless without a salt you cannot get.

The full scheme, including why it is built this way, is in okTurtles's
[password salting](https://gitlab.okturtles.org/okturtles/group-income-simple/-/wikis/E2E-Protocol/Password-salting.md)
notes. What follows is only what this app does with it.

## The keys

Two keys come from the password and the contract salt. Neither is ever stored,
because both can be worked out again from the password:

| name | what it does |
| --- | --- |
| `ipk` | signs the message that creates the account |
| `iek` | encrypts the account's other secret keys, so they can travel inside the contract |

Three more are generated at random and stay with the account for its life. They
are the ones described in [sharing.md](sharing.md): `csk` signs, `cek`
encrypts, and `#sak` is what the server checks before serving the account's
key/value store. Their secret halves are stored inside the contract itself,
each one encrypted with the `iek`. That is what makes logging in on a machine
that has never seen the account possible: work out the `iek` again from the
password, and it opens the other three.

## Signup

1. `POST /zkpp/register/:username` twice. The first call commits to a one-time
   public key and gets the server's half back; the second sends the hash of the
   password under the new authentication salt. The server ends up storing that
   hash and both salts, and never sees the password.
2. Work out `ipk` and `iek` from the password and the contract salt.
3. Generate `csk`, `cek` and `#sak`, and encrypt each one's secret half with
   the `iek`.
4. `chelonia/out/registerContract`, signed by the `ipk`. The username goes in
   the `shelter-namespace-registration` header and the one-time token from step
   1 in `shelter-salt-registration-token`, which is what makes the server
   accept a contract with no account to bill it to.
5. Keep `csk`, `cek` and `#sak`. Throw away `ipk` and `iek`.
6. Create the account's first list. See [sharing.md](sharing.md).

## Login

1. `GET /name/:username` gives the contract ID.
2. Show the server that we know the password, without sending it. `GET
   /zkpp/:contractID/auth_hash` hands back the authentication salt, the browser
   hashes the password with it and derives a value the server can check but
   cannot reverse, and `GET /zkpp/:contractID/contract_hash` sends that value
   in. If it checks out, the server returns the contract salt, encrypted with a
   key that only someone who completed this exchange can work out.
3. Work out the `iek` from the password and that salt, and hand it to Chelonia
   as a transient key.
4. `chelonia/contract/retain`. Syncing the contract decrypts `csk`, `cek` and
   `#sak` with the `iek` and stores them. That is the whole recovery.
5. Throw the `iek` away.
6. Load the `lists` slot and open each list in it.

A wrong password comes back from the server as a 500 rather than a clean
failure, so the app cannot tell the two apart by the status. It goes by whether
the server answered at all: an answer of any kind means the password was
rejected, and no answer means the server could not be reached.

## Reload

None of the above. The keys and the contract state are already in the saved
blob, so it only re-syncs.

## Changing the password

1. Show the server that we know the current password, the same exchange as
   login step 2.
2. `POST /zkpp/:contractID/updatePasswordHash` with that proof and the new
   password's hash, encrypted with a key derived from the same exchange
   (`buildUpdateSaltRequestEc`). The server replaces the stored salts and hash,
   and answers with the old contract salt and a one-time token.
3. Work out the old `ipk` and `iek` from the old password and old salt, and the
   new pair from the new password and new salt.
4. `chelonia/out/keyUpdate`, signed by the old `ipk`, with the token in the
   `shelter-salt-update-token` header. Only `ipk` and `iek` are replaced.
   `csk`, `cek` and `#sak` keep the same keys and only have their stored
   secrets re-encrypted with the new `iek`, so nothing already written to the
   contract has to change.
5. Write the deletion token again, encrypted with the new `iek`.
6. Throw away all four password-derived keys.

## Deleting the account

At signup the app generates a random deletion token, sends only its hash in
`shelter-deletion-token-digest`, and keeps the token itself inside the contract
encrypted with the `iek`. So the token can only be recovered by someone who
knows the password.

1. Show the server that we know the password and work out the `iek`, as at
   login.
2. Decrypt the token out of `attributes.encryptedDeletionToken`.
3. `chelonia/out/deleteContract` with the token. The server answers 202 and
   deletes the contract in the background, along with every list this account
   created. Lists that were only joined through an invite belong to whoever
   created them, and are left alone.
4. Log out locally.

The username stays taken. In chel 3.4.0 the name keeps pointing at the deleted
contract and is reported as orphaned, and there is nothing that later frees it,
so signing up again with the same name is refused.
