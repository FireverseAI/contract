// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract FirTokenVesting {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public immutable beneficiary;

    uint256 public immutable startTime;
    uint256 public constant INTERVAL = 30 days;
    uint256 public constant RELEASE_PER_INTERVAL = 25_000_000 * 1e18;

    uint256 public totalClaimed;

    event TokensClaimed(uint256 amount, uint256 totalClaimed);

    constructor(address _token, address _beneficiary, uint256 _startTime) {
        require(_token != address(0), "Invalid token address");
        require(_beneficiary != address(0), "Invalid beneficiary");

        token = IERC20(_token);
        beneficiary = _beneficiary;
        startTime = _startTime;
    }

    function totalUnlocked() public view returns (uint256) {
        if (block.timestamp < startTime) {
            return 0;
        }

        uint256 intervals = (block.timestamp - startTime) / INTERVAL + 1;
        return intervals * RELEASE_PER_INTERVAL;
    }

    function claimableAmount() public view returns (uint256 claimable) {
        uint256 unlocked = totalUnlocked();
        if (unlocked <= totalClaimed) {
            return 0;
        }
        claimable = unlocked - totalClaimed;

        uint256 balance = token.balanceOf(address(this));

        if (balance < claimable) {
            claimable = balance;
        }
    }

    function claim() external {
        require(msg.sender == beneficiary, "Not beneficiary");

        uint256 amount = claimableAmount();
        require(amount > 0, "Nothing to claim");

        totalClaimed += amount;

        token.safeTransfer(beneficiary, amount);

        emit TokensClaimed(amount, totalClaimed);
    }
}
