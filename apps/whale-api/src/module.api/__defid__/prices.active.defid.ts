import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc'
import { DPriceController, DefidBin, DefidRpc } from '../../e2e.defid.module'

let container: DefidRpc
let app: DefidBin
let controller: DPriceController
let client: JsonRpcClient

beforeAll(async () => {
  app = new DefidBin()
  await app.start()
  controller = app.ocean.priceController
  container = app.rpc
  await app.waitForWalletCoinbaseMaturity()
  client = new JsonRpcClient(app.rpcUrl)

  const height = await app.getBlockCount()
  await container.generate(1)
  await app.waitForBlockHeight(height)
})

afterAll(async () => {
  await app.stop()
})

const now = Math.floor(Date.now() / 1000)

it('should get active price with 2 active oracles (exact values)', async () => {
  const address = await app.getNewAddress()
  const oracles = []

  for (let i = 0; i < 2; i++) {
    oracles.push(await client.oracle.appointOracle(address, [
      { token: 'S1', currency: 'USD' }
    ], {
      weightage: 1
    }))
    await container.generate(1)
  }

  {
    const height = await app.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(height)
  }

  await app.generate(1)
  const { data: beforeActivePrice } = await controller.getFeedActive('S1-USD')
  expect(beforeActivePrice.length).toStrictEqual(0)

  const oneMinute = 60
  const timestamp = now
  for (let i = 0; i < oracles.length; i++) {
    await client.oracle.setOracleData(oracles[i], timestamp + i * oneMinute, {
      prices: [
        { tokenAmount: '10.0@S1', currency: 'USD' }
      ]
    })
  }
  await app.generate(1)

  await client.loan.setLoanToken({
    symbol: 'S1',
    fixedIntervalPriceId: 'S1/USD'
  })
  await app.generate(1)

  for (let i = 0; i <= 6; i++) {
    const mockTime = now + i * oneMinute
    await client.misc.setMockTime(mockTime)
    const price = i > 3 ? '12.0' : '10.0'
    for (const oracle of oracles) {
      await client.oracle.setOracleData(oracle, mockTime, {
        prices: [
          { tokenAmount: `${price}@S1`, currency: 'USD' }
        ]
      })
    }
    await app.generate(1)
  }

  {
    const height = await app.getBlockCount()
    await app.generate(1)
    await app.waitForBlockHeight(height)
  }

  const { data: activePrice } = await controller.getFeedActive('S1-USD')
  expect(activePrice[0]).toStrictEqual({
    block: {
      hash: expect.any(String),
      height: expect.any(Number),
      medianTime: expect.any(Number),
      time: expect.any(Number)
    },
    id: expect.any(String),
    key: 'S1-USD',
    active: {
      amount: '10.00000000',
      oracles: {
        active: 2,
        total: 2
      },
      weightage: 2
    },
    next: {
      amount: '12.00000000',
      oracles: {
        active: 2,
        total: 2
      },
      weightage: 2
    },
    sort: expect.any(String),
    isLive: true
  })

  {
    await app.generate(1)
    const height = await app.getBlockCount()
    await app.generate(1)
    await app.waitForBlockHeight(height)
  }

  const { data: nextActivePrice } = await controller.getFeedActive('S1-USD')
  expect(nextActivePrice[0]).toStrictEqual({
    active: {
      amount: '10.00000000',
      oracles: {
        active: 2,
        total: 2
      },
      weightage: 2
    },
    block: {
      hash: expect.any(String),
      height: expect.any(Number),
      medianTime: expect.any(Number),
      time: expect.any(Number)
    },
    id: expect.any(String),
    key: 'S1-USD',
    next: {
      amount: '12.00000000',
      oracles: {
        active: 2,
        total: 2
      },
      weightage: 2
    },
    sort: expect.any(String),
    isLive: true
  })
})
