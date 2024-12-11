import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc'
import { DFeeController, DefidBin, DefidRpc } from '../../e2e.defid.module'

let container: DefidRpc
let app: DefidBin
let controller: DFeeController
let client: JsonRpcClient

beforeAll(async () => {
  app = new DefidBin()
  await app.start()
  controller = app.ocean.feeController
  container = app.rpc
  await app.waitForWalletCoinbaseMaturity()
  await app.waitForWalletBalanceGTE(100)

  client = new JsonRpcClient(app.rpcUrl)

  await app.waitForBlockHeight(100)
})

afterAll(async () => {
  await app.stop()
})

describe('fee/estimate', () => {
  it('should have fee of 0.00005 and not 0.00005 after adding activity', async () => {
    const before = await controller.estimate(10)
    expect(before).toStrictEqual(0.00005000)

    for (let i = 0; i < 10; i++) {
      for (let x = 0; x < 20; x++) {
        await client.wallet.sendToAddress('bcrt1qf5v8n3kfe6v5mharuvj0qnr7g74xnu9leut39r', 0.1, {
          subtractFeeFromAmount: true,
          avoidReuse: false
        })
      }
      await container.generate(1)
    }
    const after = await controller.estimate(10)
    expect(after).not.toStrictEqual(0.00005000)
  })
})
