// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title ERC20 Errors Interface
 * @notice Common ERC‑20 custom errors
 */
interface IERC20Errors {
    /**
     * @notice Insufficient balance
     */
    error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed);

    /**
     * @notice Invalid receiver
     */
    error ERC20InvalidReceiver(address receiver);

    /**
     * @notice Invalid provider
     */
    error ERC20InvalidProvider(address provider);

    /**
     * @notice Insufficient allowance
     */
    error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed);

    /**
     * @notice Invalid spender
     */
    error ERC20InvalidSpender(address spender);
}
