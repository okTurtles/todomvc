// The identity contract.
//
// Not bundled with the app. chel signs it and Chelonia fetches it and evaluates
// it in a sandbox where `sbp` is a global, so there are no imports here.
//
// It is almost empty on purpose. Todos live in a KV slot, not in actions. What
// the contract provides is what KV cannot: an object on the server that owns
// the keys and gives `/kv/:contractID/:key` its scope.

// Encrypted data on the wire is a `[keyId, ciphertext]` pair. The check is the
// library's own: Chelonia gives the sandbox a `require` that resolves the
// modules the app lists in `contracts.defaults.modules`, so there is no second
// copy of the rule here. See src/chelonia/config.ts.
const { isRawEncryptedData } = require('@chelonia/lib/encryptedData')

sbp('chelonia/defineContract', {
  name: 'todomvc/identity',
  actions: {
    // The initial action, published with OP_CONTRACT by
    // chelonia/out/registerContract. Its name is the contract name.
    'todomvc/identity': {
      validate (data) {
        if (typeof data?.attributes?.username !== 'string') {
          throw new TypeError('attributes.username must be a string')
        }
        // Lets the account delete itself later. Optional because the contract
        // does not require one, not because this app leaves it out.
        const token = data.attributes.encryptedDeletionToken
        if (token !== undefined && !isRawEncryptedData(token)) {
          throw new TypeError('attributes.encryptedDeletionToken must be encrypted data')
        }
      },
      process ({ data }, { state }) {
        state.attributes = { ...data.attributes }
      }
    },
    // The token is encrypted with a password-derived key, so a password
    // change publishes it again under the new one.
    'todomvc/identity/setDeletionToken': {
      validate (data) {
        if (!isRawEncryptedData(data?.encryptedDeletionToken)) {
          throw new TypeError('encryptedDeletionToken must be encrypted data')
        }
      },
      process ({ data }, { state }) {
        state.attributes.encryptedDeletionToken = data.encryptedDeletionToken
      }
    }
  }
})
