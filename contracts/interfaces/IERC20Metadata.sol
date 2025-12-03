// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import { IERC20 } from "./IERC20.sol";

/**
 * @title ERC20 Metadata Interface
 * @notice Optional ERC‑20 metadata interface
 */
interface IERC20Metadata is IERC20 {
    /**
     * @notice Token name
     */
    function name() external view returns (string memory);

    /**
     * @notice Token symbol
     */
    function symbol() external view returns (string memory);

    /**
     * @notice Token decimals
     */
    function decimals() external view returns (uint8);
}
