import BigNumber from 'bignumber.js'
import { DLoanController, DefidBin, DefidRpc } from '../../e2e.defid.module'
import { WhaleApiException } from '@defichain/whale-api-client/dist/errors'

let testing: DefidRpc
let app: DefidBin
let controller: DLoanController

beforeAll(async () => {
  app = new DefidBin()
  await app.start()
  controller = app.ocean.loanController
  testing = app.rpc
  await app.waitForBlockHeight(101)

  await testing.token.create({ symbol: 'AAPL' })
  await testing.generate(1)

  await testing.token.create({ symbol: 'TSLA' })
  await testing.generate(1)

  await testing.token.create({ symbol: 'MSFT' })
  await testing.generate(1)

  await testing.token.create({ symbol: 'FB' })
  await testing.generate(1)

  const oracleId = await testing.client.oracle.appointOracle(await app.getNewAddress(),
    [
      { token: 'AAPL', currency: 'USD' },
      { token: 'TSLA', currency: 'USD' },
      { token: 'MSFT', currency: 'USD' },
      { token: 'FB', currency: 'USD' }
    ], { weightage: 1 })
  await testing.generate(1)

  await testing.client.oracle.setOracleData(oracleId, Math.floor(new Date().getTime() / 1000), {
    prices: [{
      tokenAmount: '1.5@AAPL',
      currency: 'USD'
    }]
  })
  await testing.client.oracle.setOracleData(oracleId, Math.floor(new Date().getTime() / 1000), {
    prices: [{
      tokenAmount: '2.5@TSLA',
      currency: 'USD'
    }]
  })
  await testing.client.oracle.setOracleData(oracleId, Math.floor(new Date().getTime() / 1000), {
    prices: [{
      tokenAmount: '3.5@MSFT',
      currency: 'USD'
    }]
  })
  await testing.client.oracle.setOracleData(oracleId, Math.floor(new Date().getTime() / 1000), {
    prices: [{
      tokenAmount: '4.5@FB',
      currency: 'USD'
    }]
  })
  await testing.generate(1)

  await testing.client.loan.setCollateralToken({
    token: 'AAPL',
    factor: new BigNumber(0.1),
    fixedIntervalPriceId: 'AAPL/USD'
  })
  await testing.generate(1)

  await testing.client.loan.setCollateralToken({
    token: 'TSLA',
    factor: new BigNumber(0.2),
    fixedIntervalPriceId: 'TSLA/USD'
  })
  await testing.generate(1)

  await testing.client.loan.setCollateralToken({
    token: 'MSFT',
    factor: new BigNumber(0.3),
    fixedIntervalPriceId: 'MSFT/USD'
  })
  await testing.generate(1)

  await testing.client.loan.setCollateralToken({
    token: 'FB',
    factor: new BigNumber(0.4),
    fixedIntervalPriceId: 'FB/USD'
  })
  await testing.generate(1)
})

afterAll(async () => {
  await app.stop()
})

describe('list', () => {
  it('should listCollateralTokens', async () => {
    const result = await controller.listCollateral({ size: 100 })
    expect(result.data.length).toStrictEqual(4)
    expect(result.data[0]).toStrictEqual({
      tokenId: expect.any(String),
      fixedIntervalPriceId: expect.any(String),
      factor: expect.any(String),
      activateAfterBlock: 0,
      token: {
        collateralAddress: expect.any(String),
        creation: {
          height: expect.any(Number),
          tx: expect.any(String)
        },
        decimal: 8,
        destruction: {
          height: -1,
          tx: expect.any(String)
        },
        displaySymbol: expect.any(String),
        finalized: false,
        id: expect.any(String),
        isDAT: true,
        isLPS: false,
        isLoanToken: false,
        limit: '0',
        mintable: true,
        minted: '0',
        name: expect.any(String),
        symbol: expect.any(String),
        symbolKey: expect.any(String),
        tradeable: true
      }
      // activePrice: undefined
    })
  })

  it('should listCollateralTokens with pagination', async () => {
    const first = await controller.listCollateral({ size: 2 })

    expect(first.data.length).toStrictEqual(2)
    expect(first.page?.next?.length).toStrictEqual(64)

    const next = await controller.listCollateral({
      size: 2,
      next: first.page?.next
    })

    expect(next.data.length).toStrictEqual(2)
    expect(next.page?.next?.length).toStrictEqual(64)

    const last = await controller.listCollateral({
      size: 2,
      next: next.page?.next
    })

    expect(last.data.length).toStrictEqual(0)
    expect(last.page).toBeUndefined()
  })

  it('should listCollateralTokens with an empty object if size 100 next 300 which is out of range', async () => {
    const result = await controller.listCollateral({ size: 100, next: '300' })

    expect(result.data.length).toStrictEqual(0)
    expect(result.page).toBeUndefined()
  })
})

describe('get', () => {
  it('should get collateral token by symbol', async () => {
    const data = await controller.getCollateral('AAPL')
    expect(data).toStrictEqual(
      {
        tokenId: expect.stringMatching(/[0-f]{64}/),
        fixedIntervalPriceId: 'AAPL/USD',
        factor: '0.1',
        activateAfterBlock: 0,
        token: {
          collateralAddress: expect.any(String),
          creation: {
            height: expect.any(Number),
            tx: expect.any(String)
          },
          decimal: 8,
          destruction: {
            height: -1,
            tx: expect.any(String)
          },
          displaySymbol: 'dAAPL',
          finalized: false,
          id: expect.any(String),
          isDAT: true,
          isLPS: false,
          isLoanToken: false,
          limit: '0',
          mintable: true,
          minted: '0',
          name: 'AAPL',
          symbol: 'AAPL',
          symbolKey: expect.any(String),
          tradeable: true
        }
        // activePrice: undefined
      }
    )
  })

  it('should throw error while getting non-existent collateral token id', async () => {
    expect.assertions(2)
    try {
      await controller.getCollateral('999')
    } catch (err: any) {
      expect(err).toBeInstanceOf(WhaleApiException)
      expect(err.error).toStrictEqual({
        code: 404,
        type: 'NotFound',
        at: expect.any(Number),
        message: 'Unable to find collateral token',
        url: '/v0/regtest/loans/collaterals/999'
      })
    }
  })
})
