// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title Factory Interface
 * @notice Minimal UniswapV2‑style Factory interface
 */
interface IFactory {
    /**
     * @notice Create pair
     * @param tokenA Token A
     * @param tokenB Token B
     * @return pair Pair address
     */
    function createPair(address tokenA, address tokenB) external returns (address pair);

    /**
     * @notice Get pair address
     * @param tokenA Token A
     * @param tokenB Token B
     * @return pair Pair address
     */
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}
