import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { createPublicClient, http, isAddress } from 'viem';
import { sepolia } from 'viem/chains';
import { ethers } from 'ethers';

import { ConfidentialUSDTABI } from '../abi/ConfidentialUSDT';
import { CUSDTStakingABI } from '../abi/CUSDTStaking';
import { contractAddresses } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';

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
  const [cusdtHandle, setCusdtHandle] = useState<string | null>(null);
  const [stakedHandle, setStakedHandle] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>(''); // human readable (e.g., 1.23)
  const [busy, setBusy] = useState<string | null>(null);

  const client = useMemo(() => createPublicClient({ chain: sepolia, transport: http() }), []);
  const signerPromise = useEthersSigner({ chainId: sepolia.id });
  const { instance: zamaInstance, isLoading: isZamaLoading, error: zamaError } = useZamaInstance();

  const isTokenAddressValid = isAddress(tokenAddress || '');
  const isStakingAddressValid = isAddress(stakingAddress || '');
  const parsedAmount = Number.parseFloat(amount || '');
  const isAmountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const hasSigner = Boolean(signerPromise);
  const canUseFhe = Boolean(zamaInstance) && !isZamaLoading;

  useEffect(() => {
    setCusdtBalance(null);
    setStakedBalance(null);
    setCusdtHandle(null);
    setStakedHandle(null);
  }, [address, tokenAddress, stakingAddress]);

  const refresh = useCallback(async () => {
    if (!address) {
      console.log('refresh skipped: missing address');
      return;
    }
    if (!isTokenAddressValid || !isStakingAddressValid) {
      console.log('refresh skipped: invalid contract addresses');
      return;
    }
    try {
      // Read encrypted cUSDT balance
      const encBal = await client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ConfidentialUSDTABI as any,
        functionName: 'confidentialBalanceOf',
        args: [address],
      });
      const cusdtHandleRaw = encBal as string;
      console.log('confidentialBalanceOf raw', cusdtHandleRaw);
      setCusdtHandle(cusdtHandleRaw);
      setCusdtBalance(null);

      // Read encrypted staked balance
      const encStaked = await client.readContract({
        address: stakingAddress as `0x${string}`,
        abi: CUSDTStakingABI as any,
        functionName: 'stakedOf',
        args: [address],
      });
      const stakedHandleRaw = encStaked as string;
      console.log('stakedOf raw', stakedHandleRaw);
      setStakedHandle(stakedHandleRaw);
      setStakedBalance(null);
    } catch (e) {
      console.error(e);
    }
  }, [address, client, isStakingAddressValid, isTokenAddressValid, stakingAddress, tokenAddress]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const faucet = async () => {
    if (!isTokenAddressValid || !signerPromise) return;
    setBusy('Faucet');
    try {
      const signer = await signerPromise;
      if (!signer) return;
      const token = new ethers.Contract(tokenAddress, ConfidentialUSDTABI as any, signer);
      const tx = await token.faucet();
      await tx.wait();
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const setOperator = async () => {
    if (!isTokenAddressValid || !isStakingAddressValid || !signerPromise) return;
    setBusy('Set operator');
    try {
      const signer = await signerPromise;
      if (!signer) return;
      const token = new ethers.Contract(tokenAddress, ConfidentialUSDTABI as any, signer);
      const until = 4102444800; // 2100-01-01
      const tx = await token.setOperator(stakingAddress, until);
      await tx.wait();
    } finally {
      setBusy(null);
    }
  };

  const stake = async () => {
    if (!address || !isTokenAddressValid || !isStakingAddressValid || !isAmountValid || !signerPromise || !zamaInstance) return;
    const micros = BigInt(Math.floor(parsedAmount * 1_000_000));
    setBusy('Stake');
    try {
      const signer = await signerPromise;
      if (!signer) return;
      // Encryption must target the token contract (confidentialTransferFrom does fromExternal inside token)
      const buffer = zamaInstance.createEncryptedInput(tokenAddress, await signer.getAddress());
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
    if (!address || !isStakingAddressValid || !isAmountValid || !signerPromise || !zamaInstance) return;
    const micros = BigInt(Math.floor(parsedAmount * 1_000_000));
    setBusy('Withdraw');
    try {
      const signer = await signerPromise;
      if (!signer) return;
      // Encryption must target the staking contract (withdraw does fromExternal inside staking)
      const buffer = zamaInstance.createEncryptedInput(stakingAddress, await signer.getAddress());
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

  const decryptBalances = async () => {
    if (!address || busy !== null || !signerPromise || !zamaInstance) return;
    const usableCusdtHandle = cusdtHandle;
    const usableStakedHandle = stakedHandle;
    if ((!usableCusdtHandle || !isTokenAddressValid) && (!usableStakedHandle || !isStakingAddressValid)) return;
    setBusy('Decrypt');
    try {
      const signer = await signerPromise;
      if (!signer) return;
      const signerAddress = await signer.getAddress();

      const decryptHandle = async (handle: string, contractAddress: string) => {
        if (typeof handle !== 'string') {
          return 0n;
        }
        const trimmedHandle = handle.trim();
        const handleBody = trimmedHandle.startsWith('0x') ? trimmedHandle.slice(2) : trimmedHandle;
        if (!handleBody || /^0+$/i.test(handleBody)) {
          return 0n;
        }
        const keypair = zamaInstance.generateKeypair();
        const startTimestamp = Math.floor(Date.now() / 1000).toString();
        const durationDays = '7';
        const eip712 = zamaInstance.createEIP712(keypair.publicKey, [contractAddress], startTimestamp, durationDays);
        const signature = await (signer as any).signTypedData(
          eip712.domain,
          { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
          eip712.message,
        );
        const result = await zamaInstance.userDecrypt(
          [{ handle, contractAddress }],
          keypair.privateKey,
          keypair.publicKey,
          signature.replace('0x', ''),
          [contractAddress],
          signerAddress,
          startTimestamp,
          durationDays,
        );
        const value = result[handle];
        if (!value) {
          return 0n;
        }
        const valueString = typeof value === 'string' ? value.trim() : typeof value === 'bigint' ? `0x${value.toString(16)}` : value?.toString?.().trim();
        if (!valueString) {
          return 0n;
        }
        const valueBody = valueString.startsWith('0x') ? valueString.slice(2) : valueString;
        if (!valueBody || /^0+$/i.test(valueBody)) {
          return 0n;
        }
        return BigInt(valueString);
      };

      if (usableCusdtHandle && isTokenAddressValid) {
        const value = await decryptHandle(usableCusdtHandle, tokenAddress);
        setCusdtBalance(value);
      }

      if (usableStakedHandle && isStakingAddressValid) {
        const value = await decryptHandle(usableStakedHandle, stakingAddress);
        setStakedBalance(value);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setBusy(null);
    }
  };

  const formatBalance = (balance: bigint | null, handle: string | null) => {
    if (balance !== null) {
      return (Number(balance) / 1_000_000).toLocaleString();
    }
    if (handle) {
      return '***';
    }
    return '-';
  };

  const hasDecryptableBalance = (isTokenAddressValid && Boolean(cusdtHandle)) ||
    (isStakingAddressValid && Boolean(stakedHandle));
  const canDecrypt = !isZamaLoading && !zamaError && hasDecryptableBalance;

  useEffect(() => {
    console.log('canDecrypt state', { canDecrypt, hasDecryptableBalance, cusdtHandle, stakedHandle, isZamaLoading, zamaError, hasSigner });
  }, [canDecrypt, hasDecryptableBalance, cusdtHandle, stakedHandle, isZamaLoading, zamaError, hasSigner]);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>cUSDT Staking</h1>
        <ConnectButton />
      </header>

      {zamaError && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#991b1b', padding: 12, borderRadius: 6 }}>
          Encryption service error: {zamaError}
        </div>
      )}

      {!zamaError && isZamaLoading && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', padding: 12, borderRadius: 6 }}>
          Initializing encryption service…
        </div>
      )}

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
            <button onClick={faucet} disabled={!isConnected || !isTokenAddressValid || !hasSigner || busy !== null}>{busy === 'Faucet' ? 'Faucet…' : 'Faucet 100 cUSDT'}</button>
            </div>
          </div>
        </Section>

        <Section title="Balances">
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>cUSDT: {formatBalance(cusdtBalance, cusdtHandle)}</div>
            <div>Staked: {formatBalance(stakedBalance, stakedHandle)}</div>
            <button onClick={decryptBalances} disabled={!isConnected || !canDecrypt || busy !== null}>
              {busy === 'Decrypt' ? 'Decrypting…' : 'Decrypt balances'}
            </button>
          </div>
        </Section>

        <Section title="Stake / Withdraw">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="number" min="0" step="0.000001" placeholder="Amount (cUSDT)" value={amount} onChange={e => setAmount(e.target.value)} style={{ padding: 8 }} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={stake}
                disabled={!isConnected || !isTokenAddressValid || !isStakingAddressValid || !isAmountValid || !canUseFhe || !hasSigner || busy !== null}
              >
                {busy === 'Stake' ? 'Staking…' : 'Stake'}
              </button>
              <button
                onClick={withdraw}
                disabled={!isConnected || !isStakingAddressValid || !isAmountValid || !canUseFhe || !hasSigner || busy !== null}
              >
                {busy === 'Withdraw' ? 'Withdrawing…' : 'Withdraw'}
              </button>
              <button
                onClick={setOperator}
                disabled={!isConnected || !isTokenAddressValid || !isStakingAddressValid || !hasSigner || busy !== null}
              >
                {busy === 'Set operator' ? 'Setting…' : 'Enable Operator'}
              </button>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
