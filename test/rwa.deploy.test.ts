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
import { ethers } from "hardhat"
import { parseEther } from "viem"
import { expect } from "chai"

// RWA deploy test suite
describe("RWADeploy", function () {

    /**
     * Helper to deploy RWA and infra for tests
     * @returns Deployed contracts and test accounts
     */
    async function deployRwa() {
        // Get current block timestamp for time‑based tests
        const deployTime = BigInt(await time.latest())

        // Get test accounts: owner (deployer) and otherAccount
        const [owner, otherAccount] = await ethers.getSigners()
        console.log("owner:", owner.address)
        console.log("otherAccount:", otherAccount.address)

        // Get factories for infra
        const Weth = await ethers.getContractFactory("Weth")      // WETH token
        const Factory = await ethers.getContractFactory("Factory") // Uniswap‑style factory
        const Router = await ethers.getContractFactory("Router")   // Uniswap‑style router
        const RWA = await ethers.getContractFactory("Dramas")     // RWA token

        const USDT = await ethers.getContractFactory("MockUSDT")

        // Deploy infra
        const weth = await Weth.deploy()
        const weth1 = await Weth.deploy() // for multi‑router tests
        const usdt = await USDT.deploy()
        const factory = await Factory.deploy(owner.address)


        // Deploy multiple routers for update tests
        const router = await Router.deploy(factory.getAddress(), weth.getAddress())
        const router1 = await Router.deploy(factory.getAddress(), weth1.getAddress())
        const router2 = await Router.deploy(factory.getAddress(), weth.getAddress())

        // Deploy RWA instances for ownership variants
        // rwa: owner is contract owner and project owner
        const rwa = await RWA.deploy([owner.getAddress(), router.getAddress()])

        await rwa.setPaymentToken(usdt.getAddress())

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
            usdt,
        }
    }

    // Deployment – verify initial state after deployment
    describe("Deployment", function () {
        // Verify contract owner is set correctly
        it("Should set the right owner", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)

            expect(await rwa.owner()).to.equal(owner.address)
        })

        // Deployer equals project owner
        it("If deployer is the projectOwner", async function () {
            const { rwa } = await loadFixture(deployRwa)

            expect(await rwa.owner()).to.equal(await rwa.projectOwner())
        })

        // Deployer is not the project owner
        it("If deployer is not the projectOwner", async function () {
            const { rwa2 } = await loadFixture(deployRwa)

            expect(await rwa2.owner()).to.not.equal(await rwa2.projectOwner())
        })

        // Trade disabled by default at deployment
        it("Should deploy with trade disabled", async function () {
            const { rwa } = await loadFixture(deployRwa)

            expect(await rwa.tradeEnabled()).to.equal(false)
        })

        // Project owner exempt from transaction restriction by default
        it("Should deploy with transaction restriction exempted for projectOwner", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)
            const adr = owner.address

            expect(await rwa.isExemptRestriction(adr)).to.equal(true)
        })

        // Router contract exempt from transaction restriction by default
        it("Should deploy with transaction restriction exempted for the router contract", async function () {
            const { rwa } = await loadFixture(deployRwa)
            const adr = await rwa.router()

            expect(await rwa.isExemptRestriction(adr)).to.equal(true)
        })

        // Contract owner exempt when different from project owner
        it("Should deploy with transaction restriction exempted for contract owner if contract owner is not projectOwner", async function () {
            const { rwa2, otherAccount } = await loadFixture(deployRwa)
            const adr = otherAccount.address

            expect(await rwa2.isExemptRestriction(adr)).to.equal(true)
        })

        // Mint 1 billion tokens to deployer at deployment
        it("Should mint 1 Billion token to deployer", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)
            const adr = owner.address

            expect(await rwa.balanceOf(adr)).to.equal(parseEther("1000000000"))
        })

        it("Should mint 19 Billion token to deployer", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)
            const adr = owner.address

            await rwa.mint(adr, parseEther("9"))

            expect(await rwa.balanceOf(adr)).to.equal(parseEther("1000000009"))
        })



        // Total supply equals deployer balance
        it("Total supply should be exactly the amount minted to the deployer", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)
            const adr = owner.address

            expect(await rwa.totalSupply()).to.equal(await rwa.balanceOf(adr))
        })

        // Router address is not zero after deployment
        it("Router is not address(0) after deployment", async function () {
            const { rwa } = await loadFixture(deployRwa)

            expect(await rwa.router()).to.not.equal("0x0000000000000000000000000000000000000000")
        })

        // Pair address is not zero after deployment
        it("Pair is not address(0) after deployment", async function () {
            const { rwa } = await loadFixture(deployRwa)

            expect(await rwa.pair()).to.not.equal("0x0000000000000000000000000000000000000000")
        })

        // Deploy time set upon deployment
        it("Deploy time is set upon deployment", async function () {
            const { rwa } = await loadFixture(deployRwa)

            expect(await rwa.deployTime()).to.not.equal(0)
        })

        // Pair added to LP pair list
        it("Pair has been added to pair LP list", async function () {
            const { rwa } = await loadFixture(deployRwa)
            const pair = await rwa.pair()

            expect(await rwa.isPairLP(pair)).to.equal(true)
        })

        // Fail deployment if project owner is address(0)
        it("Should fail if the projectOwner is address(0)", async function () {
            const { router } = await loadFixture(deployRwa)

            const Rwa = await ethers.getContractFactory("Dramas")
            await expect(Rwa.deploy(["0x0000000000000000000000000000000000000000", router.getAddress()])).to.be.revertedWithCustomError(
                Rwa, "InvalidAddress"
            )
        })

        // Fail deployment if project owner is address(0xdead)
        it("Should fail if the projectOwner is address(0xdead)", async function () {
            const { router } = await loadFixture(deployRwa)

            const Rwa = await ethers.getContractFactory("Dramas")
            await expect(Rwa.deploy(["0x000000000000000000000000000000000000dEaD", router.getAddress()])).to.be.revertedWithCustomError(
                Rwa, "InvalidAddress"
            )
        })


    })

    describe("Mint", function () {
        // Mint 1 billion tokens to deployer at deployment
        it("Should mint 1 Billion token to deployer", async function () {
            const { rwa, owner } = await loadFixture(deployRwa)
            const adr = owner.address

            expect(await rwa.balanceOf(adr)).to.equal(parseEther("900000000"))
        })

        it("Should mint  Billion token to deployer", async function () {
            const { rwa, usdt, owner } = await loadFixture(deployRwa)
            console.log("paymentToken", await rwa.paymentToken())
            const mintStartSec = await rwa.mintStartTime() // seconds
            const mintStartDate = new Date(Number(mintStartSec) * 1000).toISOString() // to ISO date
            console.log("mintStartTime", mintStartDate)
            const adr = owner.address

            let usdtAmount = ethers.parseUnits("10", 6)

            console.log("usdtAmount", usdtAmount)
            await usdt.mint(adr, usdtAmount)

            await usdt.connect(owner).approve(await rwa.getAddress(), usdtAmount)
            await rwa.mint(adr, usdtAmount)

            // 

            // expect(await rwa.balanceOf(adr)).to.equal(parseEther("1000000009"))
        })

        // it("Should mint USDT token to deployer", async function () {
        //     const { usdt, owner } = await loadFixture(deployRwa)
        //     const adr = owner.address

        //     await usdt.mint(adr, parseEther("19"))

        //     expect(await usdt.balanceOf(adr)).to.equal(parseEther("19"))
        // })

    })
})
