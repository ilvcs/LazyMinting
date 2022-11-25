require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
	solidity: "0.8.1",
	networks: {
		rinkeby: {
			url: ALCHEMY_API_URL,
			accounts: [PRIVATE_KEY],
		},
	},
};
