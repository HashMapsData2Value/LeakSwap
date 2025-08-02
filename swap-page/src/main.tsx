import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { WalletManager, WalletProvider, WalletId } from '@txnlab/use-wallet-react'


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletProvider manager={new WalletManager({
      wallets: [
        WalletId.KMD,
        WalletId.PERA,
      ],
    })}>
      <App />
    </WalletProvider>
  </StrictMode>,
)
