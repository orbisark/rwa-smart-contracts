import { ethers } from "hardhat";

async function main() {
  // Read contract address from env
  // 

  // 0x30b2cf8bbef53b8b03531e3228590e3d58e8bc92
  // USER_ADDRESS=0x30b2cf8bbef53b8b03531e3228590e3d58e8bc92 pnpm hardhat run --network bsctestnet scripts/mint_usdt.ts

  const usdtAddr = "0x5dB4cd3346864Bdf706724460c5EaC21A08EC531"
  const toUserAddr = process.env.USER_ADDRESS;
  if (!toUserAddr) {
    throw new Error("USDT_ADDRESS env is required");
  }

  // Minimal ABI: read on-chain state
  const abi = [
    "function mint(address to, uint256 amount)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function allowance(address owner, address spender) view returns (uint256)",
  ];

  const [signer, deployer] = await ethers.getSigners();

  console.log("signer:", signer.address);
  // console.log("deployer:", deployer.address);

   

  const c = new ethers.Contract(usdtAddr, abi, signer);



  const balance: bigint = await c.balanceOf(toUserAddr);
  console.log("balance:", balance.toString());

  const totalSupply: bigint = await c.totalSupply();
  console.log("totalSupply:", totalSupply.toString());

  const tx = await c.mint(toUserAddr, 60000_000_000);
  await tx.wait();

  const newTotalSupply: bigint = await c.totalSupply();
  console.log("newTotalSupply:", newTotalSupply.toString());
  const balanceNew: bigint = await c.balanceOf(toUserAddr);
  console.log("balanceNew:", balanceNew.toString());

  const spender = "0x1D3996576fE78fD7a5201007a8e65de7741748Ce";
  if (!spender) {
    throw new Error("SPENDER_ADDRESS env is required");
  }
  const allow: bigint = await c.allowance(toUserAddr, spender);
  console.log("allowance:", allow.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
