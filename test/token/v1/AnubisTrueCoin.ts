import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("AnubisTrueCoin", function () {
  let anubis: any;
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

    const AnubisTrueCoin = await ethers.getContractFactory("AnubisTrueCoin");
    
    anubis = await upgrades.deployProxy(
      AnubisTrueCoin,
      [owner.address, MAX_SUPPLY, INITIAL_PRICE, SALE_PERCENTAGE, owner.address],
      { initializer: "initialize" }
    );
    await anubis.waitForDeployment();

    await anubis.connect(owner).giveMinterRole(owner.address);

    // Mint tokens to the contract for the sale
    await anubis.connect(owner).mint(await anubis.getAddress(), ethers.parseEther("1000"));
  });

  it("Should initialize the contract with correct values", async function () {
    expect(await anubis.name()).to.equal(TOKEN_NAME);
    expect(await anubis.symbol()).to.equal(TOKEN_SYMBOL);
    expect(await anubis.cap()).to.equal(MAX_SUPPLY);
    expect(await anubis.price()).to.equal(INITIAL_PRICE);
    expect(await anubis.salePercentage()).to.equal(SALE_PERCENTAGE);
    expect(await anubis.treasury()).to.equal(owner.address);
  });

  it("Should allow owner to set the price", async function () {
    const NEW_PRICE = ethers.parseEther("0.02"); // 0.02 MATIC per token

    await anubis.connect(owner).setPrice(NEW_PRICE);
    expect(await anubis.price()).to.equal(NEW_PRICE);
  });

  it("Should allow buying tokens when sale is open", async function () {
    await anubis.connect(owner).setOpenSale(true);

    const buyAmount = ethers.parseEther("1"); // 1 MATIC
    const expectedTokens = (buyAmount*ethers.parseEther("1"))/INITIAL_PRICE;

    await anubis.connect(addr1).buyTokens({ value: buyAmount });

    expect(await anubis.balanceOf(addr1.address)).to.equal(expectedTokens);
    expect(await ethers.provider.getBalance(anubis.treasury())).to.be.above(buyAmount);
  });

  it("Should fail to buy tokens if sale is closed", async function () {
    const buyAmount = ethers.parseEther("1"); // 1 MATIC

    await expect(
      anubis.connect(addr1).buyTokens({ value: buyAmount })
    ).to.be.revertedWith("Sale is not open");
  });

  it("Should allow owner to set treasury", async function () {
    await anubis.connect(owner).setTreasury(addr1.address);
    expect(await anubis.treasury()).to.equal(addr1.address);
  });

  it("Should respect sale percentage limits", async function () {
    await anubis.connect(owner).setOpenSale(true);

    const maxSaleAmount = (MAX_SUPPLY * BigInt(SALE_PERCENTAGE)) / BigInt(10000);
    const buyAmount = ethers.parseEther("5001");

    await expect(
      anubis.connect(addr1).buyTokens({ value: buyAmount }) // Exceeds sale limit
    ).to.be.revertedWith("Sale limit reached");

    expect(await anubis.totalSaleAmount()).to.be.lte(maxSaleAmount);
  });

  it("Should grant and revoke roles properly", async function () {
    const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));

    // Grant Pauser Role
    await anubis.connect(owner).givePauserRole(addr1.address);
    expect(await anubis.hasRole(PAUSER_ROLE, addr1.address)).to.be.true;

    // Revoke Pauser Role
    await anubis.connect(owner).removePauserRole(addr1.address);
    expect(await anubis.hasRole(PAUSER_ROLE, addr1.address)).to.be.false;
  });

  it("Should allow pausing and unpausing by pauser", async function () {
    await anubis.connect(owner).givePauserRole(addr1.address);

    // Pause the contract
    await anubis.connect(addr1).pause();
    expect(await anubis.paused()).to.be.true;

    // Unpause the contract
    await anubis.connect(addr1).unpause();
    expect(await anubis.paused()).to.be.false;
  });

  it("Should only allow minting by minters", async function () {
    await anubis.connect(owner).giveMinterRole(addr1.address);

    const mintAmount = ethers.parseEther("1");
    await anubis.connect(addr1).mint(addr2.address, mintAmount);

    expect(await anubis.balanceOf(addr2.address)).to.equal(mintAmount);
  });

  it("Should fail minting by non-minters", async function () {
    const mintAmount = ethers.parseEther("1");
    await expect(
        anubis.connect(addr1).mint(addr2.address, mintAmount)
      ).to.be.revertedWithCustomError(anubis, "AccessControlUnauthorizedAccount")
        .withArgs(addr1.address, ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE")));
  });
});