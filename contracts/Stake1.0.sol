// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * TimelockStakingForVoting (加强版：orderId唯一性 + 最小质押额 + 赎回余额检查)
 * - 兼容旧接口：stake(amount) 自动生成“不冲突”的 orderId & voteId
 * - 新接口：stakeWithOrder(orderId, amount, voteId) 做唯一性校验
 * - 最小质押额：minStakeAmount（按“实际到账 received”校验，兼容转账税）
 * - 赎回时检查合约余额足够，提升稳健性
 */
contract TimelockStakingForVoting is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;
    uint64 public startTime; // 质押开始(含)
    uint64 public endTime;   // 质押结束(此后可赎回)

    uint256 public nextOrderId = 1;      // 自增候选起点（stake(amount) 用）
    uint256 public totalStaked;
    uint256 public totalOrders;
    uint256 public unredeemedPrincipal;
    uint256 public minStakeAmount;       // 最小质押“实际到账”数量（wei）

    mapping(address => uint256) public userStakeNonce;

    struct StakeOrder {
        uint256 id;
        address staker;
        uint256 amount;     // 实际到账（余额差额法）
        uint64  timestamp;
        bool    redeemed;
        bytes32 voteId;
    }

    mapping(uint256 => StakeOrder) public orders;        // orderId => 订单
    mapping(address => uint256[]) private _userOrders;   // 用户 => 订单ID列表
    mapping(address => uint256) public unredeemedAmount; // 用户未赎回本金汇总

    event StakeWindowUpdated(uint64 startTime, uint64 endTime);
    event MinStakeAmountUpdated(uint256 minStakeAmount);
    event StakeCreated(uint256 indexed orderId, address indexed staker, uint256 amount, uint64 timestamp, bytes32 indexed voteId);
    event StakeRedeemed(uint256 indexed orderId, address indexed staker, uint256 amount, uint64 timestamp, bytes32 indexed voteId);
    event RescueERC20(address indexed token, address indexed to, uint256 amount);
    event SweepStakingRemainder(address indexed to, uint256 amount);

    constructor(
        IERC20 _stakingToken,
        uint64 _startTime,
        uint64 _endTime,
        uint256 _minStakeAmount
    ) {
        require(address(_stakingToken) != address(0), "token=0");
        require(_endTime > _startTime, "end<=start");
        require(_startTime >= block.timestamp, "start in past");
        stakingToken = _stakingToken;
        startTime = _startTime;
        endTime = _endTime;
        minStakeAmount = _minStakeAmount;
        emit StakeWindowUpdated(_startTime, _endTime);
        emit MinStakeAmountUpdated(_minStakeAmount);
    }

    // ---------- 管理时间窗 & 参数 ----------
    function setStakeWindowBeforeStart(uint64 _startTime, uint64 _endTime) external onlyOwner {
        require(block.timestamp < startTime, "already started");
        require(_endTime > _startTime, "end<=start");
        require(_startTime >= block.timestamp, "start in past");
        startTime = _startTime;
        endTime = _endTime;
        emit StakeWindowUpdated(_startTime, _endTime);
    }

    function extendEndTime(uint64 _newEndTime) external onlyOwner {
        require(_newEndTime > endTime, "must extend");
        endTime = _newEndTime;
        emit StakeWindowUpdated(startTime, _newEndTime);
    }

    function setMinStakeAmount(uint256 _min) external onlyOwner {
        minStakeAmount = _min;
        emit MinStakeAmountUpdated(_min);
    }

    // ---------- 暂停（仅阻断新质押） ----------
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ---------- 质押（两种入口） ----------
    /// 兼容旧前端：只传 amount；自动生成不冲突的 orderId 与 voteId
    function stake(uint256 amount)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 orderId)
    {
        require(amount > 0, "amount=0");
        uint256 nowTs = block.timestamp;
        require(nowTs >= startTime, "not started");
        require(nowTs < endTime, "ended");

        uint256 balBefore = stakingToken.balanceOf(address(this));
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = stakingToken.balanceOf(address(this)) - balBefore;
        require(received > 0, "received=0");
        require(received >= minStakeAmount, "below minStake");

        orderId = _nextFreeOrderId();

        uint256 nonce = ++userStakeNonce[msg.sender];
        bytes32 voteId = keccak256(abi.encodePacked("AUTO", address(this), msg.sender, orderId, nonce, nowTs));

        _storeOrder(orderId, msg.sender, received, uint64(nowTs), voteId);
        return orderId;
    }

    /// 新接口：显式提供 orderId 与 voteId（orderId 唯一性校验）
    //function stakeWithOrder(uint256 orderId, uint256 amount, bytes32 voteId)
    //    external
    //    whenNotPaused
    //    nonReentrant
   // {
   //     require(orderId != 0, "orderId=0");
   //     require(orders[orderId].staker == address(0), "orderId used"); // 唯一性
   //     require(amount > 0, "amount=0");
   //     require(voteId != bytes32(0), "voteId=0");

   //     uint256 nowTs = block.timestamp;
   //     require(nowTs >= startTime, "not started");
   //     require(nowTs < endTime, "ended");

   //     uint256 balBefore = stakingToken.balanceOf(address(this));
   //     stakingToken.safeTransferFrom(msg.sender, address(this), amount);
   //     uint256 received = stakingToken.balanceOf(address(this)) - balBefore;
   //     require(received > 0, "received=0");
  //      require(received >= minStakeAmount, "below minStake");

    //    _storeOrder(orderId, msg.sender, received, uint64(nowTs), voteId);
   // }

    function _nextFreeOrderId() internal returns (uint256 id) {
        id = nextOrderId;
        while (orders[id].staker != address(0)) {
            unchecked { id++; }
        }
        nextOrderId = id + 1;
    }

    function _storeOrder(uint256 orderId, address staker, uint256 received, uint64 nowTs, bytes32 voteId) internal {
        require(orders[orderId].staker == address(0), "order exists");
        orders[orderId] = StakeOrder({
            id: orderId,
            staker: staker,
            amount: received,
            timestamp: nowTs,
            redeemed: false,
            voteId: voteId
        });
        _userOrders[staker].push(orderId);

        totalStaked += received;
        totalOrders += 1;
        unredeemedPrincipal += received;
        unredeemedAmount[staker] += received;

        emit StakeCreated(orderId, staker, received, nowTs, voteId);
    }

    // ---------- 赎回 ----------
    function redeem(uint256 orderId) public nonReentrant {
        require(block.timestamp >= endTime, "not ended");
        _redeem(orderId);
    }

    function redeemMany(uint256[] calldata orderIds) external nonReentrant {
        require(block.timestamp >= endTime, "not ended");
        for (uint256 i = 0; i < orderIds.length; i++) {
            _redeem(orderIds[i]);
        }
    }

    function _redeem(uint256 orderId) internal {
        StakeOrder storage o = orders[orderId];
        require(o.id == orderId, "order not found");
        require(!o.redeemed, "already redeemed");
        require(o.staker == msg.sender, "not owner");

        // ✅ 赎回前检查合约余额是否充足（更安全）
        uint256 bal = stakingToken.balanceOf(address(this));
        require(bal >= o.amount, "insufficient contract balance");

        o.redeemed = true; // 先改状态，再外部交互
        unredeemedPrincipal -= o.amount;
        unredeemedAmount[msg.sender] -= o.amount;

        stakingToken.safeTransfer(msg.sender, o.amount);
        emit StakeRedeemed(orderId, msg.sender, o.amount, uint64(block.timestamp), o.voteId);
    }

    // ---------- 查询 ----------
    function getOrder(uint256 orderId) external view returns (StakeOrder memory) {
        return orders[orderId];
    }

    function getUserOrderIds(address user) external view returns (uint256[] memory) {
        return _userOrders[user];
    }

    function getUserOrders(address user) external view returns (StakeOrder[] memory list) {
        uint256[] memory ids = _userOrders[user];
        list = new StakeOrder[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            list[i] = orders[ids[i]];
        }
    }

    function getUserOrdersPaged(address user, uint256 offset, uint256 limit)
        external
        view
        returns (StakeOrder[] memory list)
    {
        uint256[] memory ids = _userOrders[user];
        uint256 n = ids.length;
        if (offset >= n) {
            return new StakeOrder[](0);
        }
        uint256 end = offset + limit;
        if (end < offset || end > n) end = n;

        uint256 len = end - offset;
        list = new StakeOrder[](len);
        for (uint256 i = 0; i < len; i++) {
            list[i] = orders[ids[offset + i]];
        }
    }

    // ---------- 其他视图 ----------
    function userOrderCount(address user) external view returns (uint256) {
        return _userOrders[user].length;
    }

    function stakingOpen() external view returns (bool) {
        return block.timestamp >= startTime && block.timestamp < endTime;
    }

    function redeemOpen() external view returns (bool) {
        return block.timestamp >= endTime;
    }

    function contractBalance() external view returns (uint256) {
        return stakingToken.balanceOf(address(this));
    }

    function userPendingAmount(address user) external view returns (uint256) {
        return unredeemedAmount[user];
    }

    // ---------- 管理员：救援与清扫 ----------
    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(stakingToken), "no rescue stakingToken");
        IERC20(token).safeTransfer(to, amount);
        emit RescueERC20(token, to, amount);
    }

    function sweepStakingRemainder(address to) external onlyOwner {
        require(unredeemedPrincipal == 0, "principal remains");
        uint256 bal = stakingToken.balanceOf(address(this));
        stakingToken.safeTransfer(to, bal);
        emit SweepStakingRemainder(to, bal);
    }
}
