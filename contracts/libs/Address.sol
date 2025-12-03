// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title Address Library
 * @notice Safe utilities for low-level address calls
 */
library Address {
    /**
     * @notice Insufficient balance error
     */
    error AddressInsufficientBalance(address account);

    /**
     * @notice Target address has no code
     */
    error AddressEmptyCode(address target);

    /**
     * @notice Failed inner call error
     */
    error FailedInnerCall();

    /**
     * @notice Perform call
     * @param target Target address
     * @param data Call data
     */
    function functionCall(address target, bytes memory data) internal returns (bytes memory) {
        return functionCallWithValue(target, data, 0);
    }

    /**
     * @notice Call with value
     * @param target Target address
     * @param data Call data
     * @param value Ether value
     */
    function functionCallWithValue(address target, bytes memory data, uint256 value) internal returns (bytes memory) {
        if (address(this).balance < value) revert AddressInsufficientBalance(address(this));
        (bool success, bytes memory returndata) = target.call{value: value}(data);
        return verifyCallResultFromTarget(target, success, returndata);
    }

    /**
     * @notice Verify call result
     * @param target Target address
     * @param success Success flag
     * @param returndata Return data
     */
    function verifyCallResultFromTarget(address target, bool success, bytes memory returndata) internal view returns (bytes memory) {
        if (!success) {
            _revert(returndata);
        } else {
            if (returndata.length == 0 && target.code.length == 0) revert AddressEmptyCode(target);
            return returndata;
        }
    }

    /**
     * @notice Bubble up revert
     * @param returndata Return data
     */
    function _revert(bytes memory returndata) private pure {
        if (returndata.length > 0) {
            assembly {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }
        } else {
            revert FailedInnerCall();
        }
    }
}
