import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { HomePage } from './pages/Home';
import { TransferPage } from './pages/Transfer';
import { useWalletSubscription } from './hooks/useWalletSubscription';
import { tryAutoConnect } from './hooks/useWallet';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

setNetworkId('preprod');

function AppContent() {
  useEffect(() => {
    tryAutoConnect();
  }, []);

  useWalletSubscription({ balanceInterval: 15000, connectionInterval: 5000 });

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/transfer" element={<TransferPage />} />
      </Routes>
    </Layout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
