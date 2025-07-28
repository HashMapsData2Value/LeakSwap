import { AlgorandClient, Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { beforeAll, beforeEach, describe, test, expect } from 'vitest'
import { LeakSwapClient, LeakSwapFactory } from '../artifacts/leak_swap/LeakSwapClient'
import { extractScalarFromLeakySignature, genScalar, getPK, leakySignature } from './toChocoBox'
import { Account, Address, Algodv2 } from 'algosdk'
import { IndexerClient } from 'algosdk/dist/types/client/v2/indexer/indexer'
import { TransactionSignerAccount } from '@algorandfoundation/algokit-utils/types/account'

// Helper function to sleep for a given number of milliseconds
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const fundAmount = (10).algo()
const methodCallsFees = (4000).microAlgos() // Ensure we have enough budget for the app call


type LeakSwapCreateAppParams = {
  aliXternalPK: Uint8Array,
  xinAlgoAddr: string,
  xinXternalPK: Uint8Array,
  t0: number,
  t1: number,
}

describe('LeakSwap contract', () => {
  const localnet = algorandFixture()
  beforeAll(() => {
    Config.configure({
      debug: true,
      // traceAll: true,
    })
    registerDebugEventHandlers()
  })
  beforeEach(localnet.newScope)

  const deploy = async (account: string, params: LeakSwapCreateAppParams) => {
    const factory = localnet.algorand.client.getTypedAppFactory(LeakSwapFactory, {
      defaultSender: account,
    })

    const { appClient } = await factory.send.create.createApplication({
      args: [
        params.aliXternalPK,
        params.xinAlgoAddr,
        params.xinXternalPK,
        params.t0, // Convert to seconds
        params.t1, // Convert to seconds
      ],
      extraProgramPages: 0,
    })

    return { client: appClient }
  }

  test('LeakSwap: Happy Path', { timeout: 60000 }, async () => {
    const { testAccount } = localnet.context
    localnet.algorand.account.ensureFundedFromEnvironment(testAccount, (20).algo())

    // TODO: replace with 0 Algo initial funds, funding by calling funder LSIG
    const xinAlgoAccount = (await localnet.context.generateAccount({ initialFunds: (10).algo(), suppressLog: true }))
    const aliXternalSK = genScalar()
    const xinXternalSK = genScalar()

    const leakySwapCreateParams: LeakSwapCreateAppParams = {
      aliXternalPK: getPK(aliXternalSK),
      xinAlgoAddr: xinAlgoAccount.addr.toString(),
      xinXternalPK: getPK(xinXternalSK),
      t0: Date.now() + 3600, // 1 hour from now
      t1: Date.now() + 5400, // 1.5 hours from now
    }

    const { client } = await deploy(testAccount.addr.toString(), leakySwapCreateParams)

    // Basic test - check that the contract was deployed successfully
    expect(client.appId).toBeGreaterThan(0)
    expect((await client.send.getContractState()).return).toEqual(0n)

    // After deploying the contract, Ali needs to fund it
    await aliFundContract(
      localnet.algorand,
      testAccount,
      client.appAddress,
    )

    // Ali sets the contract to ready
    await aliSetReady(client)

    await callLeakyClaimFromXin(
      localnet.algorand.client.algod,
      client.appId,
      xinAlgoAccount,
      leakySignature( // Xin's leaky signature leaks his xternal secret key, on purrpose
        client.appAddress.publicKey,
        xinXternalSK,
      ))

    const leakedScalar = await repeatedlySearchForLeakedScalar(
      localnet.algorand.client.indexer,
      client.appAddress,
      getPK(xinXternalSK)
    )

    console.log(getPK(leakedScalar))
    console.log(getPK(xinXternalSK))

    expect(Array.from(getPK(leakedScalar))).toEqual(Array.from(getPK(xinXternalSK)))

  })

})





// Ali funds the contract
// This function is used to fund the LeakSwap contract after it has been deployed
async function aliFundContract(
  algorand: AlgorandClient,
  aliAccount: Address & Account & TransactionSignerAccount,
  appAddress: Address
): Promise<void> {

  // After deploying the contract, Ali needs to fund it
  const aliFund = await algorand.createTransaction.payment({
    sender: aliAccount.addr.toString(),
    receiver: appAddress,
    amount: fundAmount,
  })
  await algorand.client.algod.sendRawTransaction(await aliAccount.signer([aliFund], [0])).do()

  // Check that the contract has been funded
  expect((await algorand.client.algod.accountInformation(appAddress).do()).amount).toEqual(fundAmount.microAlgos)
}

// After Xin has locked up funds on the xternal chain, Ali sets the contract to ready
// This function is used to set the contract to ready state after Ali has funded it
async function aliSetReady(client: LeakSwapClient): Promise<void> {
  await client.send.setReady()
  const state = await client.send.getContractState()
  expect(state.return).toEqual(1n)
}

// Function to call leakyClaim from Xin's account
// This function will be used to test the leakyClaim functionality
// It will send a transaction to the LeakSwap contract, passing the leaky signature as an argument
async function callLeakyClaimFromXin(
  algod: Algodv2,
  appId: bigint,
  xinAlgoAccount: Address & Account & TransactionSignerAccount,
  xinLeakySignature: Uint8Array
) {

  const xinAlgoBalanceBefore = (await algod.accountInformation(xinAlgoAccount).do()).amount

  await AlgorandClient.defaultLocalNet()
    .setDefaultSigner(xinAlgoAccount.signer)
    .client.getTypedAppClientById(LeakSwapClient, {
      appId: appId,
      defaultSender: xinAlgoAccount.addr,
      defaultSigner: xinAlgoAccount.signer,
    }).send.leakyClaim({
      args: [xinLeakySignature],
      coverAppCallInnerTransactionFees: true,
      maxFee: methodCallsFees,
    })


  const xinAlgoBalanceAfter = (await algod.accountInformation(xinAlgoAccount).do()).amount

  // Confirm that Xin has received the funds
  expect(xinAlgoBalanceAfter - xinAlgoBalanceBefore).toEqual(fundAmount.microAlgos - methodCallsFees.microAlgos) // Account for the app call fees

}

// We must try to find the leaked scalar with retries. The delay depends on the indexer processing time.
// We will retry a few times, with a delay between each attempt, until the indexer has processed.
const repeatedlySearchForLeakedScalar = async (indexer: IndexerClient, appAddress: Address, xinXternalPK: Uint8Array): Promise<Uint8Array> => {
  let leakedScalar: Uint8Array | undefined
  const maxRetries = 6
  const retryDelay = 5000 // 5 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      leakedScalar = await findLeakedScalarInAppHistory(
        indexer,
        appAddress,
        xinXternalPK
      )
      break // Success, exit the loop
    } catch (error) {
      if (attempt < maxRetries) {
        await sleep(retryDelay)
      } else {
        const errorMessage = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to find leaked scalar after ${maxRetries} attempts: ${errorMessage}`)
      }
    }
  }

  if (!leakedScalar) {
    throw new Error('Leaked scalar not found after all retries')
  }

  return leakedScalar
}


// Searches through the transaction history of the app to find the leaky signature.
// Calculates the leaked scalar from the signature, before returning it.
const findLeakedScalarInAppHistory = async (
  indexer: IndexerClient,
  appAddress: Address,
  xinXternalPK: Uint8Array) => {

  const res = await indexer.searchForTransactions().address(appAddress).do();

  // Look for the transaction with the leaky signature (starts with the broken R-point)
  const targetRPoint = new Uint8Array([
    88, 102, 102, 102, 102, 102, 102, 102, 102, 102,
    102, 102, 102, 102, 102, 102, 102, 102, 102, 102,
    102, 102, 102, 102, 102, 102, 102, 102, 102, 102,
    102, 102
  ])

  let leakySignatureArg: Uint8Array | undefined

  for (const transaction of res.transactions) {
    const appArgs = transaction.applicationTransaction?.applicationArgs
    if (appArgs && appArgs.length > 1) {
      const arg1 = appArgs[1]
      // Check if this argument starts with the target R-point
      if (arg1.length == 66) { // 2-byte prefix + 64-byte signature
        const rPoint = arg1.slice(2, 34)
        let matches = true
        for (let i = 0; i < targetRPoint.length; i++) {
          if (rPoint[i] !== targetRPoint[i]) {
            matches = false
            break
          }
        }
        if (matches) {
          leakySignatureArg = arg1.slice(2, 66) // First two bytes are a prefix
          break
        }
      }
    }
  }

  if (!leakySignatureArg) {
    throw new Error('Could not find leaky signature in transaction history')
  }

  return extractScalarFromLeakySignature(leakySignatureArg, appAddress.publicKey, xinXternalPK)
}
