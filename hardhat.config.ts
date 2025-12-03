import { HardhatUserConfig } from "hardhat/config"
import "@nomicfoundation/hardhat-toolbox"
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            {
                version: "0.8.20",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200
                    }
                }
            }
        ]
    },
    // Network config: add BSC Testnet (chainId 97)
    networks: {
        bsctestnet: {
            // Public BSC Testnet RPC, replace with your node if needed
            url: process.env.BSC_TESTNET_RPC_URL || "https://bsc-testnet-dataseed.bnbchain.org",
            chainId: 97,
            // Use private key from .env for deployment (0x prefix optional)
            accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
            // Recommend fixed gasPrice to avoid low‑gas failures
            gasPrice: Number(process.env.BSC_TESTNET_GAS_PRICE || 6_000_000_000),//10 Gwei
        },
    },
    namedAccounts: {
        deployer: {
            // By default, it will take the first Hardhat account as the deployer
            default: 0,
        },
    },
    // Disable Sourcify verification hints (set true to enable)
    sourcify: {
        enabled: false,
    },
    // Block explorer verification (Etherscan v2 single key)
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY || process.env.BSCSCAN_API_KEY || "",
    },
}

export default config
