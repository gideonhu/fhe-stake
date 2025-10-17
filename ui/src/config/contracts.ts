import { isAddress } from 'viem';

const confidentialUsdtEnv = import.meta.env.VITE_CONFIDENTIAL_USDT_ADDRESS ?? '0x18115eB3D944b5689835e4857257dA5e86Ae3c20';
const stakingEnv = import.meta.env.VITE_CUSDT_STAKING_ADDRESS ?? '0x67e465bC75BC1be863FEcF27155f0fE1A15FF816';

const normalizeAddress = (value: string) => (isAddress(value) ? value : '');

export const contractAddresses = {
  confidentialUsdt: normalizeAddress(confidentialUsdtEnv),
  cusdtStaking: normalizeAddress(stakingEnv),
};
