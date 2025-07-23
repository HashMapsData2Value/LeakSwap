import { abimethod, Account, assert, assertMatch, Bytes, bytes, Contract, ensureBudget, Global, GlobalState, itxn, uint64 } from '@algorandfoundation/algorand-typescript'
import { ed25519verifyBare, extract, Txn } from '@algorandfoundation/algorand-typescript/op'

export class LeakSwap extends Contract {

  public aliAlgoAddr = GlobalState<Account>()
  public xinAlgoAddr = GlobalState<Account>()

  public aliXternalPK = GlobalState<bytes>()
  public xinXternalPK = GlobalState<bytes>()

  public t0 = GlobalState<uint64>()
  public t1 = GlobalState<uint64>()

  public aliReady = GlobalState({ initialValue: false })

  /*
  Create the LeakSwap contract.
  */
  @abimethod({ allowActions: 'NoOp', onCreate: 'require' })
  public createApplication(
    aliXternalPK: bytes,
    xinAlgoAddr: Account,
    xinXternalPK: bytes,
    t0: uint64,
    t1: uint64
  ): void {

    this.aliAlgoAddr.value = Global.creatorAddress
    this.aliXternalPK.value = aliXternalPK

    this.xinAlgoAddr.value = xinAlgoAddr
    this.xinXternalPK.value = xinXternalPK

    this.t0.value = t0
    this.t1.value = t1

    assert(t1 > t0, 't1 must be greater than t0')
    assert(t0 > Global.latestTimestamp, 't0 must be in the future')
    assert(t1 > Global.latestTimestamp, 't1 must be in the future')
  }

  private disburseFunds(recipient: Account): void {
    itxn
      .payment({
        amount: 0,
        closeRemainderTo: recipient,
        receiver: recipient,
      })
      .submit()
  }


  // Public method to make leakyVerifyEd25519 available for testing
  public verifySignature(signature: bytes, xternalPK: bytes): void {
    this.leakyVerifyEd25519(signature, xternalPK)
  }

  /*
  Verifies that the user has provided a broken signature signed by the xternal pk.
  The broken signature leaks the private key, because it uses an R value whose scalar
  is known: r = 1.

  Due to ARC4 encoding, signature is 66 bytes long and xternalPK is 34 bytes long.
  They start with \x00 and the actual data starts at the 3rd byte.
  */
  private leakyVerifyEd25519(signature: bytes, xternalPK: bytes): void {
    ensureBudget(2000)
    assert(
      extract(signature, 0, 32) === Bytes.fromHex('5866666666666666666666666666666666666666666666666666666666666666'),
      'R-point encoding not 0x58666... . Signature R must be broken (=BASEPOINT) to allow the secret key to be leaked!')
    assert(ed25519verifyBare(Global.currentApplicationAddress.bytes, signature, xternalPK), 'Signature verification failed!')
  }


  /*
    Ali sets the contract to ready once Xin has locked up funds on the xternal chain.
    (If Ali times out, the contract will enter an equivalent "ready" state after t0.)
  */
  public setReady(): void {
    assertMatch(Txn, { sender: this.aliAlgoAddr.value }, 'Only Ali can set the contract to ready!')
    this.aliReady.value = true
  }

  /*
   * Access contract state
   * Conforms to the LeakSwapState enum.
   */
  public getContractState(): uint64 {
    if (Global.latestTimestamp > this.t1.value) {
      return 3
    }
    if (Global.latestTimestamp > this.t0.value) {
      return 2
    }
    if (this.aliReady.value) {
      return 1
    }
    return 0
  }

  /*
   * Ali noticed that Xin has not deposited funds on the xternal chain (fast enough) and
   * wants to refund her Algo/ASA. But the refund leaks Ali's xternal secret key, in case
   * Xin actually does lock up funds.
   */
  public leakyRefund(signature: bytes): void {
    assertMatch(Txn, { sender: this.aliAlgoAddr.value }, 'Only Ali can do leaky refund!')
    assert(Global.latestTimestamp <= this.t0.value, 'Cannot refund after t0!')
    assert(!this.aliReady.value, 'Cannot refund after set ready!')

    // Forces Ali to leak xternal secret key
    this.leakyVerifyEd25519(signature, this.aliXternalPK.value)
    // Disburse the funds to Xin
    this.disburseFunds(this.aliAlgoAddr.value)
  }

  /*
   * The contract has entered "ready" state, either because Ali set it to ready (after noticing that
   * Xin locked funds up) or because t0 has passed. Xin can now claim Ali's Algo/ASA, doing so by
   * leaking the xternal secret key. That will allow Ali to claim the xternal funds
  */
  public leakyClaim(signature: bytes): void {
    assertMatch(Txn, { sender: this.xinAlgoAddr.value }, 'Only Xin can do leaky claim!')
    assert(Global.latestTimestamp > this.t0.value || this.aliReady.value, 'Cannot claim: time must be past t0 OR Ali must have set ready!')
    assert(Global.latestTimestamp < this.t1.value, 'Cannot claim after t1!')

    // Forces Xin to leak xternal secret key
    this.leakyVerifyEd25519(signature, this.xinXternalPK.value)
    // Disbuse the funds to Xin
    this.disburseFunds(this.xinAlgoAddr.value)
  }

  /*
    If after t1 Xin has still not claimed their Algo, Ali can call punish refund.
    This will disburse the funds to Ali, without forcing Ali to reveal their external PK.
    Xin's locked up funds will be foreer out of reachl.
  */
  public punishRefund(): void {
    assertMatch(Txn, { sender: this.aliAlgoAddr.value }, 'Only Ali can do punish refund!')
    assert(Global.latestTimestamp >= this.t1.value, 'Cannot punish refund before t1!')
    this.disburseFunds(this.aliAlgoAddr.value)
  }

}
