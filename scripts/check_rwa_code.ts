import { ethers } from "hardhat";

//
// deploying "Dramas" (tx: 0x7ad3346d4666b0a5ebcf66ea9a692125fd619c285ea553e66d324f3f8a92fafe)...: deployed at 0xB665448E13fa35c054d2d50f1a8D61f3b59dEd49 with 1798687 gas
// NewBalance: 62032016000000000n
async function main() {
    // Read target address to inspect
    // const addr = process.env.OARWA_ADDRESS;
    const addr = "0x1D3996576fE78fD7a5201007a8e65de7741748Ce";
    if (!addr) throw new Error("ADDRESS env is required");

    // Get network and contract bytecode info
    const net = await ethers.provider.getNetwork();
    const currentBlock = await ethers.provider.getBlockNumber();
    const code = await ethers.provider.getCode(addr);
    const hasBytecode = code !== "0x";
    const codeHash = hasBytecode ? ethers.keccak256(code) : undefined;

    console.log("network:", net.chainId, net.name);
    console.log("address:", addr);
    console.log("currentBlock:", currentBlock);
    console.log("hasBytecode:", hasBytecode);
    console.log("bytecodeLength:", code.length);
    console.log("bytecodeKeccak256:", codeHash);

    // Optional: check deployment tx confirmations (needs TX_HASH env)
    const txHash = process.env.TX_HASH;
    if (txHash) {
        const receipt = await ethers.provider.getTransactionReceipt(txHash);
        if (receipt) {
            const confirmations = currentBlock - (receipt.blockNumber ?? currentBlock);
            console.log("txHash:", txHash);
            console.log("txBlock:", receipt.blockNumber);
            console.log("confirmations:", confirmations);
            console.log("txStatus:", receipt.status);
            console.log("contractAddress:", receipt.contractAddress);
        } else {
            console.log("txHash:", txHash);
            console.log("receipt:", "notFound");
        }
    }

    // Optional: read on-chain state to confirm OARWA contract shape
    if (hasBytecode) {
        const abi = [
            "function name() view returns (string)",
            "function decimals() view returns (uint8)",
            "function mintStartTime() view returns (uint256)",
            "function participants() view returns (uint32)",
            "function minUsdtAmount() view returns (uint32)",
            "function router() view returns (address)",
            "function projectOwner() view returns (address)",
        ];
        try {
            const c = new ethers.Contract(addr, abi, ethers.provider);
            const name: string = await c.name();
            const decimals: number = await c.decimals();
            const mintStartTime: number = await c.mintStartTime();
            const participants: number = await c.participants();
            console.log("isOARWA:", true);
            console.log("decimals:", decimals);
            console.log("name:", name);
            console.log("mintStartTime:", mintStartTime);
            console.log("participants:", participants);
            const minUsdtAmount: number = await c.minUsdtAmount();
            console.log("minUsdtAmount:", minUsdtAmount);

            const projectOwner: string = await c.projectOwner();
            console.log("projectOwner:", projectOwner);
            const router: string = await c.router();
            console.log("router:", router);
            console.log(
                "constructorArgs:",
                JSON.stringify([projectOwner, router])
            );

        } catch {
            console.log("isOARWA:", false);
        }
    }
}
//OARWA_ADDRESS=0x87b09df5606aeFf3f722f67aD20a70dcbF32b5B6 pnpm hardhat run --network bsctestnet scripts/check_code.ts

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
