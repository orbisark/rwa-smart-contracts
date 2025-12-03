/**
 *Submitted for verification at Etherscan.io on 2020-06-05
 */

// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

interface IRouter {
    function factory() external view returns (address);

    function WETH() external view returns (address);
}

contract Router is IRouter {
    address public immutable override factory;
    address public immutable override WETH;

    constructor(address _factory, address _WETH) {
        factory = _factory;
        WETH = _WETH;
    }

    receive() external payable {
        assert(msg.sender == WETH); // only accept ETH via fallback from the WETH contract
    }
}
