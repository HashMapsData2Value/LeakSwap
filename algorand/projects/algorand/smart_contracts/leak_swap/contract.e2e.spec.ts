import { Config } from '@algorandfoundation/algokit-utils'
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug'
import { algorandFixture } from '@algorandfoundation/algokit-utils/testing'
import { Address } from 'algosdk'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { LeakSwapFactory } from '../artifacts/leak_swap/LeakSwapClient'

describe.skip('LeakSwap contract', () => {
  const localnet = algorandFixture()
  beforeAll(() => {
    Config.configure({
      debug: true,
      // traceAll: true,
    })
    registerDebugEventHandlers()
  })
  beforeEach(localnet.newScope)

  const deploy = async (account: Address) => {
    const factory = localnet.algorand.client.getTypedAppFactory(LeakSwapFactory, {
      defaultSender: account,
    })

    const { appClient } = await factory.deploy({
      onUpdate: 'append',
      onSchemaBreak: 'append',
    })
    return { client: appClient }
  }

  // test.skip('simulate says hello with correct budget consumed', async () => {
  //   const { testAccount } = localnet.context
  //   const { client } = await deploy(testAccount)
  //   const result = await client
  //     .newGroup()
  //     .hello({ args: { name: 'World' } })
  //     .hello({ args: { name: 'Jane' } })
  //     .simulate()

  //   expect(result.returns[0]).toBe('Hello, World')
  //   expect(result.returns[1]).toBe('Hello, Jane')
  //   expect(result.simulateResponse.txnGroups[0].appBudgetConsumed).toBeLessThan(100)
  // })


  // test('LeakSwap: Happy Path', async () => {
  //   const { testAccount } = localnet.context
  //   const { client } = await deploy(testAccount)

  //   expect(await client.send.getContractState()).toEqual(0)

  // })

})
