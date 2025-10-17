import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as dotenv from "dotenv";
dotenv.config();

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedFHECounter = await deploy("FHECounter", {
    from: deployer,
    log: true,
  });

  console.log(`FHECounter contract: `, deployedFHECounter.address);

  // Deploy ConfidentialUSDT (cUSDT)
  const deployedCUSDT = await deploy("ConfidentialUSDT", {
    from: deployer,
    log: true,
  });
  console.log(`ConfidentialUSDT (cUSDT) contract: `, deployedCUSDT.address);

  // Deploy CUSDTStaking with token address
  const deployedStaking = await deploy("CUSDTStaking", {
    from: deployer,
    args: [deployedCUSDT.address],
    log: true,
  });
  console.log(`CUSDTStaking contract: `, deployedStaking.address);
};
export default func;
func.id = "deploy_all"; // id required to prevent reexecution
func.tags = ["FHECounter", "ConfidentialUSDT", "CUSDTStaking"];
