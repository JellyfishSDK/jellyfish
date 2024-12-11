import { DRpcController, DefidBin } from '../../e2e.defid.module'

let app: DefidBin
let controller: DRpcController

beforeAll(async () => {
  app = new DefidBin()
  await app.start()
  controller = app.ocean.rpcController
  await app.waitForWalletCoinbaseMaturity()
  await app.waitForWalletBalanceGTE(100)

  await app.waitForBlockHeight(100)
})

afterAll(async () => {
  await app.stop()
})

it('test whitelisted getblockcount rpc call', async () => {
  const res = await controller.post({ method: 'getblockcount', params: [] })
  expect(res.result).toStrictEqual(101)
})

it('test **NOT** whitelisted listpoolpairs rpc call', async () => {
  await expect(
    controller.post({
      method: 'listpoolpairs',
      params: [{ start: 0, including_start: true, limit: 3 }, true]
    })
  ).rejects.toThrowError('403 - Unknown (/v0/regtest/rpc): Rpc listpoolpairs method is not whitelisted')
})
