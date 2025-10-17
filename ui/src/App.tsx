import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

import { config } from './config/wagmi';
import { StakingApp } from './components/StakingApp';

const queryClient = new QueryClient();

function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider locale="en">
          <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Background decorative elements */}
            <div style={{
              position: 'absolute',
              top: '-10%',
              right: '-5%',
              width: '500px',
              height: '500px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.1)',
              filter: 'blur(80px)',
              pointerEvents: 'none'
            }} />
            <div style={{
              position: 'absolute',
              bottom: '-10%',
              left: '-5%',
              width: '400px',
              height: '400px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              filter: 'blur(60px)',
              pointerEvents: 'none'
            }} />
            <StakingApp />
          </div>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App
