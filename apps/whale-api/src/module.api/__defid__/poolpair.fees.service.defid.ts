import { DPoolPairController, DefidBin, DefidRpc } from '../../e2e.defid.module'

let testing: DefidRpc
let app: DefidBin
let controller: DPoolPairController

beforeAll(async () => {
  app = new DefidBin()
  await app.start()
  controller = app.ocean.poolPairController
  testing = app.rpc
  await app.waitForWalletCoinbaseMaturity()
  await app.waitForWalletBalanceGTE(100)
  await setup()

  // const defiCache = app.get(DeFiDCache)
  // const tokenResult = await app.call('listtokens')
  // // precache
  // for (const k in tokenResult) {
  //   await defiCache.getTokenInfo(k)
  // }

  await app.waitForPath(controller)
})

afterAll(async () => {
  await app.stop()
})

async function setup (): Promise<void> {
  const tokens = ['DUSD', 'CAT', 'DOG', 'KOALA', 'FISH', 'TURTLE', 'PANDA', 'RABBIT', 'FOX', 'LION', 'TIGER']

  for (const token of tokens) {
    await app.createToken(token)
    await app.createPoolPair(token, 'DFI')
    await app.mintTokens(token)
    await testing.generate(1)
  }

  await app.addPoolLiquidity({
    tokenA: 'DUSD',
    amountA: 10,
    tokenB: 'DFI',
    amountB: 10,
    shareAddress: await app.getNewAddress()
  })

  await testing.generate(1)

  await app.addPoolLiquidity({
    tokenA: 'CAT',
    amountA: 100,
    tokenB: 'DFI',
    amountB: 1000,
    shareAddress: await app.getNewAddress()
  })
  await testing.generate(1)

  await app.addPoolLiquidity({
    tokenA: 'DOG',
    amountA: 10,
    tokenB: 'DFI',
    amountB: 100,
    shareAddress: await app.getNewAddress()
  })
  await testing.generate(1)

  await app.addPoolLiquidity({
    tokenA: 'KOALA',
    amountA: 10,
    tokenB: 'DFI',
    amountB: 100,
    shareAddress: await app.getNewAddress()
  })
  await testing.generate(1)

  await app.addPoolLiquidity({
    tokenA: 'FISH',
    amountA: 5,
    tokenB: 'DFI',
    amountB: 100,
    shareAddress: await app.getNewAddress()
  })
  await testing.generate(1)

  await app.addPoolLiquidity({
    tokenA: 'TURTLE',
    amountA: 1,
    tokenB: 'DFI',
    amountB: 100,
    shareAddress: await app.getNewAddress()
  })
  await testing.generate(1)

  await app.addPoolLiquidity({
    tokenA: 'PANDA',
    amountA: 2,
    tokenB: 'DFI',
    amountB: 100,
    shareAddress: await app.getNewAddress()
  })
  await testing.generate(1)

  await app.addPoolLiquidity({
    tokenA: 'RABBIT',
    amountA: 7,
    tokenB: 'DFI',
    amountB: 100,
    shareAddress: await app.getNewAddress()
  })
  await testing.generate(1)

  await app.addPoolLiquidity({
    tokenA: 'FOX',
    amountA: 8,
    tokenB: 'DFI',
    amountB: 100,
    shareAddress: await app.getNewAddress()
  })
  await testing.generate(1)

  await app.addPoolLiquidity({
    tokenA: 'LION',
    amountA: 10,
    tokenB: 'DFI',
    amountB: 100,
    shareAddress: await app.getNewAddress()
  })
  await testing.generate(1)

  await app.addPoolLiquidity({
    tokenA: 'TIGER',
    amountA: 12,
    tokenB: 'DFI',
    amountB: 100,
    shareAddress: await app.getNewAddress()
  })
  await testing.generate(1)

  // dex fee set up
  await app.call('setgov', [{
    ATTRIBUTES: {
      'v0/poolpairs/4/token_a_fee_pct': '0.001', // CAT
      'v0/poolpairs/4/token_a_fee_direction': 'in', // CAT
      'v0/poolpairs/4/token_b_fee_pct': '0.002', // DFI
      'v0/poolpairs/4/token_b_fee_direction': 'in', // DFI

      'v0/poolpairs/6/token_a_fee_pct': '0.003', // DOG
      'v0/poolpairs/6/token_a_fee_direction': 'out', // DOG
      'v0/poolpairs/6/token_b_fee_pct': '0.004', // DFI
      'v0/poolpairs/6/token_b_fee_direction': 'out', // DFI

      'v0/poolpairs/8/token_a_fee_pct': '0.005', // KOALA
      'v0/poolpairs/8/token_a_fee_direction': 'in', // KOALA

      'v0/poolpairs/10/token_b_fee_pct': '0.006', // FISH
      'v0/poolpairs/10/token_b_fee_direction': 'out', // FISH

      'v0/poolpairs/12/token_a_fee_pct': '0.007', // TURTLE
      'v0/poolpairs/12/token_a_fee_direction': 'both', // TURTLE

      'v0/poolpairs/14/token_b_fee_pct': '0.008', // PANDA
      'v0/poolpairs/14/token_b_fee_direction': 'both', // PANDA

      'v0/poolpairs/16/token_a_fee_pct': '0.009', // RABBIT
      'v0/poolpairs/16/token_a_fee_direction': 'both', // RABBIT
      'v0/poolpairs/16/token_b_fee_pct': '0.010', // RABBIT
      'v0/poolpairs/16/token_b_fee_direction': 'both', // RABBIT

      'v0/poolpairs/18/token_a_fee_pct': '0.011', // FOX

      'v0/poolpairs/20/token_b_fee_pct': '0.012', // LION

      'v0/poolpairs/22/token_a_fee_pct': '0.013', // TIGER
      'v0/poolpairs/22/token_b_fee_pct': '0.014' // TIGER
    }
  }])
  await app.generate(1)
}

describe('get best path - DEX burn fees', () => {
  it('should return fees - CAT to DFI - Both token fees direction are in', async () => {
    const paths1 = await controller.getBestPath('3', '0')
    expect(paths1.bestPath).toStrictEqual([
      {
        commissionFeeInPct: '0',
        estimatedDexFeesInPct: {
          ba: '0.00100000',
          ab: '0.00000000'
        },
        poolPairId: '4',
        priceRatio: {
          ab: '0.10000000',
          ba: '10.00000000'
        },
        symbol: 'CAT-DFI',
        tokenA: {
          displaySymbol: 'dCAT',
          id: '3',
          name: 'CAT',
          symbol: 'CAT'
        },
        tokenB: {
          displaySymbol: 'DFI',
          id: '0',
          name: 'Default Defi token',
          symbol: 'DFI'
        }
      }])
  })

  it('should return fees - DFI to CAT - Both token fees direction are in', async () => {
    const paths1 = await controller.getBestPath('0', '3')

    expect(paths1.bestPath).toStrictEqual([
      {
        commissionFeeInPct: '0',
        estimatedDexFeesInPct: {
          ba: '0.00000000',
          ab: '0.00200000'
        },
        poolPairId: '4',
        priceRatio: {
          ab: '0.10000000',
          ba: '10.00000000'
        },
        symbol: 'CAT-DFI',
        tokenA: {
          displaySymbol: 'dCAT',
          id: '3',
          name: 'CAT',
          symbol: 'CAT'
        },
        tokenB: {
          displaySymbol: 'DFI',
          id: '0',
          name: 'Default Defi token',
          symbol: 'DFI'
        }
      }])
  })

  it('should return fees - DFI to DOG - Both token fees direction is out', async () => {
    const paths1 = await controller.getBestPath('0', '5')

    expect(paths1.bestPath).toStrictEqual([
      {
        commissionFeeInPct: '0',
        estimatedDexFeesInPct: {
          ba: '0.00300000',
          ab: '0.00000000'
        },
        poolPairId: '6',
        priceRatio: {
          ab: '0.10000000',
          ba: '10.00000000'
        },
        symbol: 'DOG-DFI',
        tokenA: {
          displaySymbol: 'dDOG',
          id: '5',
          name: 'DOG',
          symbol: 'DOG'
        },
        tokenB: {
          displaySymbol: 'DFI',
          id: '0',
          name: 'Default Defi token',
          symbol: 'DFI'
        }
      }])
  })

  it('should return fees - DOG to DFI - Both token fees direction is out', async () => {
    const paths1 = await controller.getBestPath('5', '0')

    expect(paths1.bestPath).toStrictEqual([
      {
        commissionFeeInPct: '0',
        estimatedDexFeesInPct: {
          ba: '0.00000000',
          ab: '0.00400000'
        },
        poolPairId: '6',
        priceRatio: {
          ab: '0.10000000',
          ba: '10.00000000'
        },
        symbol: 'DOG-DFI',
        tokenA: {
          displaySymbol: 'dDOG',
          id: '5',
          name: 'DOG',
          symbol: 'DOG'
        },
        tokenB: {
          displaySymbol: 'DFI',
          id: '0',
          name: 'Default Defi token',
          symbol: 'DFI'
        }
      }])
  })

  it('should return fees - KOALA to DFI - TokenA fee direction is in', async () => {
    const paths1 = await controller.getBestPath('7', '0')

    expect(paths1.bestPath).toStrictEqual([
      {
        commissionFeeInPct: '0',
        estimatedDexFeesInPct: {
          ba: '0.00500000',
          ab: '0.00000000'
        },
        poolPairId: '8',
        priceRatio: {
          ab: '0.10000000',
          ba: '10.00000000'
        },
        symbol: 'KOALA-DFI',
        tokenA: {
          displaySymbol: 'dKOALA',
          id: '7',
          name: 'KOALA',
          symbol: 'KOALA'
        },
        tokenB: {
          displaySymbol: 'DFI',
          id: '0',
          name: 'Default Defi token',
          symbol: 'DFI'
        }
      }])
  })

  it('should return fees - DFI to KOALA - TokenA fee direction is in', async () => {
    const paths1 = await controller.getBestPath('0', '7')

    expect(paths1.bestPath).toStrictEqual([
      {
        commissionFeeInPct: '0',
        estimatedDexFeesInPct: {
          ba: '0.00000000',
          ab: '0.00000000'
        },
        poolPairId: '8',
        priceRatio: {
          ab: '0.10000000',
          ba: '10.00000000'
        },
        symbol: 'KOALA-DFI',
        tokenA: {
          displaySymbol: 'dKOALA',
          id: '7',
          name: 'KOALA',
          symbol: 'KOALA'
        },
        tokenB: {
          displaySymbol: 'DFI',
          id: '0',
          name: 'Default Defi token',
          symbol: 'DFI'
        }
      }])
  })

  it('should return fees - FISH to DFI - TokenB fee direction is out', async () => {
    const paths1 = await controller.getBestPath('9', '0')

    expect(paths1.bestPath).toStrictEqual([
      {
        commissionFeeInPct: '0',
        estimatedDexFeesInPct: {
          ba: '0.00000000',
          ab: '0.00600000'
        },
        poolPairId: '10',
        priceRatio: {
          ab: '0.05000000',
          ba: '20.00000000'
        },
        symbol: 'FISH-DFI',
        tokenA: {
          displaySymbol: 'dFISH',
          id: '9',
          name: 'FISH',
          symbol: 'FISH'
        },
        tokenB: {
          displaySymbol: 'DFI',
          id: '0',
          name: 'Default Defi token',
          symbol: 'DFI'
        }
      }])
  })

  it('should return fees - DFI to FISH - TokenB fee direction is out', async () => {
    const paths1 = await controller.getBestPath('0', '9')
    expect(paths1.bestPath).toStrictEqual([
      {
        commissionFeeInPct: '0',
        estimatedDexFeesInPct: {
          ba: '0.00000000',
          ab: '0.00000000'
        },
        poolPairId: '10',
        priceRatio: {
          ab: '0.05000000',
          ba: '20.00000000'
        },
        symbol: 'FISH-DFI',
        tokenA: {
          displaySymbol: 'dFISH',
          id: '9',
          name: 'FISH',
          symbol: 'FISH'
        },
        tokenB: {
          displaySymbol: 'DFI',
          id: '0',
          name: 'Default Defi token',
          symbol: 'DFI'
        }
      }])
  })

  it('should return fees (bidirectional) - DFI <-> TURTLE - TokenA fee direction is both', async () => {
    const paths1 = await controller.getBestPath('0', '11')
    const paths2 = await controller.getBestPath('11', '0')
    expect(paths1.bestPath).toStrictEqual([
      {
        commissionFeeInPct: '0',
        estimatedDexFeesInPct: {
          ba: '0.00700000',
          ab: '0.00000000'
        },
        poolPairId: '12',
        priceRatio: {
          ab: '0.01000000',
          ba: '100.00000000'
        },
        symbol: 'TURTLE-DFI',
        tokenA: {
          displaySymbol: 'dTURTLE',
          id: '11',
          name: 'TURTLE',
          symbol: 'TURTLE'
        },
        tokenB: {
          displaySymbol: 'DFI',
          id: '0',
          name: 'Default Defi token',
          symbol: 'DFI'
        }
      }])
    expect(paths1.bestPath).toStrictEqual(paths2.bestPath)
  })

  it('should return fees (bidirectional) - DFI <-> PANDA - TokenA fee direction is both', async () => {
    const paths1 = await controller.getBestPath('0', '13')
    const paths2 = await controller.getBestPath('13', '0')
    expect(paths1.bestPath).toStrictEqual([
      {
        commissionFeeInPct: '0',
        estimatedDexFeesInPct: {
          ba: '0.00000000',
          ab: '0.00800000'
        },
        poolPairId: '14',
        priceRatio: {
          ab: '0.02000000',
          ba: '50.00000000'
        },
        symbol: 'PANDA-DFI',
        tokenA: {
          displaySymbol: 'dPANDA',
          id: '13',
          name: 'PANDA',
          symbol: 'PANDA'
        },
        tokenB: {
          displaySymbol: 'DFI',
          id: '0',
          name: 'Default Defi token',
          symbol: 'DFI'
        }
      }])
    expect(paths1.bestPath).toStrictEqual(paths2.bestPath)
  })

  it('should return fees (bidirectional) - DFI <-> RABBIT - Both token fees direction are both', async () => {
    const paths1 = await controller.getBestPath('0', '15')
    const paths2 = await controller.getBestPath('15', '0')
    expect(paths1.bestPath).toStrictEqual([
      {
        commissionFeeInPct: '0',
        estimatedDexFeesInPct: {
          ba: '0.00900000',
          ab: '0.01000000'
        },
        poolPairId: '16',
        priceRatio: {
          ab: '0.07000000',
          ba: '14.28571428'
        },
        symbol: 'RABBIT-DFI',
        tokenA: {
          displaySymbol: 'dRABBIT',
          id: '15',
          name: 'RABBIT',
          symbol: 'RABBIT'
        },
        tokenB: {
          displaySymbol: 'DFI',
          id: '0',
          name: 'Default Defi token',
          symbol: 'DFI'
        }
      }])
    expect(paths1.bestPath).toStrictEqual(paths2.bestPath)
  })

  it('should return fees (bidirectional) - DFI <-> FOX - if tokenA fee direction is not set', async () => {
    const paths1 = await controller.getBestPath('0', '17')
    const paths2 = await controller.getBestPath('17', '0')
    expect(paths1.bestPath).toStrictEqual([
      {
        commissionFeeInPct: '0',
        estimatedDexFeesInPct: {
          ba: '0.01100000',
          ab: '0.00000000'
        },
        poolPairId: '18',
        priceRatio: {
          ab: '0.08000000',
          ba: '12.50000000'
        },
        symbol: 'FOX-DFI',
        tokenA: {
          displaySymbol: 'dFOX',
          id: '17',
          name: 'FOX',
          symbol: 'FOX'
        },
        tokenB: {
          displaySymbol: 'DFI',
          id: '0',
          name: 'Default Defi token',
          symbol: 'DFI'
        }
      }])
    expect(paths1.bestPath).toStrictEqual(paths2.bestPath)
  })

  it('should return fees (bidirectional) - DFI <-> LION - if tokenB fee direction is not set', async () => {
    const paths1 = await controller.getBestPath('0', '19')
    const paths2 = await controller.getBestPath('19', '0')
    expect(paths1.bestPath).toStrictEqual([
      {
        commissionFeeInPct: '0',
        estimatedDexFeesInPct: {
          ba: '0.00000000',
          ab: '0.01200000'
        },
        poolPairId: '20',
        priceRatio: {
          ab: '0.10000000',
          ba: '10.00000000'
        },
        symbol: 'LION-DFI',
        tokenA: {
          displaySymbol: 'dLION',
          id: '19',
          name: 'LION',
          symbol: 'LION'
        },
        tokenB: {
          displaySymbol: 'DFI',
          id: '0',
          name: 'Default Defi token',
          symbol: 'DFI'
        }
      }])
    expect(paths1.bestPath).toStrictEqual(paths2.bestPath)
  })

  it('should return fees (bidirectional) - DFI <-> TIGER - if both token fees direction are not set', async () => {
    const paths1 = await controller.getBestPath('0', '21')
    const paths2 = await controller.getBestPath('21', '0')
    expect(paths1.bestPath).toStrictEqual([
      {
        commissionFeeInPct: '0',
        estimatedDexFeesInPct: {
          ba: '0.01300000',
          ab: '0.01400000'
        },
        poolPairId: '22',
        priceRatio: {
          ab: '0.12000000',
          ba: '8.33333333'
        },
        symbol: 'TIGER-DFI',
        tokenA: {
          displaySymbol: 'dTIGER',
          id: '21',
          name: 'TIGER',
          symbol: 'TIGER'
        },
        tokenB: {
          displaySymbol: 'DFI',
          id: '0',
          name: 'Default Defi token',
          symbol: 'DFI'
        }
      }])
    expect(paths1.bestPath).toStrictEqual(paths2.bestPath)
  })

  it('should return [] if dex fees is not set', async () => {
    const paths1 = await controller.getBestPath('1', '0')
    const paths2 = await controller.getBestPath('0', '1')
    expect(paths1.bestPath[0].estimatedDexFeesInPct).toStrictEqual(undefined)
    expect(paths2.bestPath[0].estimatedDexFeesInPct).toStrictEqual(undefined)
  })
})

describe('get best path - DEX estimated return', () => {
  it('should less dex fees in estimatedReturnLessDexFees - 1 leg', async () => {
    const paths1 = await controller.getBestPath('15', '0')

    /*
      1 RABBIT = 14.28571428 DFI, 1 DFI = 0.07 RABBIT
      DFIAfterFeeIn = 1 - (1 * 0.009) = 0.991 DFI
      DFIToRABBIT = 0.991 * 14.28571428 = 14.1571428515 RABBIT
      RABBITAfterFeeOut = 14.1571428515 - (14.1571428515 * 0.01) = 14.01557143 RABBIT
    */
    expect(paths1.estimatedReturnLessDexFees).toStrictEqual('14.01557143')
  })

  it('should less dex fees in estimatedReturnLessDexFees - 2 legs', async () => {
    const paths1 = await controller.getBestPath('15', '3')

    /*
      1 RABBIT = 14.28571428 DFI, 1 DFI = 0.07 RABBIT
      RABBITAFterFeeIn = 1 - (1 * 0.009) = 0.991 RABBIT
      RABBIT->DFI = 0.991 * 14.28571428 = 14.1571428515 DFI
      DFIAfterFeeOut = 14.1571428515 - (14.1571428515 * 0.01) = 14.01557143 DFI

      1 DFI = 0.1 CAT, 1 CAT = 10 DFI,
      DFIAfterFeeIn = 14.01557143 - (14.01557143 * 0.002) = 13.9875402802871 DFI
      DFI->CAT= 13.9875402802871 * 0.1 = 1.398754028 CAT
    */
    expect(paths1.estimatedReturnLessDexFees).toStrictEqual('1.39875403')
  })

  it('should not less dex fees if dex fees is not set', async () => {
    const paths1 = await controller.getBestPath('1', '0')
    expect(paths1.estimatedReturn).toStrictEqual('1.00000000')
    expect(paths1.estimatedReturnLessDexFees).toStrictEqual('1.00000000')
  })

  // TODO(PIERRE): estimated return with less total should be returned
  //  it('should return direct path even if composite swap paths has greater return', async () => {
  //  it('should return composite swap paths even if direct path has greater return', async () => {
})
