/**
 *
 * @title Orbis Ark Dramas RWA
 *
 * @notice This is a smart contract developed by OrbisArk Ecosystem for RWA.
 *
 */

// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;
import {Address} from "./libs/Address.sol";
import {SafeERC20} from "./libs/SafeERC20.sol";
import {Ownable} from "./access/Ownable.sol";
import {IERC20} from "./interfaces/IERC20.sol";
import {IRouter} from "./interfaces/IRouter.sol";
import {IFactory} from "./interfaces/IFactory.sol";
import {IERC20Metadata} from "./interfaces/IERC20Metadata.sol";
import {IERC20Errors} from "./interfaces/IERC20Errors.sol";
import {ICommonError} from "./interfaces/ICommonError.sol";

/**
 * @title RWA Token Contract
 *
 * @notice RWA is an extended version of ERC-20 standard token that includes
 * additional functionalities for ownership control, trading enabling, and
 * exemption management.
 *
 * @dev Implements ERC20Metadata, ERC20Errors, and CommonError interfaces, and
 * extends Ownable contract.
 */
contract Dramas is Ownable, IERC20Metadata, IERC20Errors, ICommonError {
    // LIBRARY
    using SafeERC20 for IERC20;
    using Address for address;

    // DATA

    IRouter public router;

    string private constant NAME = "Orbis Ark Dramas RWA";
    string private constant SYMBOL = "Dramas";

    uint8 private constant DECIMALS = 18;

    uint256 private _totalSupply;
    uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10 ** DECIMALS;

    uint256 public immutable deployTime;

    uint256 public tradeStartTime = 0;

    address public projectOwner;
    address public pair;

    bool public tradeEnabled = false;
    uint256 public mintStartTime;
    uint32 public participants; // Participant count, capped at 100,000

    // Payment token (e.g., USDT)
    IERC20 public paymentToken;
    uint32 public minUsdtAmount = 200_000_000; // Minimum USDT amount, default 10 USDT (6 decimals)

    // MAPPING

    mapping(address account => uint256) private _balances;
    mapping(address account => mapping(address spender => uint256))
        private _allowances;

    mapping(address pair => bool) public isPairLP;
    mapping(address account => bool) public isExemptRestriction;

    // ERROR

    /**
     * @notice Error indicating that an action is attempted before the cooldown period ends.
     *
     * @param cooldownEnd The timestamp when the cooldown period ends.
     * @param timeLeft The time remaining in the cooldown period.
     *
     * @dev The `timeLeft` is required to inform user of the waiting period.
     */
    error WaitForCooldownTimer(uint256 cooldownEnd, uint256 timeLeft);

    /**
     * @notice Error indicating that trading has already been enabled at a specific `timestamp`.
     *
     * @param currentState The current state of trading.
     * @param timestamp The timestamp when trading was enabled.
     *
     * @dev The `currentState` is required to inform user of the current state of trading.
     */
    error TradeAlreadyEnabled(bool currentState, uint256 timestamp);

    /**
     * @notice Error indicating that trading has not been enabled yet.
     */
    error TradeNotYetEnabled();
    error USDTBalanceTooLow(uint256 balance, uint256 minimum);
    error AmountTooSmall(uint256 amount, uint256 minimum);
    error MintCapExceeded(uint256 requested, uint256 remaining);
    error BNBTransferFailed();
    error MintNotYetStarted(uint256 start, uint256 nowTime);

    // CONSTRUCTOR

    /**
     * @notice Constructs the RWA contract and initializes both owner and
     * project owner addresses. Deployer will receive 1,000,000,000 tokens after
     * the smart contract was deployed.
     *
     * @param addresses An array of addresses. Refer format in comment on L550.
     *
     * @dev Should throw if called with the address at index 0 in `addresses`
     * array set to be address(0). If deployer is not the project owner, then
     * deployer will be exempted from transaction restriction along with the
     * project owner and router.
     *
     * IMPORTANT: Project owner should be aware that {enableTrade} function and
     * transaction restriction feature could significantly impact the audit score.
     * These functions/features possess the potential for malicious exploitation,
     * which might affect the received score.
     */
    constructor(
        address[] memory addresses // [projectOwnerAddress, router]
    ) Ownable(msg.sender) {
        if (addresses[0] == address(0x0)) {
            revert InvalidAddress(addresses[0]);
        }
        if (addresses[0] == address(0xdead)) {
            revert InvalidAddress(addresses[0]);
        }

        projectOwner = addresses[0];
        deployTime = block.timestamp;

        isExemptRestriction[projectOwner] = true;
        isExemptRestriction[address(router)] = true;

        if (projectOwner != msg.sender) {
            isExemptRestriction[msg.sender] = true;
        }

        // Mint 1,000,000,000 tokens to deployer at deployment
        _mint(msg.sender, 900_000_000 * 10 ** DECIMALS);

        // router = IRouter(addresses[1]);
        // pair = IFactory(router.factory()).createPair(
        //     address(this),
        //     router.WETH()
        // );
        // isPairLP[pair] = true;
        //_allowances
        mintStartTime = block.timestamp;
    }

    // EVENT
    // function mintBNB(address to, uint256 amount) public {
    //     _mint(to, amount);
    // }

    function mint(address to, uint256 payAmount) public {
        if (mintStartTime == 0 || block.timestamp <= mintStartTime) {
            revert MintNotYetStarted(mintStartTime, block.timestamp);
        }
        if (address(paymentToken) == address(0)) {
            revert InvalidAddress(address(0));
        }
        uint256 minAmount = minUsdtAmount; // USDT has 6 decimals
        if (payAmount < minAmount) {
            revert AmountTooSmall(payAmount, minAmount);
        }
        //msg.sender
        uint256 userBal = paymentToken.balanceOf(to);
        if (userBal < payAmount) {
            revert USDTBalanceTooLow(userBal, payAmount);
        }
        paymentToken.safeTransferFrom(to, projectOwner, payAmount);
        uint256 mintAmount = (payAmount * (10 ** DECIMALS)) / 30_000;
        uint256 remaining = MAX_SUPPLY - _totalSupply;
        if (mintAmount > remaining) {
            revert MintCapExceeded(mintAmount, remaining);
        }
        _mint(to, mintAmount);
    }

    function setMintStartTime(uint256 start) external onlyOwner {
        mintStartTime = start;
    }

    function isMintOpen() external view returns (bool) {
        return mintStartTime != 0 && block.timestamp >= mintStartTime;
    }

    /**
     * @notice Set payment token address (e.g., USDT)
     * @param token Payment token address
     */
    function setPaymentToken(address token) external onlyOwner {
        if (token == address(0)) {
            revert InvalidAddress(address(0));
        }
        paymentToken = IERC20(token);
    }

    /**
     * @notice Set minimum USDT amount (6 decimals)
     * @param amount Minimum amount (e.g., 10 USDT = 10_000_000)
     */
    function setMinUsdtAmount(uint256 amount) external onlyOwner {
        if (amount == 0) {
            revert AmountTooSmall(0, 1);
        }
        minUsdtAmount = uint32(amount);
    }

    /**
     * @notice Get minimum USDT amount (6 decimals)
     * @return Current minimum amount
     */
    function getMinUsdtAmount() external view returns (uint256) {
        return minUsdtAmount;
    }

    /**
     * @notice Emitted when the router address is updated.
     *
     * @param oldRouter The address of the old router.
     * @param newRouter The address of the new router.
     * @param caller The address that triggered the router update.
     * @param timestamp The timestamp when the update occurred.
     */
    event UpdateRouter(
        address oldRouter,
        address newRouter,
        address caller,
        uint256 timestamp
    );

    /**
     * @notice Emitted when the exemption status of an account is updated.
     *
     * @param account The address of the account whose status is being updated.
     * @param oldStatus The previous exemption status.
     * @param newStatus The new exemption status.
     * @param caller The address that triggered the status update.
     * @param timestamp The timestamp when the update occurred.
     */
    event ExemptRestriction(
        address account,
        bool oldStatus,
        bool newStatus,
        address caller,
        uint256 timestamp
    );

    /**
     * @notice Emitted when trading is enabled for the contract.
     *
     * @param caller The address that triggered the trading enablement.
     * @param timestamp The timestamp when trading was enabled.
     */
    event TradeEnabled(address caller, uint256 timestamp);

    // FUNCTION

    /* General */

    /**
     * @notice Withdraws tokens or Ether from the contract to a specified address.
     *
     * @param tokenAddress The address of the token to withdraw.
     * @param amount The amount of tokens or Ether to withdraw.
     *
     * @dev You need to use 0 as `amount` to withdraw the whole balance amount
     * in the smart contract. Anyone can trigger this function to send the fund
     * to the `projectOwner`.
     */
    function wTokens(address tokenAddress, uint256 amount) external {
        uint256 toTransfer = amount;

        if (amount == 0) {
            toTransfer = IERC20(tokenAddress).balanceOf(address(this));
        }
        IERC20(tokenAddress).safeTransfer(projectOwner, toTransfer);
    }

    /**
     * @notice Withdraw BNB to contract owner
     */
    function wBNB() external onlyOwner {
        uint256 toTransfer = address(this).balance;
        (bool ok, ) = payable(owner()).call{value: toTransfer}("");
        if (!ok) {
            revert BNBTransferFailed();
        }
    }

    /**
     * @notice Enables trading functionality for the token contract.
     *
     * @dev Should trade is not enabled, if ownership is set and the sender is not the owner,
     * users can trigger it 30 days after deployment. If ownership is not set or contract
     * has been renounced before enable trade, users can trigger it 15 days after deployment.
     * Other than these, it validates the sender's authorization based on the contract
     * deployment time and ownership status and should throw if trading already enabled.
     * Can only be triggered once and emits a TradeEnabled event upon successful transaction.
     */
    function enableTrading() external {
        if (tradeEnabled) {
            revert TradeAlreadyEnabled(tradeEnabled, tradeStartTime);
        }
        if (
            owner() != address(0) &&
            owner() != msg.sender &&
            deployTime + 30 days > block.timestamp
        ) {
            revert OwnableUnauthorizedAccount(msg.sender);
        }
        if (
            owner() == address(0) &&
            owner() != msg.sender &&
            deployTime + 15 days > block.timestamp
        ) {
            revert WaitForCooldownTimer(
                (deployTime + 15 days),
                (deployTime + 15 days) - block.timestamp
            );
        }
        tradeEnabled = true;
        tradeStartTime = block.timestamp;

        emit TradeEnabled(msg.sender, block.timestamp);
    }

    /**
     * @notice Calculates the circulating supply of the token.
     *
     * @return The circulating supply of the token.
     *
     * @dev This should only return the token supply that is in circulation,
     * which excluded the potential balance that could be in both address(0)
     * and address(0xdead) that are already known to not be out of circulation.
     */
    function circulatingSupply() external view returns (uint256) {
        return
            totalSupply() - balanceOf(address(0xdead)) - balanceOf(address(0));
    }

    /* Update */

    /**
     * @notice Updates the router address used for token swaps.
     *
     * @param newRouter The address of the new router contract.
     *
     * @dev This should also generate the pair address using the factory of the `newRouter` if
     * the address of the pair on the new router's factory is address(0).If the new pair address's
     * isPairLP status is not yet set to true, this function will automatically set it to true.
     */
    function updateRouter(address newRouter) external onlyOwner {
        if (newRouter == address(router)) {
            revert CannotUseCurrentAddress(newRouter);
        }
        if (newRouter == address(0)) {
            revert InvalidAddress(newRouter);
        }

        address oldRouter = address(router);
        router = IRouter(newRouter);

        emit UpdateRouter(oldRouter, newRouter, msg.sender, block.timestamp);

        if (
            address(
                IFactory(router.factory()).getPair(address(this), router.WETH())
            ) == address(0)
        ) {
            pair = IFactory(router.factory()).createPair(
                address(this),
                router.WETH()
            );
            if (!isPairLP[pair]) {
                isPairLP[pair] = true;
            }
        }
    }

    /**
     * @notice Updates the exemption status for restriction on a specific account.
     *
     * @param user The address of the account.
     * @param newStatus The new exemption status.
     *
     * @dev Should throw if the `newStatus` is the exact same state as the current state
     * for the `user` address.
     */
    function updateExemptRestriction(
        address user,
        bool newStatus
    ) external onlyOwner {
        if (isExemptRestriction[user] == newStatus) {
            revert CannotUseCurrentState(newStatus);
        }
        bool oldStatus = isExemptRestriction[user];
        isExemptRestriction[user] = newStatus;
        emit ExemptRestriction(
            user,
            oldStatus,
            newStatus,
            msg.sender,
            block.timestamp
        );
    }

    /* Override */

    /**
     * @notice Overrides the {transferOwnership} function to update project owner.
     *
     * @param newOwner The address of the new owner.
     *
     * @dev Should throw if the `newOwner` is set to the current owner address or address(0xdead).
     * This overrides function is just an extended version of the original {transferOwnership}
     * function. See {Ownable-transferOwnership} for more information.
     */
    function transferOwnership(address newOwner) public override onlyOwner {
        if (newOwner == owner()) {
            revert CannotUseCurrentAddress(newOwner);
        }
        if (newOwner == address(0xdead)) {
            revert InvalidAddress(newOwner);
        }
        projectOwner = newOwner;
        super.transferOwnership(newOwner);
    }

    /* ERC20 Standard */

    /**
     * @notice Returns the name of the token.
     *
     * @return The name of the token.
     *
     * @dev This is usually a longer version of the name.
     */
    function name() public view virtual returns (string memory) {
        return NAME;
    }

    /**
     * @notice Returns the symbol of the token.
     *
     * @return The symbol of the token.
     *
     * @dev This is usually a shorter version of the name.
     */
    function symbol() public view virtual returns (string memory) {
        return SYMBOL;
    }

    /**
     * @notice Returns the number of decimals used for token display purposes.
     *
     * @return The number of decimals.
     *
     * @dev This is purely used for user representation of the amount and does not
     * affect any of the arithmetic of the smart contract including, but not limited
     * to {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public view virtual returns (uint8) {
        return DECIMALS;
    }

    /**
     * @notice Returns the total supply of tokens.
     *
     * @return The total supply of tokens.
     *
     * @dev See {IERC20-totalSupply} for more information.
     */
    function totalSupply() public view virtual returns (uint256) {
        return _totalSupply;
    }

    /**
     * @notice Returns the balance of tokens for a given account.
     *
     * @param account The address of the account to check.
     *
     * @return The token balance of the account.
     *
     * @dev See {IERC20-balanceOf} for more information.
     */
    function balanceOf(address account) public view virtual returns (uint256) {
        return _balances[account];
    }

    /**
     * @notice Transfers tokens from the sender to a specified recipient.
     *
     * @param to The address of the recipient.
     * @param value The amount of tokens to transfer.
     *
     * @return A boolean indicating whether the transfer was successful or not.
     *
     * @dev See {IERC20-transfer} for more information.
     */
    function transfer(address to, uint256 value) public virtual returns (bool) {
        address provider = msg.sender;
        _transfer(provider, to, value);
        return true;
    }

    /**
     * @notice Returns the allowance amount that a spender is allowed to spend on behalf of a provider.
     *
     * @param provider The address allowing spending.
     * @param spender The address allowed to spend tokens.
     *
     * @return The allowance amount for the spender.
     *
     * @dev See {IERC20-allowance} for more information.
     */
    function allowance(
        address provider,
        address spender
    ) public view virtual returns (uint256) {
        return _allowances[provider][spender];
    }

    /**
     * @notice Approves a spender to spend a certain amount of tokens on behalf of the sender.
     *
     * @param spender The address allowed to spend tokens.
     * @param value The allowance amount for the spender.
     *
     * @return A boolean indicating whether the approval was successful or not.
     *
     * @dev See {IERC20-approve} for more information.
     */
    function approve(
        address spender,
        uint256 value
    ) public virtual returns (bool) {
        address provider = msg.sender;
        _approve(provider, spender, value);
        return true;
    }

    /**
     * @notice Transfers tokens from one address to another on behalf of a spender.
     *
     * @param from The address to transfer tokens from.
     * @param to The address to transfer tokens to.
     * @param value The amount of tokens to transfer.
     *
     * @return A boolean indicating whether the transfer was successful or not.
     *
     * @dev See {IERC20-transferFrom} for more information.
     */
    function transferFrom(
        address from,
        address to,
        uint256 value
    ) public virtual returns (bool) {
        address spender = msg.sender;
        _spendAllowance(from, spender, value);
        _transfer(from, to, value);
        return true;
    }

    /**
     * @notice Internal function to handle token transfers.
     *
     * @param from The address tokens are transferred from.
     * @param to The address tokens are transferred to.
     * @param value The amount of tokens to transfer.
     *
     * @dev This internal function is equivalent to {transfer}, and thus can be used for other functions
     * such as implementing automatic token fees, slashing mechanisms, etc. Since this function is not
     * virtual, {_update} should be overridden instead. This function can only be called if the address
     * for `to` is not address(0) and has omitted the situation where `from` is address(0) since it is
     * redundant to have it due to the fact that _transfer() is not being used in any other part of the
     * smart contract that does not prevent the use of address(0) as the `from` account. This function
     * also require `from` to at least have a balance of `value`.
     *
     * NOTE: In transfer() function, the _transfer() cannot take address(0) as `from` because no one
     * has the access to address(0). In transferFrom() function, the _transfer() cannot take address(0)
     * as `from` because the _spendAllowance() logic implemented in the function will already throw with
     * ERC20InvalidProvider() error from the restriction implemented to prevent the function from trying
     * to spending any form of allowance from address(0).
     *
     * IMPORTANT: Since this project implement logic for trading restriction, the transaction will only
     * go through if the trade was already enabled or if the trade is still disabled, both addresses must
     * be exempted from the restriction. Please note that this feature could significantly impact the audit
     * score as it possesses the potential for malicious exploitation, which might affect the received score.
     */
    function _transfer(address from, address to, uint256 value) internal {
        if (to == address(0)) {
            revert ERC20InvalidReceiver(address(0));
        }
        if (!tradeEnabled) {
            if (!isExemptRestriction[from] && !isExemptRestriction[to]) {
                revert TradeNotYetEnabled();
            }
        }
        _update(from, to, value);
    }

    /**
     * @notice Internal function to update token balances during transfers.
     * 
     * @param from The address tokens are transferred from.
     * @param to The address tokens are transferred to.
     * @param value The amount of tokens to transfer.
     * 
     * @dev This function is used internally to transfer a `value` amount of token from
     * `from` address to `to` address. This function is also used for mints if `from`
     * is the zero address and for burns if `to` is the zero address.
     * 
     * IMPORTANT: All customizations that are required for transfers, mints, and burns
     * should be done by overriding this function.

     */
    function _update(address from, address to, uint256 value) internal virtual {
        if (from == address(0)) {
            _totalSupply += value;
        } else {
            uint256 fromBalance = _balances[from];
            if (fromBalance < value) {
                revert ERC20InsufficientBalance(from, fromBalance, value);
            }
            unchecked {
                _balances[from] = fromBalance - value;
            }
        }

        unchecked {
            _balances[to] += value;
        }

        emit Transfer(from, to, value);
    }

    /**
     * @notice Internal function to mint tokens and update the total supply.
     *
     * @param account The address to mint tokens to.
     * @param value The amount of tokens to mint.
     *
     * @dev The initial restriction where `account` address cannot be address(0) was omitted for
     * optimization purposes and to save gas since it is redundant to have it due to the logic not
     * being used in any other part of the contract except in the constructor during deployment where
     * the account was already restricted by the logic to prevent address(0) and address(0xdead) from
     * being used as it does not make any sense for the project to mint to these two addresses at all.
     * Since this function is not virtual, {_update} should be overridden instead for customization.
     */
    function _mint(address account, uint256 value) internal {
        _update(address(0), account, value);
        unchecked {
            participants++;
        }
    }

    /**
     * @notice Internal function to set an allowance for a `spender` to spend a specific `value` of tokens
     * on behalf of a `provider`.
     *
     * @param provider The address allowing spending.
     * @param spender The address allowed to spend tokens.
     * @param value The allowance amount for the spender.
     *
     * @dev This internal function is equivalent to {approve}, and thus can be used for other functions
     * such as setting automatic allowances for certain subsystems, etc.
     *
     * IMPORTANT: This function internally calls {_approve} with the emitEvent parameter set to `true`.
     */
    function _approve(
        address provider,
        address spender,
        uint256 value
    ) internal {
        _approve(provider, spender, value, true);
    }

    /**
     * @notice Variant of {_approve} with an optional flag to enable or disable the {Approval} event.
     *
     * @param provider The address allowing spending.
     * @param spender The address allowed to spend tokens.
     * @param value The allowance amount for the spender.
     * @param emitEvent A boolean indicating whether to emit the Approval event.
     *
     * @dev This internal function is equivalent to {approve}, and thus can be used for other functions
     * such as setting automatic allowances for certain subsystems, etc. This function can only be called
     * if the address for `spender` is not address(0) and has omitted the situation where `provider` is
     * address(0) since it is redundant to have it due to the logic not being used in any part of the
     * contract. If `emitEvent` is set to `true`, this function will emits the Approval event.
     */
    function _approve(
        address provider,
        address spender,
        uint256 value,
        bool emitEvent
    ) internal virtual {
        if (spender == address(0)) {
            revert ERC20InvalidSpender(address(0));
        }
        _allowances[provider][spender] = value;
        if (emitEvent) {
            emit Approval(provider, spender, value);
        }
    }

    /**
     * @notice Internal function to decrease allowance when tokens are spent.
     *
     * @param provider The address allowing spending.
     * @param spender The address allowed to spend tokens.
     * @param value The amount of tokens spent.
     *
     * @dev If the allowance value for the `spender` is infinite/the max value of uint256,
     * this function will notupdate the allowance value. Should throw if not enough allowance
     * is available. On all occasion, this function will not emit an Approval event.
     */
    function _spendAllowance(
        address provider,
        address spender,
        uint256 value
    ) internal virtual {
        if (provider == address(0)) {
            revert ERC20InvalidProvider(address(0));
        }

        uint256 currentAllowance = allowance(provider, spender);
        if (currentAllowance != type(uint256).max) {
            if (currentAllowance < value) {
                revert ERC20InsufficientAllowance(
                    spender,
                    currentAllowance,
                    value
                );
            }
            unchecked {
                _approve(provider, spender, currentAllowance - value, false);
            }
        }
    }
}
