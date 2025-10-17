import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

const projectId = "YOUR_PROJECT_ID";

export const config = getDefaultConfig({
  appName: 'cUSDT Staking',
  projectId,
  chains: [sepolia],
  ssr: false,
});
