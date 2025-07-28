import { TestExecutionContext } from '@algorandfoundation/algorand-typescript-testing'
import { describe, expect, it } from 'vitest'
import { Bytes } from '@algorandfoundation/algorand-typescript'
import { LeakSwap } from './contract.algo'
import { genScalar, getPK, leakySignature } from './toChocoBox'
import { ed25519 } from '@noble/curves/ed25519'

export enum LeakSwapState {
  NotReady = 0, // Contract is not ready
  Ready = 1, // Contract is ready (Ali has set it to ready)
  T0Passed = 2, // T0 has passed, Xin can claim
  T1Passed = 3, // T1 has passed, Ali can punish refund
}

describe('LeakSwap contract', () => {
  const ctx = new TestExecutionContext()
  const aliAlgoAddr = ctx.defaultSender
  const xinAlgoAddr = ctx.any.account()
  const transferAmount = 1_000_000

  it('test leakySignature method in contract', () => {
    const contract = ctx.contract.create(LeakSwap)

    const a = genScalar()
    const pk = getPK(a);

    // Fixed Contract Address
    const hexString = '72a43709d7a9981bc3b37f700e56d3cdb295a5fb731085bcec398f48d0a4d436'
    const messageBytes = Uint8Array.from(Buffer.from(hexString, 'hex'))

    const signature = leakySignature(messageBytes, a)

    contract.verifySignature(Bytes(signature), Bytes(pk))


    // Test that non-broken, aka a proper signature, fails:
    const { secretKey: k, publicKey: K } = ed25519.keygen()
    expect(() => {
      contract.verifySignature(Bytes(ed25519.sign(messageBytes, k)), Bytes(K))
    }).toThrow('R-point encoding not 0x58666... . Signature R must be broken (=BASEPOINT) to allow the secret key to be leaked!')

    // Test corrupted signature (in the R-value):
    const corruptedSignatureR = new Uint8Array(signature)
    corruptedSignatureR[15] = 0
    expect(() => {
      contract.verifySignature(Bytes(corruptedSignatureR), Bytes(pk))
    }).toThrow('R-point encoding not 0x58666... . Signature R must be broken (=BASEPOINT) to allow the secret key to be leaked!')

    // Test corrupted signature (in the S-value):
    const corruptedSignatureS = new Uint8Array(signature)
    corruptedSignatureS[55] = 0
    expect(() => {
      contract.verifySignature(Bytes(corruptedSignatureS), Bytes(pk))
    }).toThrow('Signature verification failed')

    // Test wrong PK:
    const corruptedPK = new Uint8Array(pk)
    corruptedPK[0] = 0
    expect(() => {
      contract.verifySignature(Bytes(signature), Bytes(corruptedPK))
    }).toThrow('Signature verification failed')
  })


  it('LeakSwap: Simple Happy Path', async () => {
    const contract = ctx.contract.create(LeakSwap)

    const aliXternalSK = genScalar()
    const aliXternalPK = getPK(aliXternalSK)
    const xinXternalSK = genScalar()
    const xinXternalPK = getPK(xinXternalSK)
    const t0 = Date.now() + 3600 * 1000 // 1 hour from current time
    const t1 = t0 + 1800 * 1000 // 30 minutes after t0

    // Create application with the specified parameters
    contract.createApplication(
      Bytes(aliXternalPK),
      xinAlgoAddr,
      Bytes(xinXternalPK),
      t0,
      t1,
    )

    // Expect aliAlgoAddr to be the creator address
    expect(contract.aliAlgoAddr.value).toEqual(ctx.ledger.getApplicationForContract(contract).creator)
    expect(contract.getContractState()).toEqual(LeakSwapState.NotReady)

    // * <-- Xin *does* lock up funds in the combined Monero account --> *

    // Xin's leaky signature - convert contract address hex to bytes
    const xinSignature = leakySignature(
      Buffer.from(ctx.ledger.getApplicationForContract(contract).address.bytes as unknown as string, 'hex'),
      xinXternalSK
    )

    // Ali sets the contract to ready state
    contract.setReady()

    // Now the contract should be in ready state
    expect(contract.getContractState()).toEqual(LeakSwapState.Ready)

    // Ali, maliciously, tries to call leakyRefund
    // It should of course fail since the contract is in ready state
    const aliSignature = leakySignature(
      Buffer.from(ctx.ledger.getApplicationForContract(contract).address.bytes as unknown as string, 'hex'),
      aliXternalSK
    )
    expect(() => {
      ctx.txn.createScope([
        ctx.any.txn.applicationCall({
          appId: contract,
          sender: aliAlgoAddr,
        })
      ]).execute(() => contract.leakyRefund(Bytes(aliSignature)))
    }).toThrow('Cannot refund after set ready!')

    // Ali, maliciously, tries to call punishRefund
    // It should of course fail since the contract t1 has not passed yet
    expect(() => {
      ctx.txn.createScope([
        ctx.any.txn.applicationCall({
          appId: contract,
          sender: aliAlgoAddr,
        })
      ]).execute(() => contract.punishRefund())
    }).toThrow('Cannot punish refund before t1!')

    // Xin successfully claims the funds
    ctx.txn.createScope([
      ctx.any.txn.applicationCall({
        appId: contract,
        sender: xinAlgoAddr,
      })
    ]).execute(() => contract.leakyClaim(Bytes(xinSignature)))

    // Should be in some final state, e.g. funds are empty, contract deleted, added a 5th "complete" state that gets returned, etc
  })

  it('LeakSwap: T0 TimeOut Path', async () => {
    const contract = ctx.contract.create(LeakSwap)

    const aliXternalSK = genScalar()
    const aliXternalPK = getPK(aliXternalSK)
    const xinXternalSK = genScalar()
    const xinXternalPK = getPK(xinXternalSK)
    const t0 = Date.now() + 3600 * 1000 // 1 hour from current time
    const t1 = t0 + 1800 * 1000 // 30 minutes after t0

    // Create application with the specified parameters
    contract.createApplication(
      Bytes(aliXternalPK),
      xinAlgoAddr,
      Bytes(xinXternalPK),
      t0,
      t1,
    )

    // Expect aliAlgoAddr to be the creator address
    expect(contract.aliAlgoAddr.value).toEqual(ctx.ledger.getApplicationForContract(contract).creator)
    expect(contract.getContractState()).toEqual(LeakSwapState.NotReady)

    // * <-- Xin does or does not lock up funds in the combined Monero account --> *

    // Xin's leaky signature - convert contract address hex to bytes
    const xinSignature = leakySignature(
      Buffer.from(ctx.ledger.getApplicationForContract(contract).address.bytes as unknown as string, 'hex'),
      xinXternalSK
    )

    // Let's test out some error cases

    // It should fail since we are not calling from Xin's account
    expect(() => {
      contract.leakyClaim(Bytes(xinSignature))
    }).toThrow('Only Xin can do leaky claim')

    // should error out
    // Xin tries to premptively call leakyClaim before contract in ready state
    // This should fail since the contract is not ready yet
    expect(() => {
      ctx.txn.createScope([
        ctx.any.txn.applicationCall({
          appId: contract,
          sender: xinAlgoAddr,
        })
      ]).execute(() => contract.leakyClaim(Bytes(xinSignature)))
    }).toThrow('Cannot claim: time must be past t0 OR Ali must have set ready!')
    // Should still be in initial state
    expect(contract.getContractState()).toEqual(LeakSwapState.NotReady)

    // Ali does not set ready so Xin waits until t0 passes
    ctx.ledger.patchGlobalData({ latestTimestamp: t0 + 1 })

    // Now the contract should be in T0 Passed state
    expect(contract.getContractState()).toEqual(LeakSwapState.T0Passed)

    // Ali, in a panic, tries to call leakyRefund
    // This should fail since the contract has already passed t0
    const aliSignature = leakySignature(
      Buffer.from(ctx.ledger.getApplicationForContract(contract).address.bytes as unknown as string, 'hex'),
      aliXternalSK
    )
    expect(() => {
      ctx.txn.createScope([
        ctx.any.txn.applicationCall({
          appId: contract,
          sender: aliAlgoAddr,
        })
      ]).execute(() => contract.leakyRefund(Bytes(aliSignature)))
    }).toThrow('Cannot refund after t0!')

    // Xin successfully claims the funds
    ctx.txn.createScope([
      ctx.any.txn.applicationCall({
        appId: contract,
        sender: xinAlgoAddr,
      })
    ]).execute(() => contract.leakyClaim(Bytes(xinSignature)))

    // Should be in some final state, e.g. funds are empty, contract deleted, added a 5th "complete" state that gets returned, etc
  })


  it('LeakSwap: Ali Leaky Refunds', async () => {
    const contract = ctx.contract.create(LeakSwap)

    const aliXternalSK = genScalar()
    const aliXternalPK = getPK(aliXternalSK)
    const xinXternalSK = genScalar()
    const xinXternalPK = getPK(xinXternalSK)
    const t0 = Date.now() + 3600 * 1000 // 1 hour from current time
    const t1 = t0 + 1800 * 1000 // 30 minutes after t0

    // Create application with the specified parameters
    contract.createApplication(
      Bytes(aliXternalPK),
      xinAlgoAddr,
      Bytes(xinXternalPK),
      t0,
      t1,
    )

    // Expect aliAlgoAddr to be the creator address
    expect(contract.aliAlgoAddr.value).toEqual(ctx.ledger.getApplicationForContract(contract).creator)
    expect(contract.getContractState()).toEqual(LeakSwapState.NotReady)

    // * <-- Xin does not lock up funds in the combined Monero account --> *

    // Ali's leaky signature - convert contract address hex to bytes
    const aliSignature = leakySignature(
      Buffer.from(ctx.ledger.getApplicationForContract(contract).address.bytes as unknown as string, 'hex'),
      aliXternalSK
    )

    // Ali calls leakyRefund
    contract.leakyRefund(Bytes(aliSignature))

    // Should be in some final state, e.g. funds are empty, contract deleted, added a 5th "complete" state that gets returned, etc
  })

  it('LeakSwap: T1 TimeOut PunishRefund Path', async () => {
    const contract = ctx.contract.create(LeakSwap)

    const aliXternalSK = genScalar()
    const aliXternalPK = getPK(aliXternalSK)
    const xinXternalSK = genScalar()
    const xinXternalPK = getPK(xinXternalSK)
    const t0 = Date.now() + 3600 * 1000 // 1 hour from current time
    const t1 = t0 + 1800 * 1000 // 30 minutes after t0

    // Create application with the specified parameters
    contract.createApplication(
      Bytes(aliXternalPK),
      xinAlgoAddr,
      Bytes(xinXternalPK),
      t0,
      t1,
    )

    // Expect aliAlgoAddr to be the creator address
    expect(contract.aliAlgoAddr.value).toEqual(ctx.ledger.getApplicationForContract(contract).creator)
    expect(contract.getContractState()).toEqual(LeakSwapState.NotReady)

    // * <-- Xin does or does not lock up funds in the combined Monero account --> *

    // Xin does not call leakyClaim, so we simulate the passage of time to reach t1
    ctx.ledger.patchGlobalData({ latestTimestamp: t1 + 1 })

    // Now the contract should be in T1 passed state
    expect(contract.getContractState()).toEqual(LeakSwapState.T1Passed)

    const xinSignature = leakySignature(
      Buffer.from(ctx.ledger.getApplicationForContract(contract).address.bytes as unknown as string, 'hex'),
      xinXternalSK
    )

    // Xin tries and fails to claim the funds
    expect(() => {
      ctx.txn.createScope([
        ctx.any.txn.applicationCall({
          appId: contract,
          sender: xinAlgoAddr,
        })
      ]).execute(() => contract.leakyClaim(Bytes(xinSignature)))
    }).toThrow('Cannot claim after t1!')

    // Ali successfully punishes refund
    ctx.txn.createScope([
      ctx.any.txn.applicationCall({
        appId: contract,
        sender: aliAlgoAddr,
      })
    ]).execute(() => contract.punishRefund())

    // Should be in some final state, e.g. funds are empty, contract deleted, added a 5th "complete" state that gets returned, etc
  })

})
