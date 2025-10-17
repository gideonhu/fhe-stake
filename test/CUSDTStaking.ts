import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("CUSDTStaking (local mock)", function () {
  before(function () {
    if (!fhevm.isMock) {
      console.warn("This test runs only on local FHEVM mock environment");
      this.skip();
    }
  });

  it("stake and withdraw flow", async function () {
    const [deployer, alice] = await ethers.getSigners();

    const cusdtFactory = await ethers.getContractFactory("ConfidentialUSDT");
    const cusdt = await cusdtFactory.connect(deployer).deploy();
    const cusdtAddress = await cusdt.getAddress();

    const stakingFactory = await ethers.getContractFactory("CUSDTStaking");
    const staking = await stakingFactory.connect(deployer).deploy(cusdtAddress);
    const stakingAddress = await staking.getAddress();

    // Alice faucet 100 cUSDT (decimals 6)
    await cusdt.connect(alice).faucet();

    const encBal1 = await cusdt.confidentialBalanceOf(alice.address);
    const bal1 = await fhevm.userDecryptEuint(FhevmType.euint64, encBal1, cusdtAddress, alice);
    expect(bal1).to.be.greaterThan(0n);

    // Approve operator: staking contract on token
    await cusdt.connect(alice).setOperator(stakingAddress, 4102444800); // year 2100

    // Stake 1_000_000 (1 cUSDT)
    const encAmtStake = await fhevm
      .createEncryptedInput(stakingAddress, alice.address)
      .add64(1_000_000n)
      .encrypt();
    await staking.connect(alice).stake(encAmtStake.handles[0], encAmtStake.inputProof);

    // Check stakedOf
    const encStaked1 = await staking.stakedOf(alice.address);
    const staked1 = await fhevm.userDecryptEuint(FhevmType.euint64, encStaked1, stakingAddress, alice);
    expect(staked1).to.equal(1_000_000n);

    // Withdraw 500_000 (0.5 cUSDT)
    const encAmtWd = await fhevm
      .createEncryptedInput(stakingAddress, alice.address)
      .add64(500_000n)
      .encrypt();
    await staking.connect(alice).withdraw(encAmtWd.handles[0], encAmtWd.inputProof);

    // Check stakedOf after withdraw
    const encStaked2 = await staking.stakedOf(alice.address);
    const staked2 = await fhevm.userDecryptEuint(FhevmType.euint64, encStaked2, stakingAddress, alice);
    expect(staked2).to.equal(500_000n);

    // Alice token balance should have decreased by net 0.5 cUSDT (1 stake - 0.5 withdraw)
    const encBalAfter = await cusdt.confidentialBalanceOf(alice.address);
    const balAfter = await fhevm.userDecryptEuint(FhevmType.euint64, encBalAfter, cusdtAddress, alice);
    expect(bal1 - balAfter).to.equal(500_000n);
  });
});
