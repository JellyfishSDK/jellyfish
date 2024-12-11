import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc'
import { DOracleController, DefidBin, DefidRpc } from '../../e2e.defid.module'

let container: DefidRpc
let app: DefidBin
let controller: DOracleController
let client: JsonRpcClient

interface OracleSetup {
  id: string
  address: string
  weightage: number
  feed: Array<{ token: string, currency: string }>
  prices: Array<Array<{ tokenAmount: string, currency: string }>>
}

const oracles: Record<string, OracleSetup> = {
  a: {
    id: undefined as any,
    address: undefined as any,
    weightage: 1,
    feed: [
      { token: 'TA', currency: 'USD' },
      { token: 'TB', currency: 'USD' },
      { token: 'TC', currency: 'USD' },
      { token: 'TD', currency: 'USD' }
    ],
    prices: [
      [
        { tokenAmount: '1.1@TA', currency: 'USD' },
        { tokenAmount: '2.1@TB', currency: 'USD' },
        { tokenAmount: '3.1@TC', currency: 'USD' },
        { tokenAmount: '4.1@TD', currency: 'USD' }
      ],
      [
        { tokenAmount: '1@TA', currency: 'USD' },
        { tokenAmount: '2@TB', currency: 'USD' },
        { tokenAmount: '3@TC', currency: 'USD' }
      ],
      [
        { tokenAmount: '0.9@TA', currency: 'USD' },
        { tokenAmount: '1.9@TB', currency: 'USD' }
      ]
    ]
  },
  b: {
    id: undefined as any,
    address: undefined as any,
    weightage: 2,
    feed: [
      { token: 'TA', currency: 'USD' },
      { token: 'TB', currency: 'USD' },
      { token: 'TD', currency: 'USD' }
    ],
    prices: [
      [
        { tokenAmount: '1.5@TA', currency: 'USD' },
        { tokenAmount: '2.5@TB', currency: 'USD' },
        { tokenAmount: '4.5@TD', currency: 'USD' }
      ],
      [
        { tokenAmount: '1.5@TA', currency: 'USD' },
        { tokenAmount: '2.5@TB', currency: 'USD' },
        { tokenAmount: '4.5@TD', currency: 'USD' }
      ]
    ]
  },
  c: {
    id: undefined as any,
    address: undefined as any,
    weightage: 0,
    feed: [
      { token: 'TA', currency: 'USD' },
      { token: 'TB', currency: 'USD' },
      { token: 'TC', currency: 'USD' }
    ],
    prices: [
      [
        { tokenAmount: '1.25@TA', currency: 'USD' },
        { tokenAmount: '2.25@TB', currency: 'USD' },
        { tokenAmount: '4.25@TC', currency: 'USD' }
      ]
    ]
  }
}

beforeAll(async () => {
  app = new DefidBin()
  await app.start()
  controller = app.ocean.oracleController
  container = app.rpc
  await app.waitForBlockHeight(101)
  client = new JsonRpcClient(app.rpcUrl)

  for (const setup of Object.values(oracles)) {
    setup.address = await app.getNewAddress()
    setup.id = await client.oracle.appointOracle(setup.address, setup.feed, {
      weightage: setup.weightage
    })
    await container.generate(1)
  }

  for (const setup of Object.values(oracles)) {
    for (const price of setup.prices) {
      const timestamp = Math.floor(new Date().getTime() / 1000)
      await client.oracle.setOracleData(setup.id, timestamp, {
        prices: price
      })
      await container.generate(1)
    }
  }

  const height = await app.getBlockCount()
  await container.generate(1)
  await app.waitForBlockHeight(height)
})

afterAll(async () => {
  await app.stop()
})

it('should list', async () => {
  const { data: oracles } = await controller.list()

  expect(oracles.length).toStrictEqual(3)
  expect(oracles[0]).toStrictEqual({
    id: expect.stringMatching(/[0-f]{64}/),
    ownerAddress: expect.any(String),
    weightage: expect.any(Number),
    priceFeeds: expect.any(Array),
    block: {
      hash: expect.stringMatching(/[0-f]{64}/),
      height: expect.any(Number),
      medianTime: expect.any(Number),
      time: expect.any(Number)
    }
  })
})

it('should get oracle a TA-USD feed', async () => {
  const { data: feed } = await controller.getPriceFeed(oracles.a.id, 'TA-USD')

  expect(feed.length).toStrictEqual(3)
  expect(feed[0]).toStrictEqual({
    id: expect.any(String),
    key: expect.any(String),
    sort: expect.any(String),
    amount: expect.any(String),
    currency: 'USD',
    token: 'TA',
    time: expect.any(Number),
    oracleId: oracles.a.id,
    txid: expect.stringMatching(/[0-f]{64}/),
    block: {
      hash: expect.stringMatching(/[0-f]{64}/),
      height: expect.any(Number),
      medianTime: expect.any(Number),
      time: expect.any(Number)
    }
  })
})

it('should get oracle a TB-USD feed', async () => {
  const { data: feed } = await controller.getPriceFeed(oracles.a.id, 'TB-USD')

  expect(feed.length).toStrictEqual(3)
  expect(feed[0]).toStrictEqual({
    id: expect.any(String),
    key: expect.any(String),
    sort: expect.any(String),
    amount: expect.any(String),
    currency: 'USD',
    token: 'TB',
    time: expect.any(Number),
    oracleId: oracles.a.id,
    txid: expect.stringMatching(/[0-f]{64}/),
    block: {
      hash: expect.stringMatching(/[0-f]{64}/),
      height: expect.any(Number),
      medianTime: expect.any(Number),
      time: expect.any(Number)
    }
  })
})

it('should get oracle b TB-USD feed', async () => {
  const { data: feed } = await controller.getPriceFeed(oracles.b.id, 'TB-USD')

  expect(feed.length).toStrictEqual(2)
  expect(feed[0]).toStrictEqual({
    id: expect.any(String),
    key: expect.any(String),
    sort: expect.any(String),
    amount: '2.5',
    currency: 'USD',
    token: 'TB',
    time: expect.any(Number),
    oracleId: oracles.b.id,
    txid: expect.stringMatching(/[0-f]{64}/),
    block: {
      hash: expect.stringMatching(/[0-f]{64}/),
      height: expect.any(Number),
      medianTime: expect.any(Number),
      time: expect.any(Number)
    }
  })
})

it('should get oracles by owner address', async () => {
  const { data: oracles } = await controller.list()

  for (const oracle of oracles) {
    const toCompare = await controller.getOracleByAddress(oracle.ownerAddress)
    expect(toCompare).toStrictEqual(oracle)
  }
})

it('test UpdateOracle and RemoveOracle', async () => {
  const { data: oraclesBefore } = await controller.list()

  const before = oraclesBefore[0]
  const oracleId = before.id
  const address = before.ownerAddress

  {
    await client.oracle.updateOracle(oracleId, address, {
      priceFeeds: [
        { token: 'TD', currency: 'USD' }
      ],
      weightage: 3
    })
    await container.generate(1)
    const height = await app.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(height)
  }

  const { data: oracles } = await controller.list()
  const after = oracles.find((oracle) => oracle.id === oracleId)
  expect(after?.id).toStrictEqual(before.id)
  expect(after?.priceFeeds).toStrictEqual([{ token: 'TD', currency: 'USD' }])
  expect(after?.weightage).toStrictEqual(3)

  {
    await client.oracle.removeOracle(oracleId)
    await container.generate(1)
    const height = await app.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(height)
  }

  const { data: oraclesFinal } = await controller.list()
  expect(oraclesFinal.length).toStrictEqual(oraclesBefore.length - 1)
  const removed = oraclesFinal.find((oracle) => oracle.id === oracleId)
  expect(removed).toBeUndefined()
})
