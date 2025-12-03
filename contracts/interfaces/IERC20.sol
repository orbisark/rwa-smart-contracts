// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title ERC20 Interface
 * @notice Minimal ERC‑20 standard interface
 */
interface IERC20 {
    /**
     * @notice Token transfer event
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @notice Approval event
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @notice Total supply
     */
    function totalSupply() external view returns (uint256);

    /**
     * @notice Get balance
     * @param account Address
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @notice Transfer
     * @param to Recipient address
     * @param value Amount
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @notice Get allowance
     * @param owner Owner
     * @param spender Spender
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @notice Approve
     * @param spender Spender
     * @param value Amount
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @notice Transfer from
     * @param from From address
     * @param to To address
     * @param value Amount
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}
