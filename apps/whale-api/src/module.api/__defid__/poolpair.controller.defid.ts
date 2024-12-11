
import { BigNumber } from 'bignumber.js'
import { DPoolPairController, DefidBin, DefidRpc } from '../../e2e.defid.module'
import { WhaleApiException } from '@defichain/whale-api-client/dist/errors'

let container: DefidRpc
let app: DefidBin
let controller: DPoolPairController

beforeAll(async () => {
  app = new DefidBin()
  await app.start()
  controller = app.ocean.poolPairController
  container = app.rpc
  await app.waitForBlockHeight(101)
  await setup()

  // const cache = app.get<Cache>(CACHE_MANAGER)
  // const defiCache = app.get(DeFiDCache)

  // const tokenResult = await app.call('listtokens')
  // // precache
  // for (const k in tokenResult) {
  //   await defiCache.getTokenInfo(k) as TokenInfo
  // }

  // // ensure precache is working
  // const tkey = `${CachePrefix.TOKEN_INFO} 31`
  // const token = await cache.get<TokenInfo>(tkey)
  // expect(token?.symbolKey).toStrictEqual('USDT-DFI')

  // await app.waitForPath(controller)
})

afterAll(async () => {
  await app.stop()
})

async function setup (): Promise<void> {
  const tokens = [
    'A', 'B', 'C', 'D', 'E', 'F',

    // For testing swap paths
    'G', // bridged via A to the rest
    'H', // isolated - no associated poolpair
    'I', 'J', 'K', 'L', 'M', 'N' // isolated from the rest - only swappable with one another
  ]

  for (const token of tokens) {
    await app.waitForWalletBalanceGTE(110)
    await app.createToken(token)
    await app.mintTokens(token)
  }

  // Create non-DAT token - direct RPC call required as createToken() will
  // rpc call 'gettoken' with symbol, but will fail for non-DAT tokens
  await app.waitForWalletBalanceGTE(110)
  await app.call('createtoken', [{
    symbol: 'O',
    name: 'O',
    isDAT: false,
    mintable: true,
    tradeable: true,
    collateralAddress: await app.getNewAddress()
  }])
  await container.generate(1)

  await app.createPoolPair('A', 'DFI')
  await app.createPoolPair('B', 'DFI')
  await app.createPoolPair('C', 'DFI')
  await app.createPoolPair('D', 'DFI')
  await app.createPoolPair('E', 'DFI')
  await app.createPoolPair('F', 'DFI')

  await app.createPoolPair('G', 'A')
  await app.createPoolPair('I', 'J')
  await app.createPoolPair('J', 'K', { commission: 0.25 })
  await app.createPoolPair('J', 'L', { commission: 0.1 })
  await app.createPoolPair('L', 'K')
  await app.createPoolPair('L', 'M', { commission: 0.50 })
  await app.createPoolPair('M', 'N')

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

  // 1 G = 5 A = 10 DFI
  await app.addPoolLiquidity({
    tokenA: 'G',
    amountA: 10,
    tokenB: 'A',
    amountB: 50,
    shareAddress: await app.getNewAddress()
  })

  // 1 J = 7 K
  await app.addPoolLiquidity({
    tokenA: 'J',
    amountA: 10,
    tokenB: 'K',
    amountB: 70,
    shareAddress: await app.getNewAddress()
  })

  // 1 J = 2 L = 8 K
  await app.addPoolLiquidity({
    tokenA: 'J',
    amountA: 4,
    tokenB: 'L',
    amountB: 8,
    shareAddress: await app.getNewAddress()
  })
  await app.addPoolLiquidity({
    tokenA: 'L',
    amountA: 5,
    tokenB: 'K',
    amountB: 20,
    shareAddress: await app.getNewAddress()
  })

  await app.addPoolLiquidity({
    tokenA: 'L',
    amountA: 6,
    tokenB: 'M',
    amountB: 48,
    shareAddress: await app.getNewAddress()
  })
  await app.addPoolLiquidity({
    tokenA: 'M',
    amountA: 7,
    tokenB: 'N',
    amountB: 70,
    shareAddress: await app.getNewAddress()
  })

  // BURN should not be listed as swappable
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

  await app.call('setgov', [{ LP_SPLITS: { 16: 1.0 } }])
  await app.generate(1)

  // dex fee set up
  await app.call('setgov', [{
    ATTRIBUTES: {
      'v0/poolpairs/16/token_a_fee_pct': '0.05',
      'v0/poolpairs/16/token_b_fee_pct': '0.08',
      'v0/poolpairs/26/token_a_fee_pct': '0.07',
      'v0/poolpairs/26/token_b_fee_pct': '0.09'
    }
  }])
  await app.generate(1)
}

describe('list', () => {
  it('should list', async () => {
    const response = await controller.list({
      size: 30
    })

    expect(response.data.length).toStrictEqual(14)
    expect(response.page).toBeUndefined()

    expect(response.data[1]).toStrictEqual({
      id: '16',
      symbol: 'B-DFI',
      displaySymbol: 'dB-DFI',
      name: 'B-Default Defi token',
      status: true,
      tokenA: {
        id: '2',
        name: 'B',
        symbol: 'B',
        reserve: '50',
        blockCommission: '0',
        displaySymbol: 'dB',
        fee: {
          pct: '0.05',
          inPct: '0.05',
          outPct: '0.05'
        }
      },
      tokenB: {
        id: '0',
        name: 'Default Defi token',
        symbol: 'DFI',
        reserve: '300',
        blockCommission: '0',
        displaySymbol: 'DFI',
        fee: {
          pct: '0.08',
          inPct: '0.08',
          outPct: '0.08'
        }
      },
      apr: {
        reward: 2229.42,
        total: 2229.42,
        commission: 0
      },
      commission: '0',
      totalLiquidity: {
        token: '122.47448713',
        // usd: '1390.4567576291117892'
        usd: '1390.4567576291117892008229279'
      },
      tradeEnabled: true,
      ownerAddress: expect.any(String),
      priceRatio: {
        ab: '0.16666666',
        ba: '6'
      },
      rewardPct: '1',
      rewardLoanPct: '0',
      // customRewards: undefined,
      creation: {
        tx: expect.any(String),
        height: expect.any(Number)
      },
      volume: {
        d30: 0,
        h24: 0
      }
    })
  })

  it('should list with pagination', async () => {
    const first = await controller.list({
      size: 2
    })
    expect(first.data.length).toStrictEqual(2)
    expect(first.page?.next).toStrictEqual('16')
    expect(first.data[0].symbol).toStrictEqual('A-DFI')
    expect(first.data[1].symbol).toStrictEqual('B-DFI')

    const next = await controller.list({
      size: 14,
      next: first.page?.next
    })

    expect(next.data.length).toStrictEqual(12)
    expect(next.page?.next).toBeUndefined()
    expect(next.data[0].symbol).toStrictEqual('C-DFI')
    expect(next.data[1].symbol).toStrictEqual('D-DFI')
    expect(next.data[2].symbol).toStrictEqual('E-DFI')
    expect(next.data[3].symbol).toStrictEqual('F-DFI')
  })

  it('should list with undefined next pagination', async () => {
    const first = await controller.list({
      size: 2,
      next: undefined
    })

    expect(first.data.length).toStrictEqual(2)
    expect(first.page?.next).toStrictEqual('16')
  })
})

describe('get', () => {
  it('should get', async () => {
    const response = await controller.get('15')

    expect(response).toStrictEqual({
      id: '15',
      symbol: 'A-DFI',
      displaySymbol: 'dA-DFI',
      name: 'A-Default Defi token',
      status: true,
      tokenA: {
        id: expect.any(String),
        name: 'A',
        symbol: 'A',
        reserve: '100',
        blockCommission: '0',
        displaySymbol: 'dA'
        // fee: undefined
      },
      tokenB: {
        id: '0',
        name: 'Default Defi token',
        symbol: 'DFI',
        reserve: '200',
        blockCommission: '0',
        displaySymbol: 'DFI'
        // fee: undefined
      },
      apr: {
        reward: 0,
        total: 0,
        commission: 0
      },
      commission: '0',
      totalLiquidity: {
        token: '141.42135623',
        // usd: '926.9711717527411928'
        usd: '926.9711717527411928005486186'
      },
      tradeEnabled: true,
      ownerAddress: expect.any(String),
      priceRatio: {
        ab: '0.5',
        ba: '2'
      },
      rewardPct: '0',
      rewardLoanPct: '0',
      // customRewards: undefined,
      creation: {
        tx: expect.any(String),
        height: expect.any(Number)
      },
      volume: {
        d30: 0,
        h24: 0
      }
    })
  })

  it('should throw error while getting non-existent poolpair', async () => {
    expect.assertions(2)
    try {
      await controller.get('999')
    } catch (err: any) {
      expect(err).toBeInstanceOf(WhaleApiException)
      expect(err.error).toStrictEqual({
        code: 404,
        type: 'NotFound',
        at: expect.any(Number),
        message: 'Unable to find poolpair',
        url: '/v0/regtest/poolpairs/999'
      })
    }
  })
})

describe('get best path', () => {
  it('should be bidirectional swap path - listPaths(a, b) === listPaths(b, a)', async () => {
    const paths1 = await controller.getBestPath('1', '0') // A to DFI
    expect(paths1).toStrictEqual({
      fromToken: {
        id: '1',
        name: 'A',
        symbol: 'A',
        displaySymbol: 'dA'
      },
      toToken: {
        id: '0',
        name: 'Default Defi token',
        symbol: 'DFI',
        displaySymbol: 'DFI'
      },
      bestPath: [
        {
          symbol: 'A-DFI',
          poolPairId: '15',
          priceRatio: { ab: '0.50000000', ba: '2.00000000' },
          tokenA: { id: '1', name: 'A', symbol: 'A', displaySymbol: 'dA' },
          tokenB: { id: '0', name: 'Default Defi token', symbol: 'DFI', displaySymbol: 'DFI' },
          commissionFeeInPct: '0'
        }
      ],
      estimatedReturn: '2.00000000',
      estimatedReturnLessDexFees: '2.00000000'
    })
  })

  it('should get best swap path - 2 legs', async () => {
    const response = await controller.getBestPath('1', '3') // A to C
    expect(response).toStrictEqual({
      fromToken: {
        id: '1',
        name: 'A',
        symbol: 'A',
        displaySymbol: 'dA'
      },
      toToken: {
        id: '3',
        name: 'C',
        symbol: 'C',
        displaySymbol: 'dC'
      },
      bestPath: [
        {
          symbol: 'A-DFI',
          poolPairId: '15',
          priceRatio: { ab: '0.50000000', ba: '2.00000000' },
          tokenA: { id: '1', name: 'A', symbol: 'A', displaySymbol: 'dA' },
          tokenB: { id: '0', name: 'Default Defi token', symbol: 'DFI', displaySymbol: 'DFI' },
          commissionFeeInPct: '0'
        },
        {
          symbol: 'C-DFI',
          poolPairId: '17',
          priceRatio: { ab: '0.25000000', ba: '4.00000000' },
          tokenA: { id: '3', name: 'C', symbol: 'C', displaySymbol: 'dC' },
          tokenB: { id: '0', name: 'Default Defi token', symbol: 'DFI', displaySymbol: 'DFI' },
          commissionFeeInPct: '0'
        }
      ],
      estimatedReturn: '0.50000000',
      estimatedReturnLessDexFees: '0.50000000'
    })
  })

  it('should get correct swap path - 3 legs', async () => {
    const response = await controller.getBestPath('7', '3') // G to C
    expect(response).toStrictEqual({
      fromToken: {
        id: '7',
        name: 'G',
        symbol: 'G',
        displaySymbol: 'dG'
      },
      toToken: {
        id: '3',
        name: 'C',
        symbol: 'C',
        displaySymbol: 'dC'
      },
      bestPath: [
        {
          symbol: 'G-A',
          poolPairId: '21',
          priceRatio: { ab: '0.20000000', ba: '5.00000000' },
          tokenA: { id: '7', name: 'G', symbol: 'G', displaySymbol: 'dG' },
          tokenB: { id: '1', name: 'A', symbol: 'A', displaySymbol: 'dA' },
          commissionFeeInPct: '0'
        },
        {
          symbol: 'A-DFI',
          poolPairId: '15',
          priceRatio: { ab: '0.50000000', ba: '2.00000000' },
          tokenA: { id: '1', name: 'A', symbol: 'A', displaySymbol: 'dA' },
          tokenB: { id: '0', name: 'Default Defi token', symbol: 'DFI', displaySymbol: 'DFI' },
          commissionFeeInPct: '0'
        },
        {
          symbol: 'C-DFI',
          poolPairId: '17',
          priceRatio: { ab: '0.25000000', ba: '4.00000000' },
          tokenA: { id: '3', name: 'C', symbol: 'C', displaySymbol: 'dC' },
          tokenB: { id: '0', name: 'Default Defi token', symbol: 'DFI', displaySymbol: 'DFI' },
          commissionFeeInPct: '0'
        }
      ],
      estimatedReturn: '2.50000000',
      estimatedReturnLessDexFees: '2.50000000'
    })
  })

  it('should ignore correct swap path > 3 legs', async () => {
    const response = await controller.getBestPath('9', '14') // I to N
    /* paths available
      (4 legs) Swap I through -> I-J -> J-L -> L-M -> M-N to get N
      (5 legs) Swap I through -> I-J -> J-K -> K-L -> L-M -> M-N to get N
    */
    expect(response).toStrictEqual({
      fromToken: {
        id: '9',
        name: 'I',
        symbol: 'I',
        displaySymbol: 'dI'
      },
      toToken: {
        id: '14',
        name: 'N',
        symbol: 'N',
        displaySymbol: 'dN'
      },
      bestPath: [],
      estimatedReturn: '0',
      estimatedReturnLessDexFees: '0'
    })
  })

  it('should return direct path even if composite swap paths has greater return', async () => {
    // 1 J = 7 K
    // 1 J = 2 L = 8 K
    const response = await controller.getBestPath('10', '11')
    expect(response).toStrictEqual({
      fromToken: {
        id: '10',
        name: 'J',
        symbol: 'J',
        displaySymbol: 'dJ'
      },
      toToken: {
        id: '11',
        name: 'K',
        symbol: 'K',
        displaySymbol: 'dK'
      },
      bestPath: [
        {
          symbol: 'J-K',
          poolPairId: '23',
          priceRatio: { ab: '0.14285714', ba: '7.00000000' },
          tokenA: { id: '10', name: 'J', symbol: 'J', displaySymbol: 'dJ' },
          tokenB: { id: '11', name: 'K', symbol: 'K', displaySymbol: 'dK' },
          commissionFeeInPct: '0.25000000'
        }
      ],
      estimatedReturn: '7.00000000',
      estimatedReturnLessDexFees: '5.25000000'
    })
  })

  it('should deduct commission fee - 1 leg', async () => {
    const response = await controller.getBestPath('10', '12')
    expect(response).toStrictEqual({
      fromToken: {
        id: '10',
        name: 'J',
        symbol: 'J',
        displaySymbol: 'dJ'
      },
      toToken: {
        id: '12',
        name: 'L',
        symbol: 'L',
        displaySymbol: 'dL'
      },
      bestPath: [
        {
          symbol: 'J-L',
          poolPairId: '24',
          priceRatio: { ab: '0.50000000', ba: '2.00000000' },
          tokenA: { id: '10', name: 'J', symbol: 'J', displaySymbol: 'dJ' },
          tokenB: { id: '12', name: 'L', symbol: 'L', displaySymbol: 'dL' },
          commissionFeeInPct: '0.10000000'
        }
      ],
      estimatedReturn: '2.00000000',
      estimatedReturnLessDexFees: '1.80000000'
    })
  })

  it('should deduct commission and dex fees - 2 legs', async () => {
    const response = await controller.getBestPath('10', '13')
    expect(response).toStrictEqual({
      fromToken: {
        id: '10',
        name: 'J',
        symbol: 'J',
        displaySymbol: 'dJ'
      },
      toToken: {
        id: '13',
        name: 'M',
        symbol: 'M',
        displaySymbol: 'dM'
      },
      bestPath: [
        {
          symbol: 'J-L',
          poolPairId: '24',
          priceRatio: { ab: '0.50000000', ba: '2.00000000' },
          tokenA: { id: '10', name: 'J', symbol: 'J', displaySymbol: 'dJ' },
          tokenB: { id: '12', name: 'L', symbol: 'L', displaySymbol: 'dL' },
          commissionFeeInPct: '0.10000000'
        },
        {
          symbol: 'L-M',
          poolPairId: '26',
          priceRatio: { ab: '0.12500000', ba: '8.00000000' },
          tokenA: { id: '12', name: 'L', symbol: 'L', displaySymbol: 'dL' },
          tokenB: { id: '13', name: 'M', symbol: 'M', displaySymbol: 'dM' },
          commissionFeeInPct: '0.50000000',
          estimatedDexFeesInPct: {
            ab: '0.09000000',
            ba: '0.07000000'
          }
        }
      ],
      estimatedReturn: '16.00000000',
      /*
        Swap through first leg -- J -> L (No DEX fees)
          Deduct commission fee: 1 * 0.1
            = 1 - (1 * 0.1)
          Convert fromToken -> toToken by price ratio
            = 0.9 * 2
        Swap through second leg -- L -> M  (With DEX fees)
          Deduct commission fee: 1.8 * 0.5
            = 1.8 - 0.9
          Deduct dex fees fromToken: estLessDexFees * 0.07
            = 0.9 - 0.063
          Convert fromToken -> toToken by price ratio
            = 0.837 * 8
          Deduct dex fees toToken: estLessDexFees * 0.09
            = 6.696 - 0.60264

        Estimated return less commission and dex fees
          = 6.09336
      */
      estimatedReturnLessDexFees: '6.09336000'
    })
  })

  it('should have no swap path - isolated token H', async () => {
    const response = await controller.getBestPath('8', '1') // H to A impossible
    expect(response).toStrictEqual({
      fromToken: {
        id: '8',
        name: 'H',
        symbol: 'H',
        displaySymbol: 'dH'
      },
      toToken: {
        id: '1',
        name: 'A',
        symbol: 'A',
        displaySymbol: 'dA'
      },
      bestPath: [],
      estimatedReturn: '0',
      estimatedReturnLessDexFees: '0'
    })
  })

  it('should throw error for invalid tokenId', async () => {
    await expect(controller.getBestPath('-1', '1')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/paths/best/from/-1/to/1): Unable to find token -1')
    await expect(controller.getBestPath('1', '-1')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/paths/best/from/1/to/-1): Unable to find token -1')
    await expect(controller.getBestPath('100', '1')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/paths/best/from/100/to/1): Unable to find token 100')
    await expect(controller.getBestPath('1', '100')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/paths/best/from/1/to/100): Unable to find token 100')
    await expect(controller.getBestPath('-1', '100')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/paths/best/from/-1/to/100): Unable to find token -1')
    // await expect(controller.getBestPath('-1', '1')).rejects.toThrowError('Unable to find token -1')
    // await expect(controller.getBestPath('1', '-1')).rejects.toThrowError('Unable to find token -1')
    // await expect(controller.getBestPath('100', '1')).rejects.toThrowError('Unable to find token 100')
    // await expect(controller.getBestPath('1', '100')).rejects.toThrowError('Unable to find token 100')
    // await expect(controller.getBestPath('-1', '100')).rejects.toThrowError('Unable to find token -1')
  })
})

describe('get all paths', () => {
  it('should be bidirectional swap path - listPaths(a, b) === listPaths(b, a)', async () => {
    const paths1 = await controller.listPaths('1', '0') // A to DFI
    expect(paths1).toStrictEqual({
      fromToken: {
        id: '1',
        name: 'A',
        symbol: 'A',
        displaySymbol: 'dA'
      },
      toToken: {
        id: '0',
        name: 'Default Defi token',
        symbol: 'DFI',
        displaySymbol: 'DFI'
      },
      paths: [
        [
          {
            symbol: 'A-DFI',
            poolPairId: '15',
            tokenA: { id: '1', name: 'A', symbol: 'A', displaySymbol: 'dA' },
            tokenB: { id: '0', name: 'Default Defi token', symbol: 'DFI', displaySymbol: 'DFI' },
            priceRatio: { ab: '0.50000000', ba: '2.00000000' },
            commissionFeeInPct: '0'
          }
        ]
      ]
    })
  })

  it('should get correct swap path - 2 legs', async () => {
    const response = await controller.listPaths('1', '3') // A to C
    expect(response).toStrictEqual({
      fromToken: {
        id: '1',
        name: 'A',
        symbol: 'A',
        displaySymbol: 'dA'
      },
      toToken: {
        id: '3',
        name: 'C',
        symbol: 'C',
        displaySymbol: 'dC'
      },
      paths: [
        [
          {
            symbol: 'A-DFI',
            poolPairId: '15',
            priceRatio: { ab: '0.50000000', ba: '2.00000000' },
            tokenA: { id: '1', name: 'A', symbol: 'A', displaySymbol: 'dA' },
            tokenB: { id: '0', name: 'Default Defi token', symbol: 'DFI', displaySymbol: 'DFI' },
            commissionFeeInPct: '0'
          },
          {
            symbol: 'C-DFI',
            poolPairId: '17',
            priceRatio: { ab: '0.25000000', ba: '4.00000000' },
            tokenA: { id: '3', name: 'C', symbol: 'C', displaySymbol: 'dC' },
            tokenB: { id: '0', name: 'Default Defi token', symbol: 'DFI', displaySymbol: 'DFI' },
            commissionFeeInPct: '0'
          }
        ]
      ]
    })
  })

  it('should get correct swap path - 3 legs', async () => {
    const response = await controller.listPaths('7', '3') // G to C
    expect(response).toStrictEqual({
      fromToken: {
        id: '7',
        name: 'G',
        symbol: 'G',
        displaySymbol: 'dG'
      },
      toToken: {
        id: '3',
        name: 'C',
        symbol: 'C',
        displaySymbol: 'dC'
      },
      paths: [
        [
          {
            symbol: 'G-A',
            poolPairId: '21',
            priceRatio: { ab: '0.20000000', ba: '5.00000000' },
            tokenA: { id: '7', name: 'G', symbol: 'G', displaySymbol: 'dG' },
            tokenB: { id: '1', name: 'A', symbol: 'A', displaySymbol: 'dA' },
            commissionFeeInPct: '0'
          },
          {
            symbol: 'A-DFI',
            poolPairId: '15',
            priceRatio: { ab: '0.50000000', ba: '2.00000000' },
            tokenA: { id: '1', name: 'A', symbol: 'A', displaySymbol: 'dA' },
            tokenB: { id: '0', name: 'Default Defi token', symbol: 'DFI', displaySymbol: 'DFI' },
            commissionFeeInPct: '0'
          },
          {
            symbol: 'C-DFI',
            poolPairId: '17',
            priceRatio: { ab: '0.25000000', ba: '4.00000000' },
            tokenA: { id: '3', name: 'C', symbol: 'C', displaySymbol: 'dC' },
            tokenB: { id: '0', name: 'Default Defi token', symbol: 'DFI', displaySymbol: 'DFI' },
            commissionFeeInPct: '0'
          }
        ]
      ]
    })
  })

  it('should ignore correct swap paths > 3 legs', async () => {
    const response = await controller.listPaths('9', '14') // I to N

    /* paths available
      (4 legs) Swap I through -> I-J -> J-L -> L-M -> M-N to get N
      (5 legs) Swap I through -> I-J -> J-K -> K-L -> L-M -> M-N to get N
    */
    expect(response).toStrictEqual({
      fromToken: {
        id: '9',
        name: 'I',
        symbol: 'I',
        displaySymbol: 'dI'
      },
      toToken: {
        id: '14',
        name: 'N',
        symbol: 'N',
        displaySymbol: 'dN'
      },
      paths: []
    })
  })

  it('should get multiple swap paths', async () => {
    const response = await controller.listPaths('9', '11') // I to K
    expect(response).toStrictEqual({
      fromToken: {
        id: '9',
        name: 'I',
        symbol: 'I',
        displaySymbol: 'dI'
      },
      toToken: {
        id: '11',
        name: 'K',
        symbol: 'K',
        displaySymbol: 'dK'
      },
      paths: [
        [
          {
            symbol: 'I-J',
            poolPairId: '22',
            priceRatio: { ab: '0', ba: '0' },
            tokenA: { id: '9', name: 'I', symbol: 'I', displaySymbol: 'dI' },
            tokenB: { id: '10', name: 'J', symbol: 'J', displaySymbol: 'dJ' },
            commissionFeeInPct: '0'
          },
          {
            symbol: 'J-L',
            poolPairId: '24',
            priceRatio: { ab: '0.50000000', ba: '2.00000000' },
            tokenA: { id: '10', name: 'J', symbol: 'J', displaySymbol: 'dJ' },
            tokenB: { id: '12', name: 'L', symbol: 'L', displaySymbol: 'dL' },
            commissionFeeInPct: '0.10000000'
          },
          {
            symbol: 'L-K',
            poolPairId: '25',
            priceRatio: { ab: '0.25000000', ba: '4.00000000' },
            tokenA: { id: '12', name: 'L', symbol: 'L', displaySymbol: 'dL' },
            tokenB: { id: '11', name: 'K', symbol: 'K', displaySymbol: 'dK' },
            commissionFeeInPct: '0'
          }
        ],
        [
          {
            symbol: 'I-J',
            poolPairId: '22',
            priceRatio: { ab: '0', ba: '0' },
            tokenA: { id: '9', name: 'I', symbol: 'I', displaySymbol: 'dI' },
            tokenB: { id: '10', name: 'J', symbol: 'J', displaySymbol: 'dJ' },
            commissionFeeInPct: '0'
          },
          {
            symbol: 'J-K',
            poolPairId: '23',
            priceRatio: { ab: '0.14285714', ba: '7.00000000' },
            tokenA: { id: '10', name: 'J', symbol: 'J', displaySymbol: 'dJ' },
            tokenB: { id: '11', name: 'K', symbol: 'K', displaySymbol: 'dK' },
            commissionFeeInPct: '0.25000000'
          }
        ]
      ]
    })
  })

  it('should handle cyclic swap paths', async () => {
    const response = await controller.listPaths('10', '11') // J to K
    expect(response).toStrictEqual({
      fromToken: {
        id: '10',
        name: 'J',
        symbol: 'J',
        displaySymbol: 'dJ'
      },
      toToken: {
        id: '11',
        name: 'K',
        symbol: 'K',
        displaySymbol: 'dK'
      },
      paths: [
        [
          {
            symbol: 'J-L',
            poolPairId: '24',
            priceRatio: { ab: '0.50000000', ba: '2.00000000' },
            tokenA: { id: '10', name: 'J', symbol: 'J', displaySymbol: 'dJ' },
            tokenB: { id: '12', name: 'L', symbol: 'L', displaySymbol: 'dL' },
            commissionFeeInPct: '0.10000000'
          },
          {
            symbol: 'L-K',
            poolPairId: '25',
            priceRatio: { ab: '0.25000000', ba: '4.00000000' },
            tokenA: { id: '12', name: 'L', symbol: 'L', displaySymbol: 'dL' },
            tokenB: { id: '11', name: 'K', symbol: 'K', displaySymbol: 'dK' },
            commissionFeeInPct: '0'
          }
        ],
        [
          {
            symbol: 'J-K',
            poolPairId: '23',
            priceRatio: { ab: '0.14285714', ba: '7.00000000' },
            tokenA: { id: '10', name: 'J', symbol: 'J', displaySymbol: 'dJ' },
            tokenB: { id: '11', name: 'K', symbol: 'K', displaySymbol: 'dK' },
            commissionFeeInPct: '0.25000000'
          }
        ]
      ]
    })
  })

  it('should have no swap path - isolated token H', async () => {
    const response = await controller.listPaths('8', '1') // H to A impossible
    expect(response).toStrictEqual({
      fromToken: {
        id: '8',
        name: 'H',
        symbol: 'H',
        displaySymbol: 'dH'
      },
      toToken: {
        id: '1',
        name: 'A',
        symbol: 'A',
        displaySymbol: 'dA'
      },
      paths: []
    })
  })

  it('should throw error when fromToken === toToken', async () => {
    // DFI to DFI - forbid technically correct but redundant results,
    // e.g. [DFI -> A -> DFI], [DFI -> B -> DFI], etc.
    await expect(controller.listPaths('0', '0'))
      .rejects
      .toThrowError('Invalid tokens: fromToken must be different from toToken')
  })

  it('should throw error for invalid tokenId', async () => {
    await expect(controller.listPaths('-1', '1')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/paths/from/-1/to/1): Unable to find token -1')
    await expect(controller.listPaths('1', '-1')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/paths/from/1/to/-1): Unable to find token -1')
    await expect(controller.listPaths('100', '1')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/paths/from/100/to/1): Unable to find token 100')
    await expect(controller.listPaths('1', '100')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/paths/from/1/to/100): Unable to find token 100')
    await expect(controller.listPaths('-1', '100')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/paths/from/-1/to/100): Unable to find token -1')
    // await expect(controller.listPaths('-1', '1')).rejects.toThrowError('Unable to find token -1')
    // await expect(controller.listPaths('1', '-1')).rejects.toThrowError('Unable to find token -1')
    // await expect(controller.listPaths('100', '1')).rejects.toThrowError('Unable to find token 100')
    // await expect(controller.listPaths('1', '100')).rejects.toThrowError('Unable to find token 100')
    // await expect(controller.listPaths('-1', '100')).rejects.toThrowError('Unable to find token -1')
  })
})

describe('get list swappable tokens', () => {
  it('should list correct swappable tokens', async () => {
    const result = await controller.listSwappableTokens('1') // A
    expect(result).toStrictEqual(expect.objectContaining({
      fromToken: { id: '1', name: 'A', symbol: 'A', displaySymbol: 'dA' },
      swappableTokens: expect.arrayContaining([
        { id: '7', name: 'G', symbol: 'G', displaySymbol: 'dG' },
        { id: '0', name: 'Default Defi token', symbol: 'DFI', displaySymbol: 'DFI' },
        { id: '30', name: 'USDT', symbol: 'USDT', displaySymbol: 'dUSDT' },
        { id: '6', name: 'F', symbol: 'F', displaySymbol: 'dF' },
        { id: '5', name: 'E', symbol: 'E', displaySymbol: 'dE' },
        { id: '4', name: 'D', symbol: 'D', displaySymbol: 'dD' },
        { id: '3', name: 'C', symbol: 'C', displaySymbol: 'dC' },
        { id: '2', name: 'B', symbol: 'B', displaySymbol: 'dB' }
      ])
    }))
  })

  it('should not show status:false tokens', async () => {
    const result = await controller.listSwappableTokens('1') // A
    expect(result.swappableTokens.map(token => token.symbol))
      .not.toContain('BURN')
  })

  it('should list no tokens for token that is not swappable with any', async () => {
    const result = await controller.listSwappableTokens('8') // H
    expect(result).toStrictEqual({
      fromToken: { id: '8', name: 'H', symbol: 'H', displaySymbol: 'dH' },
      swappableTokens: []
    })
  })

  it('should throw error for invalid / non-existent tokenId', async () => {
    // rust-ocean
    // skip as `-1` failed throw path validation which is not u32, hit ParseIntErr
    // await expect(controller.listSwappableTokens('-1')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/paths/swappable/-1): Unable to find token -1')
    // await expect(controller.listSwappableTokens('a')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/paths/swappable/a): Unable to find token a')
    await expect(controller.listSwappableTokens('100')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/paths/swappable/100): Unable to find token 100')

    // js-ocean
    // await expect(controller.listSwappableTokens('-1')).rejects.toThrowError('Unable to find token -1')
    // await expect(controller.listSwappableTokens('a')).rejects.toThrowError('Unable to find token a')
    // await expect(controller.listSwappableTokens('100')).rejects.toThrowError('Unable to find token 100')
  })
})

describe('latest dex prices', () => {
  it('should get latest dex prices - denomination: DFI', async () => {
    const result = await controller.listDexPrices('DFI')
    expect(result).toStrictEqual({
      denomination: { displaySymbol: 'DFI', id: '0', name: 'Default Defi token', symbol: 'DFI' },
      dexPrices: {
        USDT: {
          token: { displaySymbol: 'dUSDT', id: '30', name: 'USDT', symbol: 'USDT' },
          denominationPrice: '0.43151288'
        },
        N: {
          token: { displaySymbol: 'dN', id: '14', name: 'N', symbol: 'N' },
          denominationPrice: '0'
        },
        M: {
          token: { displaySymbol: 'dM', id: '13', name: 'M', symbol: 'M' },
          denominationPrice: '0'
        },
        L: {
          token: { displaySymbol: 'dL', id: '12', name: 'L', symbol: 'L' },
          denominationPrice: '0'
        },
        K: {
          token: { displaySymbol: 'dK', id: '11', name: 'K', symbol: 'K' },
          denominationPrice: '0'
        },
        J: {
          token: { displaySymbol: 'dJ', id: '10', name: 'J', symbol: 'J' },
          denominationPrice: '0'
        },
        I: {
          token: { displaySymbol: 'dI', id: '9', name: 'I', symbol: 'I' },
          denominationPrice: '0'
        },
        H: {
          token: { displaySymbol: 'dH', id: '8', name: 'H', symbol: 'H' },
          denominationPrice: '0'
        },
        G: {
          token: { displaySymbol: 'dG', id: '7', name: 'G', symbol: 'G' },
          denominationPrice: '10.00000000'
        },
        F: {
          token: { displaySymbol: 'dF', id: '6', name: 'F', symbol: 'F' },
          denominationPrice: '0'
        },
        E: {
          token: { displaySymbol: 'dE', id: '5', name: 'E', symbol: 'E' },
          denominationPrice: '0'
        },
        D: {
          token: { displaySymbol: 'dD', id: '4', name: 'D', symbol: 'D' },
          denominationPrice: '0'
        },
        C: {
          token: { displaySymbol: 'dC', id: '3', name: 'C', symbol: 'C' },
          denominationPrice: '4.00000000'
        },
        B: {
          token: { displaySymbol: 'dB', id: '2', name: 'B', symbol: 'B' },
          denominationPrice: '6.00000000'
        },
        A: {
          token: { displaySymbol: 'dA', id: '1', name: 'A', symbol: 'A' },
          denominationPrice: '2.00000000'
        }
      }
    })
  })

  it('should get latest dex prices - denomination: USDT', async () => {
    const result = await controller.listDexPrices('USDT')
    expect(result).toStrictEqual({
      denomination: { displaySymbol: 'dUSDT', id: '30', name: 'USDT', symbol: 'USDT' },
      dexPrices: {
        DFI: {
          token: { displaySymbol: 'DFI', id: '0', name: 'Default Defi token', symbol: 'DFI' },
          denominationPrice: '2.31742792' // 1 DFI = 2.31 USDT
        },
        A: {
          token: { displaySymbol: 'dA', id: '1', name: 'A', symbol: 'A' },
          denominationPrice: '4.63485584' // 1 A = 4.63 USDT
        },
        G: {
          token: { displaySymbol: 'dG', id: '7', name: 'G', symbol: 'G' },
          denominationPrice: '23.17427920' // 1 G = 5 A = 10 DFI = 23 USDT
        },
        B: {
          token: { displaySymbol: 'dB', id: '2', name: 'B', symbol: 'B' },
          denominationPrice: '13.90456752'
        },
        C: {
          token: { displaySymbol: 'dC', id: '3', name: 'C', symbol: 'C' },
          denominationPrice: '9.26971168'
        },
        N: {
          token: { displaySymbol: 'dN', id: '14', name: 'N', symbol: 'N' },
          denominationPrice: '0'
        },
        M: {
          token: { displaySymbol: 'dM', id: '13', name: 'M', symbol: 'M' },
          denominationPrice: '0'
        },
        L: {
          token: { displaySymbol: 'dL', id: '12', name: 'L', symbol: 'L' },
          denominationPrice: '0'
        },
        K: {
          token: { displaySymbol: 'dK', id: '11', name: 'K', symbol: 'K' },
          denominationPrice: '0'
        },
        J: {
          token: { displaySymbol: 'dJ', id: '10', name: 'J', symbol: 'J' },
          denominationPrice: '0'
        },
        I: {
          token: { displaySymbol: 'dI', id: '9', name: 'I', symbol: 'I' },
          denominationPrice: '0'
        },
        H: {
          token: { displaySymbol: 'dH', id: '8', name: 'H', symbol: 'H' },
          denominationPrice: '0'
        },
        F: {
          token: { displaySymbol: 'dF', id: '6', name: 'F', symbol: 'F' },
          denominationPrice: '0'
        },
        E: {
          token: { displaySymbol: 'dE', id: '5', name: 'E', symbol: 'E' },
          denominationPrice: '0'
        },
        D: {
          token: { displaySymbol: 'dD', id: '4', name: 'D', symbol: 'D' },
          denominationPrice: '0'
        }
      }
    })
  })

  it('should get consistent, mathematically sound dex prices - USDT and DFI', async () => {
    const pricesInUSDT = await controller.listDexPrices('USDT')
    const pricesInDFI = await controller.listDexPrices('DFI')

    // 1 DFI === x USDT
    // 1 USDT === 1/x DFI
    expect(new BigNumber(pricesInDFI.dexPrices.USDT.denominationPrice).toFixed(8))
      .toStrictEqual(
        new BigNumber(pricesInUSDT.dexPrices.DFI.denominationPrice)
          .pow(-1)
          .toFixed(8)
      )
    expect(pricesInDFI.dexPrices.USDT.denominationPrice).toStrictEqual('0.43151288')
    expect(pricesInUSDT.dexPrices.DFI.denominationPrice).toStrictEqual('2.31742792')
  })

  it('should get consistent, mathematically sound dex prices - A and B', async () => {
    // 1 A = n DFI
    // 1 B = m DFI
    // 1 DFI = 1/m B
    // hence 1 A = n DFI = n/m B
    const pricesInDFI = await controller.listDexPrices('DFI')
    const pricesInA = await controller.listDexPrices('A')
    const pricesInB = await controller.listDexPrices('B')

    // 1 A = n DFI
    const AInDfi = new BigNumber(pricesInDFI.dexPrices.A.denominationPrice) // n
    // 1 DFI = 1/n A
    const DFIInA = new BigNumber(pricesInA.dexPrices.DFI.denominationPrice)

    // Verify that B/DFI and DFI/B values are consistent between listPrices('DFI') and listPrices('A')
    expect(AInDfi.toFixed(8)).toStrictEqual(DFIInA.pow(-1).toFixed(8))
    expect(AInDfi.toFixed(8)).toStrictEqual('2.00000000')
    expect(DFIInA.toFixed(8)).toStrictEqual('0.50000000')

    // 1 B = m DFI
    const BInDfi = new BigNumber(pricesInDFI.dexPrices.B.denominationPrice) // m
    // 1 DFI = 1/m B
    const DFIInB = new BigNumber(pricesInB.dexPrices.DFI.denominationPrice)

    // Verify that B/DFI and DFI/B values are consistent between listPrices('DFI') and listPrices('B')
    expect(BInDfi.toFixed(6)).toStrictEqual(
      DFIInB.pow(-1).toFixed(6) // precision - 2 due to floating point imprecision
    )
    expect(BInDfi.toFixed(8)).toStrictEqual('6.00000000')
    expect(DFIInB.toFixed(8)).toStrictEqual('0.16666666')

    // Verify that the value of token A denoted in B (1 A = n/m B) is also returned by the endpoint
    expect(new BigNumber(pricesInB.dexPrices.A.denominationPrice).toFixed(7))
      .toStrictEqual(
        AInDfi.div(BInDfi).toFixed(7) // precision - 1 due to floating point imprecision
      )
    expect(AInDfi.div(BInDfi).toFixed(8)).toStrictEqual('0.33333333')
    expect(pricesInB.dexPrices.A.denominationPrice).toStrictEqual('0.33333332')
  })

  it('should list DAT tokens only - O (non-DAT token) is not included in result', async () => {
    // O not included in any denominated dex prices
    const result = await controller.listDexPrices('DFI')
    expect(result.dexPrices.O).toBeUndefined()

    // O is not a valid 'denomination' token
    await expect(controller.listDexPrices('O'))
      .rejects
      .toThrowError('404 - NotFound (/v0/regtest/poolpairs/dexprices?denomination=O): Unable to find token')
      // .toThrowError('Could not find token with symbol \'O\'')
  })

  it('should list DAT tokens only - status:false tokens are excluded', async () => {
    // BURN not included in any denominated dex prices
    const result = await controller.listDexPrices('DFI')
    expect(result.dexPrices.BURN).toBeUndefined()

    // BURN is not a valid 'denomination' token
    await expect(controller.listDexPrices('BURN'))
      .rejects
      .toThrowError('500 - Unknown (/v0/regtest/poolpairs/dexprices?denomination=BURN): Token "BURN" is invalid as it is not tradeable')
      // .toThrowError('Token \'BURN\' is invalid as it is not tradeable')
  })

  describe('param validation - denomination', () => {
    it('should throw error for invalid denomination', async () => {
      await expect(controller.listDexPrices('aaaaa')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/dexprices?denomination=aaaaa): Unable to find token')
      await expect(controller.listDexPrices('-1')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/dexprices?denomination=-1): Unable to find token')
      // await expect(controller.listDexPrices('aaaaa')).rejects.toThrowError('Could not find token with symbol \'aaaaa\'')
      // await expect(controller.listDexPrices('-1')).rejects.toThrowError('Could not find token with symbol \'-1\'')

      // endpoint is case-sensitive
      await expect(controller.listDexPrices('dfi')).rejects.toThrowError('404 - NotFound (/v0/regtest/poolpairs/dexprices?denomination=dfi): Unable to find token')
      // await expect(controller.listDexPrices('dfi')).rejects.toThrowError('Could not find token with symbol \'dfi\'')
    })
  })
})
