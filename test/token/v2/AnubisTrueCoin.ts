import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("AnubisTrueCoinV2", function () {
  let anubisV1: any;
  let anubisV2: any;
  let owner: any;
  let addr1: any;
  let addr2: any;

  const TOKEN_NAME = "AnubisTrueCoin";
  const TOKEN_SYMBOL = "ATC42";
  const MAX_SUPPLY = ethers.parseEther("1000000"); // 1,000,000 tokens
  const INITIAL_PRICE = ethers.parseEther("0.01"); // 0.01 MATIC per token
  const SALE_PERCENTAGE = 5000; // 50%

  beforeEach(async () => {
    [owner, addr1, addr2] = await ethers.getSigners();

    const AnubisTrueCoinV1 = await ethers.getContractFactory("AnubisTrueCoin");
    anubisV1 = await upgrades.deployProxy(
      AnubisTrueCoinV1,
      [owner.address, MAX_SUPPLY, INITIAL_PRICE, SALE_PERCENTAGE, owner.address],
      { initializer: "initialize" }
    );
    await anubisV1.waitForDeployment();

    await anubisV1.connect(owner).giveMinterRole(owner.address);

    // Mint tokens to the contract for the sale
    await anubisV1.connect(owner).mint(await anubisV1.getAddress(), ethers.parseEther("1000"));

    // Grant upgrader role to owner
    const UPGRADER_ROLE = await anubisV1.UPGRADER_ROLE();
    await anubisV1.grantRole(UPGRADER_ROLE, owner.address);

    // Upgrade to V2
    const AnubisTrueCoinV2 = await ethers.getContractFactory("AnubisTrueCoinV2");
    anubisV2 = await upgrades.upgradeProxy(await anubisV1.getAddress(), AnubisTrueCoinV2);
  });

  it("Should retain state after upgrade", async function () {
    expect(await anubisV2.name()).to.equal(TOKEN_NAME);
    expect(await anubisV2.symbol()).to.equal(TOKEN_SYMBOL);
    expect(await anubisV2.cap()).to.equal(MAX_SUPPLY);
    expect(await anubisV2.price()).to.equal(INITIAL_PRICE);
    expect(await anubisV2.salePercentage()).to.equal(SALE_PERCENTAGE);
    expect(await anubisV2.treasury()).to.equal(owner.address);
  });

  it("Should allow setting and updating price", async function () {
    const NEW_PRICE = ethers.parseEther("0.02"); // 0.02 MATIC per token
    await anubisV2.connect(owner).setPrice(NEW_PRICE);
    expect(await anubisV2.price()).to.equal(NEW_PRICE);
  });

  it("Should allow buying tokens when sale is open", async function () {
    await anubisV2.connect(owner).setOpenSale(true);
    const buyAmount = ethers.parseEther("1"); // 1 MATIC
    const expectedTokens = (buyAmount*ethers.parseEther("1"))/INITIAL_PRICE;

    await anubisV2.connect(addr1).buyTokens({ value: buyAmount });

    expect(await anubisV2.balanceOf(addr1.address)).to.equal(expectedTokens);
    expect(await ethers.provider.getBalance(anubisV2.treasury())).to.be.above(buyAmount);
  });

  it("Should respect sale percentage limits", async function () {
    await anubisV2.connect(owner).setOpenSale(true);
    const maxSaleAmount = (MAX_SUPPLY * BigInt(SALE_PERCENTAGE)) / BigInt(10000);

    await expect(
      anubisV2.connect(addr1).buyTokens({ value: ethers.parseEther("5001") })
    ).to.be.revertedWith("Sale limit reached");

    expect(await anubisV2.totalSaleAmount()).to.be.lte(maxSaleAmount);
  });

  it("Should allow upgrading contract without affecting state", async function () {
    const newVersion = await anubisV2.version();
    expect(newVersion).to.equal("v2.0");
  });
});
