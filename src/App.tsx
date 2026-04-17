import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { HomePage } from './pages/Home';
import { TransferPage } from './pages/Transfer';
import { ContractCallPage } from './pages/ContractCall';
import { SwapPage } from './pages/Swap';
import { CompleteSwapPage } from './pages/CompleteSwap';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/transfer" element={<TransferPage />} />
          <Route path="/contract-call" element={<ContractCallPage />} />
          <Route path="/swap" element={<SwapPage />} />
          <Route path="/complete-swap" element={<CompleteSwapPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;