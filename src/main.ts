import { createApp } from 'vue'
import App from './components/App.vue'
import { startChelonia } from './chelonia/index.ts'
import './style.css'

// The app mounts either way, but it has to know the difference. Without this,
// a saved session would render the last known todos as though they were live.
let bootError: Error | null = null

startChelonia()
  .catch((e: unknown) => {
    bootError = e as Error
    console.error('[todomvc] could not start Chelonia', e)
  })
  .finally(() => {
    createApp(App, { bootError }).mount('#app')
  })
