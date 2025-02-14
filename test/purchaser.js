const { assert } = require("chai");
const { ethers } = require("hardhat");
const BigNumber = ethers.BigNumber;

describe("ETHPurchaser", async () => {
  let accounts;
  let defaultDutchAuctionLengthInSeconds = 60 * 60 * 7;

  async function buildContract({
    license,
    collector,
    accountant,
    dutchAuctionLengthInSeconds,
  }) {
    const _dutchAuctionLengthInSeconds =
      dutchAuctionLengthInSeconds ?? defaultDutchAuctionLengthInSeconds;
    const ETHPurchaser = await ethers.getContractFactory("ETHPurchaser");
    const purchaser = await ETHPurchaser.deploy();
    await purchaser.deployed();

    await purchaser.setDutchAuctionLengthInSeconds(
      _dutchAuctionLengthInSeconds
    );
    if (license) {
      await purchaser.setLicense(license);
    }
    if (collector) {
      await purchaser.setCollector(collector);
    }
    if (accountant) {
      await purchaser.setAccountant(accountant);
    }

    return purchaser;
  }

  before(async () => {
    accounts = await ethers.getSigners();
  });

  it("should only allow admin to set dutchAuctionLengthInSeconds", async () => {
    let purchaser = await buildContract({});

    var err;
    try {
      await purchaser.connect(accounts[1]).setDutchAuctionLengthInSeconds(10);
    } catch (error) {
      err = error;
    }

    assert(err, "Expected an error but did not get one");

    await purchaser.setDutchAuctionLengthInSeconds(10);

    const value = await purchaser.dutchAuctionLengthInSeconds();
    assert(value.eq(BigNumber.from(10)), "Value was not updated");
  });

  it("should only allow admin to set license", async () => {
    let purchaser = await buildContract({});

    var err;
    try {
      await purchaser.connect(accounts[1]).setLicense(purchaser.address);
    } catch (error) {
      err = error;
    }

    assert(err, "Expected an error but did not get one");

    await purchaser.setLicense(purchaser.address);

    const value = await purchaser.license();
    assert(value == purchaser.address, "Value was not updated");
  });

  it("should only allow admin to set collector", async () => {
    let purchaser = await buildContract({});

    var err;
    try {
      await purchaser.connect(accounts[1]).setCollector(purchaser.address);
    } catch (error) {
      err = error;
    }

    assert(err, "Expected an error but did not get one");

    await purchaser.setCollector(purchaser.address);

    const value = await purchaser.collector();
    assert(value == purchaser.address, "Value was not updated");
  });

  it("should only allow admin to set accountant", async () => {
    let purchaser = await buildContract({});

    var err;
    try {
      await purchaser.connect(accounts[1]).setAccountant(purchaser.address);
    } catch (error) {
      err = error;
    }

    assert(err, "Expected an error but did not get one");

    await purchaser.setAccountant(purchaser.address);

    const value = await purchaser.accountant();
    assert(value == purchaser.address, "Value was not updated");
  });

  it("should only allow admin to pause purchases", async () => {
    const MockERC721License = await ethers.getContractFactory(
      "MockERC721License"
    );
    const license = await MockERC721License.deploy("Mock", "MOCK");
    await license.deployed();

    const minPayment = 1;

    const MockCollector = await ethers.getContractFactory("MockCollector");
    const collector = await MockCollector.deploy(1000, minPayment);
    await collector.deployed();

    const MockAccountant = await ethers.getContractFactory("MockAccountant");
    const accountant = await MockAccountant.deploy(1, 2);
    await accountant.deployed();

    let purchaser = await buildContract({
      accountant: accountant.address,
      license: license.address,
      collector: collector.address,
    });

    let contributionRate = 10;

    await license.mint(accounts[2].address, 1);
    await license
      .connect(accounts[2])
      .setApprovalForAll(purchaser.address, true);
    await accountant.setContributionRate(1, contributionRate);
    await collector.setContributionRate(1, contributionRate, {
      value: ethers.utils.parseEther("1"),
    });

    const maxPurchasePrice = 20 + 1000 * contributionRate;

    var err;
    try {
      await purchaser.connect(accounts[1]).pause();
    } catch (error) {
      err = error;
    }

    assert(err, "Expected an error but did not get one");

    await purchaser.pause();

    var err;
    try {
      await purchaser
        .connect(accounts[3])
        .purchase(1, accounts[3].address, maxPurchasePrice, contributionRate, {
          value: maxPurchasePrice,
        });
    } catch (error) {
      err = error;
    }

    assert(
      err.message.includes("paused"),
      "Expected an error but did not get one"
    );

    await purchaser.unpause();

    await purchaser
      .connect(accounts[3])
      .purchase(1, accounts[3].address, maxPurchasePrice, contributionRate, {
        value: maxPurchasePrice,
      });
  });

  it("should calculate purchase price", async () => {
    const MockERC721License = await ethers.getContractFactory(
      "MockERC721License"
    );
    const license = await MockERC721License.deploy("Mock", "MOCK");
    await license.deployed();

    const minPayment = 1;

    const MockCollector = await ethers.getContractFactory("MockCollector");
    const collector = await MockCollector.deploy(1000, minPayment);
    await collector.deployed();

    const MockAccountant = await ethers.getContractFactory("MockAccountant");
    const accountant = await MockAccountant.deploy(1, 2);
    await accountant.deployed();

    let purchaser = await buildContract({
      accountant: accountant.address,
      license: license.address,
      collector: collector.address,
    });

    await license.mint(accounts[2].address, 1);
    await license
      .connect(accounts[2])
      .setApprovalForAll(purchaser.address, true);

    await accountant.setContributionRate(1, 10);
    await collector.setContributionRate(1, 10, {
      value: ethers.utils.parseEther("1"),
    });

    // Token ID: 1
    // Expiration: now + 1000
    // Contribution rate: 10
    // Time balance: 1000*10
    // Value: 20

    let purchasePrice = await purchaser.calculatePurchasePrice(1);

    assert.equal(
      purchasePrice.toString(),
      20 + 1000 * 10,
      "Purchase price was not correct"
    );
  });

  it("should calculate purchase price at start of auction", async () => {
    const MockERC721License = await ethers.getContractFactory(
      "MockERC721License"
    );
    const license = await MockERC721License.deploy("Mock", "MOCK");
    await license.deployed();

    const minPayment = 1;

    const MockCollector = await ethers.getContractFactory("MockCollector");
    const collector = await MockCollector.deploy(0, minPayment);
    await collector.deployed();

    const MockAccountant = await ethers.getContractFactory("MockAccountant");
    const accountant = await MockAccountant.deploy(1, 2);
    await accountant.deployed();

    let purchaser = await buildContract({
      accountant: accountant.address,
      license: license.address,
      collector: collector.address,
    });

    await license.mint(accounts[2].address, 1);
    await license
      .connect(accounts[2])
      .setApprovalForAll(purchaser.address, true);

    await accountant.setContributionRate(1, 10);
    await collector.setContributionRate(1, 10, {
      value: ethers.utils.parseEther("1"),
    });

    let purchasePrice = await purchaser.calculatePurchasePrice(1);

    assert.equal(
      purchasePrice.toString(),
      20,
      "Purchase price was not correct"
    );
  });

  it("should calculate purchase price during auction", async () => {
    const MockERC721License = await ethers.getContractFactory(
      "MockERC721License"
    );
    const license = await MockERC721License.deploy("Mock", "MOCK");
    await license.deployed();

    const minPayment = 1;

    const MockCollector = await ethers.getContractFactory("MockCollector");
    const collector = await MockCollector.deploy(0, minPayment);
    await collector.deployed();

    const MockAccountant = await ethers.getContractFactory("MockAccountant");
    const accountant = await MockAccountant.deploy(1, 2);
    await accountant.deployed();

    let purchaser = await buildContract({
      accountant: accountant.address,
      license: license.address,
      collector: collector.address,
    });

    await license.mint(accounts[2].address, 1);
    await license
      .connect(accounts[2])
      .setApprovalForAll(purchaser.address, true);

    await accountant.setContributionRate(1, 10000);
    await collector.setContributionRate(1, 10000, {
      value: ethers.utils.parseEther("1"),
    });

    // Mine a few blocks
    await hre.network.provider.request({
      method: "evm_mine",
      params: [],
    });

    await hre.network.provider.request({
      method: "evm_mine",
      params: [],
    });

    await hre.network.provider.request({
      method: "evm_mine",
      params: [],
    });

    let purchasePrice = await purchaser.calculatePurchasePrice(1);
    let decreaseRate = 20000 / defaultDutchAuctionLengthInSeconds;

    assert.equal(
      purchasePrice.toString(),
      Math.ceil(20000 - decreaseRate * 3),
      "Purchase price was not correct"
    );
  });

  it("should calculate purchase price at end of auction", async () => {
    const MockERC721License = await ethers.getContractFactory(
      "MockERC721License"
    );
    const license = await MockERC721License.deploy("Mock", "MOCK");
    await license.deployed();

    const minPayment = 1;

    const MockCollector = await ethers.getContractFactory("MockCollector");
    const collector = await MockCollector.deploy(0, minPayment);
    await collector.deployed();

    const MockAccountant = await ethers.getContractFactory("MockAccountant");
    const accountant = await MockAccountant.deploy(1, 2);
    await accountant.deployed();

    let purchaser = await buildContract({
      dutchAuctionLengthInSeconds: 3,
      accountant: accountant.address,
      license: license.address,
      collector: collector.address,
    });

    await license.mint(accounts[2].address, 1);
    await license
      .connect(accounts[2])
      .setApprovalForAll(purchaser.address, true);

    await accountant.setContributionRate(1, 10000);
    await collector.setContributionRate(1, 10000, {
      value: ethers.utils.parseEther("1"),
    });

    // Mine a few blocks
    await hre.network.provider.request({
      method: "evm_mine",
      params: [],
    });

    await hre.network.provider.request({
      method: "evm_mine",
      params: [],
    });

    await hre.network.provider.request({
      method: "evm_mine",
      params: [],
    });

    // Token ID: 1
    // Expiration: now
    // Contribution rate: 10
    // Time balance: 0
    // Value: 20

    let purchasePrice = await purchaser.calculatePurchasePrice(1);

    assert.equal(purchasePrice.toString(), 0, "Purchase price was not correct");
  });

  it("should calculate purchase price after auction", async () => {
    const MockERC721License = await ethers.getContractFactory(
      "MockERC721License"
    );
    const license = await MockERC721License.deploy("Mock", "MOCK");
    await license.deployed();

    const minPayment = 1;

    const MockCollector = await ethers.getContractFactory("MockCollector");
    const collector = await MockCollector.deploy(0, minPayment);
    await collector.deployed();

    const MockAccountant = await ethers.getContractFactory("MockAccountant");
    const accountant = await MockAccountant.deploy(1, 2);
    await accountant.deployed();

    let purchaser = await buildContract({
      dutchAuctionLengthInSeconds: 2,
      accountant: accountant.address,
      license: license.address,
      collector: collector.address,
    });

    await license.mint(accounts[2].address, 1);
    await license
      .connect(accounts[2])
      .setApprovalForAll(purchaser.address, true);

    await accountant.setContributionRate(1, 10000);
    await collector.setContributionRate(1, 10000, {
      value: ethers.utils.parseEther("1"),
    });

    // Mine a few blocks
    await hre.network.provider.request({
      method: "evm_mine",
      params: [],
    });

    await hre.network.provider.request({
      method: "evm_mine",
      params: [],
    });

    await hre.network.provider.request({
      method: "evm_mine",
      params: [],
    });

    let purchasePrice = await purchaser.calculatePurchasePrice(1);

    assert.equal(purchasePrice.toString(), 0, "Purchase price was not correct");
  });

  it("should purchase a license [ @skip-on-coverage ]", async () => {
    const MockERC721License = await ethers.getContractFactory(
      "MockERC721License"
    );
    const license = await MockERC721License.deploy("Mock", "MOCK");
    await license.deployed();

    const minPayment = 1;

    const MockCollector = await ethers.getContractFactory("MockCollector");
    const collector = await MockCollector.deploy(1000, minPayment);
    await collector.deployed();

    const MockAccountant = await ethers.getContractFactory("MockAccountant");
    const accountant = await MockAccountant.deploy(1, 2);
    await accountant.deployed();

    let purchaser = await buildContract({
      accountant: accountant.address,
      license: license.address,
      collector: collector.address,
    });

    let contributionRate = 10;

    await license.mint(accounts[2].address, 1);
    await license
      .connect(accounts[2])
      .setApprovalForAll(purchaser.address, true);

    await accountant.setContributionRate(1, contributionRate);
    let result1 = await collector.setContributionRate(1, contributionRate, {
      value: ethers.utils.parseEther("1"),
    });
    let receipt1 = await result1.wait();
    let block1 = await ethers.provider.getBlock(receipt1.blockNumber);

    // Token ID: 1
    // Expiration: now + 1000
    // Contribution rate: 10
    // Time balance: 1000*10
    // Value: 20

    let initialExpiration = await collector.licenseExpirationTimestamps(1);

    let originalBalance2 = await ethers.provider.getBalance(
      accounts[3].address
    );

    const maxPurchasePrice = 20 + 1000 * contributionRate;
    let result2 = await purchaser
      .connect(accounts[3])
      .purchase(1, accounts[3].address, maxPurchasePrice, contributionRate, {
        value: maxPurchasePrice,
      });

    let receipt2 = await result2.wait();
    let block2 = await ethers.provider.getBlock(receipt2.blockNumber);

    let finalPurchasePrice =
      maxPurchasePrice -
      (block2.timestamp - block1.timestamp) * contributionRate;

    let buyerBalance = await ethers.provider.getBalance(accounts[3].address);

    assert.equal(
      await license.ownerOf(1),
      accounts[3].address,
      "License did not transfer"
    );
    assert.equal(
      buyerBalance.toString(),
      BigNumber.from(originalBalance2).sub(maxPurchasePrice).toString(),
      "Payment was not taken from buyer"
    );
    assert.equal(
      (await purchaser.payments(accounts[2].address)).toString(),
      finalPurchasePrice,
      "Payment was not sent to seller"
    );
    assert(
      (await collector.licenseExpirationTimestamps(1)).gt(initialExpiration),
      "Collector was not updated"
    );
  });

  it("should fail to purchase license if maxPurchasePrice is too low", async () => {
    const MockERC721License = await ethers.getContractFactory(
      "MockERC721License"
    );
    const license = await MockERC721License.deploy("Mock", "MOCK");
    await license.deployed();

    const minPayment = 1;

    const MockCollector = await ethers.getContractFactory("MockCollector");
    const collector = await MockCollector.deploy(1000, minPayment);
    await collector.deployed();

    const MockAccountant = await ethers.getContractFactory("MockAccountant");
    const accountant = await MockAccountant.deploy(1, 2);
    await accountant.deployed();

    let purchaser = await buildContract({
      accountant: accountant.address,
      license: license.address,
      collector: collector.address,
    });

    let contributionRate = 10;

    await license.mint(accounts[2].address, 1);
    await license
      .connect(accounts[2])
      .setApprovalForAll(purchaser.address, true);

    await accountant.setContributionRate(1, contributionRate);
    await collector.setContributionRate(1, contributionRate, {
      value: ethers.utils.parseEther("1"),
    });

    // Token ID: 1
    // Expiration: now + 1000
    // Contribution rate: 10
    // Time balance: 1000*10
    // Value: 20

    const maxPurchasePrice = 20 + 1000 * contributionRate;

    var err;
    try {
      await purchaser
        .connect(accounts[3])
        .purchase(
          1,
          accounts[3].address,
          maxPurchasePrice - 1000,
          contributionRate,
          {
            value: maxPurchasePrice - 1000,
          }
        );
    } catch (error) {
      err = error;
    }

    assert(
      err.message.includes("above max purchase price"),
      "Expected an error but did not get one"
    );
  });

  it("should fail to purchase license if value is too low", async () => {
    const MockERC721License = await ethers.getContractFactory(
      "MockERC721License"
    );
    const license = await MockERC721License.deploy("Mock", "MOCK");
    await license.deployed();

    const minPayment = 1;

    const MockCollector = await ethers.getContractFactory("MockCollector");
    const collector = await MockCollector.deploy(1000, minPayment);
    await collector.deployed();

    const MockAccountant = await ethers.getContractFactory("MockAccountant");
    const accountant = await MockAccountant.deploy(1, 2);
    await accountant.deployed();

    let purchaser = await buildContract({
      accountant: accountant.address,
      license: license.address,
      collector: collector.address,
    });

    let contributionRate = 10;

    await license.mint(accounts[2].address, 1);
    await license
      .connect(accounts[2])
      .setApprovalForAll(purchaser.address, true);

    await accountant.setContributionRate(1, contributionRate);
    await collector.setContributionRate(1, contributionRate, {
      value: ethers.utils.parseEther("1"),
    });

    // Token ID: 1
    // Expiration: now + 1000
    // Contribution rate: 10
    // Time balance: 1000*10
    // Value: 20

    const maxPurchasePrice = 20 + 1000 * contributionRate;

    var err;
    try {
      await purchaser
        .connect(accounts[3])
        .purchase(1, accounts[3].address, maxPurchasePrice, contributionRate, {
          value: maxPurchasePrice - 1000,
        });
    } catch (error) {
      err = error;
    }

    assert(
      err.message.includes(
        "Message value must be greater than or equal to the total buy price"
      ),
      "Expected an error but did not get one"
    );
  });
});
