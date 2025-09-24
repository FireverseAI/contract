// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * TimelockStakingForVoting (按需求调整版)
 * 1. owner 可配置管理开始结束时间（开始前任意设置；开始后仅可“延长” endTime）
 * 2. 仅支持配置的 ERC20 代币；本金只有用户在 endTime 之后可赎回（管理员不能挪用 stakingToken）
 * 3. 质押 & 赎回函数均带入参订单号：
 *      - stake(orderId, amount, voteId)：对 orderId 做唯一性校验，成功后写入订单
 *      - redeem(orderId)：校验订单所有者/状态/到期时间后赎回
 *    并提供 getOrder(orderId) 单笔查询
 * 4. 到期(>= endTime)后方可赎回
 * 5. 按钱包地址查询质押记录接口（全量/分页/计数）
 * 其他：暂停仅阻断 stake；余额差额法兼容 fee-on-transfer；先改状态后转账；ReentrancyGuard
 */
contract TimelockStakingForVoting is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable stakingToken;
    uint64 public startTime; // 质押开始(含)
    uint64 public endTime;   // 质押结束(此后可赎回)

    uint256 public totalStaked;
    uint256 public totalOrders;
    uint256 public unredeemedPrincipal;

    struct StakeOrder {
        uint256 id;         // 订单号（外部传入，需唯一）
        address staker;     // 用户地址
        uint256 amount;     // 实际到账（余额差额法）
        uint64  timestamp;  // 质押时间
        bool    redeemed;   // 是否已赎回
        bytes32 voteId;     // 服务器提供的ID（建议前端 keccak256(utf8(stringId)) 后传入）
    }

    // orderId => 订单
    mapping(uint256 => StakeOrder) public orders;
    // 用户 => 订单ID列表
    mapping(address => uint256[]) private _userOrders;
    // 用户未赎回本金汇总
    mapping(address => uint256) public unredeemedAmount;

    event StakeWindowUpdated(uint64 startTime, uint64 endTime);
    event StakeCreated(uint256 indexed orderId, address indexed staker, uint256 amount, uint64 timestamp, bytes32 indexed voteId);
    event StakeRedeemed(uint256 indexed orderId, address indexed staker, uint256 amount, uint64 timestamp, bytes32 indexed voteId);
    event RescueERC20(address indexed token, address indexed to, uint256 amount);
    event SweepStakingRemainder(address indexed to, uint256 amount);

    constructor(IERC20 _stakingToken, uint64 _startTime, uint64 _endTime) {
        require(address(_stakingToken) != address(0), "token=0");
        require(_endTime > _startTime, "end<=start");
        require(_startTime >= block.timestamp, "start in past");
        stakingToken = _stakingToken;
        startTime = _startTime;
        endTime = _endTime;
        emit StakeWindowUpdated(_startTime, _endTime);
    }

    // ---------- 管理时间窗 ----------
    /// 开始前任意设置窗口
    function setStakeWindowBeforeStart(uint64 _startTime, uint64 _endTime) external onlyOwner {
        require(block.timestamp < startTime, "already started");
        require(_endTime > _startTime, "end<=start");
        require(_startTime >= block.timestamp, "start in past");
        startTime = _startTime;
        endTime = _endTime;
        emit StakeWindowUpdated(_startTime, _endTime);
    }

    /// 开始后仅允许延长 endTime
    function extendEndTime(uint64 _newEndTime) external onlyOwner {
        require(_newEndTime > endTime, "must extend");
        endTime = _newEndTime;
        emit StakeWindowUpdated(startTime, _newEndTime);
    }

    // ---------- 暂停（仅阻断新质押） ----------
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ---------- 质押 / 赎回 ----------
    /**
     * @notice 质押：由调用方提供 orderId，合约校验唯一性后入账
     * @param orderId 自定义订单号（需全局唯一且 > 0）
     * @param amount 拟质押数量（用户需先对本合约 approve）
     * @param voteId 服务器提供的 bytes32（建议对字符串做 keccak256 后传入）
     */
    function stake(uint256 orderId, uint256 amount, bytes32 voteId)
        external
        whenNotPaused
        nonReentrant
    {
        require(orderId != 0, "orderId=0");
        require(orders[orderId].id == 0, "orderId used"); // 唯一性校验
        require(amount > 0, "amount=0");
        require(voteId != bytes32(0), "voteId=0");

        uint256 nowTs = block.timestamp;
        require(nowTs >= startTime, "not started");
        require(nowTs < endTime, "ended");

        // 余额差额法，兼容转账税/重基
        uint256 balBefore = stakingToken.balanceOf(address(this));
        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = stakingToken.balanceOf(address(this)) - balBefore;
        require(received > 0, "received=0");

        orders[orderId] = StakeOrder({
            id: orderId,
            staker: msg.sender,
            amount: received,
            timestamp: uint64(nowTs),
            redeemed: false,
            voteId: voteId
        });
        _userOrders[msg.sender].push(orderId);

        totalStaked += received;
        totalOrders += 1;
        unredeemedPrincipal += received;
        unredeemedAmount[msg.sender] += received;

        emit StakeCreated(orderId, msg.sender, received, uint64(nowTs), voteId);
    }

    /// @notice 到期后赎回（不受暂停影响）
    function redeem(uint256 orderId) public nonReentrant {
        require(block.timestamp >= endTime, "not ended");
        _redeem(orderId);
    }

    /// @notice 批量赎回
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

        o.redeemed = true; // 先改状态，再转账
        unredeemedPrincipal -= o.amount;
        unredeemedAmount[msg.sender] -= o.amount;

        stakingToken.safeTransfer(msg.sender, o.amount);
        emit StakeRedeemed(orderId, msg.sender, o.amount, uint64(block.timestamp), o.voteId);
    }

    // ---------- 查询 ----------
    /// @notice 单笔读取（按订单号）
    function getOrder(uint256 orderId) external view returns (StakeOrder memory) {
        return orders[orderId];
    }

    /// @notice 返回某地址所有订单ID
    function getUserOrderIds(address user) external view returns (uint256[] memory) {
        return _userOrders[user];
    }

    /// @notice 返回某地址所有订单详情（可能 gas 重，前端慎用）
    function getUserOrders(address user) external view returns (StakeOrder[] memory list) {
        uint256[] memory ids = _userOrders[user];
        list = new StakeOrder[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            list[i] = orders[ids[i]];
        }
    }

    /// @notice 分页查询（推荐前端使用）
    function getUserOrdersPaged(address user, uint256 offset, uint256 limit)
        external
        view
        returns (StakeOrder[] memory list)
    {
        uint256[] memory ids = _userOrders[user];
        uint256 n = ids.length;
        if (offset >= n) {
            return new StakeOrder; // 空数组
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
    /// 仅救援“非质押代币”，本金不可被管理员转走
    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        require(token != address(stakingToken), "no rescue stakingToken");
        IERC20(token).safeTransfer(to, amount);
        emit RescueERC20(token, to, amount);
    }

    /// 在全部本金赎回后，可清扫剩余（如舍入/奇异代币残余）
    function sweepStakingRemainder(address to) external onlyOwner {
        require(unredeemedPrincipal == 0, "principal remains");
        uint256 bal = stakingToken.balanceOf(address(this));
        stakingToken.safeTransfer(to, bal);
        emit SweepStakingRemainder(to, bal);
    }
}
