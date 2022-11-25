const ethers = require('ethers')
const SIGNING_DOMAIN = '"NFT4Good-Voucher'
const SIGNATURE_VERSION = '1'

class ERC721LazyMinter {
  constructor({ contract, minter }) {
    this.contract = contract
    this.minter = minter
  }

  async createVoucher(tokenId, uri, creator, minPrice = 0) {
    const voucher = { tokenId, minPrice, uri, creator }
    const domain = await this._signingDomain()
    const types = {
      NFTVoucher: [
        { name: 'tokenId', type: 'uint256' },
        { name: 'minPrice', type: 'uint256' },
        { name: 'uri', type: 'string' },
        { name: 'creator', type: 'address' },
      ],
    }
    const signature = await this.minter._signTypedData(domain, types, voucher)

    return {
      ...voucher,
      signature,
    }
  }

  async _signingDomain() {
    if (this._domain != null) {
      return this._domain
    }
    const chainId = await this.contract.getChainID()
    this._domain = {
      name: SIGNING_DOMAIN,
      version: SIGNATURE_VERSION,
      verifyingContract: this.contract.address,
      chainId,
    }
    return this._domain
  }
}

module.exports = {
  ERC721LazyMinter,
}
