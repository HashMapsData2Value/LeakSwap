# Leakswap (Old: Gjallarbro)
Implementation of the Algorand cross-chain atomic-swap protocol described in this [ARC issue](https://github.com/algorandfoundation/ARCs/issues/92).

Ali has Algo on Algorand and wants x on X. Xin has x on X and wants Algo on Algorand. Through this protocol, utilizing timelocks, they can trustlessly get what they both want. The true innovation of this protocol is that it can be used on blockchains that DON'T have ANY scripting capabilities. It has primarily been designed with Monero in mind.

The original proposal is for Bitcoin<->Monero swaps. As Bitcoin is NOT an ed25519-"native" chain, and also does not have sophisticated scripting or smart contract capabilities, that solution requires the use of zero-knowledge proofs being passed around off-chain. This Algorand-based solution should however not require that. In terms of opcodes, it can make some clever use of ed25519verify.

## Etymology

### Gjallarbro
In Norse mythology the Gjallarbrú was the gilded bridge over the river Gjöll, guarded by the giant maiden Modgunn. Hermod rides over it in his quest to save his brother Balder from the kingdom of the dead - Helheim.

### Leakswap
Because Algorand lacks the scalar mul opcode, we are forced to "leak" the private key by constructing a faulty, broken signature.