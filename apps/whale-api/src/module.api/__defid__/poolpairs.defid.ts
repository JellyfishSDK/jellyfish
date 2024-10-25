import { PoolSwapAggregatedInterval } from '@defichain/whale-api-client/dist/api/poolpairs'
import { DPoolPairController, DefidBin } from '../../e2e.defid.module'

let app: DefidBin
let controller: DPoolPairController

beforeAll(async () => {
  app = new DefidBin()
  await app.start()
  controller = app.ocean.poolPairController
  await app.waitForBlockHeight(101)

  await setup()
})

afterAll(async () => {
  await app.stop()
})

async function setup (): Promise<void> {
  const tokens = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']

  for (const token of tokens) {
    await app.waitForWalletBalanceGTE(110)
    await app.createToken(token, {
      collateralAddress: await app.rpc.address('swap')
    })
    await app.mintTokens(token, {
      mintAmount: 10000
    })
  }
  await app.createPoolPair('A', 'DFI')
  await app.createPoolPair('B', 'DFI')
  await app.createPoolPair('C', 'DFI')
  await app.createPoolPair('D', 'DFI')
  await app.createPoolPair('E', 'DFI')
  await app.createPoolPair('F', 'DFI')
  await app.createPoolPair('G', 'DFI')
  await app.createPoolPair('H', 'DFI')
  await app.createPoolPair('H', 'I')

  await app.addPoolLiquidity({
    tokenA: 'A',
    amountA: 100,
    tokenB: 'DFI',
    amountB: 200,
    shareAddress: await app.getNewAddress()
  })
  await app.addPoolLiquidity({
    tokenA: 'B',
    amountA: 50,
    tokenB: 'DFI',
    amountB: 300,
    shareAddress: await app.getNewAddress()
  })
  await app.addPoolLiquidity({
    tokenA: 'C',
    amountA: 90,
    tokenB: 'DFI',
    amountB: 360,
    shareAddress: await app.getNewAddress()
  })
  await app.addPoolLiquidity({
    tokenA: 'H',
    amountA: 200,
    tokenB: 'DFI',
    amountB: 550,
    shareAddress: await app.getNewAddress()
  })

  await app.addPoolLiquidity({
    tokenA: 'H',
    amountA: 100,
    tokenB: 'I',
    amountB: 300,
    shareAddress: await app.getNewAddress()
  })

  // dexUsdtDfi setup
  await app.createToken('USDT')
  await app.createPoolPair('USDT', 'DFI')
  await app.mintTokens('USDT')
  await app.addPoolLiquidity({
    tokenA: 'USDT',
    amountA: 1000,
    tokenB: 'DFI',
    amountB: 431.51288,
    shareAddress: await app.getNewAddress()
  })

  await app.createToken('USDC')
  await app.createPoolPair('USDC', 'H')
  await app.mintTokens('USDC')
  await app.addPoolLiquidity({
    tokenA: 'USDC',
    amountA: 500,
    tokenB: 'H',
    amountB: 31.51288,
    shareAddress: await app.getNewAddress()
  })

  await app.createToken('DUSD')
  await app.createToken('TEST', {
    collateralAddress: await app.rpc.address('swap')
  })
  await app.createPoolPair('TEST', 'DUSD', {
    commission: 0.002
  })
  await app.mintTokens('DUSD')
  await app.mintTokens('TEST')
  await app.addPoolLiquidity({
    tokenA: 'TEST',
    amountA: 20,
    tokenB: 'DUSD',
    amountB: 100,
    shareAddress: await app.getNewAddress()
  })

  await app.rpc.token.dfi({
    address: await app.rpc.address('swap'),
    amount: 20
  })

  await app.createToken('BURN')
  await app.createPoolPair('BURN', 'DFI', { status: false })
  await app.mintTokens('BURN', { mintAmount: 1 })
  await app.addPoolLiquidity({
    tokenA: 'BURN',
    amountA: 1,
    tokenB: 'DFI',
    amountB: 1,
    shareAddress: await app.getNewAddress()
  })
}

it('should show aggregated swaps for 24h and 30d', async () => {
  {
    const fiveMinutes = 60 * 5
    const numBlocks = 24 * 16 // 1.333 days
    const dateNow = new Date()
    dateNow.setUTCSeconds(0)
    dateNow.setUTCMinutes(2)
    dateNow.setUTCHours(0)
    dateNow.setUTCDate(dateNow.getUTCDate() + 2)
    const timeNow = Math.floor(dateNow.getTime() / 1000)
    await app.rpcClient.misc.setMockTime(timeNow)
    await app.generate(10)

    for (let i = 0; i <= numBlocks; i++) {
      const mockTime = timeNow + i * fiveMinutes
      await app.rpcClient.misc.setMockTime(mockTime)

      await app.rpc.poolpair.swap({
        from: await app.rpc.address('swap'),
        tokenFrom: 'B',
        amountFrom: 0.1,
        to: await app.rpc.address('swap'),
        tokenTo: 'DFI'
      })

      await app.generate(1)
    }

    const height = await app.getBlockCount()
    await app.generate(1)
    await app.waitForBlockHeight(height)
  }

  const { data: dayAggregated } = await controller.listPoolSwapAggregates('11', PoolSwapAggregatedInterval.ONE_DAY, { size: 10 })
  expect([...dayAggregated]).toStrictEqual([
    {
      aggregated: {
        amounts: { 2: '9.50000000' },
        usd: 42.16329700024263
      },
      block: expect.any(Object),
      bucket: expect.any(Number),
      id: expect.any(String),
      key: '11-86400'
    },
    {
      aggregated: {
        amounts: {
          2: '29.00000000'
        },
        usd: 128.7090118954775
      },
      block: expect.any(Object),
      bucket: expect.any(Number),
      id: expect.any(String),
      key: '11-86400'
    }
    // no point to preview the default
    // {
    //   aggregated: {
    //     amounts: {},
    //     usd: 0
    //   },
    //   block: expect.any(Object),
    //   bucket: expect.any(Number),
    //   id: expect.any(String),
    //   key: '11-86400'
    // }
  ])

  const { data: hourAggregated } = await controller.listPoolSwapAggregates('11', PoolSwapAggregatedInterval.ONE_HOUR, { size: 3 })
  expect([...hourAggregated]).toStrictEqual([
    {
      aggregated: {
        amounts: { 2: '1.10000000' },
        usd: 4.8820659684491465
      },
      block: expect.any(Object),
      bucket: expect.any(Number),
      id: expect.any(String),
      key: '11-3600'
    },
    {
      aggregated: {
        amounts: { 2: '1.20000000' },
        usd: 5.325890147399068
      },
      block: expect.any(Object),
      bucket: expect.any(Number),
      id: expect.any(String),
      key: '11-3600'
    },
    {
      aggregated: {
        amounts: { 2: '1.20000000' },
        usd: 5.325890147399068
      },
      block: expect.any(Object),
      bucket: expect.any(Number),
      id: expect.any(String),
      key: '11-3600'
    }
  ])
})
