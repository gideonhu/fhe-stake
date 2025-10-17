import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

if (!projectId) {
  throw new Error('VITE_WALLETCONNECT_PROJECT_ID must be set');
}

export const config = getDefaultConfig({
  appName: 'cUSDT Staking',
  projectId,
  chains: [sepolia],
  ssr: false,
});
