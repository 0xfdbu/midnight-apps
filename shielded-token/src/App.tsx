import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { HomePage } from './pages/Home';
import { DeployPage } from './pages/Deploy';
import { MintPage } from './pages/Mint';
import { SendPage } from './pages/Send';
import { BurnPage } from './pages/Burn';
import { useWalletStore } from './hooks/useWallet';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

setNetworkId('preprod');

const LAST_WALLET_KEY = 'midnight_last_wallet';

function App() {
  const { setWallet, connect, isConnected, wallet } = useWalletStore();

  useEffect(() => {
    const tryAutoConnect = async () => {
      if (isConnected || wallet) return;

      const lastWalletId = localStorage.getItem(LAST_WALLET_KEY);
      if (!lastWalletId || !window.midnight) return;

      const wallets = Object.values(window.midnight) as any[];
      const matchingWallet = wallets.find((w) => w.rdns === lastWalletId);

      if (matchingWallet) {
        console.log('[App] Auto-reconnecting to:', lastWalletId);
        setWallet(matchingWallet as any);
        try {
          await connect('preprod');
        } catch (err) {
          console.log('[App] Auto-reconnect failed:', err);
          localStorage.removeItem(LAST_WALLET_KEY);
        }
      }
    };

    tryAutoConnect();
  }, []);

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/deploy" element={<DeployPage />} />
          <Route path="/mint" element={<MintPage />} />
          <Route path="/send" element={<SendPage />} />
          <Route path="/burn" element={<BurnPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
