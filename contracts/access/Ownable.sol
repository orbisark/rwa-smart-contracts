// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

/**
 * @title Ownable Base Contract
 * @notice Provides owner-based access control primitives
 */
abstract contract Ownable {
    // Data
    address private _owner;

    // Modifiers
    /**
     * @notice Only owner
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    // Errors
    /**
     * @notice Unauthorized account error
     * @param account Caller address
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @notice Invalid owner error
     * @param owner Address
     */
    error OwnableInvalidOwner(address owner);

    // Constructor
    /**
     * @notice Initialize owner
     * @param initialOwner Initial owner address
     */
    constructor(address initialOwner) {
        _transferOwnership(initialOwner);
    }

    // Events
    /**
     * @notice Ownership transferred event
     * @param previousOwner Previous owner
     * @param newOwner New owner
     */
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // Methods
    /**
     * @notice Get current owner
     * @return Current owner address
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @notice Check caller is owner
     */
    function _checkOwner() internal view virtual {
        if (owner() != msg.sender) {
            revert OwnableUnauthorizedAccount(msg.sender);
        }
    }

    /**
     * @notice Renounce ownership
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @notice Transfer ownership
     * @param newOwner New owner address
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @notice Internal: set owner
     * @param newOwner New owner address
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
