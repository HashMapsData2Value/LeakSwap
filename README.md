# Gjallarbro
Implementation of the Algorand cross-chain atomic-swap protocol described in this [ARC issue](https://github.com/algorandfoundation/ARCs/issues/92).

Alice has Algo on Algorand and wants x on X. Bob has x on X and wants Algo on Algorand. Through this protocol, utilizing hashed timelocks, they can trustlessly get what they both want. The true innovation of this protocol is that it can be used on blockchains that DON'T have ANY scripting capabilities. It has primarily been designed with Monero in mind, but it could probably be extended to Nano as well, as both are ed25519-based chains. Cardano is also an ed25519-based chain but as it has its own smart contracts, there are probably better ways of bridging over.

The original proposal is for Bitcoin<->Monero swaps. As Bitcoin is NOT an ed25519-"native" chain, and also does not have sophisticated scripting or smart contract capabilities, that solution requires the use of zero-knowledge proofs being passed around off-chain. This Algorand-based solution should however not require that. Instead, it just needs to implement a new opcode, tentatively called ed25519skpkeq.

# Roadmap

- [ ] POC Smart contract that can execute algo<->X atomic swaps, e.g. algo<->xmr.
- [ ] Successfully lobby for AVM to include a new opcode "ed25519skpkeq", which facilitates the leaky claiming/refunding actions.
- [ ] POC Smart contract that can execute ASA<->X atomic swaps, e.g. USDCa<->xmr.
- [ ] Algorand<->Monero swap daemon
- [ ] Swap daemon gets nice GUI
- [ ] Audits here and there...
- [ ] ???


## Etymology
In Norse mythology the Gjallarbrú was the gilded bridge over the river Gjöll, guarded by the giant maiden Modgunn. Hermod rides over it in his quest to save his brother Balder from the kingdom of the dead - Helheim.
