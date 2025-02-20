// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.22;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {ERC20CappedUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20CappedUpgradeable.sol";
import {ERC20BurnableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import {ERC20PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import {ERC20PermitUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import {ERC20VotesUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {NoncesUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/NoncesUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

contract AnubisTrueCoinV2 is Initializable, ERC20CappedUpgradeable, ERC20BurnableUpgradeable, ERC20PausableUpgradeable, AccessControlUpgradeable, ERC20PermitUpgradeable, ERC20VotesUpgradeable, UUPSUpgradeable, ReentrancyGuardUpgradeable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    uint256 public price; // Token price in wei per token unit (e.g., 1 MATIC = 1e18 wei)
    address public treasury; // Address to receive funds from token sales
    uint256 public salePercentage; // Percentage of supply available for sale (Scaled by 100)
    uint256 public totalSaleAmount; // Total amount of tokens sold
    bool public openSale; // Whether the sale is open

    event PriceUpdated(uint256 newPrice);
    event TreasuryUpdated(address newTreasury);
    event SalePercentageUpdated(uint256 newPercentage);
    event SaleStatusUpdated(bool openSale);


    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address defaultAdmin, uint256 maxSupply, uint256 initialPrice, uint256 initialSalePercentage, address treasuryAddress)
        initializer public
    {
        __ERC20_init("AnubisTrueCoin", "ATC42");
        __ERC20Capped_init(maxSupply);
        __ERC20Burnable_init();
        __ERC20Pausable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();
        __ERC20Permit_init("AnubisTrueCoin");
        __ERC20Votes_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        openSale = false;

        require(maxSupply > 0, "Max supply must be greater than zero");
        require(initialPrice > 0, "Initial price must be greater than zero");
        require(initialSalePercentage > 0 && initialSalePercentage <= 10000, "Invalid sale percentage");

        price = initialPrice;
        salePercentage = initialSalePercentage;
        treasury = treasuryAddress;
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setPrice(uint256 newPrice) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newPrice > 0, "Price must be greater than zero");
        price = newPrice;
        emit PriceUpdated(newPrice);
    }

    function setTreasury(address newTreasury) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTreasury != address(0), "Treasury address cannot be zero");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setSalePercentage(uint256 newPercentage) public onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newPercentage > 0 && newPercentage <= 10000, "Invalid sale percentage");
        salePercentage = newPercentage;
        emit SalePercentageUpdated(newPercentage);
    }

    function setOpenSale(bool open) public onlyRole(DEFAULT_ADMIN_ROLE) {
        openSale = open;
        emit SaleStatusUpdated(open);
    }

    function contractTransfer(address to, uint256 amount) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _transfer(address(this), to, amount);
    }

    function buyTokens() public payable nonReentrant {
        require(openSale, "Sale is not open");
        require(price > 0, "Token price not set");
        require(msg.value > 0, "Must send MATIC to buy tokens");

        uint256 tokenAmount = (msg.value * 1e18) / price; // Calculate token amount
        uint256 maxSaleAmount = (cap() * salePercentage) / 10000;

        require(totalSaleAmount + tokenAmount <= maxSaleAmount, "Sale limit reached");
        require(tokenAmount <= balanceOf(address(this)), "Not enough tokens available");

        // Update state before external calls
        totalSaleAmount += tokenAmount;

        // Perform the internal action
        _transfer(address(this), msg.sender, tokenAmount); // Transfer tokens to buyer

        // External interaction
        payable(treasury).transfer(msg.value); // Send received funds to treasury
    }


    function giveAdminRole(address newAdmin) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
    }

    function givePauserRole(address newPauser) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(PAUSER_ROLE, newPauser);
    }

    function giveMinterRole(address newMinter) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(MINTER_ROLE, newMinter);
    }

    function giveUpgraderRole(address newUpgrader) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(UPGRADER_ROLE, newUpgrader);
    }

    function removeAdminRole(address admin) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function removePauserRole(address pauser) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(PAUSER_ROLE, pauser);
    }

    function removeMinterRole(address minter) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(MINTER_ROLE, minter);
    }

    function removeUpgraderRole(address upgrader) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(UPGRADER_ROLE, upgrader);
    }

    function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    function giveFullAccessAllowance(address to) public onlyRole(DEFAULT_ADMIN_ROLE) {
        _approve(address(this), to, type(uint256).max);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        onlyRole(UPGRADER_ROLE)
        override
    {}

    function version() public pure returns(string memory) 
    {
        return "v2.0";
    }

    // The following functions are overrides required by Solidity.
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20CappedUpgradeable, ERC20PausableUpgradeable, ERC20Upgradeable, ERC20VotesUpgradeable)
    {
        super._update(from, to, value);
    }
    function nonces(address owner)
        public
        view
        override(ERC20PermitUpgradeable, NoncesUpgradeable)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}
