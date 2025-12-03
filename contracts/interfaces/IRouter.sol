// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title Router Interface
 * @notice Minimal UniswapV2‑style Router interface
 */
interface IRouter {
    /**
     * @notice Get WETH address
     * @return WETH address
     */
    function WETH() external view returns (address);

    /**
     * @notice Get factory address
     * @return Factory address
     */
    function factory() external view returns (address);
}
