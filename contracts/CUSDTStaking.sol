// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {FHE, euint64, externalEuint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {IConfidentialFungibleToken} from "new-confidential-contracts/interfaces/IConfidentialFungibleToken.sol";
import {FHESafeMath} from "new-confidential-contracts/utils/FHESafeMath.sol";

/// @title cUSDT Staking Contract
/// @notice Stake and withdraw cUSDT (ConfidentialUSDT) using Zama FHEVM encrypted amounts
contract CUSDTStaking is SepoliaConfig {
    IConfidentialFungibleToken public immutable token;

    mapping(address => euint64) private _staked;
    euint64 private _totalStaked;

    event Staked(address indexed user, euint64 amount);
    event Withdrawn(address indexed user, euint64 amount);

    constructor(address tokenAddress) {
        require(tokenAddress != address(0), "Invalid token");
        token = IConfidentialFungibleToken(tokenAddress);
    }

    /// @notice Stake encrypted cUSDT amount into this contract
    /// @param encryptedAmount external encrypted amount (target: token contract)
    /// @param inputProof zk-proof validating the encrypted input
    function stake(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        // Decode external encrypted amount for transfer
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        FHE.allow(amount, address(token));

        // Pull encrypted tokens from user into this contract
        euint64 transferred = token.confidentialTransferFrom(msg.sender, address(this), amount);

        // Update user staked balance
        euint64 current = _staked[msg.sender];
        euint64 updated = FHE.add(current, transferred);
        FHE.allowThis(updated);
        FHE.allow(updated, msg.sender);
        _staked[msg.sender] = updated;

        // Update total staked
        euint64 totalUpdated = FHE.add(_totalStaked, transferred);
        FHE.allowThis(totalUpdated);
        _totalStaked = totalUpdated;

        // Record the transferred amount for user access
        FHE.allow(transferred, msg.sender);
        FHE.allowThis(transferred);
        emit Staked(msg.sender, transferred);
    }

    /// @notice Withdraw encrypted cUSDT amount from this contract back to caller
    /// @param encryptedAmount external encrypted amount (target: this staking contract)
    /// @param inputProof zk-proof validating the encrypted input
    function withdraw(externalEuint64 encryptedAmount, bytes calldata inputProof) external {
        euint64 requested = FHE.fromExternal(encryptedAmount, inputProof);

        // Decrease user's staked balance safely
        euint64 current = _staked[msg.sender];
        (ebool ok, euint64 newUserBal) = FHESafeMath.tryDecrease(current, requested);
        FHE.allowThis(newUserBal);
        FHE.allow(newUserBal, msg.sender);
        _staked[msg.sender] = newUserBal;

        // Amount actually withdrawn (0 if underflow)
        euint64 withdrawn = FHE.select(ok, requested, FHE.asEuint64(0));
        // Allow staking contract, user, and token contract to use this handle
        FHE.allowThis(withdrawn);
        FHE.allow(withdrawn, msg.sender);
        FHE.allow(withdrawn, address(token));

        // Update total staked
        euint64 newTotal = FHE.sub(_totalStaked, withdrawn);
        FHE.allowThis(newTotal);
        _totalStaked = newTotal;

        // Send tokens back to user
        token.confidentialTransfer(msg.sender, withdrawn);

        emit Withdrawn(msg.sender, withdrawn);
    }

    /// @notice Encrypted staked balance for an account
    /// @dev Do not use msg.sender in view methods per project rules
    function stakedOf(address account) external view returns (euint64) {
        return _staked[account];
    }

    /// @notice Encrypted total staked across all users
    function totalStaked() external view returns (euint64) {
        return _totalStaked;
    }
}
