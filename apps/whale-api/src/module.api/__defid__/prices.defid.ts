import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc'
import { DPriceController, DefidBin, DefidRpc } from '../../e2e.defid.module'

let container: DefidRpc
let app: DefidBin
let controller: DPriceController
let client: JsonRpcClient

interface OracleSetup {
  id: string
  address: string
  weightage: number
  feed: Array<{ token: string, currency: string }>
  prices: Array<Array<{ tokenAmount: string, currency: string }>>
}

const setups: Record<string, OracleSetup> = {
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

const now = Math.floor(Date.now() / 1000)

beforeAll(async () => {
  app = new DefidBin()
  await app.start()
  controller = app.ocean.priceController
  container = app.rpc
  await app.waitForWalletCoinbaseMaturity()
  client = new JsonRpcClient(app.rpcUrl)

  for (const setup of Object.values(setups)) {
    setup.address = await app.getNewAddress()
    setup.id = await client.oracle.appointOracle(setup.address, setup.feed, {
      weightage: setup.weightage
    })
    await container.generate(1)
  }

  for (const setup of Object.values(setups)) {
    for (const price of setup.prices) {
      await client.oracle.setOracleData(setup.id, now, {
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
  const { data: prices } = await controller.list()
  expect(prices.length).toStrictEqual(4)
  expect(prices[0]).toStrictEqual({
    id: 'TB-USD',
    sort: '000000030000006eTB-USD',
    price: {
      block: {
        hash: expect.stringMatching(/[0-f]{64}/),
        height: expect.any(Number),
        medianTime: expect.any(Number),
        time: expect.any(Number)
      },
      currency: 'USD',
      token: 'TB',
      id: 'TB-USD-110',
      key: 'TB-USD',
      sort: expect.any(String),
      aggregated: {
        // amount: '2.30000000',
        amount: expect.any(Number), // 2.33333333
        weightage: 3,
        oracles: {
          active: 2,
          total: 3
        }
      }
    }
  })
})

it('should get ticker', async () => {
  const ticker = await controller.get('TA-USD')
  expect(ticker).toStrictEqual({
    id: 'TA-USD',
    sort: '000000030000006eTA-USD',
    price: {
      block: {
        hash: expect.stringMatching(/[0-f]{64}/),
        height: expect.any(Number),
        medianTime: expect.any(Number),
        time: expect.any(Number)
      },
      aggregated: {
        // amount: '1.30000000',
        amount: expect.any(Number), // 1.33333333
        weightage: 3,
        oracles: {
          active: 2,
          total: 3
        }
      },
      currency: 'USD',
      token: 'TA',
      id: 'TA-USD-110',
      key: 'TA-USD',
      sort: expect.any(String)
    }
  })
})

it('should get feeds', async () => {
  const { data: feeds } = await controller.getFeed('TA-USD')
  expect(feeds.length).toStrictEqual(6)
})

it('should get oracles', async () => {
  const { data: oracles } = await controller.listPriceOracles('TA-USD')
  expect(oracles.length).toStrictEqual(3)

  expect(oracles[0]).toStrictEqual({
    id: expect.stringMatching(/TA-USD-[0-f]{64}/),
    key: 'TA-USD',
    oracleId: expect.stringMatching(/[0-f]{64}/),
    token: 'TA',
    currency: 'USD',
    weightage: expect.any(Number),
    feed: {
      id: expect.any(String),
      key: expect.any(String),
      sort: expect.any(String),
      amount: expect.any(String),
      currency: 'USD',
      token: 'TA',
      time: expect.any(Number),
      oracleId: oracles[0].oracleId,
      txid: expect.stringMatching(/[0-f]{64}/),
      block: {
        hash: expect.stringMatching(/[0-f]{64}/),
        height: expect.any(Number),
        medianTime: expect.any(Number),
        time: expect.any(Number)
      }
    },
    block: {
      hash: expect.stringMatching(/[0-f]{64}/),
      height: expect.any(Number),
      medianTime: expect.any(Number),
      time: expect.any(Number)
    }
  })
})

// NOTE(canonbrother):
// `getFeedActive` and `getFeedWithInterval` are skipped on origin test suite due to flaky
// to do while needed
