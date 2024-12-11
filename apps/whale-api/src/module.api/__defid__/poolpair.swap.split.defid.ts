import { PoolSwapAggregatedInterval } from '@defichain/whale-api-client/dist/api/poolpairs'
import { DPoolPairController, DefidBin } from '../../e2e.defid.module'
import BigNumber from 'bignumber.js'

let app: DefidBin
let controller: DPoolPairController

function now (): number {
  return Math.floor(new Date().getTime() / 1000)
}

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
  const tokens = ['A', 'B']

  for (const token of tokens) {
    await app.waitForWalletBalanceGTE(110)
    await app.createToken(token, {
      collateralAddress: await app.rpc.address('swap')
    })
    await app.mintTokens(token, {
      mintAmount: 10000
    })
  }

  await app.rpc.token.dfi({
    address: await app.rpc.address('swap'),
    amount: 300000
  })
  await app.generate(1)

  const oracleId = await app.rpcClient.oracle.appointOracle(await app.getNewAddress(),
    [{
      token: 'DFI',
      currency: 'USD'
    }, {
      token: 'DUSD',
      currency: 'USD'
    }],
    { weightage: 1 })
  await app.generate(1)

  await app.rpcClient.oracle.setOracleData(oracleId, now(), {
    prices: [{
      tokenAmount: '1@DFI',
      currency: 'USD'
    }, {
      tokenAmount: '1@DUSD',
      currency: 'USD'
    }]
  })
  await app.generate(1)

  await app.rpcClient.loan.setCollateralToken({
    token: 'DFI',
    factor: new BigNumber(1),
    fixedIntervalPriceId: 'DFI/USD'
  })
  await app.generate(1)

  await app.rpcClient.loan.setLoanToken({
    symbol: 'DUSD',
    fixedIntervalPriceId: 'DUSD/USD'
  })
  await app.generate(1)

  await app.rpcClient.loan.createLoanScheme({
    minColRatio: 100,
    interestRate: new BigNumber(1),
    id: 'default'
  })
  await app.generate(1)

  const vaultId = await app.rpcClient.vault.createVault({
    ownerAddress: await app.rpc.address('swap'),
    loanSchemeId: 'default'
  })
  await app.generate(15)

  await app.rpcClient.vault.depositToVault({
    vaultId, from: await app.rpc.address('swap'), amount: '4000@DFI'
  })
  await app.generate(1)

  await app.rpcClient.loan.takeLoan({
    vaultId, amounts: '3000@DUSD', to: await app.rpc.address('swap')
  })
  await app.generate(1)

  await app.createPoolPair('A', 'DUSD')
  await app.createPoolPair('B', 'DUSD')

  await app.addPoolLiquidity({
    tokenA: 'A',
    amountA: 100,
    tokenB: 'DUSD',
    amountB: 200,
    shareAddress: await app.getNewAddress()
  })
  await app.addPoolLiquidity({
    tokenA: 'B',
    amountA: 50,
    tokenB: 'DUSD',
    amountB: 300,
    shareAddress: await app.getNewAddress()
  })
}

it('should not getting empty after pool split', async () => {
  const fiveMinutes = 60 * 5
  const numBlocks = 24 * 16 // 1.333 days
  // before
  {
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
        tokenFrom: 'DUSD',
        amountFrom: 0.1,
        to: await app.rpc.address('swap'),
        tokenTo: 'B'
      })

      await app.generate(1)
    }

    const height = await app.getBlockCount()
    await app.generate(1)
    await app.waitForBlockHeight(height)
  }

  const beforePool = await app.rpc.client.poolpair.getPoolPair('B-DUSD')
  // console.log('beforePool: ', beforePool)
  const poolId = Object.keys(beforePool)[0]
  // console.log('poolId: ', poolId)
  let dusdToken = await app.rpc.client.token.getToken('DUSD')
  let dusdTokenId = Object.keys(dusdToken)[0]
  // console.log('dusdTokenId: ', dusdTokenId)
  const { data: dayAggregated } = await controller.listPoolSwapAggregates(poolId, PoolSwapAggregatedInterval.ONE_DAY, { size: 10 })
  expect(dayAggregated.length).toBeGreaterThan(0)
  // console.log('dayAggregated: ', dayAggregated)

  // split
  await app.rpcClient.masternode.setGov({
    ATTRIBUTES: {
      [`v0/poolpairs/${poolId}/token_a_fee_pct`]: '0.01',
      [`v0/poolpairs/${poolId}/token_b_fee_pct`]: '0.03'
    }
  })
  await app.generate(1)

  await app.rpcClient.masternode.setGov({ LP_SPLITS: { [Number(poolId)]: 1 } })
  await app.generate(1)

  await app.rpcClient.masternode.setGov({ LP_LOAN_TOKEN_SPLITS: { [Number(poolId)]: 1 } })
  await app.generate(1)

  await app.rpc.client.masternode.setGov({
    ATTRIBUTES: {
      [`v0/locks/token/${dusdTokenId}`]: 'true'
    }
  })
  await app.generate(1)

  const count = await app.rpc.client.blockchain.getBlockCount() + 2
  await app.rpc.client.masternode.setGov({
    ATTRIBUTES: {
      [`v0/oracles/splits/${count}`]: `${dusdTokenId}/2`
    }
  })
  await app.generate(2)

  // after
  const afterPool = await app.rpc.client.poolpair.getPoolPair(beforePool[poolId].symbol)
  // console.log('afterPool: ', afterPool)
  const afterPoolId = Object.keys(afterPool)[0]
  dusdToken = await app.rpc.client.token.getToken('DUSD')
  dusdTokenId = Object.keys(dusdToken)[0]
  // console.log('dusdTokenId: ', dusdTokenId)

  await app.rpc.client.masternode.setGov({
    ATTRIBUTES: {
      [`v0/locks/token/${dusdTokenId}`]: 'false'
    }
  })
  await app.generate(1)

  {
    const dateNow = new Date()
    dateNow.setUTCSeconds(0)
    dateNow.setUTCMinutes(2)
    dateNow.setUTCHours(0)
    dateNow.setUTCDate(dateNow.getUTCDate() + 20)
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
        tokenTo: 'DUSD'
      })

      await app.generate(1)
    }

    const height = await app.getBlockCount()
    await app.generate(1)
    await app.waitForBlockHeight(height)
  }

  // Note(canonbrother): PoolSwapAggregated with new poolId should already be indexed at ocean index_block_start
  const { data: dayAggregatedAfter } = await controller.listPoolSwapAggregates(afterPoolId, PoolSwapAggregatedInterval.ONE_DAY, { size: 10 })
  expect(dayAggregatedAfter.length).toBeGreaterThan(0)
  // console.log('dayAggregatedAfter: ', dayAggregatedAfter)
})
