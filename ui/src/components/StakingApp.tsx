import { useEffect, useMemo, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { createPublicClient, http, isAddress } from 'viem';
import { sepolia } from 'viem/chains';
import { ethers } from 'ethers';
import { createInstance, SepoliaConfig as RelayerSepoliaConfig } from '@zama-fhe/relayer-sdk/web';

import { ConfidentialUSDTABI } from '../abi/ConfidentialUSDT';
import { CUSDTStakingABI } from '../abi/CUSDTStaking';
import { contractAddresses } from '../config/contracts';

function Section({ title, children }: { title: string; children: any }) {
  return (
    <section style={{ background: '#fff', padding: 16, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <h2 style={{ marginTop: 0, fontSize: 18 }}>{title}</h2>
      {children}
    </section>
  );
}

export function StakingApp() {
  const { address, isConnected } = useAccount();
  const [tokenAddress, setTokenAddress] = useState<string>(contractAddresses.confidentialUsdt);
  const [stakingAddress, setStakingAddress] = useState<string>(contractAddresses.cusdtStaking);
  const [cusdtBalance, setCusdtBalance] = useState<bigint | null>(null);
  const [stakedBalance, setStakedBalance] = useState<bigint | null>(null);
  const [amount, setAmount] = useState<string>(''); // human readable (e.g., 1.23)
  const [busy, setBusy] = useState<string | null>(null);

  const client = useMemo(() => createPublicClient({ chain: sepolia, transport: http() }), []);

  const isTokenAddressValid = isAddress(tokenAddress || '');
  const isStakingAddressValid = isAddress(stakingAddress || '');
  const parsedAmount = Number.parseFloat(amount || '');
  const isAmountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;

  useEffect(() => {
    setCusdtBalance(null);
    setStakedBalance(null);
  }, [address, tokenAddress, stakingAddress]);

  const refresh = async () => {
    if (!address || !isTokenAddressValid || !isStakingAddressValid) return;
    try {
      const instance = await createInstance(RelayerSepoliaConfig);
      // Read encrypted cUSDT balance
      const encBal = await client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ConfidentialUSDTABI as any,
        functionName: 'confidentialBalanceOf',
        args: [address],
      });
      if (encBal === ethers.ZeroHash) {
        setCusdtBalance(0n);
      } else {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();

        const keypair = instance.generateKeypair();
        const startTimeStamp = Math.floor(Date.now() / 1000).toString();
        const durationDays = '7';
        const eip712 = instance.createEIP712(keypair.publicKey, [tokenAddress], startTimeStamp, durationDays);
        const signature = await (signer as any).signTypedData(
          eip712.domain,
          { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
          eip712.message,
        );
        const result = await instance.userDecrypt(
          [{ handle: encBal as string, contractAddress: tokenAddress }],
          keypair.privateKey,
          keypair.publicKey,
          signature.replace('0x', ''),
          [tokenAddress],
          await signer.getAddress(),
          startTimeStamp,
          durationDays,
        );
        const v = result[encBal as string];
        setCusdtBalance(BigInt(v ?? 0));
      }

      // Read encrypted staked balance
      const encStaked = await client.readContract({
        address: stakingAddress as `0x${string}`,
        abi: CUSDTStakingABI as any,
        functionName: 'stakedOf',
        args: [address],
      });
      if (encStaked === ethers.ZeroHash) {
        setStakedBalance(0n);
      } else {
        const instance2 = await createInstance(RelayerSepoliaConfig);
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const signer = await provider.getSigner();
        const keypair = instance2.generateKeypair();
        const startTimeStamp = Math.floor(Date.now() / 1000).toString();
        const durationDays = '7';
        const eip712 = instance2.createEIP712(keypair.publicKey, [stakingAddress], startTimeStamp, durationDays);
        const signature = await (signer as any).signTypedData(
          eip712.domain,
          { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
          eip712.message,
        );
        const result = await instance2.userDecrypt(
          [{ handle: encStaked as string, contractAddress: stakingAddress }],
          keypair.privateKey,
          keypair.publicKey,
          signature.replace('0x', ''),
          [stakingAddress],
          await signer.getAddress(),
          startTimeStamp,
          durationDays,
        );
        const v = result[encStaked as string];
        setStakedBalance(BigInt(v ?? 0));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const faucet = async () => {
    if (!isTokenAddressValid) return;
    setBusy('Faucet');
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const token = new ethers.Contract(tokenAddress, ConfidentialUSDTABI as any, signer);
      const tx = await token.faucet();
      await tx.wait();
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const setOperator = async () => {
    if (!isTokenAddressValid || !isStakingAddressValid) return;
    setBusy('Set operator');
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const token = new ethers.Contract(tokenAddress, ConfidentialUSDTABI as any, signer);
      const until = 4102444800; // 2100-01-01
      const tx = await token.setOperator(stakingAddress, until);
      await tx.wait();
    } finally {
      setBusy(null);
    }
  };

  const stake = async () => {
    if (!address || !isTokenAddressValid || !isStakingAddressValid || !isAmountValid) return;
    const micros = BigInt(Math.floor(parsedAmount * 1_000_000));
    setBusy('Stake');
    try {
      const instance = await createInstance(RelayerSepoliaConfig);
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      // Encryption must target the token contract (confidentialTransferFrom does fromExternal inside token)
      const buffer = instance.createEncryptedInput(tokenAddress, await signer.getAddress());
      buffer.add64(micros);
      const encrypted = await buffer.encrypt();

      const staking = new ethers.Contract(stakingAddress, CUSDTStakingABI as any, signer);
      const tx = await staking.stake(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
      setAmount('');
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async () => {
    if (!address || !isStakingAddressValid || !isAmountValid) return;
    const micros = BigInt(Math.floor(parsedAmount * 1_000_000));
    setBusy('Withdraw');
    try {
      const instance = await createInstance(RelayerSepoliaConfig);
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      // Encryption must target the staking contract (withdraw does fromExternal inside staking)
      const buffer = instance.createEncryptedInput(stakingAddress, await signer.getAddress());
      buffer.add64(micros);
      const encrypted = await buffer.encrypt();

      const staking = new ethers.Contract(stakingAddress, CUSDTStakingABI as any, signer);
      const tx = await staking.withdraw(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
      setAmount('');
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>cUSDT Staking</h1>
        <ConnectButton />
      </header>

      <div style={{ display: 'grid', gap: 16 }}>
        <Section title="Contracts">
          <div style={{ display: 'grid', gap: 8 }}>
            <label>
              <div style={{ fontSize: 12, marginBottom: 4 }}>ConfidentialUSDT address</div>
              <input value={tokenAddress} onChange={e => setTokenAddress(e.target.value)} placeholder="0x..." style={{ width: '100%', padding: 8 }} />
            </label>
            <label>
              <div style={{ fontSize: 12, marginBottom: 4 }}>CUSDTStaking address</div>
              <input value={stakingAddress} onChange={e => setStakingAddress(e.target.value)} placeholder="0x..." style={{ width: '100%', padding: 8 }} />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={refresh} disabled={!isConnected || !isTokenAddressValid || !isStakingAddressValid}>Refresh</button>
              <button onClick={faucet} disabled={!isConnected || !isTokenAddressValid || busy !== null}>{busy === 'Faucet' ? 'Faucet…' : 'Faucet 100 cUSDT'}</button>
              <button onClick={setOperator} disabled={!isConnected || !isTokenAddressValid || !isStakingAddressValid || busy !== null}>{busy === 'Set operator' ? 'Setting…' : 'Enable Operator'}</button>
            </div>
          </div>
        </Section>

        <Section title="Balances">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>cUSDT: {cusdtBalance === null ? '-' : (Number(cusdtBalance) / 1_000_000).toLocaleString()}</div>
            <div>Staked: {stakedBalance === null ? '-' : (Number(stakedBalance) / 1_000_000).toLocaleString()}</div>
          </div>
        </Section>

        <Section title="Stake / Withdraw">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="number" min="0" step="0.000001" placeholder="Amount (cUSDT)" value={amount} onChange={e => setAmount(e.target.value)} style={{ padding: 8 }} />
            <button onClick={stake} disabled={!isConnected || !isTokenAddressValid || !isStakingAddressValid || !isAmountValid || busy !== null}>{busy === 'Stake' ? 'Staking…' : 'Stake'}</button>
            <button onClick={withdraw} disabled={!isConnected || !isStakingAddressValid || !isAmountValid || busy !== null}>{busy === 'Withdraw' ? 'Withdrawing…' : 'Withdraw'}</button>
          </div>
        </Section>
      </div>
    </div>
  );
}
