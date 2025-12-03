/**
 * RWA (Real World Asset) smart contract tests
 *
 * This suite covers the RWA token contract across modules:
 * 1) Deployment – initialization and parameters
 * 2) Withdraw – owner withdrawals across scenarios
 * 3) Trading – enable/disable access control
 * 4) Supply – total supply correctness
 * 5) Metadata – name, symbol, basics
 * 6) Router – DEX router update behavior
 * 7) Exemptions – trading restriction exemptions
 * 8) Ownership – transfer and renounce flows
 * 9) Balance – account balance checks
 * 10) Transfers – scenarios and restrictions
 * 11) Allowance – approvals and transferFrom
 *
 * Tested on Hardhat with scenarios for:
 * - Before/after trading enablement
 * - Restricted vs non‑restricted addresses
 * - Contract vs project owner permissions
 * - Exceptional and edge conditions
 */

import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { parseEther } from "viem"
import { expect } from "chai"
import { ethers } from "hardhat"

// RWA test suite
describe("RWA", function () {

    /**
     * Helper to deploy RWA and infra for tests
     * @returns Deployed contracts and test accounts
     */
    async function deployRwa() {
        // Get current block timestamp for time‑based tests
        const deployTime = BigInt(await time.latest())
        
        // Get test accounts: owner (deployer) and otherAccount
        const [owner, otherAccount] = await ethers.getSigners()
    
        // Get factories for infra
        const Weth = await ethers.getContractFactory("Weth")      // WETH token
        const Factory = await ethers.getContractFactory("Factory") // Uniswap‑style factory
        const Router = await ethers.getContractFactory("Router")   // Uniswap‑style router
        const RWA = await ethers.getContractFactory("Dramas")     // RWA token
        
        // Deploy infra
        const weth = await Weth.deploy()
        const weth1 = await Weth.deploy() // for multi‑router tests
        const factory = await Factory.deploy(owner.address)
        
        // Deploy multiple routers for update tests
        const router = await Router.deploy(factory.getAddress(), weth.getAddress())
        const router1 = await Router.deploy(factory.getAddress(), weth1.getAddress())
        const router2 = await Router.deploy(factory.getAddress(), weth.getAddress())
        
        // Deploy RWA instances for ownership variants
        // rwa: owner is contract owner and project owner
        const rwa = await RWA.deploy([owner.getAddress(), router.getAddress()])
        // rwa2: otherAccount is project owner, owner is contract owner
        const rwa2 = await RWA.deploy([otherAccount.getAddress(), router.getAddress()])
        
        return {
            rwa,        // RWA instance (owner is projectOwner)
            rwa2,       // RWA instance (otherAccount is projectOwner)
            router,     // primary router
            router1,    // test router 1
            router2,    // test router 2
            owner,      // primary account (deployer)
            deployTime, // deployment timestamp
            otherAccount, // other test account
        }
    }

    // Deployment – verify initial state after deployment
    describe("Deployment", function () {
        // Should set the right contract owner
        it("Should set the right owner", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)

            expect(await rwa.owner()).to.equal(owner.address)
        })

        // Case: deployer is the projectOwner
        it("If deployer is the projectOwner", async function () {
            const { rwa } = await loadFixture(deployRwa)

            expect(await rwa.owner()).to.equal(await rwa.projectOwner())
        })

        // Case: deployer is not the projectOwner
        it("If deployer is not the projectOwner", async function () {
            const { rwa2 } = await loadFixture(deployRwa)

            expect(await rwa2.owner()).to.not.equal(await rwa2.projectOwner())
        })

        // Trade should be disabled on deployment
        it("Should deploy with trade disabled", async function () {
            const { rwa } = await loadFixture(deployRwa)

            expect(await rwa.tradeEnabled()).to.equal(false)
        })

        // ProjectOwner exempted from restriction by default
        it("Should deploy with transaction restriction exempted for projectOwner", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)
            const adr = owner.address
            
            expect(await rwa.isExemptRestriction(adr)).to.equal(true)
        })

        // Router contract exempted from restriction by default
        it("Should deploy with transaction restriction exempted for the router contract", async function () {
            const { rwa } = await loadFixture(deployRwa)
            const adr = await rwa.router()
            
            expect(await rwa.isExemptRestriction(adr)).to.equal(true)
        })

        // Contract owner exempted if not projectOwner
        it("Should deploy with transaction restriction exempted for contract owner if contract owner is not projectOwner", async function () {
            const { rwa2, otherAccount } = await loadFixture(deployRwa)
            const adr = otherAccount.address
            
            expect(await rwa2.isExemptRestriction(adr)).to.equal(true)
        })

        // Mint 1 Billion tokens to deployer on deployment
        it("Should mint 1 Billion token to deployer", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)
            const adr = owner.address
            
            expect(await rwa.balanceOf(adr)).to.equal(parseEther("1000000000"))
        })

        // Total supply equals deployer balance
        it("Total supply should be exactly the amount minted to the deployer", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)
            const adr = owner.address
            
            expect(await rwa.totalSupply()).to.equal(await rwa.balanceOf(adr))
        })

        // Router address is not address(0) after deployment
        it("Router is not address(0) after deployment", async function () {
            const { rwa } = await loadFixture(deployRwa)
            
            expect(await rwa.router()).to.not.equal("0x0000000000000000000000000000000000000000")
        })

        // Pair address is not address(0) after deployment
        it("Pair is not address(0) after deployment", async function () {
            const { rwa } = await loadFixture(deployRwa)
            
            expect(await rwa.pair()).to.not.equal("0x0000000000000000000000000000000000000000")
        })

        // Deploy time is set upon deployment
        it("Deploy time is set upon deployment", async function () {
            const { rwa } = await loadFixture(deployRwa)
            
            expect(await rwa.deployTime()).to.not.equal(0)
        })

        // Pair is added to LP pair list
        it("Pair has been added to pair LP list", async function () {
            const { rwa } = await loadFixture(deployRwa)
            const pair = await rwa.pair()

            expect(await rwa.isPairLP(pair)).to.equal(true)
        })

        // Should fail if projectOwner is address(0)
        it("Should fail if the projectOwner is address(0)", async function () {
            const { router } = await loadFixture(deployRwa)

            const Rwa = await ethers.getContractFactory("Rwa")
            await expect(Rwa.deploy(["0x0000000000000000000000000000000000000000", router.getAddress()])).to.be.revertedWithCustomError(
                Rwa, "InvalidAddress"
            )
        })

        // Should fail if projectOwner is address(0xdead)
        it("Should fail if the projectOwner is address(0xdead)", async function () {
            const { router } = await loadFixture(deployRwa)

            const Rwa = await ethers.getContractFactory("Rwa")
            await expect(Rwa.deploy(["0x000000000000000000000000000000000000dEaD", router.getAddress()])).to.be.revertedWithCustomError(
                Rwa, "InvalidAddress"
            )
        })
    })

    // Withdraw – owner token withdrawal scenarios
    describe("Withdraw", function () {
        // When contract not yet renounced
        describe("When contract not yet renounced", function () {
            // When not initiated by projectOwner
            describe("When not initiated by projectOwner", function () {
                // Withdraw the whole balance to projectOwner
                describe("Withdraw the whole balance to projectOwner", function () {
                    // For Native Token balance
                    describe("For Native Token balance", function () {
                        // Contract has Native Token
                        it("Contract has Native Token", async function () {
                            const { rwa2 } = await loadFixture(deployRwa)

                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa2.getAddress(), parseEther("10"))

                            expect(await rwa2.balanceOf(rwa2.getAddress())).to.equal(parseEther("10"))
                        })

                        // All Native Token withdrawn from contract
                        it("All Native Token withdrawn from contract", async function () {
                            const { rwa2 } = await loadFixture(deployRwa)

                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa2.getAddress(), parseEther("10"))

                            await rwa2.wTokens(rwa2.getAddress(), 0)

                            expect(await rwa2.balanceOf(rwa2.getAddress())).to.equal(0)
                        })

                        // All Native Token withdrawn received by projectOwner
                        it("All Native Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa2 } = await loadFixture(deployRwa)

                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa2.getAddress(), parseEther("10"))
                            const projectOwner = await rwa2.projectOwner()
                            const initialBalance = await rwa2.balanceOf(projectOwner)

                            await rwa2.wTokens(rwa2.getAddress(), 0)

                            expect(await rwa2.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("10"))
                        })
                    })

                    describe("For Other Token balance", function () {
                        it("Contract has Other Token", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("10"))

                            expect(await rwa.balanceOf(rwa2.getAddress())).to.equal(parseEther("10"))
                        })

                        it("All Other Token withdrawn from contract", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("10"))

                            await rwa2.wTokens(rwa.getAddress(), 0)

                            expect(await rwa.balanceOf(rwa2.getAddress())).to.equal(0)
                        })

                        it("All Other Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("10"))
                            const projectOwner = await rwa2.projectOwner()
                            const initialBalance = await rwa.balanceOf(projectOwner)

                            await rwa2.wTokens(rwa.getAddress(), 0)

                            expect(await rwa.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("10"))
                        })
                    })
                })

                describe("Withdraw only specific balance to projectOwner", function () {
                    describe("For Native Token balance", function () {
                        it("Contract has Native Token", async function () {
                            const { rwa2 } = await loadFixture(deployRwa)

                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa2.getAddress(), parseEther("10"))

                            expect(await rwa2.balanceOf(rwa2.getAddress())).to.equal(parseEther("10"))
                        })

                        it("5 Native Token withdrawn from contract", async function () {
                            const { rwa2 } = await loadFixture(deployRwa)

                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa2.getAddress(), parseEther("10"))

                            await rwa2.wTokens(rwa2.getAddress(), parseEther("5"))

                            expect(await rwa2.balanceOf(rwa2.getAddress())).to.equal(parseEther("5"))
                        })

                        it("5 Native Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa2 } = await loadFixture(deployRwa)

                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa2.getAddress(), parseEther("10"))
                            const projectOwner = await rwa2.projectOwner()
                            const initialBalance = await rwa2.balanceOf(projectOwner)

                            await rwa2.wTokens(rwa2.getAddress(), parseEther("5"))

                            expect(await rwa2.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("5"))
                        })

                        it("Should fail if insufficient balance", async function () {
                            const { rwa2 } = await loadFixture(deployRwa)

                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa2.getAddress(), parseEther("10"))

                            await expect(
                                rwa2.wTokens(rwa2.getAddress(), parseEther("50"))
                            ).to.be.revertedWithCustomError(
                                rwa2, "ERC20InsufficientBalance"
                            )
                        })
                    })

                    describe("For Other Token balance", function () {
                        it("Contract has Other Token", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("10"))

                            expect(await rwa.balanceOf(rwa2.getAddress())).to.equal(parseEther("10"))
                        })

                        it("All Other Token withdrawn from contract", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("10"))

                            await rwa2.wTokens(rwa.getAddress(), parseEther("5"))

                            expect(await rwa.balanceOf(rwa2.getAddress())).to.equal(parseEther("5"))
                        })

                        it("All Other Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("10"))
                            const projectOwner = await rwa2.projectOwner()
                            const initialBalance = await rwa.balanceOf(projectOwner)

                            await rwa2.wTokens(rwa.getAddress(), parseEther("5"))

                            expect(await rwa.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("5"))
                        })

                        it("Should fail if insufficient balance", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("0.1"))

                            await expect(
                                rwa2.wTokens(rwa.getAddress(), parseEther("0.5"))
                            ).to.be.revertedWithCustomError(
                                rwa2, "ERC20InsufficientBalance"
                            )
                        })
                    })
                })
            })

            describe("When initiated by projectOwner", function () {
                describe("Withdraw the whole balance to projectOwner", function () {
                    describe("For Native Token balance", function () {
                        it("Contract has Native Token", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))

                            expect(await rwa.balanceOf(rwa.getAddress())).to.equal(parseEther("10"))
                        })

                        it("All Native Token withdrawn from contract", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))

                            await rwa.wTokens(rwa.getAddress(), 0)

                            expect(await rwa.balanceOf(rwa.getAddress())).to.equal(0)
                        })

                        it("All Native Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))
                            const projectOwner = await rwa.projectOwner()
                            const initialBalance = await rwa.balanceOf(projectOwner)

                            await rwa.wTokens(rwa.getAddress(), 0)

                            expect(await rwa.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("10"))
                        })

                        it("Should fail if insufficient balance", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))

                            await expect(
                                rwa.wTokens(rwa.getAddress(), parseEther("50"))
                            ).to.be.revertedWithCustomError(
                                rwa, "ERC20InsufficientBalance"
                            )
                        })
                    })

                    describe("For Other Token balance", function () {
                        it("Contract has Other Token", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa.getAddress(), parseEther("10"))

                            expect(await rwa2.balanceOf(rwa.getAddress())).to.equal(parseEther("10"))
                        })

                        it("All Other Token withdrawn from contract", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa.getAddress(), parseEther("10"))

                            await rwa.wTokens(rwa2.getAddress(), 0)

                            expect(await rwa2.balanceOf(rwa.getAddress())).to.equal(0)
                        })

                        it("All Other Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa.getAddress(), parseEther("10"))
                            const projectOwner = await rwa.projectOwner()
                            const initialBalance = await rwa2.balanceOf(projectOwner)

                            await rwa.wTokens(rwa2.getAddress(), 0)

                            expect(await rwa2.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("10"))
                        })

                        it("Should fail if insufficient balance", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa.getAddress(), parseEther("0.1"))

                            await expect(
                                rwa.wTokens(rwa2.getAddress(), parseEther("0.5"))
                            ).to.be.revertedWithCustomError(
                                rwa, "ERC20InsufficientBalance"
                            )
                        })
                    })
                })

                describe("Withdraw only specific balance to projectOwner", function () {
                    describe("For Native Token balance", function () {
                        it("Contract has Native Token", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))

                            expect(await rwa.balanceOf(rwa.getAddress())).to.equal(parseEther("10"))
                        })

                        it("5 Native Token withdrawn from contract", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))

                            await rwa.wTokens(rwa.getAddress(), parseEther("5"))

                            expect(await rwa.balanceOf(rwa.getAddress())).to.equal(parseEther("5"))
                        })

                        it("5 Native Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))
                            const projectOwner = await rwa.projectOwner()
                            const initialBalance = await rwa.balanceOf(projectOwner)

                            await rwa.wTokens(rwa.getAddress(), parseEther("5"))

                            expect(await rwa.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("5"))
                        })

                        it("Should fail if insufficient balance", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))

                            await expect(
                                rwa.wTokens(rwa.getAddress(), parseEther("50"))
                            ).to.be.revertedWithCustomError(
                                rwa, "ERC20InsufficientBalance"
                            )
                        })
                    })

                    describe("For Other Token balance", function () {
                        it("Contract has Other Token", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa.getAddress(), parseEther("10"))

                            expect(await rwa2.balanceOf(rwa.getAddress())).to.equal(parseEther("10"))
                        })

                        it("All Other Token withdrawn from contract", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa.getAddress(), parseEther("10"))

                            await rwa.wTokens(rwa2.getAddress(), parseEther("5"))

                            expect(await rwa2.balanceOf(rwa.getAddress())).to.equal(parseEther("5"))
                        })

                        it("All Other Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa.getAddress(), parseEther("10"))
                            const projectOwner = await rwa.projectOwner()
                            const initialBalance = await rwa2.balanceOf(projectOwner)

                            await rwa.wTokens(rwa2.getAddress(), parseEther("5"))

                            expect(await rwa2.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("5"))
                        })

                        it("Should fail if insufficient balance", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("0.1"))

                            await expect(
                                rwa2.wTokens(rwa.getAddress(), parseEther("0.5"))
                            ).to.be.revertedWithCustomError(
                                rwa, "ERC20InsufficientBalance"
                            )
                        })
                    })
                })
            })
        })

        describe("When contract has been renounced", function () {
            describe("When not initiated by projectOwner", function () {
                describe("Withdraw the whole balance to projectOwner", function () {
                    describe("For Native Token balance", function () {
                        it("Contract has Native Token", async function () {
                            const { rwa2 } = await loadFixture(deployRwa)

                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa2.getAddress(), parseEther("10"))

                            expect(await rwa2.balanceOf(rwa2.getAddress())).to.equal(parseEther("10"))
                        })

                        it("All Native Token withdrawn from contract", async function () {
                            const { rwa2 } = await loadFixture(deployRwa)

                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa2.getAddress(), parseEther("10"))

                            await rwa2.renounceOwnership()
                            await rwa2.wTokens(rwa2.getAddress(), 0)

                            expect(await rwa2.balanceOf(rwa2.getAddress())).to.equal(0)
                        })

                        it("All Native Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa2 } = await loadFixture(deployRwa)

                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa2.getAddress(), parseEther("10"))
                            const projectOwner = await rwa2.projectOwner()
                            const initialBalance = await rwa2.balanceOf(projectOwner)

                            await rwa2.renounceOwnership()
                            await rwa2.wTokens(rwa2.getAddress(), 0)

                            expect(await rwa2.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("10"))
                        })
                    })

                    describe("For Other Token balance", function () {
                        it("Contract has Other Token", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("10"))

                            expect(await rwa.balanceOf(rwa2.getAddress())).to.equal(parseEther("10"))
                        })

                        it("All Other Token withdrawn from contract", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("10"))

                            await rwa2.renounceOwnership()
                            await rwa2.wTokens(rwa.getAddress(), 0)

                            expect(await rwa.balanceOf(rwa2.getAddress())).to.equal(0)
                        })

                        it("All Other Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("10"))
                            const projectOwner = await rwa2.projectOwner()
                            const initialBalance = await rwa.balanceOf(projectOwner)

                            await rwa2.renounceOwnership()
                            await rwa2.wTokens(rwa.getAddress(), 0)

                            expect(await rwa.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("10"))
                        })
                    })
                })

                describe("Withdraw only specific balance to projectOwner", function () {
                    describe("For Native Token balance", function () {
                        it("Contract has Native Token", async function () {
                            const { rwa2 } = await loadFixture(deployRwa)

                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa2.getAddress(), parseEther("10"))

                            expect(await rwa2.balanceOf(rwa2.getAddress())).to.equal(parseEther("10"))
                        })

                        it("5 Native Token withdrawn from contract", async function () {
                            const { rwa2 } = await loadFixture(deployRwa)

                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa2.getAddress(), parseEther("10"))

                            await rwa2.renounceOwnership()
                            await rwa2.wTokens(rwa2.getAddress(), parseEther("5"))

                            expect(await rwa2.balanceOf(rwa2.getAddress())).to.equal(parseEther("5"))
                        })

                        it("5 Native Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa2 } = await loadFixture(deployRwa)

                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa2.getAddress(), parseEther("10"))
                            const projectOwner = await rwa2.projectOwner()
                            const initialBalance = await rwa2.balanceOf(projectOwner)

                            await rwa2.renounceOwnership()
                            await rwa2.wTokens(rwa2.getAddress(), parseEther("5"))

                            expect(await rwa2.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("5"))
                        })

                        it("Should fail if insufficient balance", async function () {
                            const { rwa2 } = await loadFixture(deployRwa)

                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa2.getAddress(), parseEther("10"))
                            await rwa2.renounceOwnership()

                            await expect(
                                rwa2.wTokens(rwa2.getAddress(), parseEther("50"))
                            ).to.be.revertedWithCustomError(
                                rwa2, "ERC20InsufficientBalance"
                            )
                        })
                    })

                    describe("For Other Token balance", function () {
                        it("Contract has Other Token", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("10"))

                            expect(await rwa.balanceOf(rwa2.getAddress())).to.equal(parseEther("10"))
                        })

                        it("All Other Token withdrawn from contract", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("10"))

                            await rwa2.renounceOwnership()
                            await rwa2.wTokens(rwa.getAddress(), parseEther("5"))

                            expect(await rwa.balanceOf(rwa2.getAddress())).to.equal(parseEther("5"))
                        })

                        it("All Other Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("10"))
                            const projectOwner = await rwa2.projectOwner()
                            const initialBalance = await rwa.balanceOf(projectOwner)

                            await rwa2.renounceOwnership()
                            await rwa2.wTokens(rwa.getAddress(), parseEther("5"))

                            expect(await rwa.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("5"))
                        })

                        it("Should fail if insufficient balance", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("0.1"))
                            await rwa2.renounceOwnership()

                            await expect(
                                rwa2.wTokens(rwa.getAddress(), parseEther("0.5"))
                            ).to.be.revertedWithCustomError(
                                rwa2, "ERC20InsufficientBalance"
                            )
                        })
                    })
                })
            })

            describe("When initiated by projectOwner", function () {
                describe("Withdraw the whole balance to projectOwner", function () {
                    describe("For Native Token balance", function () {
                        it("Contract has Native Token", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))

                            expect(await rwa.balanceOf(rwa.getAddress())).to.equal(parseEther("10"))
                        })

                        it("All Native Token withdrawn from contract", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))

                            await rwa.renounceOwnership()
                            await rwa.wTokens(rwa.getAddress(), 0)

                            expect(await rwa.balanceOf(rwa.getAddress())).to.equal(0)
                        })

                        it("All Native Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))
                            const projectOwner = await rwa.projectOwner()
                            const initialBalance = await rwa.balanceOf(projectOwner)

                            await rwa.renounceOwnership()
                            await rwa.wTokens(rwa.getAddress(), 0)

                            expect(await rwa.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("10"))
                        })

                        it("Should fail if insufficient balance", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))
                            await rwa.renounceOwnership()

                            await expect(
                                rwa.wTokens(rwa.getAddress(), parseEther("50"))
                            ).to.be.revertedWithCustomError(
                                rwa, "ERC20InsufficientBalance"
                            )
                        })
                    })

                    describe("For Other Token balance", function () {
                        it("Contract has Other Token", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa.getAddress(), parseEther("10"))

                            expect(await rwa2.balanceOf(rwa.getAddress())).to.equal(parseEther("10"))
                        })

                        it("All Other Token withdrawn from contract", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa.getAddress(), parseEther("10"))

                            await rwa.renounceOwnership()
                            await rwa.wTokens(rwa2.getAddress(), 0)

                            expect(await rwa2.balanceOf(rwa.getAddress())).to.equal(0)
                        })

                        it("All Other Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa.getAddress(), parseEther("10"))
                            const projectOwner = await rwa.projectOwner()
                            const initialBalance = await rwa2.balanceOf(projectOwner)

                            await rwa.renounceOwnership()
                            await rwa.wTokens(rwa2.getAddress(), 0)

                            expect(await rwa2.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("10"))
                        })

                        it("Should fail if insufficient balance", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa.getAddress(), parseEther("0.1"))
                            await rwa.renounceOwnership()

                            await expect(
                                rwa.wTokens(rwa2.getAddress(), parseEther("0.5"))
                            ).to.be.revertedWithCustomError(
                                rwa, "ERC20InsufficientBalance"
                            )
                        })
                    })
                })

                describe("Withdraw only specific balance to projectOwner", function () {
                    describe("For Native Token balance", function () {
                        it("Contract has Native Token", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))

                            expect(await rwa.balanceOf(rwa.getAddress())).to.equal(parseEther("10"))
                        })

                        it("5 Native Token withdrawn from contract", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))

                            await rwa.renounceOwnership()
                            await rwa.wTokens(rwa.getAddress(), parseEther("5"))

                            expect(await rwa.balanceOf(rwa.getAddress())).to.equal(parseEther("5"))
                        })

                        it("5 Native Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))
                            const projectOwner = await rwa.projectOwner()
                            const initialBalance = await rwa.balanceOf(projectOwner)

                            await rwa.renounceOwnership()
                            await rwa.wTokens(rwa.getAddress(), parseEther("5"))

                            expect(await rwa.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("5"))
                        })

                        it("Should fail if insufficient balance", async function () {
                            const { rwa } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa.transfer(rwa.getAddress(), parseEther("10"))
                            await rwa.renounceOwnership()

                            await expect(
                                rwa.wTokens(rwa.getAddress(), parseEther("50"))
                            ).to.be.revertedWithCustomError(
                                rwa, "ERC20InsufficientBalance"
                            )
                        })
                    })

                    describe("For Other Token balance", function () {
                        it("Contract has Other Token", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa.getAddress(), parseEther("10"))

                            expect(await rwa2.balanceOf(rwa.getAddress())).to.equal(parseEther("10"))
                        })

                        it("All Other Token withdrawn from contract", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa.getAddress(), parseEther("10"))

                            await rwa.renounceOwnership()
                            await rwa.wTokens(rwa2.getAddress(), parseEther("5"))

                            expect(await rwa2.balanceOf(rwa.getAddress())).to.equal(parseEther("5"))
                        })

                        it("All Other Token withdrawn from contract received by projectOwner", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa2.transfer(rwa.getAddress(), parseEther("10"))
                            const projectOwner = await rwa.projectOwner()
                            const initialBalance = await rwa2.balanceOf(projectOwner)

                            await rwa.renounceOwnership()
                            await rwa.wTokens(rwa2.getAddress(), parseEther("5"))

                            expect(await rwa2.balanceOf(projectOwner)).to.equal(BigInt(initialBalance) + parseEther("5"))
                        })

                        it("Should fail if insufficient balance", async function () {
                            const { rwa, rwa2 } = await loadFixture(deployRwa)

                            await rwa.enableTrading()
                            await rwa2.enableTrading()
                            await rwa.transfer(rwa2.getAddress(), parseEther("0.1"))
                            await rwa2.renounceOwnership()

                            await expect(
                                rwa2.wTokens(rwa.getAddress(), parseEther("0.5"))
                            ).to.be.revertedWithCustomError(
                                rwa, "ERC20InsufficientBalance"
                            )
                        })
                    })
                })
            })
        })
    })

    // Enable Trade – enabling token trading scenarios
    describe("Enable Trade", function () {
        // Initiated by contract owner
        describe("When initiated by owner", function () {
            // Should fail when triggered the second time onward
            it("Should fail if triggered the second times onward", async function () {
                const { rwa } = await loadFixture(deployRwa)

                await rwa.enableTrading()

                await expect(
                    rwa.enableTrading()
                ).to.be.revertedWithCustomError(
                    rwa, "TradeAlreadyEnabled"
                )
            })

            // Should enable trade 5 days after deployment
            it("Should enable trade if triggered 5 days after deployment", async function () {
                const { rwa } = await loadFixture(deployRwa)
                const deploy = await rwa.deployTime()

                await time.increaseTo(BigInt(deploy) + BigInt(432000))
                await rwa.enableTrading()

                expect(await rwa.tradeEnabled()).to.equal(true)
            })

            // Should enable trade 16 days after deployment
            it("Should enable trade if triggered 16 days after deployment", async function () {
                const { rwa } = await loadFixture(deployRwa)
                const deploy = await rwa.deployTime()

                await time.increaseTo(BigInt(deploy) + BigInt(1382400))
                await rwa.enableTrading()

                expect(await rwa.tradeEnabled()).to.equal(true)
            })

            it("Should enable trade if triggered 25 days after deployment", async function () {
                const { rwa } = await loadFixture(deployRwa)
                const deploy = await rwa.deployTime()

                await time.increaseTo(BigInt(deploy) + BigInt(2160000))
                await rwa.enableTrading()

                expect(await rwa.tradeEnabled()).to.equal(true)
            })

            it("Should enable trade if triggered 31 days after deployment", async function () {
                const { rwa } = await loadFixture(deployRwa)
                const deploy = await rwa.deployTime()

                await time.increaseTo(BigInt(deploy) + BigInt(2678400))
                await rwa.enableTrading()

                expect(await rwa.tradeEnabled()).to.equal(true)
            })

            it("Should update trade start time", async function () {
                const { rwa } = await loadFixture(deployRwa)
                const deploy = await rwa.deployTime()

                await time.increaseTo(BigInt(deploy) + BigInt(2678400))
                await rwa.enableTrading()
                
                expect(await rwa.tradeStartTime()).to.not.equal(0)
            })

            it("Should emit an event on trade enable", async function () {
                const { rwa } = await loadFixture(deployRwa)
                const deploy = await rwa.deployTime()

                await time.increaseTo(BigInt(deploy) + BigInt(2678400))
                
                await expect(
                    rwa.enableTrading()
                ).to.emit(rwa, "TradeEnabled")
            })
        })

        describe("When not initiated by owner", function () {
            describe("Contract not renounced", function () {
                it("Should fail if triggered the second times onward", async function () {
                    const { rwa, otherAccount } = await loadFixture(deployRwa)
                    
                    await rwa.enableTrading()
                    await rwa.transferOwnership(otherAccount.getAddress())                
                
                    await expect(
                        rwa.enableTrading()
                    ).to.be.revertedWithCustomError(
                        rwa, "TradeAlreadyEnabled"
                    )
                })

                it("Should enable trade if triggered 5 days after deployment", async function () {
                    const { rwa, otherAccount } = await loadFixture(deployRwa)
                    const deploy = await rwa.deployTime()

                    await rwa.transferOwnership(otherAccount.getAddress())
                    await time.increaseTo(BigInt(deploy) + BigInt(432000))

                    await expect(
                        rwa.enableTrading()
                    ).to.be.revertedWithCustomError(
                        rwa, "OwnableUnauthorizedAccount"
                    )
                })

                it("Should enable trade if triggered 16 days after deployment", async function () {
                    const { rwa, otherAccount } = await loadFixture(deployRwa)
                    const deploy = await rwa.deployTime()

                    await rwa.transferOwnership(otherAccount.getAddress())
                    await time.increaseTo(BigInt(deploy) + BigInt(1382400))

                    await expect(
                        rwa.enableTrading()
                    ).to.be.revertedWithCustomError(
                        rwa, "OwnableUnauthorizedAccount"
                    )
                })

                it("Should enable trade if triggered 25 days after deployment", async function () {
                    const { rwa, otherAccount } = await loadFixture(deployRwa)
                    const deploy = await rwa.deployTime()

                    await rwa.transferOwnership(otherAccount.address)
                    await time.increaseTo(BigInt(deploy) + BigInt(2160000))

                    await expect(
                        rwa.enableTrading()
                    ).to.be.revertedWithCustomError(
                        rwa, "OwnableUnauthorizedAccount"
                    )
                })

                it("Should enable trade if triggered 31 days after deployment", async function () {
                    const { rwa, otherAccount } = await loadFixture(deployRwa)
                    const deploy = await rwa.deployTime()

                    await rwa.transferOwnership(otherAccount.address)
                    await time.increaseTo(BigInt(deploy) + BigInt(2678400))
                    await rwa.enableTrading()

                    expect(await rwa.tradeEnabled()).to.equal(true)
                })

                it("Should update trade start time", async function () {
                    const { rwa, otherAccount } = await loadFixture(deployRwa)
                    const deploy = await rwa.deployTime()

                    await rwa.transferOwnership(otherAccount.address)
                    await time.increaseTo(BigInt(deploy) + BigInt(2678400))
                    await rwa.enableTrading()
                
                    expect(await rwa.tradeStartTime()).to.not.equal(0)
                })

                it("Should emit an event on trade enable", async function () {
                    const { rwa, otherAccount } = await loadFixture(deployRwa)
                    const deploy = await rwa.deployTime()

                    await rwa.transferOwnership(otherAccount.address)
                    await time.increaseTo(BigInt(deploy) + BigInt(2678400))
                    
                    await expect(rwa.enableTrading()).to.emit(rwa, "TradeEnabled")

                })
            })

            describe("Contract renounced", function () {
                it("Should fail if triggered the second times onward", async function () {
                    const { rwa } = await loadFixture(deployRwa)
                    
                    await rwa.enableTrading()
                    await rwa.renounceOwnership()
                
                    await expect(
                        rwa.enableTrading()
                    ).to.be.revertedWithCustomError(
                        rwa, "TradeAlreadyEnabled"
                    )
                })

                it("Should enable trade if triggered 5 days after deployment", async function () {
                    const { rwa } = await loadFixture(deployRwa)
                    const deploy = await rwa.deployTime()

                    await rwa.renounceOwnership()
                    await time.increaseTo(BigInt(deploy) + BigInt(432000))

                    await expect(
                        rwa.enableTrading()
                    ).to.be.revertedWithCustomError(
                        rwa, "WaitForCooldownTimer"
                    )
                })

                it("Should enable trade if triggered 16 days after deployment", async function () {
                    const { rwa } = await loadFixture(deployRwa)
                    const deploy = await rwa.deployTime()

                    await rwa.renounceOwnership()
                    await time.increaseTo(BigInt(deploy) + BigInt(1382400))
                    await rwa.enableTrading()

                    expect(await rwa.tradeEnabled()).to.equal(true)
                })

                it("Should enable trade if triggered 25 days after deployment", async function () {
                    const { rwa } = await loadFixture(deployRwa)
                    const deploy = await rwa.deployTime()

                    await rwa.renounceOwnership()
                    await time.increaseTo(BigInt(deploy) + BigInt(2160000))
                    await rwa.enableTrading()

                    expect(await rwa.tradeEnabled()).to.equal(true)
                })

                it("Should enable trade if triggered 31 days after deployment", async function () {
                    const { rwa } = await loadFixture(deployRwa)
                    const deploy = await rwa.deployTime()

                    await rwa.renounceOwnership()
                    await time.increaseTo(BigInt(deploy) + BigInt(2678400))
                    await rwa.enableTrading()

                    expect(await rwa.tradeEnabled()).to.equal(true)
                })

                it("Should update trade start time", async function () {
                    const { rwa } = await loadFixture(deployRwa)
                    const deploy = await rwa.deployTime()

                    await rwa.renounceOwnership()
                    await time.increaseTo(BigInt(deploy) + BigInt(2678400))
                    await rwa.enableTrading()
                    
                    expect(await rwa.tradeStartTime()).to.not.equal(0)
                })

                it("Should emit an event on trade enable", async function () {
                    const { rwa } = await loadFixture(deployRwa)
                    const deploy = await rwa.deployTime()

                    await rwa.renounceOwnership()
                    await time.increaseTo(BigInt(deploy) + BigInt(2678400))
                    
                    await expect(rwa.enableTrading()).to.emit(rwa, "TradeEnabled")
                })
            })
        })
    })

    // Check Supply – total and circulating supply
    describe("Check Supply", function () {
        // Total supply should return 1 Billion tokens
        it("Total supply should return 1 Billion token", async function () {
            const { rwa } = await loadFixture(deployRwa)

            expect(await rwa.totalSupply()).to.equal(parseEther("1000000000"))
        })

        // Circulating supply should ignore balance in address(0xdead)
        it("Circulating supply should ignore balance in address(0xdead)", async function () {
            const { rwa } = await loadFixture(deployRwa)
            const total = await rwa.circulatingSupply()
            await rwa.transfer("0x000000000000000000000000000000000000dEaD", parseEther("10"))

            expect(await rwa.circulatingSupply()).to.equal(BigInt(total) - parseEther("10"))
        })

        // Circulating supply should not ignore balances of other addresses
        it("Circulating supply should not ignore balance in address other than address(0xdead)", async function () {
            const { rwa, otherAccount } = await loadFixture(deployRwa)
            const total = await rwa.circulatingSupply()
            await rwa.transfer(otherAccount.getAddress(), parseEther("10"))

            expect(await rwa.circulatingSupply()).to.equal(BigInt(total))
        })
    })

    // Check Metadata – name, symbol, decimals
    describe("Check Metadata", function () {
        // Token name should be "RWA"
        it("Should return name as RWA", async function () {
            const { rwa } = await loadFixture(deployRwa)

            expect(await rwa.name()).to.equal("Dramas RWA")
        })

        // Token symbol should be "$RWA"
        it("Should return symbol as $RWA", async function () {
            const { rwa } = await loadFixture(deployRwa)

            expect(await rwa.symbol()).to.equal("bDramas")
        })

        it("Should return decimals as 18", async function () {
            const { rwa } = await loadFixture(deployRwa)

            expect(await rwa.decimals()).to.equal(18)
        })
    })

    // Update Router – manage DEX router and pair address
    describe("Update Router", function () {
        // Update router to new router
        it("Should update router to new router", async function () {
            const { rwa, router1 } = await loadFixture(deployRwa)
            const newRouter = await router1.getAddress()
            await rwa.updateRouter(newRouter)

            expect(await rwa.router()).to.equal(newRouter)
        })

        it("Should retain pair address if new pair address is the same", async function () {
            const { rwa, router2 } = await loadFixture(deployRwa)
            const pair = await rwa.pair()
            const newRouter = await router2.getAddress()
            await rwa.updateRouter(newRouter)

            expect(await rwa.pair()).to.equal(pair)
        })
        
        it("Should update pair to new pair if new pair address is different", async function () {
            const { rwa, router1 } = await loadFixture(deployRwa)
            const pair = await rwa.pair()
            const newRouter = await router1.getAddress()
            await rwa.updateRouter(newRouter)

            expect(await rwa.pair()).to.not.equal(pair)
        })
        
        it("Should add new pair to the pair LP list", async function () {
            const { rwa, router1 } = await loadFixture(deployRwa)
            const newRouter = await router1.getAddress()
            await rwa.updateRouter(newRouter)
            const pair = await rwa.pair()

            expect(await rwa.isPairLP(pair)).to.equal(true)
        })

        it("Should emit an event on router update", async function () {
            const { rwa, router1 } = await loadFixture(deployRwa)
            const newRouter = await router1.getAddress()

            await expect(
                rwa.updateRouter(newRouter)
            ).to.emit(
                rwa, "UpdateRouter"
            )
        })

        it("Should fail if the update router is triggered by non-owner account", async function () {
            const { rwa, router1, otherAccount } = await loadFixture(deployRwa)
            const newRouter = await router1.getAddress()

            await expect(
                rwa.connect(otherAccount).updateRouter(newRouter)
            ).to.be.revertedWithCustomError(
                rwa, "OwnableUnauthorizedAccount"
            )
        })

        it("Should fail if the update using current router", async function () {
            const { rwa, router } = await loadFixture(deployRwa)
            const newRouter = await router.getAddress()

            await expect(
                rwa.updateRouter(newRouter)
            ).to.be.revertedWithCustomError(
                rwa, "CannotUseCurrentAddress"
            )
        })

        it("Should fail if the update using non-router contract", async function () {
            const { rwa, rwa2 } = await loadFixture(deployRwa)
            const newRouter = await rwa2.getAddress()

            await expect(
                rwa.updateRouter(newRouter)
            ).to.be.reverted
        })

        it("Should fail if the update using wallet address", async function () {
            const { rwa, otherAccount } = await loadFixture(deployRwa)
            const newRouter = await otherAccount.getAddress()

            await expect(
                rwa.updateRouter(newRouter)
            ).to.be.reverted
        })

        it("Should fail if the update using address(0)", async function () {
            const { rwa } = await loadFixture(deployRwa)
            
            await expect(
                rwa.updateRouter("0x0000000000000000000000000000000000000000")
            ).to.be.reverted
        })

        it("Should fail with rejected reason if the update using address(0)", async function () {
            const { rwa } = await loadFixture(deployRwa)
            
            await expect(
                rwa.updateRouter("0x0000000000000000000000000000000000000000")
            ).to.be.revertedWithCustomError(
                rwa, "InvalidAddress"
            )
        })
    })

    // Exempt Restriction – update trading restriction exemptions
    describe("Exempt Restriction", function () {
        // Update address exempt restriction state to true
        it("Should update address's exempt restriction to new state (true)", async function () {
            const { rwa, otherAccount } = await loadFixture(deployRwa)
            await rwa.updateExemptRestriction(otherAccount.getAddress(), true)

            expect(await rwa.isExemptRestriction(otherAccount.getAddress())).to.equal(true)
        })

        it("Should update address's exempt restriction to new state (false)", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)
            await rwa.updateExemptRestriction(owner.getAddress(), false)

            expect(await rwa.isExemptRestriction(owner.getAddress())).to.equal(false)
        })

        it("Should fail to update address's exempt restriction to new state (true) using non-owner account", async function () {
            const { rwa, otherAccount } = await loadFixture(deployRwa)
            await rwa.transferOwnership(otherAccount.getAddress())
            
            await expect(
                rwa.updateExemptRestriction(otherAccount.getAddress(), true)
            ).to.be.revertedWithCustomError(
                rwa, "OwnableUnauthorizedAccount"
            )
        })

        it("Should fail to update address's exempt restriction to new state (false) using non-owner account", async function () {
            const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
            await rwa.transferOwnership(otherAccount.getAddress())
            
            await expect(
                rwa.updateExemptRestriction(owner.getAddress(), false)
            ).to.be.revertedWithCustomError(
                rwa, "OwnableUnauthorizedAccount"
            )
        })

        it("Should emit an event on exempt restriction", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)

            await expect(
                rwa.updateExemptRestriction(owner.getAddress(), false)
            ).to.emit(
                rwa, "ExemptRestriction"
            )
        })

        it("Should fail if the update using address's current state", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)
            
            await expect(
                rwa.updateExemptRestriction(owner.getAddress(), true)
            ).to.be.revertedWithCustomError(
                rwa, "CannotUseCurrentState"
            )
        })
    })

    // Transfer Ownership – contract and project owner changes
    describe("Transfer Ownership", function () {
        // Update contract owner address to new owner
        it("Should update contract owner address to new owner", async function () {
            const { rwa, otherAccount } = await loadFixture(deployRwa)
            const newOwner = await otherAccount.getAddress()
            await rwa.transferOwnership(newOwner)

            expect(await rwa.owner()).to.equal(newOwner)
        })

        it("Should update project owner address to new owner", async function () {
            const { rwa, otherAccount } = await loadFixture(deployRwa)
            const newOwner = await otherAccount.getAddress()
            await rwa.transferOwnership(newOwner)

            expect(await rwa.projectOwner()).to.equal(newOwner)
        })

        it("Should emit an event on ownership transfer", async function () {
            const { rwa, otherAccount } = await loadFixture(deployRwa)
            const newOwner = await otherAccount.getAddress()

            await expect(
                rwa.transferOwnership(newOwner)
            ).to.emit(
                rwa, "OwnershipTransferred"
            )
        })

        it("Should fail if the update using current contract owner address", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)
            const newOwner = await owner.getAddress()

            await expect(
                rwa.transferOwnership(newOwner)
            ).to.be.revertedWithCustomError(
                rwa, "CannotUseCurrentAddress"
            )
        })

        it("Should fail if the update using address(0)", async function () {
            const { rwa } = await loadFixture(deployRwa)
            
            await expect(
                rwa.transferOwnership("0x0000000000000000000000000000000000000000")
            ).to.be.revertedWithCustomError(
                rwa, "OwnableInvalidOwner"
            )
        })

        it("Should fail if the update using address(0xdead)", async function () {
            const { rwa } = await loadFixture(deployRwa)
            
            await expect(
                rwa.transferOwnership("0x000000000000000000000000000000000000dEaD")
            ).to.be.revertedWithCustomError(
                rwa, "InvalidAddress"
            )
        })

        it("Should fail if not called by contract owner", async function () {
            const { rwa, otherAccount } = await loadFixture(deployRwa)
            const newOwner = await otherAccount.getAddress()

            await expect(
                rwa.connect(otherAccount).transferOwnership(newOwner)
            ).to.be.revertedWithCustomError(
                rwa, "OwnableUnauthorizedAccount"
            )
        })
    })

    // Renounce Ownership – owner relinquishes control
    describe("Renounce Ownership", function () {
        // Owner becomes address(0) after renounce
        it("Should update contract owner address to address(0)", async function () {
            const { rwa } = await loadFixture(deployRwa)
            await rwa.renounceOwnership()

            expect(await rwa.owner()).to.equal("0x0000000000000000000000000000000000000000")
        })

        it("Should retain project owner address", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)
            const newOwner = await owner.getAddress()
            await rwa.renounceOwnership()

            expect(await rwa.projectOwner()).to.equal(newOwner)
        })

        it("Should emit an event on ownership renounce", async function () {
            const { rwa } = await loadFixture(deployRwa)
            
            await expect(
                rwa.renounceOwnership()
            ).to.emit(
                rwa, "OwnershipTransferred"
            )
        })

        it("Should fail if not called by contract owner", async function () {
            const { rwa, otherAccount } = await loadFixture(deployRwa)
            const newOwner = await otherAccount.getAddress()
            await rwa.transferOwnership(newOwner)

            await expect(
                rwa.renounceOwnership()
            ).to.be.revertedWithCustomError(
                rwa, "OwnableUnauthorizedAccount"
            )
        })
    })

    // Check Balance – token balance queries
    describe("Check Balance", function () {
        // Return correct amount when balance exists
        it("Should return correct token amount if there's token balance", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)
            
            expect(await rwa.balanceOf(owner.getAddress())).to.equal(parseEther("1000000000"))
        })

        // Return 0 when there is no balance
        it("Should return 0 if there's no token balance", async function () {
            const { rwa } = await loadFixture(deployRwa)
            
            expect(await rwa.balanceOf(rwa.getAddress())).to.equal(0)
        })
    })

    // Transfer Token – transfer scenarios
    describe("Transfer Token", function () {
        // Before trade enabled
        describe("Before Trade Enabled", function () {
            // Should not fail transferring 0 token
            it("Should not fail when transferring 0 token", async function () {
                const { rwa, otherAccount } = await loadFixture(deployRwa)
                const initial = await rwa.balanceOf(otherAccount.getAddress())
                await rwa.transfer(otherAccount.getAddress(), 0)

                expect(await rwa.balanceOf(otherAccount.getAddress())).to.equal(BigInt(initial))
            })

            it("Should return correct token amount being transferred by non-restricted account to restricted account", async function () {
                const { rwa, otherAccount } = await loadFixture(deployRwa)
                const initial = await rwa.balanceOf(otherAccount.getAddress())
                await rwa.transfer(otherAccount.getAddress(), parseEther("10"))

                expect(await rwa.balanceOf(otherAccount.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
            })

            it("Should return correct token amount being transferred by restricted account to non-restricted account", async function () {
                const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                const initial = await rwa.balanceOf(otherAccount.getAddress())
                await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                await rwa.updateExemptRestriction(owner.getAddress(), false)
                await rwa.transfer(otherAccount.getAddress(), parseEther("10"))
                
                expect(await rwa.balanceOf(otherAccount.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
            })

            it("Should return correct token amount being transferred by restricted account to non-restricted account", async function () {
                const { rwa, otherAccount } = await loadFixture(deployRwa)
                const initial = await rwa.balanceOf(otherAccount.getAddress())
                await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                await rwa.transfer(otherAccount.getAddress(), parseEther("10"))
                
                expect(await rwa.balanceOf(otherAccount.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
            })

            it("Should fail if token amount being transferred by restricted account to restricted account", async function () {
                const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                await rwa.updateExemptRestriction(owner.getAddress(), false)                
                
                await expect(
                    rwa.transfer(otherAccount.getAddress(), parseEther("10"))
                ).to.be.revertedWithCustomError(
                    rwa, "TradeNotYetEnabled"
                )
            })

            it("Should fail if transferring to address(0)", async function () {
                const { rwa } = await loadFixture(deployRwa)
                
                await expect(
                    rwa.transfer("0x0000000000000000000000000000000000000000", parseEther("10"))
                ).to.be.revertedWithCustomError(
                    rwa, "ERC20InvalidReceiver"
                )
            })

            it("Should fail if insufficient balance to transfer", async function () {
                const { rwa, otherAccount } = await loadFixture(deployRwa)
                
                await expect(
                    rwa.transfer(otherAccount.getAddress(), parseEther("10000000000"))
                ).to.be.revertedWithCustomError(
                    rwa, "ERC20InsufficientBalance"
                )
            })

            it("Should emit an event on token transfer", async function () {
                const { rwa, otherAccount } = await loadFixture(deployRwa)
                
                await expect(
                    rwa.transfer(otherAccount.getAddress(), parseEther("10"))
                ).to.emit(
                    rwa, "Transfer"
                )
            })
        })

        describe("After Trade Enabled", function () {
            it("Should not fail when transferring 0 token", async function () {
                const { rwa, otherAccount } = await loadFixture(deployRwa)
                await rwa.enableTrading()
                const initial = await rwa.balanceOf(otherAccount.getAddress())
                await rwa.transfer(otherAccount.getAddress(), 0)

                expect(await rwa.balanceOf(otherAccount.getAddress())).to.equal(BigInt(initial))
            })

            it("Should return correct token amount being transferred by non-restricted account to restricted account", async function () {
                const { rwa, otherAccount } = await loadFixture(deployRwa)
                await rwa.enableTrading()
                const initial = await rwa.balanceOf(otherAccount.getAddress())
                await rwa.transfer(otherAccount.getAddress(), parseEther("10"))

                expect(await rwa.balanceOf(otherAccount.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
            })

            it("Should return correct token amount being transferred by restricted account to non-restricted account", async function () {
                const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                await rwa.enableTrading()
                const initial = await rwa.balanceOf(otherAccount.getAddress())
                await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                await rwa.updateExemptRestriction(owner.getAddress(), false)
                await rwa.transfer(otherAccount.getAddress(), parseEther("10"))
                
                expect(await rwa.balanceOf(otherAccount.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
            })

            it("Should return correct token amount being transferred by restricted account to non-restricted account", async function () {
                const { rwa, otherAccount } = await loadFixture(deployRwa)
                await rwa.enableTrading()
                const initial = await rwa.balanceOf(otherAccount.getAddress())
                await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                await rwa.transfer(otherAccount.getAddress(), parseEther("10"))
                
                expect(await rwa.balanceOf(otherAccount.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
            })

            it("Should return correct token amount being transferred by restricted account to restricted account", async function () {
                const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                await rwa.enableTrading()
                const initial = await rwa.balanceOf(otherAccount.getAddress())
                await rwa.updateExemptRestriction(owner.getAddress(), false)                
                await rwa.transfer(otherAccount.getAddress(), parseEther("10"))
                
                expect(await rwa.balanceOf(otherAccount.getAddress())).to.equal(BigInt(initial) + parseEther("10"))                
            })

            it("Should fail if transferring to address(0)", async function () {
                const { rwa } = await loadFixture(deployRwa)
                await rwa.enableTrading()

                await expect(
                    rwa.transfer("0x0000000000000000000000000000000000000000", parseEther("10"))
                ).to.be.revertedWithCustomError(
                    rwa, "ERC20InvalidReceiver"
                )
            })

            it("Should fail if insufficient balance to transfer", async function () {
                const { rwa, otherAccount } = await loadFixture(deployRwa)
                await rwa.enableTrading()

                await expect(
                    rwa.transfer(otherAccount.getAddress(), parseEther("10000000000"))
                ).to.be.revertedWithCustomError(
                    rwa, "ERC20InsufficientBalance"
                )
            })

            it("Should emit an event on token transfer", async function () {
                const { rwa, otherAccount } = await loadFixture(deployRwa)
                await rwa.enableTrading()

                await expect(
                    rwa.transfer(otherAccount.getAddress(), parseEther("10"))
                ).to.emit(
                    rwa, "Transfer"
                )
            })
        })
    })

    // Check Allowance – allowance values across scenarios
    describe("Check Allowance", function () {
        // Return correct allowance when approval exists
        it("Should return correct allowance amount if there's any allowance approved for the address", async function () {
            const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
            await rwa.approve(otherAccount.getAddress(), parseEther("10"))

            expect(await rwa.allowance(owner.getAddress(), otherAccount.getAddress())).to.equal(parseEther("10"))
        })

        it("Should return 0 if there's no allowance approved for the address", async function () {
            const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

            expect(await rwa.allowance(owner.getAddress(), otherAccount.getAddress())).to.equal(0)
        })
    })

    // Allowance Approval – approve behavior and event
    describe("Allowance Approval", function () {
        // Return same amount if approval matches current amount
        it("Should return same allowance amount if allowance approved for the address is the same as the current amount", async function () {
            const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
            await rwa.approve(otherAccount.getAddress(), parseEther("10"))
            const initial = await rwa.allowance(owner.getAddress(), otherAccount.getAddress())
            await rwa.approve(otherAccount.getAddress(), parseEther("10"))

            expect(await rwa.allowance(owner.getAddress(), otherAccount.getAddress())).to.equal(BigInt(initial))
        })

        it("Should not return same allowance amount if allowance approved for the address is not the same as the current amount", async function () {
            const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
            const initial = await rwa.allowance(owner.getAddress(), otherAccount.getAddress())
            await rwa.approve(otherAccount.getAddress(), parseEther("10"))

            expect(await rwa.allowance(owner.getAddress(), otherAccount.getAddress())).to.not.equal(BigInt(initial))
        })

        it("Should return higher allowance amount if allowance approved for the address is higher than the current amount", async function () {
            const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
            const initial = await rwa.allowance(owner.getAddress(), otherAccount.getAddress())
            await rwa.approve(otherAccount.getAddress(), parseEther("10"))
            const latest = await rwa.allowance(owner.getAddress(), otherAccount.getAddress())
            expect(Number(BigInt(latest))).to.greaterThan(Number(BigInt(initial)))
        })

        it("Should return lower allowance amount if allowance approved for the address is lower than the current amount", async function () {
            const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
            await rwa.approve(otherAccount.getAddress(), parseEther("10"))
            const initial = await rwa.allowance(owner.getAddress(), otherAccount.getAddress())
            await rwa.approve(otherAccount.getAddress(), 1000000000000000000n)
            const latest = await rwa.allowance(owner.getAddress(), otherAccount.getAddress())
            expect(Number(BigInt(latest))).to.lessThan(Number(BigInt(initial)))
        })

        it("Should fail if allowance approval is for address(0)", async function () {
            const { rwa } = await loadFixture(deployRwa)
            
            await expect(
                rwa.approve("0x0000000000000000000000000000000000000000", parseEther("10"))
            ).to.be.revertedWithCustomError(
                rwa, "ERC20InvalidSpender"
            )
        })

        it("Should emit an event on allowance approval", async function () {
            const { rwa, otherAccount } = await loadFixture(deployRwa)
                
            await expect(
                rwa.approve(otherAccount.getAddress(), parseEther("10"))
            ).to.emit(
                rwa, "Approval"
            )
        })
    })

    // Transfer Token From – transferFrom under restriction scenarios
    describe("Transfer Token From", function () {
        // Before trade enabled
        describe("Before Trade Enabled", function () {
            // Initiated by restricted spender
            describe("Initiated by Restricted Spender", function () {
                describe("From non-restricted provider to restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + BigInt(0))
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        const initial = await rwa.balanceOf(owner.getAddress())
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(owner.getAddress())).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientBalance"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.emit(
                            rwa, "Transfer"
                        )
                    })
                })

                describe("From restricted provider to non-restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + BigInt(0))
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        const initial = await rwa.balanceOf(owner.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(owner.getAddress())).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientBalance"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.emit(
                            rwa, "Transfer"
                        )
                    })
                })

                describe("From non-restricted provider to non-restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + BigInt(0))
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        const initial = await rwa.balanceOf(owner.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(owner.getAddress())).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientBalance"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.emit(
                            rwa, "Transfer"
                        )
                    })
                })

                describe("From restricted provider to restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "TradeNotYetEnabled"
                        )
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "TradeNotYetEnabled"
                        )
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "TradeNotYetEnabled"
                        )
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "TradeNotYetEnabled"
                        )
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "TradeNotYetEnabled"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.be.revertedWithCustomError(
                            rwa, "TradeNotYetEnabled"
                        )
                    })
                })
            })

            describe("Initiated by Non-Restricted Spender", function () {
                describe("From non-restricted provider to restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + BigInt(0))
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(owner.getAddress())
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(owner.getAddress())).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientBalance"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.emit(
                            rwa, "Transfer"
                        )
                    })
                })

                describe("From restricted provider to non-restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + BigInt(0))
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        const initial = await rwa.balanceOf(owner.getAddress())
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(owner.getAddress())).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientBalance"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.emit(
                            rwa, "Transfer"
                        )
                    })
                })

                describe("From non-restricted provider to non-restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + BigInt(0))
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        const initial = await rwa.balanceOf(owner.getAddress())
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(owner.getAddress())).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientBalance"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.emit(
                            rwa, "Transfer"
                        )
                    })
                })

                describe("From restricted provider to restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "TradeNotYetEnabled"
                        )
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "TradeNotYetEnabled"
                        )
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "TradeNotYetEnabled"
                        )
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "TradeNotYetEnabled"
                        )
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "TradeNotYetEnabled"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.be.revertedWithCustomError(
                            rwa, "TradeNotYetEnabled"
                        )
                    })
                })
            })
        })

        describe("After Trade Enabled", function () {
            describe("Initiated by Restricted Spender", function () {
                describe("From non-restricted provider to restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + BigInt(0))
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        const initial = await rwa.balanceOf(owner.getAddress())
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(owner.getAddress())).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should not update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.approve(otherAccount.getAddress(), 115792089237316195423570985008687907853269984665640564039457584007913129639935n)
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial))
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientBalance"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.emit(
                            rwa, "Transfer"
                        )
                    })
                })

                describe("From restricted provider to non-restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + BigInt(0))
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        const initial = await rwa.balanceOf(owner.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(owner.getAddress())).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should not update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), 115792089237316195423570985008687907853269984665640564039457584007913129639935n)
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial))
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientBalance"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.emit(
                            rwa, "Transfer"
                        )
                    })
                })

                describe("From non-restricted provider to non-restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + BigInt(0))
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        const initial = await rwa.balanceOf(owner.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(owner.getAddress())).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should not update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), 115792089237316195423570985008687907853269984665640564039457584007913129639935n)
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial))
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientBalance"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.emit(
                            rwa, "Transfer"
                        )
                    })
                })

                describe("From restricted provider to restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + BigInt(0))
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        const initial = await rwa.balanceOf(owner.getAddress())
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(owner.getAddress())).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should not update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), 115792089237316195423570985008687907853269984665640564039457584007913129639935n)
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial))
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientBalance"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.emit(
                            rwa, "Transfer"
                        )
                    })
                })
            })

            describe("Initiated by Non-Restricted Spender", function () {
                describe("From non-restricted provider to restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + BigInt(0))
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(owner.getAddress())
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(owner.getAddress())).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should not update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), 115792089237316195423570985008687907853269984665640564039457584007913129639935n)
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial))
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientBalance"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.emit(
                            rwa, "Transfer"
                        )
                    })
                })

                describe("From restricted provider to non-restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + BigInt(0))
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(owner.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(owner.getAddress())).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should not update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), 115792089237316195423570985008687907853269984665640564039457584007913129639935n)
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial))
                    })


                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientBalance"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.emit(
                            rwa, "Transfer"
                        )
                    })
                })

                describe("From non-restricted provider to non-restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + BigInt(0))
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(owner.getAddress())
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(owner.getAddress())).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should not update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), 115792089237316195423570985008687907853269984665640564039457584007913129639935n)
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial))
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientBalance"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(rwa.getAddress(), true)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.emit(
                            rwa, "Transfer"
                        )
                    })
                })

                describe("From restricted provider to restricted receiver", function () {
                    it("Should not fail when transferring 0 token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), 0)
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + BigInt(0))
                    })

                    it("Should update receiver token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)

                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(rwa.getAddress())
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(rwa.getAddress())).to.equal(BigInt(initial) + parseEther("10"))
                    })

                    it("Should update provider token balance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        const initial = await rwa.balanceOf(owner.getAddress())
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.balanceOf(owner.getAddress())).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial) - parseEther("10"))
                    })

                    it("Should not update spender token allowance after transferring token", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), 115792089237316195423570985008687907853269984665640564039457584007913129639935n)
                        const initial = await rwa.allowance(owner.getAddress(), otherAccount.address)
                        await rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        expect(await rwa.allowance(owner.getAddress(), otherAccount.address)).to.equal(BigInt(initial))
                    })

                    it("Should fail if transferring any value to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring any value from address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), "0x0000000000000000000000000000000000000000", 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidReceiver"
                        )
                    })

                    it("Should fail if transferring 0 token to address(0)", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom("0x0000000000000000000000000000000000000000", owner.getAddress(), 0)
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InvalidProvider"
                        )
                    })

                    it("Should fail if insufficient balance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("10000000000"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10000000000"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientBalance"
                        )
                    })

                    it("Should fail if insufficient allowance to transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("10"))
                        ).to.be.revertedWithCustomError(
                            rwa, "ERC20InsufficientAllowance"
                        )
                    })
        
                    it("Should emit an event on token transfer", async function () {
                        const { rwa, owner, otherAccount } = await loadFixture(deployRwa)
                        
                        await rwa.enableTrading()
                        await rwa.updateExemptRestriction(otherAccount.getAddress(), true)
                        await rwa.updateExemptRestriction(owner.getAddress(), false)
                        await rwa.approve(otherAccount.getAddress(), parseEther("0.1"))
                        await expect(
                            rwa.connect(otherAccount).transferFrom(owner.getAddress(), rwa.getAddress(), parseEther("0.1"))
                        ).to.emit(
                            rwa, "Transfer"
                        )
                    })
                })
            })
        })
    })
})
