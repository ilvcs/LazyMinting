//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
pragma abicoder v2; // required to accept structs as function parameters

import "hardhat/console.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";

contract ERC721LazyMinter is ERC721URIStorage, EIP712, AccessControl {
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
  bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
  string private constant SIGNING_DOMAIN = '"NFT4Good-Voucher';
  string private constant SIGNATURE_VERSION = '1';

  mapping (address => uint256) pendingWithdrawals;

  /// @notice Represents an un-minted NFT, which has not yet been recorded into the blockchain. A signed voucher can be redeemed for a real NFT using the redeem function.
  struct NFTVoucher {
    //  The id of the token to be redeemed. Must be unique - if another token with this ID already exists, the redeem function will revert.
    uint256 tokenId;

    // The minimum price (in wei) that the NFT creator is willing to accept for the initial sale of this NFT.
    uint256 minPrice;

    //  The metadata URI to associate with this token.
    string uri;
    
    // Creator of the nft where we transfer funds after the purchase
    address creator;

    //  the EIP-712 signature of all other fields in the NFTVoucher struct. For a voucher to be valid, it must be signed by an account with the MINTER_ROLE.
    bytes signature;
  }
  // For checking whether the user is a null address
  modifier nonZeroAddress() {
    require(msg.sender != address(0), "Not a valid address");
    _;
  }
  // For checking the user is not an user but the contract
  modifier notAContract() {
    require(msg.sender.code.length == 0, "Not a valid user");
    _;
  }

  constructor(address payable _minter)
    ERC721("LazyNFT", "LAZ") 
    EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION) {
      _setupRole(MINTER_ROLE, _minter);
      _setupRole(ADMIN_ROLE, payable(msg.sender));
    }

  


  /// @notice Redeems an NFTVoucher for an actual NFT, creating it in the process.
  /// @param _voucher A signed NFTVoucher that describes the NFT to be redeemed.
  function redeem( NFTVoucher calldata _voucher) public payable nonZeroAddress notAContract returns (uint256) {
    // make sure signature is valid and get the address of the minter
    address minter = _verify(_voucher);
    // Creator sould not be null
    require(_voucher.creator != address(0), 'Creator is null address');
    // Make creator payable
    address payable creator =payable(_voucher.creator);
    // make sure that the minter is authorized to mint NFTs
    require(hasRole(MINTER_ROLE, minter), "Signature invalid or unauthorized");
    
    // make sure that the redeemer is paying enough to cover the buyer's cost
    require(msg.value >= _voucher.minPrice, "Insufficient funds to redeem");

    // first assign the token to the minter, to establish provenance on-chain
    _mint(minter, _voucher.tokenId);
    _setTokenURI(_voucher.tokenId, _voucher.uri);
    
    // transfer the token to the redeemer
    _transfer(minter, msg.sender, _voucher.tokenId);

    // record payment to crator's withdrawal balance(98% of the total ETH goes to the creator)
    pendingWithdrawals[creator] += msg.value * 98/100;

    return _voucher.tokenId;
  }

  /// @notice Transfers all pending withdrawal balance to the caller. Reverts if the caller is not an authorized minter.
  function withdraw() public nonZeroAddress notAContract{
    // IMPORTANT: casting msg.sender to a payable address is only safe if ALL members of the minter role are payable addresses.
    address payable receiver = payable(msg.sender);
    uint amount = pendingWithdrawals[receiver];
    //console.log("Creaters Amount is %s", amount);
    require(amount > 0, "No balance to withdraw");
    
    // zero account before transfer to prevent re-entrancy attack
    pendingWithdrawals[receiver] = 0;
    receiver.transfer(amount);
  }
  
  // This function is for admins to withdraw funds from the contract.
  function withdrawContractBalance() public nonZeroAddress notAContract{
    address payable admin = payable(msg.sender);
    require(hasRole(ADMIN_ROLE, admin), "Only authorized admin can withdraw");
    require(getContractBalance() > 0, "No balance to withdraw");
    // Transfer the balance to the admin
    admin.transfer(getContractBalance());
  }

  /// @notice Returns a hash of the given NFTVoucher, prepared using EIP712 typed data hashing rules.
  /// @param _voucher An NFTVoucher to hash.
  function _hash(NFTVoucher calldata _voucher) internal view returns (bytes32) {
    return _hashTypedDataV4(keccak256(abi.encode(
      keccak256("NFTVoucher(uint256 tokenId,uint256 minPrice,string uri,address creator)"),
      _voucher.tokenId,
      _voucher.minPrice,
      keccak256(bytes(_voucher.uri)),
      _voucher.creator
    )));
  }

  /// @notice Returns the chain id of the current blockchain.
  /// @dev This is used to workaround an issue with ganache returning different values from the on-chain chainid() function and
  ///  the eth_chainId RPC method. See https://github.com/protocol/nft-website/issues/121 for context.
  function getChainID() external view returns (uint256) {
    uint256 id;
    assembly {
        id := chainid()
    }
    return id;
  }
   /// @notice Retuns the amount of Ether available in the contract.
  function getContractBalance() public view returns(uint256){
   return address(this).balance;
  }

   /// @notice Retuns the amount of Ether available to the caller to withdraw.
  function availableToWithdraw() public view returns (uint256) {
    return pendingWithdrawals[msg.sender];
  }

  /// @notice Verifies the signature for a given NFTVoucher, returning the address of the signer.
  /// @dev Will revert if the signature is invalid. Does not verify that the signer is authorized to mint NFTs.
  /// @param _voucher An NFTVoucher describing an unminted NFT.
  function _verify(NFTVoucher calldata _voucher) internal view returns (address) {
    bytes32 digest = _hash(_voucher);
    return ECDSA.recover(digest, _voucher.signature);
  }

  function supportsInterface(bytes4 _interfaceId) public view virtual override (AccessControl, ERC721) returns (bool) {
    return ERC721.supportsInterface(_interfaceId) || AccessControl.supportsInterface(_interfaceId);
  }
}
