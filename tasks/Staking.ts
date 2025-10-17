import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("stake:address", "Prints deployed contract addresses").setAction(async (_args, hre) => {
  const { deployments } = hre;
  const cusdt = await deployments.get("ConfidentialUSDT");
  const staking = await deployments.get("CUSDTStaking");
  console.log(`ConfidentialUSDT: ${cusdt.address}`);
  console.log(`CUSDTStaking   : ${staking.address}`);
});

task("stake:faucet", "Mint cUSDT to caller using faucet").setAction(async (_args, hre) => {
  const { ethers, deployments } = hre;
  const cusdt = await deployments.get("ConfidentialUSDT");
  const [signer] = await ethers.getSigners();
  const token = await ethers.getContractAt("ConfidentialUSDT", cusdt.address);
  const tx = await token.connect(signer).faucet();
  console.log(`Faucet tx: ${tx.hash}`);
  await tx.wait();
});

task("stake:set-operator", "Set staking contract as operator on cUSDT")
  .addOptionalParam("until", "Unix timestamp until operator is valid", "4102444800")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments } = hre;
    const cusdt = await deployments.get("ConfidentialUSDT");
    const staking = await deployments.get("CUSDTStaking");
    const [signer] = await ethers.getSigners();
    const token = await ethers.getContractAt("ConfidentialUSDT", cusdt.address);
    const until = BigInt(args.until);
    const tx = await token.connect(signer).setOperator(staking.address, Number(until));
    console.log(`setOperator tx: ${tx.hash}`);
    await tx.wait();
  });

task("stake:stake", "Stake cUSDT to staking contract")
  .addParam("value", "Amount in micro-units (decimals=6)")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const cusdt = await deployments.get("ConfidentialUSDT");
    const staking = await deployments.get("CUSDTStaking");
    const [signer] = await ethers.getSigners();
    const stakingContract = await ethers.getContractAt("CUSDTStaking", staking.address);

    // Important: stake uses token.confidentialTransferFrom which validates the input in the token contract
    const encrypted = await fhevm
      .createEncryptedInput(cusdt.address, signer.address)
      .add64(BigInt(args.value))
      .encrypt();

    const tx = await stakingContract
      .connect(signer)
      .stake(encrypted.handles[0], encrypted.inputProof);
    console.log(`stake tx: ${tx.hash}`);
    await tx.wait();
  });

task("stake:withdraw", "Withdraw cUSDT from staking contract")
  .addParam("value", "Amount in micro-units (decimals=6)")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();
    const staking = await deployments.get("CUSDTStaking");
    const [signer] = await ethers.getSigners();
    const stakingContract = await ethers.getContractAt("CUSDTStaking", staking.address);

    // Important: withdraw validates input in the staking contract
    const encrypted = await fhevm
      .createEncryptedInput(staking.address, signer.address)
      .add64(BigInt(args.value))
      .encrypt();

    const tx = await stakingContract
      .connect(signer)
      .withdraw(encrypted.handles[0], encrypted.inputProof);
    console.log(`withdraw tx: ${tx.hash}`);
    await tx.wait();
  });

