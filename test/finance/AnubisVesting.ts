import { expect } from "chai";
import { ethers } from "hardhat";

describe("AnubisVesting", function () {
  let vesting: any;
  let token: any;
  let owner: any;
  let beneficiary: any;
  let otherAccount: any;

  const TOKEN_NAME = "AnubisVestingToken";
  const TOKEN_SYMBOL = "AVT";
  const TOTAL_SUPPLY = ethers.parseEther("1000000"); // 1,000,000 tokens
  const VESTING_AMOUNT = ethers.parseEther("10000"); // 10,000 tokens

  beforeEach(async () => {
    [owner, beneficiary, otherAccount] = await ethers.getSigners();

    // Deploy mock ERC20 token
    const MockToken = await ethers.getContractFactory("MockToken");
    token = await MockToken.deploy(owner.address);
    await token.waitForDeployment();

    // Deploy vesting contract
    const AnubisVesting = await ethers.getContractFactory("AnubisVesting");
    vesting = await AnubisVesting.deploy(await token.getAddress(), TOKEN_NAME, TOKEN_SYMBOL);
    await vesting.waitForDeployment();

    // Mint tokens and transfer to vesting contract
    await token.connect(owner).mint(await vesting.getAddress(), TOTAL_SUPPLY);
  });

  it("Should initialize correctly", async function () {
    expect(await vesting.name()).to.equal(TOKEN_NAME);
    expect(await vesting.symbol()).to.equal(TOKEN_SYMBOL);
    expect(await vesting.totalSupply()).to.equal(0); // Virtual token system
  });

  it("Should allow owner to create a vesting schedule", async function () {
    const start = 0; // Immediate start
    const cliff = 3600; // 1 hour
    const duration = 7 * 86400; // 7 days
    const slicePeriod = 30; // 30 seconds

    await expect(
      vesting.createVestingSchedule(beneficiary.address, start, cliff, duration, slicePeriod, true, VESTING_AMOUNT)
    ).to.emit(vesting, "ScheduleCreated");
  });

  it("Should not allow non-owner to create vesting schedule", async function () {
    await expect(
      vesting.connect(otherAccount).createVestingSchedule(beneficiary.address, 0, 3600, 7 * 86400, 30, true, VESTING_AMOUNT)
    ).to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount");
  });

  it("Should test gradual vesting over time", async function () {
    const start = 0; // Immediate start
    const cliff = 3600; // 1 hour
    const duration = 7 * 86400; // 7 days
    const slicePeriod = 30; // 30 seconds

    await vesting.createVestingSchedule(beneficiary.address, start, cliff, duration, slicePeriod, true, VESTING_AMOUNT);
    const vestingScheduleId = await vesting.computeVestingScheduleIdForAddressAndIndex(beneficiary.address, 0);

    await ethers.provider.send("evm_increaseTime", [duration / 2]); // Move to halfway through vesting period
    await ethers.provider.send("evm_mine", []);

    const releasableHalfway = await vesting.computeReleasableAmount(vestingScheduleId);
    expect(releasableHalfway).to.be.closeTo(VESTING_AMOUNT/BigInt(2), ethers.parseEther("0.1"));

    await vesting.connect(beneficiary).release(vestingScheduleId, releasableHalfway);
    expect(await token.balanceOf(beneficiary.address)).to.equal(releasableHalfway);

    await ethers.provider.send("evm_increaseTime", [duration / 2]); // Move to the end of the vesting period
    await ethers.provider.send("evm_mine", []);

    const releasableEnd = await vesting.computeReleasableAmount(vestingScheduleId);
    expect(releasableEnd).to.equal(VESTING_AMOUNT/BigInt(2));
  });

  it("Should compute releasable amount correctly", async function () {
    const start = 0; // Immediate start
    const cliff = 3600; // 1 hour
    const duration = 7 * 86400; // 7 days
    const slicePeriod = 30; // 30 seconds

    await vesting.createVestingSchedule(beneficiary.address, start, cliff, duration, slicePeriod, true, VESTING_AMOUNT);
    const vestingScheduleId = await vesting.computeVestingScheduleIdForAddressAndIndex(beneficiary.address, 0);

    await ethers.provider.send("evm_increaseTime", [43200]); // Fast forward 12 hours
    await ethers.provider.send("evm_mine", []);

    const releasable = await vesting.computeReleasableAmount(vestingScheduleId);
    expect(releasable).to.be.gt(0);
  });

  it("Should enforce proper cliff and duration restrictions", async function () {
    const start = 0; // Immediate start
    const duration = 7 * 86400; // 7 days

    await expect(vesting.createVestingSchedule(beneficiary.address, start, 5 * duration, duration, 1, true, VESTING_AMOUNT))
      .to.be.revertedWithCustomError(vesting, "DurationShorterThanCliff");
  });

  it("Should handle multiple schedules for a beneficiary", async function () {
    const start = 0; // Immediate start
    const cliff = 3600; // 1 hour
    const duration = 7 * 86400; // 7 days

    await vesting.createVestingSchedule(beneficiary.address, start, cliff, duration, 1, true, VESTING_AMOUNT);
    await vesting.createVestingSchedule(beneficiary.address, start, cliff, duration * 2, 1, true, VESTING_AMOUNT/BigInt(2));
    expect(await vesting.holdersVestingScheduleCount(beneficiary.address)).to.equal(2);
  });

  it("Should allow beneficiary to release vested tokens", async function () {
    const start = 0; // Immediate start
    const cliff = 3600; // 1 hour
    const duration = 7 * 86400; // 7 days
    const slicePeriod = 30; // 30 seconds

    await vesting.createVestingSchedule(beneficiary.address, start, cliff, duration, slicePeriod, true, VESTING_AMOUNT);
    const vestingScheduleId = await vesting.computeVestingScheduleIdForAddressAndIndex(beneficiary.address, 0);

    await ethers.provider.send("evm_increaseTime", [7 * 86400]); // Fast forward 7 days
    await ethers.provider.send("evm_mine", []);

    await expect(vesting.connect(beneficiary).release(vestingScheduleId, VESTING_AMOUNT)).to.emit(vesting, "TokensReleased");
  });

  it("Should allow owner to revoke vesting schedule", async function () {
    const start = 0; // Immediate start
    const cliff = 3600; // 1 hour
    const duration = 7 * 86400; // 7 days
    const slicePeriod = 30; // 30 seconds

    await vesting.createVestingSchedule(beneficiary.address, start, cliff, duration, slicePeriod, true, VESTING_AMOUNT);
    const vestingScheduleId = await vesting.computeVestingScheduleIdForAddressAndIndex(beneficiary.address, 0);

    await expect(vesting.revoke(vestingScheduleId)).to.emit(vesting, "ScheduleRevoked");
  });

  it("Should not allow non-owner to revoke vesting schedule", async function () {
    const start = 0; // Immediate start
    const cliff = 3600; // 1 hour
    const duration = 7 * 86400; // 7 days
    const slicePeriod = 30; // 30 seconds

    await vesting.createVestingSchedule(beneficiary.address, start, cliff, duration, slicePeriod, true, VESTING_AMOUNT);
    const vestingScheduleId = await vesting.computeVestingScheduleIdForAddressAndIndex(beneficiary.address, 0);

    await expect(vesting.connect(otherAccount).revoke(vestingScheduleId)).to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount");
  });

  it("Should allow the owner to pause and unpause the contract", async function () {
    await vesting.setPaused(true);
    expect(await vesting.paused()).to.equal(true);

    await vesting.setPaused(false);
    expect(await vesting.paused()).to.equal(false);
  });
});
