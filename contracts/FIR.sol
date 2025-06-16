// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract FIR is ERC20Burnable {
    constructor(string memory name_, string memory symbol_, uint256 totalSupply_, address holder) ERC20(name_, symbol_) {
        _mint(holder, totalSupply_);
    }
}