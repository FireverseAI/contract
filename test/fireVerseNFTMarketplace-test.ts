import { expect } from 'chai'
import { formatBytes32String, parseUnits } from 'ethers/lib/utils'
import { ethers, getChainId } from 'hardhat'
import { getWalletWithEther } from './utils/impersonate'
import { takeSnapshot, SnapshotRestorer } from '@nomicfoundation/hardhat-network-helpers'
import { Wallet } from 'ethers'
import { deployContract } from './utils/contracts'

import { FireVerseNFT, FireVerseNFTMarketplace, TestERC20 } from '../typechain'

describe('FireVerseNFTMarketplace', async function () {
  let owner: any

  let user0: Wallet
  let user1: Wallet
  let user2: Wallet

  const { provider } = ethers
  const uri = 'http://example.com'


  before('', async function () {
    owner = await ethers.getNamedSigner('deployer')
    // console.log('owner', owner.address)

    user0 = await getWalletWithEther()
    user1 = await getWalletWithEther()
    user2 = await getWalletWithEther()
  })

  describe('', function () {
    let snapshot: SnapshotRestorer

    let fireVerseNFT: FireVerseNFT
    let marketPlace: FireVerseNFTMarketplace
    let testToken: TestERC20

    before('', async function () {
      fireVerseNFT = (await deployContract('FireVerseNFT', ['FireVerse NFT', 'FireVerseNFT', 100])) as FireVerseNFT
      marketPlace = (await deployContract('FireVerseNFTMarketplace', [])) as FireVerseNFTMarketplace
      testToken = (await deployContract('TestERC20', ["Test Token", "TST", parseUnits('1000000'), 18])) as TestERC20

      await marketPlace.connect(owner).allowNFT(fireVerseNFT.address, true)
      await marketPlace.connect(owner).allowPaymentToken(ethers.constants.AddressZero, true)
      await marketPlace.connect(owner).allowPaymentToken(testToken.address, true)
      snapshot = await takeSnapshot()
    })
    beforeEach(async () => {
      await snapshot.restore()
    })
    after(async () => {
      await snapshot.restore()
    })

    async function createOrder(
      seller: Wallet,
      tokenId: number,
      price: string = '1',
      nonce: number = 0,
      paymentToken: string = ethers.constants.AddressZero
    ) {
      return {
        seller: seller.address,
        nft: fireVerseNFT.address,
        tokenId,
        price: parseUnits(price, 18),
        paymentToken,
        nonce,
        expiry: Math.floor(Date.now() / 1000) + 3600,
      };
    }

    async function signOrder(order: any, signer: Wallet) {
      const domain = {
        name: "FireVerseNFTMarketplace",
        version: "1",
        chainId: await getChainId(),
        verifyingContract: marketPlace.address,
      };

      const types = {
        Order: [
          { name: "seller", type: "address" },
          { name: "nft", type: "address" },
          { name: "tokenId", type: "uint256" },
          { name: "price", type: "uint256" },
          { name: "paymentToken", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "expiry", type: "uint256" },
        ],
      };

      return await signer._signTypedData(domain, types, order);
    }
    it('inits', async () => {
      expect(await marketPlace.allowedNFTs(fireVerseNFT.address)).to.be.true;
    })

    it('buy user0 to user1 with native token', async () => {
      await fireVerseNFT.connect(user0).mint(uri);
      expect(await fireVerseNFT.ownerOf(1)).to.equal(user0.address);

      const order = await createOrder(user0, 1);
      const signature = await signOrder(order, user0);

      await fireVerseNFT.connect(user0).setApprovalForAll(marketPlace.address, true);

      const beforeSellerBalance = await user0.getBalance()

      const beforePlatformFeeRecipientBalance = await owner.getBalance();;
      await marketPlace.connect(user1).buy(order, signature, { value: order.price });

      expect(await fireVerseNFT.ownerOf(1)).to.equal(user1.address);
      const afterSellerBalance = await user0.getBalance();
      const afterPlatformFeeRecipientBalance = await owner.getBalance();;
      expect(afterSellerBalance).to.equal(beforeSellerBalance.add(parseUnits('0.99')));
      expect(afterPlatformFeeRecipientBalance).to.equal(beforePlatformFeeRecipientBalance.add(parseUnits('0.01')));
    });

    it('buy user0 to user1 with token', async () => {
      await fireVerseNFT.connect(user0).mint(uri);
      expect(await fireVerseNFT.ownerOf(1)).to.equal(user0.address);

      const order = await createOrder(user0, 1, '1', 0, testToken.address);
      const signature = await signOrder(order, user0);

      await fireVerseNFT.connect(user0).setApprovalForAll(marketPlace.address, true);
      await testToken.connect(owner).transfer(user1.address, parseUnits('1'))
      await testToken.connect(user1).approve(marketPlace.address, parseUnits('1'))

      const beforeSellerBalance = await testToken.balanceOf(user0.address)
      const beforeBuyerBalance = await testToken.balanceOf(user1.address);
      const beforePlatformFeeRecipientBalance = await testToken.balanceOf(owner.address);

      await marketPlace.connect(user1).buy(order, signature, { value: order.price });

      expect(await fireVerseNFT.ownerOf(1)).to.equal(user1.address);
      const afterSellerBalance = await testToken.balanceOf(user0.address);
      const afterBuyerBalance = await testToken.balanceOf(user1.address);
      const afterPlatformFeeRecipientBalance = await testToken.balanceOf(owner.address);
      expect(afterSellerBalance).to.equal(beforeSellerBalance.add(parseUnits('0.99')));
      expect(afterBuyerBalance).to.equal(beforeBuyerBalance.sub(parseUnits('1')));
      expect(afterPlatformFeeRecipientBalance).to.equal(beforePlatformFeeRecipientBalance.add(parseUnits('0.01')));
    });


    it('token1 user0 -> user1 -> user2', async () => {
      await fireVerseNFT.connect(user0).mint(uri);
      await fireVerseNFT.connect(user0).setApprovalForAll(marketPlace.address, true);

      const order1 = await createOrder(user0, 1);
      const sig1 = await signOrder(order1, user0);
      await marketPlace.connect(user1).buy(order1, sig1, { value: order1.price });

      const order2 = await createOrder(user1, 1);
      const sig2 = await signOrder(order2, user1);
      await fireVerseNFT.connect(user1).setApprovalForAll(marketPlace.address, true);

      const beforeUser0 = await user0.getBalance();
      const beforeUser1 = await user1.getBalance();
      const beforePlatformFeeRecipientBalance = await owner.getBalance();;

      await marketPlace.connect(user2).buy(order2, sig2, { value: order2.price });

      expect(await fireVerseNFT.ownerOf(1)).to.equal(user2.address);
      expect(await user1.getBalance()).to.equal(beforeUser1.add(parseUnits('0.98')));
      expect(await user0.getBalance()).to.equal(beforeUser0.add(parseUnits('0.01')));
      expect(await owner.getBalance()).to.equal(beforePlatformFeeRecipientBalance.add(parseUnits('0.01')));
    });

    it('should reject cancelled orders', async () => {
      await fireVerseNFT.connect(user0).mint(uri);
      const order = await createOrder(user0, 1, '1', 0);

      await marketPlace.connect(user0).cancelOrder(fireVerseNFT.address, 1, 0);
      // await marketPlace.connect(user0).batchCancelOrder([fireVerseNFT.address], [1], [0]);
      const signature = await signOrder(order, user0);

      await fireVerseNFT.connect(user0).setApprovalForAll(marketPlace.address, true);

      await expect(
        marketPlace.connect(user1).buy(order, signature, { value: order.price })
      ).to.be.revertedWith("Invalid nonce");
    });

    it('should reject expiry order', async () => {
      await fireVerseNFT.connect(user0).mint(uri);
      const order = await createOrder(user0, 1, '1', 0);

      order.expiry -= 10000
      const signature = await signOrder(order, user0);

      await fireVerseNFT.connect(user0).setApprovalForAll(marketPlace.address, true);

      await expect(
        marketPlace.connect(user1).buy(order, signature, { value: order.price })
      ).to.be.revertedWith("Order expired");
    });
  })
})
