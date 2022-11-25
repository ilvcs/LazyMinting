const { expect } = require("chai");
const hardhat = require("hardhat");
const { ethers } = hardhat;
const { ERC721LazyMinter } = require("../scripts/lib/ERC721LazyMinter");

const deploy = async () => {
	const [owner, minter, redeemer, creator, randomUser] =
		await ethers.getSigners();

	let factory = await ethers.getContractFactory("ERC721LazyMinter", owner);
	const contract = await factory.deploy(minter.address);

	// const createrBalance = await creator.getBalance()
	// console.log(`Balance Creator ${ethers.utils.formatEther(createrBalance)}`)

	return {
		owner,
		minter,
		redeemer,
		creator,
		randomUser,
		contract,
	};
};

describe("ERC721LazyMinter Tesing", () => {
	it("Should deploly", async () => {
		const [owner, minter] = await ethers.getSigners();

		let factory = await ethers.getContractFactory("ERC721LazyMinter", owner);
		const contract = await factory.deploy(minter.address);
		await contract.deployed();
	});

	it("Should redeem an nft from a signed voucher", async () => {
		const { contract, redeemer, minter, creator } = await deploy();
		//console.log(redeemer.address, minter.address)
		const lazyMinter = new ERC721LazyMinter({ contract, minter });
		const voucher = await lazyMinter.createVoucher(
			1,
			"Image URL",
			creator.address,
		);
		//console.log(voucher)
		//console.log(`Minter is ${minter.address}`)

		await expect(contract.connect(redeemer).redeem(voucher))
			.to.emit(contract, "Transfer") // transfer from null addresss to minter
			.withArgs(
				"0x0000000000000000000000000000000000000000",
				minter.address,
				voucher.tokenId,
			)
			.and.to.emit(contract, "Transfer") // Transfer from minter to redeemer
			.withArgs(minter.address, redeemer.address, voucher.tokenId);
	});

	it("Should faill to redeem an NFT that is already been claimed", async () => {
		const { contract, redeemer, minter, creator } = await deploy();

		const lazyMinter = new ERC721LazyMinter({ contract, minter });
		const voucher = await lazyMinter.createVoucher(
			1,
			"ipfs://image-url",
			creator.address,
		);

		await expect(contract.connect(redeemer).redeem(voucher))
			.to.emit(contract, "Transfer")
			.withArgs(
				"0x0000000000000000000000000000000000000000",
				minter.address,
				voucher.tokenId,
			)
			.and.to.emit(contract, "Transfer") // Transfer from minter to redeemer
			.withArgs(minter.address, redeemer.address, voucher.tokenId);

		await expect(contract.connect(redeemer).redeem(voucher)).to.be.revertedWith(
			"ERC721: token already minted",
		);
	});
	it("Should fail to redeem an NFT voucher that's signed by an unauthorized account", async () => {
		const { contract, redeemer, minter, creator } = await deploy();
		const signers = await ethers.getSigners();
		const rando = signers[signers.length - 1];

		const lazyMinter = new ERC721LazyMinter({ contract, minter: rando });
		const voucher = await lazyMinter.createVoucher(
			1,
			"ipfs://image-url",
			creator.address,
		);

		await expect(contract.connect(redeemer).redeem(voucher)).to.be.revertedWith(
			"Signature invalid or unauthorized",
		);
	});
	it("Creater can redeem the balance", async () => {
		const { contract, redeemer, minter, creator } = await deploy();

		const lazyMinter = new ERC721LazyMinter({ contract, minter: minter });
		const nftPrice = ethers.utils.parseEther("1");
		const voucher = await lazyMinter.createVoucher(
			1,
			"ipfs://image-url",
			creator.address,
			nftPrice,
		);
		//const redeemerBalance  = await redeemer.getBalance()
		const createrBalance = await creator.getBalance();

		//console.log('Creater balance is ', createrBalance)
		await contract.connect(redeemer).redeem(voucher, { value: nftPrice });

		await contract.connect(creator).withdraw();
		const createrBalanceAfter = await creator.getBalance();

		const balance1 = Number(
			ethers.utils.formatEther(createrBalance.toString()),
		);
		const balance2 = Number(
			ethers.utils.formatEther(createrBalanceAfter.toString()),
		);
		// console.log(balance1,   balance2 )
		expect(balance2).to.be.greaterThan(
			parseInt(ethers.utils.formatEther(balance1)),
		);

		// console.log(createrBalanceAfter.toString())
	});
	it("Others cannot redeem the balance of the creator", async () => {
		const { contract, redeemer, minter, creator, randomUser } = await deploy();
		const lazyMinter = new ERC721LazyMinter({ contract, minter: minter });
		const nftPrice = ethers.utils.parseEther("1");
		const voucher = await lazyMinter.createVoucher(
			1,
			"ipfs://image-url",
			creator.address,
			nftPrice,
		);

		await contract.connect(redeemer).redeem(voucher, { value: nftPrice });
		await expect(contract.connect(randomUser).withdraw()).to.be.revertedWith(
			"No balance to withdraw",
		);
	});
	it("Owner can redeem the balance of the smart contract", async () => {
		// User should buy first
		// Check the contract balance it should be more then 0
		// withdraw
		// check the contract balance got 0
		const { contract, redeemer, minter, creator, owner } = await deploy();
		const lazyMinter = new ERC721LazyMinter({ contract, minter: minter });
		const nftPrice = ethers.utils.parseEther("1");
		const voucher = await lazyMinter.createVoucher(
			1,
			"ipfs://image-url",
			creator.address,
			nftPrice,
		);
		await contract.connect(redeemer).redeem(voucher, { value: nftPrice });
		const contractBalance = await ethers.provider.getBalance(contract.address);
		//console.log(`Contract Balance ${contractBalance.toString()}`)
		await expect(Number(contractBalance)).to.be.greaterThan(0);
		//Owner balance before withdrawing contract funds

		const ownerBalance = await owner.getBalance();

		// Withdraw contract funds
		await contract.connect(owner).withdrawContractBalance();

		// Owner balance after withdrawing contract funds
		const ownerBalance2 = await owner.getBalance();
		// compare theat the user balance got increased

		expect(Number(ownerBalance2)).to.be.greaterThan(Number(ownerBalance));
		// Contract balance after withdrawl
		const contractBalance1 = await ethers.provider.getBalance(contract.address);
		// Contract balance after owner withdrawl should be zero
		expect(Number(contractBalance1)).to.be.equal(0);
	});
	it("Others cannot redeem the balance of the smart contract", async () => {
		const { contract, redeemer, minter, creator, randomUser } = await deploy();
		const lazyMinter = new ERC721LazyMinter({ contract, minter: minter });
		const nftPrice = ethers.utils.parseEther("1");
		const voucher = await lazyMinter.createVoucher(
			1,
			"ipfs://image-url",
			creator.address,
			nftPrice,
		);
		await contract.connect(redeemer).redeem(voucher, { value: nftPrice });
		await expect(
			contract.connect(randomUser).withdrawContractBalance(),
		).to.be.revertedWith("Only authorized admin can withdraw");
	});
	// it('If others brougth second had nft the previous user will get paid', async () => {})
	// it('If others brought the second hand nft the contract get commission on that', async () => {})
	// it('', async () => {})
	// it('', async () => {})
});
