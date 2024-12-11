import { DStatsController, DefidBin, DefidRpc } from '../../e2e.defid.module'

let container: DefidRpc
let app: DefidBin
let controller: DStatsController

beforeAll(async () => {
  app = new DefidBin()
  await app.start()
  controller = app.ocean.statsController
  container = app.rpc
  await app.waitForBlockHeight(100)
})

afterAll(async () => {
  await app.stop()
})

it('should getRewardDistribution', async () => {
  await container.generate(10)
  await app.waitForBlockHeight(110)

  const data = await controller.getRewardDistribution()
  expect(data).toStrictEqual({
    masternode: 66.66,
    community: 9.82,
    anchor: 0.04,
    liquidity: 50.9,
    loan: 49.36,
    options: 19.76,
    unallocated: 3.46
  })
})
