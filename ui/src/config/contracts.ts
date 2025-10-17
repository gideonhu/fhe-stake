import { isAddress } from 'viem';

const confidentialUsdtEnv = import.meta.env.VITE_CONFIDENTIAL_USDT_ADDRESS ?? '';
const stakingEnv = import.meta.env.VITE_CUSDT_STAKING_ADDRESS ?? '';

const normalizeAddress = (value: string) => (isAddress(value) ? value : '');

export const contractAddresses = {
  confidentialUsdt: normalizeAddress(confidentialUsdtEnv),
  cusdtStaking: normalizeAddress(stakingEnv),
};
