import { MasterNodeRegTestContainer } from '@defichain/testcontainers'
import { StubService } from '../stub.service'
import { WhaleApiClient } from '../../src'
import { StubWhaleApiClient } from '../stub.client'
import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc'
import { PriceFeedTimeInterval } from '@defichain/whale-api-client/dist/api/prices'
import { Testing } from '@defichain/jellyfish-testing'
import {
  OracleIntervalSeconds
} from '@defichain-apps/nest-apps/whale-api/src/module.model/oracle.price.aggregated.interval'

const now = Math.floor(Date.now() / 1000)

describe('oracles', () => {
  let container: MasterNodeRegTestContainer
  let service: StubService
  let rpcClient: JsonRpcClient
  let apiClient: WhaleApiClient

  beforeAll(async () => {
    container = new MasterNodeRegTestContainer()
    service = new StubService(container)
    apiClient = new StubWhaleApiClient(service)

    await container.start()
    await container.waitForReady()
    await container.waitForWalletCoinbaseMaturity()
    await service.start()

    rpcClient = new JsonRpcClient(await container.getCachedRpcUrl())
  })

  afterAll(async () => {
    try {
      await service.stop()
    } finally {
      await container.stop()
    }
  })

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
        { token: 'TD', currency: 'USD' },
        { token: 'TE', currency: 'USD' },
        { token: 'TF', currency: 'USD' }
      ],
      prices: [
        [
          { tokenAmount: '1.1@TA', currency: 'USD' },
          { tokenAmount: '2.1@TB', currency: 'USD' },
          { tokenAmount: '3.1@TC', currency: 'USD' },
          { tokenAmount: '4.1@TD', currency: 'USD' },
          { tokenAmount: '5.1@TE', currency: 'USD' },
          { tokenAmount: '6.1@TF', currency: 'USD' }
        ],
        [
          { tokenAmount: '1@TA', currency: 'USD' },
          { tokenAmount: '2@TB', currency: 'USD' },
          { tokenAmount: '3@TC', currency: 'USD' },
          { tokenAmount: '4@TD', currency: 'USD' },
          { tokenAmount: '5@TE', currency: 'USD' },
          { tokenAmount: '6@TF', currency: 'USD' }
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
        { token: 'TD', currency: 'USD' },
        { token: 'TG', currency: 'USD' }
      ],
      prices: [
        [
          { tokenAmount: '1.5@TA', currency: 'USD' },
          { tokenAmount: '2.5@TB', currency: 'USD' },
          { tokenAmount: '4.5@TD', currency: 'USD' },
          { tokenAmount: '6.5@TG', currency: 'USD' }
        ],
        [
          { tokenAmount: '1.5@TA', currency: 'USD' },
          { tokenAmount: '2.5@TB', currency: 'USD' },
          { tokenAmount: '4.5@TD', currency: 'USD' },
          { tokenAmount: '6.5@TG', currency: 'USD' }
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
        { token: 'TC', currency: 'USD' },
        { token: 'TH', currency: 'USD' }
      ],
      prices: [
        [
          { tokenAmount: '1.25@TA', currency: 'USD' },
          { tokenAmount: '2.25@TB', currency: 'USD' },
          { tokenAmount: '4.25@TC', currency: 'USD' },
          { tokenAmount: '8.25@TH', currency: 'USD' }
        ]
      ]
    }
  }

  beforeAll(async () => {
    for (const setup of Object.values(setups)) {
      setup.address = await container.getNewAddress()
      setup.id = await rpcClient.oracle.appointOracle(setup.address, setup.feed, {
        weightage: setup.weightage
      })
      await container.generate(1)
    }

    for (const setup of Object.values(setups)) {
      for (const price of setup.prices) {
        await rpcClient.oracle.setOracleData(setup.id, now, {
          prices: price
        })
        await container.generate(1)
      }
    }

    const height = await container.getBlockCount()
    await container.generate(1)
    await service.waitForIndexedHeight(height)
  })

  it('should list', async () => {
    const prices = await apiClient.prices.list()
    expect(prices.length).toStrictEqual(7)
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
          amount: '2.30000000',
          weightage: 3,
          oracles: {
            active: 2,
            total: 3
          }
        }
      }
    })

    const expectOrders = [
      'TB-USD',
      'TA-USD',
      'TC-USD',
      'TD-USD',
      'TG-USD',
      'TF-USD',
      'TE-USD'
    ]
    const ids = prices.map(p => p.id)
    for (let i = 0; i < ids.length; i += 1) {
      expect(ids[i]).toStrictEqual(expectOrders[i])
    }
  })

  describe('TA-USD', () => {
    it('should get ticker', async () => {
      const ticker = await apiClient.prices.get('TA', 'USD')
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
            amount: '1.30000000',
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
      const feeds = await apiClient.prices.getFeed('TA', 'USD')
      expect(feeds.length).toStrictEqual(6)
    })

    it('should get oracles', async () => {
      const oracles = await apiClient.prices.getOracles('TA', 'USD')
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
  })
})

describe('pricefeed with interval', () => {
  const container = new MasterNodeRegTestContainer()
  const service = new StubService(container)
  const apiClient = new StubWhaleApiClient(service)
  let client: JsonRpcClient

  beforeAll(async () => {
    await container.start()
    await container.waitForWalletCoinbaseMaturity()
    await service.start()

    client = new JsonRpcClient(await container.getCachedRpcUrl())
  })

  afterAll(async () => {
    try {
      await service.stop()
    } finally {
      await container.stop()
    }
  })

  // TODO(jingyi2811): Temporarily skip failed flaky test. See issue 1474.
  it.skip('should get interval', async () => {
    const address = await container.getNewAddress()
    const oracleId = await client.oracle.appointOracle(address, [
      { token: 'S1', currency: 'USD' }
    ], {
      weightage: 1
    })
    await container.generate(1)

    const oneMinute = 60
    let price = 0
    let mockTime = now
    for (let h = 0; h < 24; h++) { // loop for 24 hours to make a day
      for (let z = 0; z < 4; z++) { // loop for 4 x 15 mins interval to make an hour
        mockTime += (15 * oneMinute) + 1 // +1 sec to fall into the next 15 mins bucket
        await client.misc.setMockTime(mockTime)
        await container.generate(2)

        await client.oracle.setOracleData(oracleId, mockTime, {
          prices: [
            {
              tokenAmount: `${(++price).toFixed(2)}@S1`,
              currency: 'USD'
            }
          ]
        })
        await container.generate(1)
      }
    }

    const height = await container.getBlockCount()
    await container.generate(1)
    await service.waitForIndexedHeight(height)

    const noInterval = await apiClient.prices.getFeed('S1', 'USD', height)
    expect(noInterval.length).toStrictEqual(96)

    const interval15Mins = await apiClient.prices.getFeedWithInterval('S1', 'USD', PriceFeedTimeInterval.FIFTEEN_MINUTES, height)
    expect(interval15Mins.length).toStrictEqual(96)
    let prevMedianTime = 0
    let checkPrice = price
    interval15Mins.forEach(value => {
      expect(value.aggregated.amount).toStrictEqual(checkPrice.toFixed(8)) // check if price is descending in intervals of 1
      checkPrice--
      if (prevMedianTime !== 0) { // check if time interval is in 15 mins block
        expect(prevMedianTime - value.block.medianTime - 1).toStrictEqual(OracleIntervalSeconds.FIFTEEN_MINUTES) // account for +1 in mock time
      }
      prevMedianTime = value.block.medianTime
    })

    const interval1Hour = await apiClient.prices.getFeedWithInterval('S1', 'USD', PriceFeedTimeInterval.ONE_HOUR, height)
    expect(interval1Hour.length).toStrictEqual(24)
    prevMedianTime = 0
    interval1Hour.forEach(value => { // check if time interval is in 1-hour block
      if (prevMedianTime !== 0) {
        expect(prevMedianTime - value.block.medianTime - 4).toStrictEqual(OracleIntervalSeconds.ONE_HOUR) // account for + 1 per block in mock time
      }
      prevMedianTime = value.block.medianTime
    })

    expect(interval1Hour.map(x => {
      return {
        amount: x.aggregated.amount,
        time: x.aggregated.time
      }
    })).toStrictEqual(
      [
        {
          amount: '94.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '90.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '86.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '82.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '78.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '74.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '70.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '66.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '62.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '58.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '54.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '50.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '46.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '42.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '38.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '34.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '30.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '26.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '22.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '18.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '14.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '10.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '6.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        },
        {
          amount: '2.50000000',
          time: {
            interval: 3600,
            start: expect.any(Number),
            end: expect.any(Number)
          }
        }
      ]
    )

    { // ensure all aggregated time is aligned
      let prevStart = interval1Hour[0].aggregated.time.start
      for (let i = 1; i < interval1Hour.length; i++) {
        const interval = interval1Hour[i]
        expect(interval.aggregated.time.end).toStrictEqual(prevStart)
        prevStart = interval.aggregated.time.start
      }
    }

    const interval1Day = await apiClient.prices.getFeedWithInterval('S1', 'USD', PriceFeedTimeInterval.ONE_DAY, height)
    expect(interval1Day.length).toStrictEqual(1)
    prevMedianTime = 0
    interval1Day.forEach(value => { // check if time interval is in 1-day block
      if (prevMedianTime !== 0) {
        expect(prevMedianTime - value.block.medianTime - 96).toStrictEqual(OracleIntervalSeconds.ONE_DAY) // account for + 1 per block in mock time
      }
      prevMedianTime = value.block.medianTime
    })
    expect(interval1Day.map(x => x.aggregated.amount)).toStrictEqual(
      [
        '48.50000000'
      ]
    )
  })
})

// TODO(jingyi2811): Temporarily skip failed flaky test. See issue 1474.
describe.skip('active price', () => {
  const container = new MasterNodeRegTestContainer()
  const testing = Testing.create(container)
  const service = new StubService(container)
  const apiClient = new StubWhaleApiClient(service)
  let client: JsonRpcClient

  beforeEach(async () => {
    await container.start()
    await container.waitForWalletCoinbaseMaturity()
    await service.start()

    client = new JsonRpcClient(await container.getCachedRpcUrl())
  })

  afterEach(async () => {
    try {
      await service.stop()
    } finally {
      await container.stop()
    }
  })

  it('should get active price with 2 active oracles (exact values)', async () => {
    const address = await container.getNewAddress()
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
      const height = await container.getBlockCount()
      await container.generate(1)
      await service.waitForIndexedHeight(height)
    }

    await testing.generate(1)
    const beforeActivePrice = await apiClient.prices.getFeedActive('S1', 'USD', 1)
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
    await testing.generate(1)

    await testing.rpc.loan.setLoanToken({
      symbol: 'S1',
      fixedIntervalPriceId: 'S1/USD'
    })
    await testing.generate(1)

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
      await testing.generate(1)
    }

    {
      const height = await container.getBlockCount()
      await testing.generate(1)
      await service.waitForIndexedHeight(height)
    }

    const activePrice = await apiClient.prices.getFeedActive('S1', 'USD', 1)
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
      await testing.generate(1)
      const height = await container.getBlockCount()
      await testing.generate(1)
      await service.waitForIndexedHeight(height)
    }

    const nextActivePrice = await apiClient.prices.getFeedActive('S1', 'USD', 1)
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

  it('should get active price with 2 active oracles (vs rpc)', async () => {
    const oracles = []
    for (let i = 0; i < 2; i++) {
      oracles.push(await client.oracle.appointOracle(await container.getNewAddress(), [
        { token: 'S1', currency: 'USD' }
      ], { weightage: 1 }))
      await testing.generate(1)
    }

    for (const oracle of oracles) {
      await client.oracle.setOracleData(oracle, now, {
        prices: [
          { tokenAmount: '10.0@S1', currency: 'USD' }
        ]
      })
    }

    await testing.generate(1)
    await testing.rpc.loan.setLoanToken({
      symbol: 'S1',
      fixedIntervalPriceId: 'S1/USD'
    })
    await testing.generate(1)

    const oneMinute = 60
    const timeNow = now
    for (let i = 0; i <= 6; i++) {
      const mockTime = timeNow + i * oneMinute
      await client.misc.setMockTime(mockTime)
      const price = i > 3 ? '12.0' : '10.0'
      for (const oracle of oracles) {
        await client.oracle.setOracleData(oracle, mockTime, {
          prices: [
            { tokenAmount: `${price}@S1`, currency: 'USD' }
          ]
        })
      }
      await container.generate(1)
    }

    // Active price ticks over in this loop, this is to ensure the values align
    for (let i = 0; i <= 5; i++) {
      {
        const height = await container.getBlockCount()
        await container.generate(1)
        await service.waitForIndexedHeight(height)
      }

      const fixedIntervalPrice = await testing.rpc.oracle.getFixedIntervalPrice('S1/USD')
      const activePrice = await apiClient.prices.getFeedActive('S1', 'USD', 1)
      expect(activePrice[0]).toStrictEqual({
        active: {
          amount: fixedIntervalPrice.activePrice.toFixed(8),
          oracles: {
            active: 2,
            total: 2
          },
          weightage: 2
        },
        block: {
          hash: expect.any(String),
          height: fixedIntervalPrice.activePriceBlock,
          medianTime: expect.any(Number),
          time: expect.any(Number)
        },
        id: expect.any(String),
        key: 'S1-USD',
        next: {
          amount: fixedIntervalPrice.nextPrice.toFixed(8),
          oracles: {
            active: 2,
            total: 2
          },
          weightage: 2
        },
        sort: expect.any(String),
        isLive: fixedIntervalPrice.isLive
      })
    }
  })

  it('should go active then inactive then active (vs rpc)', async () => {
    const address = await container.getNewAddress()
    const oracles = []
    for (let i = 0; i < 2; i++) {
      oracles.push(await client.oracle.appointOracle(address, [
        { token: 'S1', currency: 'USD' }
      ], { weightage: 1 }))
      await container.generate(1)
    }

    const beforeActivePrice = await apiClient.prices.getFeedActive('S1', 'USD', 1)
    expect(beforeActivePrice.length).toStrictEqual(0)

    for (const oracle of oracles) {
      await client.oracle.setOracleData(oracle, now, {
        prices: [
          { tokenAmount: '10.0@S1', currency: 'USD' }
        ]
      })
    }

    await testing.generate(1)
    await testing.rpc.loan.setLoanToken({
      symbol: 'S1',
      fixedIntervalPriceId: 'S1/USD'
    })
    await testing.generate(1)

    const oneMinute = 60
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
    }

    {
      const height = await container.getBlockCount()
      await container.generate(1)
      await service.waitForIndexedHeight(height)
      await new Promise((resolve) => setTimeout(resolve, 500))

      const fixedIntervalPrice = await testing.rpc.oracle.getFixedIntervalPrice('S1/USD')
      const activePrice = await apiClient.prices.getFeedActive('S1', 'USD', 1)
      expect(activePrice[0]).toStrictEqual({
        block: {
          hash: expect.any(String),
          height: expect.any(Number),
          medianTime: expect.any(Number),
          time: fixedIntervalPrice.timestamp
        },
        id: expect.any(String),
        key: 'S1-USD',
        next: {
          amount: fixedIntervalPrice.nextPrice.toFixed(8),
          oracles: {
            active: 2,
            total: 2
          },
          weightage: 2
        },
        sort: expect.any(String),
        isLive: fixedIntervalPrice.isLive
      })

      expect(activePrice[0].isLive).toStrictEqual(false)
    }

    // Set mock time in the future
    const mockTime = now + 70 * oneMinute
    await client.misc.setMockTime(mockTime)

    {
      await container.generate(6)
      const height = await container.getBlockCount()
      await container.generate(1)
      await service.waitForIndexedHeight(height)
      await new Promise((resolve) => setTimeout(resolve, 500))

      const fixedIntervalPrice = await testing.rpc.oracle.getFixedIntervalPrice('S1/USD')
      const activePrice = await apiClient.prices.getFeedActive('S1', 'USD', 1)

      expect(activePrice[0]).toStrictEqual({
        active: {
          amount: fixedIntervalPrice.activePrice.toFixed(8),
          oracles: {
            active: 2,
            total: 2
          },
          weightage: 2
        },
        block: {
          hash: expect.any(String),
          height: fixedIntervalPrice.activePriceBlock,
          medianTime: expect.any(Number),
          time: expect.any(Number)
        },
        id: expect.any(String),
        key: 'S1-USD',
        sort: expect.any(String),
        isLive: fixedIntervalPrice.isLive
      })

      expect(activePrice[0].isLive).toStrictEqual(false)
    }

    for (const oracle of oracles) {
      await client.oracle.setOracleData(oracle, mockTime, {
        prices: [
          { tokenAmount: '15.0@S1', currency: 'USD' }
        ]
      })
    }

    {
      await container.generate(6)
      const height = await container.getBlockCount()
      await container.generate(1)
      await service.waitForIndexedHeight(height)
      await new Promise((resolve) => setTimeout(resolve, 500))

      const fixedIntervalPrice = await testing.rpc.oracle.getFixedIntervalPrice('S1/USD')
      const activePrice = await apiClient.prices.getFeedActive('S1', 'USD', 1)

      expect(activePrice[0]).toStrictEqual({
        active: {
          amount: fixedIntervalPrice.activePrice.toFixed(8),
          oracles: {
            active: 2,
            total: 2
          },
          weightage: 2
        },
        next: {
          amount: fixedIntervalPrice.nextPrice.toFixed(8),
          oracles: {
            active: 2,
            total: 2
          },
          weightage: 2
        },
        block: {
          hash: expect.any(String),
          height: fixedIntervalPrice.activePriceBlock,
          medianTime: expect.any(Number),
          time: expect.any(Number)
        },
        id: expect.any(String),
        key: 'S1-USD',
        sort: expect.any(String),
        isLive: fixedIntervalPrice.isLive
      })

      expect(activePrice[0].isLive).toStrictEqual(true)
    }
  })
})
