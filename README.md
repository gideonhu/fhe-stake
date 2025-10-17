# FHE-Stake: Confidential cUSDT Staking on FHEVM

FHE-Stake is an end-to-end staking application built on Zama’s Fully Homomorphic Encryption Virtual Machine (FHEVM). Users stake Confidential USDT (cUSDT) while keeping balances encrypted on-chain and decrypting them client-side when needed. The repository combines production-ready Solidity contracts, automated deployment scripts, and a front-end built with React and Vite that relies on RainbowKit, viem, and ethers for seamless wallet connectivity and hybrid encrypted workflow support.

## Why This Project Matters

Modern DeFi applications struggle to provide meaningful privacy without sacrificing usability. FHE-Stake demonstrates how FHE-enabled smart contracts can:

- Preserve sensitive financial data by keeping token balances encrypted end-to-end.
- Allow users to stake and withdraw funds with the transparency and auditability of public blockchains.
- Deliver a familiar UX while harnessing powerful cryptography, thanks to automated encrypted input flows and client-side decryption.

## Key Advantages

- **End-to-End Confidentiality:** All stake amounts remain encrypted on-chain. Users decrypt balances locally via the Zama Relayer SDK and personal signing keys.
- **Operator-Gated Custody:** The staking contract relies on cUSDT’s operator controls rather than custodial approvals, enforcing principle-of-least-privilege semantics.
- **Deterministic Stake Accounting:** Arithmetic over encrypted balances uses the `FHESafeMath` library to prevent underflow/overflow and guarantee correct state transitions.
- **Battle-Tested Tooling:** Hardhat, automated tests, and deployment scripts ensure reproducible builds for both local FHEVM mocks and Sepolia environments.
- **Wallet-Native UX:** RainbowKit and wagmi manage wallet connectivity, while viem covers efficient reads and ethers powers contract writes.

## Architecture & Technology

- **Smart Contracts:**
  - `ConfidentialUSDT`: Existing confidential ERC-20-like token (kept untouched per project constraints).
  - `CUSDTStaking`: Core staking logic that accepts encrypted deposits, maintains encrypted balances, and coordinates withdrawals using the FHEVM primitives.
- **Frameworks & Libraries:**
  - Hardhat, TypeScript, and `@fhevm/hardhat-plugin` for compilation, testing, and local mock execution.
  - `@fhevm/solidity` and `new-confidential-contracts` for encrypted arithmetic and safe math helpers.
  - React + Vite front-end with RainbowKit, wagmi, viem, ethers, and Zama’s Relayer SDK for encryption, staking, and decryption flows.
- **Configuration & Deployment:**
  - `.env` supplies private keys, relayer endpoints, and `INFURA_API_KEY` for Sepolia access.
  - Deployment scripts in `deploy/` target both local FHEVM nodes and Sepolia testnet.
  - ABI artifacts are sourced from `deployments/sepolia` and consumed directly by the UI.

## Problems We Solve

- **Confidential Staking Workflows:** Traditional staking exposes balances and transactions; FHE-Stake keeps these values private without surrendering control to custodians.
- **End-User Decryption:** Users historically rely on opaque custodial views; here, they decrypt balances themselves via EIP-712 signed requests and the Relayer SDK.
- **Consistent Cross-Chain Tooling:** Integrates Sepolia testnet infrastructure with Zama’s Gateway and KMS services in a single developer experience.
- **Developer Onboarding:** Provides a full-stack example covering encryption setup, ACL management, staking logic, and UI integration—ready for further customization.

## Project Structure

```
├── contracts/              # Solidity sources (CUSDTStaking plus existing confidential token)
├── deploy/                 # Hardhat-deploy scripts for local and Sepolia targets
├── deployments/            # Deployed contract metadata and ABIs (consumed by the UI)
├── tasks/                  # Hardhat tasks (automation, ACL management, helper flows)
├── test/                   # TypeScript Hardhat tests (uses FHEVM mock)
├── ui/                     # React + Vite application (no Tailwind, no local storage)
└── docs/                   # Internal references for Zama FHE architecture and relayer usage
```

## Getting Started

### Prerequisites

- Node.js 20+
- npm (used across both backend and frontend)
- Access to Infura (or compatible Sepolia RPC) and configured environment variables
- A wallet private key funded on Sepolia for deployments (stored in `.env` as configured)

### Backend Setup

```bash
npm install
npx hardhat compile
npm run test            # Runs Hardhat tests against the FHEVM mock
```

To launch a local FHEVM-enabled node:

```bash
npx hardhat node
npx hardhat deploy --network localhost
```

Deploy to Sepolia once tests pass and environment variables are in place:

```bash
npx hardhat deploy --network sepolia
```

The deployment scripts load `process.env.INFURA_API_KEY` and `dotenv.config()` to ensure network access and key management follow best practices.

### Frontend Setup

```bash
cd ui
npm install
npm run dev            # Starts Vite dev server (use Sepolia RPC; no localhost chain binding)
```

- ABIs are imported from `deployments/sepolia` and mirrored into the UI.
- viem handles read-only state such as encrypted balances and operator status.
- ethers is responsible for write transactions including faucet, setOperator, stake, and withdraw.

## Core User Flows

1. **Funding & Permissions**
   - Use the faucet to mint cUSDT.
   - Set the staking contract as operator via `setOperator`.
2. **Staking**
   - The UI encrypts stake amounts for the staking contract, forwards handles and proofs to `CUSDTStaking.stake`, and updates encrypted balance handles.
3. **Withdrawing**
   - Users encrypt desired withdrawal amounts targeting the staking contract and invoke `withdraw`, which returns encrypted balances via `confidentialTransfer`.
4. **Decryption**
   - When decrypting balances, the UI generates ephemeral key pairs, signs EIP-712 payloads, and calls the Relayer SDK; zero-value ciphertexts resolve to “0” for clarity.

## Testing & Quality

- Unit tests (`npx hardhat test`) exercise stake/withdraw flows against the FHEVM mock.
- Frontend type checking and linting come from the Vite + TypeScript toolchain.
- Continuous verification is encouraged before Sepolia deployment to avoid ACL or encryption mismatches.

## Future Roadmap

- **Multi-Asset Support:** Generalize the staking contract to accept multiple confidential tokens with isolated encrypted accounting.
- **Reward Distribution:** Introduce encrypted reward accruals and disclosure workflows that maintain confidentiality while enabling yield calculations.
- **Advanced Analytics:** Surface aggregated, privacy-preserving metrics (e.g., total staked, participation rates) through public decryption flows.
- **Mobile Wallet UX:** Extend RainbowKit integration with mobile-friendly connectors and QR-based signing for encrypted operations.
- **Infrastructure Resilience:** Add automated smoke tests and monitoring around relayer availability, ACL drift, and KMS health.

## Contributing & Support

- Use the existing Hardhat and UI scripts to validate any proposed changes before submission.
- Refer to the docs in `docs/` for FHEVM specifics and relayer integration patterns.
- For protocol-level guidance, consult Zama’s official documentation and community channels.

FHE-Stake brings privacy-preserving staking to life, showcasing how developers can merge encrypted smart contracts with user-friendly interfaces without compromising security or transparency.
