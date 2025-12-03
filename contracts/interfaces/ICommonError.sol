// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title Common Error Interface
 * @notice Non-ERC20 specific common errors
 */
interface ICommonError {
    /**
     * @notice Cannot use current address
     */
    error CannotUseCurrentAddress(address current);

    /**
     * @notice Cannot use current state
     */
    error CannotUseCurrentState(bool current);

    /**
     * @notice Invalid address
     */
    error InvalidAddress(address invalid);
}
