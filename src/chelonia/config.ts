import sbp from '@sbp/sbp'
import '@chelonia/lib'
import { isRawEncryptedData } from '@chelonia/lib/encryptedData'
import manifestsFile from '../contracts/manifests.json'
import './state.ts'

export const CONTRACT_NAME = 'todomvc/identity'

// A list is created by an identity, so the server knows which account to bill
// it to.
export const LIST_CONTRACT_NAME = 'todomvc/list'

// The same chel serve process answers /event, /name, /kv and the pubsub socket.
export const API_URL = window.location.origin

export async function configureChelonia (): Promise<void> {
  await sbp('chelonia/configure', {
    connectionURL: API_URL,
    stateSelector: 'todomvc/state',
    contracts: {
      // manifests.json is written by `npm run contracts`. Chelonia refuses to
      // load a contract whose manifest CID is not listed here.
      manifests: manifestsFile.manifests,
      defaults: {
        // The contract calls no selectors, so nothing needs allowing through.
        allowedSelectors: [],
        allowedDomains: [],
        preferSlim: false,
        // What the contract is allowed to `require`. Chelonia gives the
        // sandbox a `require` that resolves only what is listed here, which is
        // how a contract shares code without bundling any.
        modules: { '@chelonia/lib/encryptedData': { isRawEncryptedData } }
      }
    }
  })

  // configure does not open the socket. Without this, writes still reach the
  // server but nothing comes back: no contract events, no KV updates.
  sbp('chelonia/connect')
}
