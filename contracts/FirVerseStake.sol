// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract FirVerseStake is ERC721Holder, Ownable2Step, ReentrancyGuard  {
    using EnumerableSet for EnumerableSet.UintSet;
    using SafeERC20 for ERC20Burnable;

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    uint256 public constant TOTAL_DAYS = 360;

    ERC20Burnable public immutable firToken;
    IERC721 public immutable vboxNFT;

    uint256 public immutable startTimestamp;
    uint256 public immutable totalReward;
    uint256 public immutable dailyUnlock;

    uint256 public minStakeAmount = 1e18;
    uint256 public maxStakePerNFT = 2000e18;

    uint256 public lastBurnedDay;

    uint256 public totalUnlocked;
    uint256 public stakeCounter;

    struct StakeType {
        uint256 lockDays;
        uint256 rewardRate; // e.g. 100 = 1%
    }

    struct StakeInfo {
        address owner;
        uint256 nftId;
        uint256 amount;
        uint256 startDay;
        uint256 lockDays;
        uint256 rewardRate;
        uint256 claimedDay;
        bool redeemed;
    }

    StakeType[] public stakeTypes;
    mapping(uint256 => StakeInfo) public stakes;

    mapping(uint256 => uint256) public nftStakedAmount;
    mapping(uint256 => address) public nftOwner;
    mapping(address => EnumerableSet.UintSet) private userStakes;
    mapping(uint256 => uint256) public dailyClaimed;

    event Staked(address indexed user, uint256 indexed stakeId, uint256 nftId, uint256 amount, uint256 lockDays);
    event Claimed(address indexed user, uint256 indexed stakeId, uint256 reward, uint256 day);
    event Redeemed(address indexed user, uint256 indexed stakeId);
    event NFTWithdrawn(address indexed user, uint256 nftId);
    event DailyBurned(uint256 indexed day, uint256 amount);

    event StakeTypeUpdated(uint8 index, uint256 lockDays, uint256 rewardRate);
    
    constructor(
        address vboxNFT_,
        address firToken_,
        uint256 startTimestamp_,
        uint256 totalReward_
    ) {
        require(startTimestamp_ % 1 days == 0, "Start time must be UTC 0");
        vboxNFT = IERC721(vboxNFT_);
        firToken = ERC20Burnable(firToken_);
        startTimestamp = startTimestamp_;
        totalReward = totalReward_;
        dailyUnlock = totalReward_ / TOTAL_DAYS;

        stakeTypes.push(StakeType(15, 2500));
        stakeTypes.push(StakeType(45, 5000));
        stakeTypes.push(StakeType(90, 7500));
        stakeTypes.push(StakeType(180, 15000));
        stakeTypes.push(StakeType(360, 25000));
    }

    function addStakeType(uint256 lockDays, uint256 rewardRate) external onlyOwner {
        stakeTypes.push(StakeType(lockDays, rewardRate));
    }

    function updateStakeType(uint8 index, uint256 newLockDays, uint256 newRewardRate) external onlyOwner {
        require(index < stakeTypes.length, "Invalid index");
        stakeTypes[index] = StakeType(newLockDays, newRewardRate);
        emit StakeTypeUpdated(index, newLockDays, newRewardRate);
    }

    function setStakeAmountLimits(uint256 minAmount, uint256 maxAmount) external onlyOwner {
        require(minAmount > 0 && maxAmount > minAmount, "Invalid limits");
        minStakeAmount = minAmount;
        maxStakePerNFT = maxAmount;
    }

    function getCurrentDay() public view returns (uint256) {
        if (block.timestamp < startTimestamp) return 0;
        return (block.timestamp - startTimestamp) / 1 days + 1;
    }

    function batchStake(uint256[] calldata nftIdArr, uint256[] calldata stakeTypeArr, uint256[] calldata amountArr) external nonReentrant {
        require(block.timestamp > startTimestamp, "Not start");
        require(block.timestamp < startTimestamp + TOTAL_DAYS * 1 days, "Stake end");
        
        for (uint i = 0; i < nftIdArr.length; i++) {
            _stake(nftIdArr[i], stakeTypeArr[i], amountArr[i]);
        }
    }

    function stake(uint256 nftId, uint256 stakeTypeId, uint256 amount) external nonReentrant {
        require(block.timestamp > startTimestamp, "Not start");
        require(block.timestamp < startTimestamp + TOTAL_DAYS * 1 days, "Stake end");
        _stake(nftId, stakeTypeId, amount);
    }

    function _stake(uint256 nftId, uint256 stakeTypeId, uint256 amount) internal {
        require(amount >= minStakeAmount, "Below minimum stake amount");
        require(nftStakedAmount[nftId] + amount <= maxStakePerNFT, "Exceeds NFT stake limit");
        require(stakeTypeId < stakeTypes.length, "Invalid stake type");

        if (nftOwner[nftId] == address(0)) {
            require(vboxNFT.ownerOf(nftId) == msg.sender, "Not NFT owner");
            vboxNFT.safeTransferFrom(msg.sender, address(this), nftId);
            nftOwner[nftId] = msg.sender;
        } else {
            require(nftOwner[nftId] == msg.sender, "NFT belongs to another user");
        }

        nftStakedAmount[nftId] += amount;
        StakeType memory sType = stakeTypes[stakeTypeId];
        uint256 currentDay = getCurrentDay();

        uint256 stakeId = stakeCounter++;
        stakes[stakeId] = StakeInfo({
            owner: msg.sender,
            nftId: nftId,
            amount: amount,
            startDay: currentDay,
            lockDays: sType.lockDays,
            rewardRate: sType.rewardRate,
            claimedDay: currentDay - 1,
            redeemed: false
        });

        userStakes[msg.sender].add(stakeId);
        firToken.safeTransferFrom(msg.sender, address(this), amount);

        emit Staked(msg.sender, stakeId, nftId, amount, sType.lockDays);
    }

    function claim(uint256 from, uint256 to) external nonReentrant {
        _burnPending();
        uint256 today = getCurrentDay();
        if (today > TOTAL_DAYS) return;

        uint256 claimableReward = 0;
        EnumerableSet.UintSet storage set = userStakes[msg.sender];
        uint256 len = set.length();

        require(from < to && to <= len, "Invalid range");

        for (uint256 i = from; i < to; ++i) {
            uint256 id = set.at(i);
            StakeInfo memory s = stakes[id];
            if (s.redeemed) continue;

            uint256 rewardDay = today - 1;
            if (rewardDay >= s.startDay + s.lockDays - 1) continue;
            if (s.claimedDay >= today) continue;

            uint256 reward = s.amount * s.rewardRate / BASIS_POINTS_DIVISOR / TOTAL_DAYS;
            uint256 available = dailyUnlock - dailyClaimed[rewardDay];
            uint256 actualReward = reward > available ? available : reward;

            if (actualReward == 0) continue;

            s.claimedDay = today;
            claimableReward += actualReward;

            stakes[id] = s;
            dailyClaimed[rewardDay] += actualReward;
            
            emit Claimed(msg.sender, id, actualReward, rewardDay);
        }

        if (claimableReward > 0) {
            firToken.safeTransfer(msg.sender, claimableReward);
        }
    }

    function redeem(uint256 stakeId) external nonReentrant {
        StakeInfo storage s = stakes[stakeId];
        require(s.owner == msg.sender, "Not stake owner");
        require(!s.redeemed, "Already redeemed");
        require(getCurrentDay() >= s.startDay + s.lockDays, "Stake not matured");

        s.redeemed = true;
        nftStakedAmount[s.nftId] -= s.amount;
        firToken.safeTransfer(msg.sender, s.amount);

        emit Redeemed(msg.sender, stakeId);
    }

    function withdrawNFT(uint256 nftId) external nonReentrant {
        require(nftOwner[nftId] == msg.sender, "Not NFT staker");
        require(nftStakedAmount[nftId] == 0, "NFT still in use");

        delete nftOwner[nftId];
        vboxNFT.safeTransferFrom(address(this), msg.sender, nftId);

        emit NFTWithdrawn(msg.sender, nftId);
    }

    function _burnPending() internal {
        uint256 today = getCurrentDay();
        if (lastBurnedDay >= today - 1) return;

        uint256 pendingDays = today - 1 - lastBurnedDay;
        uint256 expectedUnlock = dailyUnlock * pendingDays;
        
        uint256 claimed = dailyClaimed[lastBurnedDay];

        if (totalUnlocked + expectedUnlock > totalReward) {
            expectedUnlock = totalReward - totalUnlocked;
        }

        totalUnlocked += expectedUnlock;
        lastBurnedDay = today - 1;

        if (claimed < expectedUnlock) {
            uint256 toBurn = expectedUnlock - claimed;
            firToken.burn(toBurn);
            emit DailyBurned(today - 1, toBurn);
        }
    }

    function getUserStakeIds(address user) external view returns (uint256[] memory ids) {
        EnumerableSet.UintSet storage set = userStakes[user];
        ids = new uint256[](set.length());
        for (uint256 i = 0; i < set.length(); i++) {
            ids[i] = set.at(i);
        }
    }

    function getUserStakes(address user) external view returns (StakeInfo[] memory infos) {
        EnumerableSet.UintSet storage set = userStakes[user];
        infos = new StakeInfo[](set.length());
        for (uint256 i = 0; i < set.length(); i++) {
            infos[i] = stakes[set.at(i)];
        }
    }
}
