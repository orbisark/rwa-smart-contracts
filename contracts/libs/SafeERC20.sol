// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import { Address } from "./Address.sol";
import { IERC20 } from "../interfaces/IERC20.sol";

/**
 * @title SafeERC20 Library
 * @notice Safe wrappers for calling ERC-20 contracts
 */
library SafeERC20 {
    using Address for address;

    /**
     * @notice Safe transfer
     * @param token Token interface
     * @param to Recipient address
     * @param value Amount
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @notice Safe transferFrom
     * @param token Token interface
     * @param from From address
     * @param to Recipient address
     * @param value Amount
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @notice Optional return call
     * @param token Token interface
     * @param data Encoded data
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        bytes memory returndata = address(token).functionCall(data);
        if (returndata.length != 0 && !abi.decode(returndata, (bool))) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @notice Operation failed error
     */
    error SafeERC20FailedOperation(address token);
}
