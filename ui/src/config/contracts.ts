import { isAddress } from 'viem';

const confidentialUsdtEnv = import.meta.env.VITE_CONFIDENTIAL_USDT_ADDRESS ?? '0xd0425CBCC15D12fEe4fd5D8eB3378feDc0198b13';
const stakingEnv = import.meta.env.VITE_CUSDT_STAKING_ADDRESS ?? '0xe4b32d6958Bc91075702bAa7A336faFC15B4F610';

const normalizeAddress = (value: string) => (isAddress(value) ? value : '');

export const contractAddresses = {
  confidentialUsdt: normalizeAddress(confidentialUsdtEnv),
  cusdtStaking: normalizeAddress(stakingEnv),
};
