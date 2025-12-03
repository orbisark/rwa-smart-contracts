import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

/**
 * Deployment flow: deploy Factory, Weth, Router in order, then pass
 * Router address and project owner as constructor args to OARWA
 *
 * @param hre Hardhat runtime environment
 */
const deploySe2Token: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  /*
    Local: use default Hardhat accounts with sufficient balance
    Production: deployer must have enough balance for gas
    Use `yarn account` to check balances per network
  */
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const isLocal = ["hardhat", "localhost"].includes(hre.network.name);
  const waitConfirmations = isLocal ? 1 : 5;

  console.log("Deployer OARWA address:", deployer);

  const bal = await hre.ethers.provider.getBalance(deployer);
  console.log("Balance:", bal / 1000000000000000000n);

  // Deploy Factory (feeToSetter set to deployer)
  const factoryDeployment = await deploy("Factory", {
    from: deployer,
    args: [deployer],
    log: true,
    autoMine: true,
    waitConfirmations,
  });
  console.log("Factory:", factoryDeployment.address);

  // Deploy Weth (no constructor args)
  const wethDeployment = await deploy("Weth", {
    from: deployer,
    log: true,
    autoMine: true,
    waitConfirmations,
  });
  console.log("WETH:", wethDeployment.address);

  // Deploy Router (args: factory address, WETH address)
  const routerDeployment = await deploy("Router", {
    from: deployer,
    args: [factoryDeployment.address, wethDeployment.address],
    log: true,
    autoMine: true,
    waitConfirmations,
  });
  console.log("Router:", routerDeployment.address);

  // Deploy OARWA (args: project owner, Router address)
  console.log("Deploy Dramas...", [deployer, routerDeployment.address]);
  await deploy("Dramas", {
    from: deployer,
    args: [[deployer, routerDeployment.address]],
    log: true,
    autoMine: true,
    waitConfirmations,
  });

  let usdtAdrr = "0x5dB4cd3346864Bdf706724460c5EaC21A08EC531"
  const rwa = await hre.ethers.getContract("Dramas");

  const ownerSigner = await hre.ethers.getSigner(deployer)
  const tx = await rwa.connect(ownerSigner).setPaymentToken(usdtAdrr)
  await tx.wait(waitConfirmations)

  console.log("Get Payment Token:", await rwa.paymentToken());


  const newBal = await hre.ethers.provider.getBalance(deployer);
  console.log("NewBalance:", newBal);
};

// export default deploySe2Token;

// Tag to selectively run this deploy script, e.g.: yarn deploy --tags RWAToken
// deploySe2Token.tags = ["RWATokenALL"];

/**
 * Deployment flow: deploy Factory, Weth, Router in order, then pass
 * Router address and project owner as constructor args to OARWA
 *
 * @param hre Hardhat runtime environment
 */
const deployRWAToken: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  /*
    Local: use default Hardhat accounts with sufficient balance
    Production: deployer must have enough balance for gas
    Use `yarn account` to check balances per network
  */
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;
  const isLocal = ["hardhat", "localhost"].includes(hre.network.name);
  const waitConfirmations = isLocal ? 1 : 2;

  console.log("Deployer Dramas address:", deployer);

  let routerAddress = "0x6A24807CDBc70B728894E01150Ea25F8e1973717"

  console.log("Deploy Dramas...", [deployer, routerAddress]);

  await deploy("Dramas", {
    from: deployer,
    args: [[deployer, routerAddress]],
    log: true,
    autoMine: true,
    skipIfAlreadyDeployed: false,
    waitConfirmations,
  });

  //  let usdtAdrr = "0x5dB4cd3346864Bdf706724460c5EaC21A08EC531"
  // const rwa = await hre.ethers.getContract("Dramas");

  //  const ownerSigner = await hre.ethers.getSigner(deployer)
  // const tx = await rwa.connect(ownerSigner).setPaymentToken(usdtAdrr)
  // await tx.wait(waitConfirmations)

  const newBal = await hre.ethers.provider.getBalance(deployer);
  console.log("NewBalance:", newBal);


  // Deploy OARWA (constructor args: project owner address, Router address)
  // console.log("Deploy MockUSDT...", []);
  // await deploy("MockUSDT", {
  //   from: deployer,
  //   log: true,
  //   autoMine: true,
  // });

};

export default deployRWAToken;

// Tag to selectively run this deploy script, e.g.: yarn deploy --tags RWAToken
// deployRWAToken.tags = ["OARWA"]; 
// Tag to selectively run this deploy script, e.g.: yarn deploy --tags RWAToken
deployRWAToken.tags = ["Dramas"];

// deploying "MockUSDT" (tx: 0xf114a2c57a86dd872b31f76dee9634d8d5f7e02ac3328e3aa4db89a44113177b)...: deployed at 0x5dB4cd3346864Bdf706724460c5EaC21A08EC531 with 558312 gas
