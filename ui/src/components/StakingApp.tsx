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
    <section style={{
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(10px)',
      padding: '24px',
      borderRadius: '16px',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
      border: '1px solid rgba(255, 255, 255, 0.2)'
    }}>
      <h2 style={{
        marginTop: 0,
        fontSize: '20px',
        fontWeight: '600',
        color: '#1f2937',
        marginBottom: '16px'
      }}>{title}</h2>
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
      // Encryption must target the staking contract (amount decoded inside staking contract)
      const buffer = zamaInstance.createEncryptedInput(stakingAddress, await signer.getAddress());
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
    <div style={{
      maxWidth: '900px',
      margin: '0 auto',
      padding: '32px 24px',
      position: 'relative',
      zIndex: 1
    }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px',
        background: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(10px)',
        padding: '20px 24px',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.2)'
      }}>
        <h1 style={{
          fontSize: '28px',
          margin: 0,
          fontWeight: '700',
          color: '#ffffff',
          textShadow: '0 2px 10px rgba(0, 0, 0, 0.2)'
        }}>
          🔐 FHE Staking
        </h1>
        <ConnectButton />
      </header>

      {zamaError && (
        <div style={{
          background: 'rgba(254, 226, 226, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid #fca5a5',
          color: '#991b1b',
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '16px',
          fontWeight: '500'
        }}>
          ⚠️ Encryption service error: {zamaError}
        </div>
      )}

      {!zamaError && isZamaLoading && (
        <div style={{
          background: 'rgba(239, 246, 255, 0.95)',
          backdropFilter: 'blur(10px)',
          border: '1px solid #bfdbfe',
          color: '#1d4ed8',
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '16px',
          fontWeight: '500'
        }}>
          ⏳ Initializing encryption service…
        </div>
      )}

      <div style={{ display: 'grid', gap: '20px' }}>
        <Section title="📋 Contracts">
          <div style={{ display: 'grid', gap: '12px' }}>
            <label>
              <div style={{
                fontSize: '13px',
                marginBottom: '6px',
                fontWeight: '500',
                color: '#4b5563'
              }}>ConfidentialUSDT address</div>
              <input
                value={tokenAddress}
                onChange={e => setTokenAddress(e.target.value)}
                placeholder="0x..."
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: '2px solid #e5e7eb',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  transition: 'all 0.2s',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            </label>
            <label>
              <div style={{
                fontSize: '13px',
                marginBottom: '6px',
                fontWeight: '500',
                color: '#4b5563'
              }}>CUSDTStaking address</div>
              <input
                value={stakingAddress}
                onChange={e => setStakingAddress(e.target.value)}
                placeholder="0x..."
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: '2px solid #e5e7eb',
                  fontSize: '14px',
                  fontFamily: 'monospace',
                  transition: 'all 0.2s',
                  outline: 'none'
                }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
              />
            </label>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                onClick={refresh}
                disabled={!isConnected || !isTokenAddressValid || !isStakingAddressValid}
                style={{
                  padding: '12px 24px',
                  borderRadius: '10px',
                  border: 'none',
                  background: !isConnected || !isTokenAddressValid || !isStakingAddressValid ? '#d1d5db' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: !isConnected || !isTokenAddressValid || !isStakingAddressValid ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                }}
              >
                🔄 Refresh
              </button>
              <button
                onClick={faucet}
                disabled={!isConnected || !isTokenAddressValid || !hasSigner || busy !== null}
                style={{
                  padding: '12px 24px',
                  borderRadius: '10px',
                  border: 'none',
                  background: !isConnected || !isTokenAddressValid || !hasSigner || busy !== null ? '#d1d5db' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '14px',
                  cursor: !isConnected || !isTokenAddressValid || !hasSigner || busy !== null ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}
              >
                {busy === 'Faucet' ? '⏳ Faucet…' : '💧 Faucet 100 cUSDT'}
              </button>
            </div>
          </div>
        </Section>

        <Section title="💰 Balances">
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            marginBottom: '16px'
          }}>
            <div style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              padding: '20px',
              borderRadius: '12px',
              color: 'white',
              boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
            }}>
              <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '4px' }}>cUSDT Balance</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>{formatBalance(cusdtBalance, cusdtHandle)}</div>
            </div>
            <div style={{
              background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
              padding: '20px',
              borderRadius: '12px',
              color: 'white',
              boxShadow: '0 4px 12px rgba(240, 147, 251, 0.3)'
            }}>
              <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '4px' }}>Staked Balance</div>
              <div style={{ fontSize: '24px', fontWeight: '700' }}>{formatBalance(stakedBalance, stakedHandle)}</div>
            </div>
          </div>
          <button
            onClick={decryptBalances}
            disabled={!isConnected || !canDecrypt || busy !== null}
            style={{
              padding: '12px 24px',
              borderRadius: '10px',
              border: 'none',
              background: !isConnected || !canDecrypt || busy !== null ? '#d1d5db' : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              color: 'white',
              fontWeight: '600',
              fontSize: '14px',
              cursor: !isConnected || !canDecrypt || busy !== null ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(251, 191, 36, 0.3)',
              width: '100%'
            }}
          >
            {busy === 'Decrypt' ? '⏳ Decrypting…' : '🔓 Decrypt balances'}
          </button>
        </Section>

        <Section title="⚡ Stake / Withdraw">
          <div style={{ display: 'grid', gap: '16px' }}>
            <input
              type="number"
              min="0"
              step="0.000001"
              placeholder="Amount (cUSDT)"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{
                padding: '14px 18px',
                borderRadius: '10px',
                border: '2px solid #e5e7eb',
                fontSize: '16px',
                fontWeight: '500',
                transition: 'all 0.2s',
                outline: 'none',
                width: '100%'
              }}
              onFocus={(e) => e.target.style.borderColor = '#667eea'}
              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <button
                onClick={stake}
                disabled={!isConnected || !isTokenAddressValid || !isStakingAddressValid || !isAmountValid || !canUseFhe || !hasSigner || busy !== null}
                style={{
                  padding: '14px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  background: !isConnected || !isTokenAddressValid || !isStakingAddressValid || !isAmountValid || !canUseFhe || !hasSigner || busy !== null ? '#d1d5db' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '15px',
                  cursor: !isConnected || !isTokenAddressValid || !isStakingAddressValid || !isAmountValid || !canUseFhe || !hasSigner || busy !== null ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                }}
              >
                {busy === 'Stake' ? '⏳ Staking…' : '🚀 Stake'}
              </button>
              <button
                onClick={withdraw}
                disabled={!isConnected || !isStakingAddressValid || !isAmountValid || !canUseFhe || !hasSigner || busy !== null}
                style={{
                  padding: '14px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  background: !isConnected || !isStakingAddressValid || !isAmountValid || !canUseFhe || !hasSigner || busy !== null ? '#d1d5db' : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '15px',
                  cursor: !isConnected || !isStakingAddressValid || !isAmountValid || !canUseFhe || !hasSigner || busy !== null ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(240, 147, 251, 0.3)'
                }}
              >
                {busy === 'Withdraw' ? '⏳ Withdrawing…' : '💸 Withdraw'}
              </button>
              <button
                onClick={setOperator}
                disabled={!isConnected || !isTokenAddressValid || !isStakingAddressValid || !hasSigner || busy !== null}
                style={{
                  padding: '14px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  background: !isConnected || !isTokenAddressValid || !isStakingAddressValid || !hasSigner || busy !== null ? '#d1d5db' : 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '15px',
                  cursor: !isConnected || !isTokenAddressValid || !isStakingAddressValid || !hasSigner || busy !== null ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)'
                }}
              >
                {busy === 'Set operator' ? '⏳ Setting…' : '🔑 Enable Operator'}
              </button>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
