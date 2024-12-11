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

  const oracleId = await app.call('appointoracle', [await testing.generateAddress(), [
    { token: 'AAPL', currency: 'USD' },
    { token: 'TSLA', currency: 'USD' },
    { token: 'MSFT', currency: 'USD' },
    { token: 'FB', currency: 'USD' }
  ], 1])
  await testing.generate(1)

  await testing.client.oracle.setOracleData(oracleId, Math.floor(new Date().getTime() / 1000), { prices: [{ tokenAmount: '1.5@AAPL', currency: 'USD' }] })
  await testing.client.oracle.setOracleData(oracleId, Math.floor(new Date().getTime() / 1000), { prices: [{ tokenAmount: '2.5@TSLA', currency: 'USD' }] })
  await testing.client.oracle.setOracleData(oracleId, Math.floor(new Date().getTime() / 1000), { prices: [{ tokenAmount: '3.5@MSFT', currency: 'USD' }] })
  await testing.client.oracle.setOracleData(oracleId, Math.floor(new Date().getTime() / 1000), { prices: [{ tokenAmount: '4.5@FB', currency: 'USD' }] })
  await testing.generate(1)

  await app.call('setloantoken', [{
    symbol: 'AAPL',
    fixedIntervalPriceId: 'AAPL/USD',
    mintable: false,
    interest: new BigNumber(0.01)
  }])
  await testing.generate(1)

  await app.call('setloantoken', [{
    symbol: 'TSLA',
    fixedIntervalPriceId: 'TSLA/USD',
    mintable: false,
    interest: new BigNumber(0.02)
  }])
  await testing.generate(1)

  await app.call('setloantoken', [{
    symbol: 'MSFT',
    fixedIntervalPriceId: 'MSFT/USD',
    mintable: false,
    interest: new BigNumber(0.03)
  }])
  await testing.generate(1)

  await app.call('setloantoken', [{
    symbol: 'FB',
    fixedIntervalPriceId: 'FB/USD',
    mintable: false,
    interest: new BigNumber(0.04)
  }])
  await testing.generate(1)
})

afterAll(async () => {
  await app.stop()
})

describe('list', () => {
  it('should listLoanTokens', async () => {
    const result = await controller.listLoanToken({ size: 100 })
    expect(result.data.length).toStrictEqual(4)
    expect(result.data[0]).toStrictEqual({
      tokenId: expect.any(String),
      interest: expect.any(String),
      fixedIntervalPriceId: expect.any(String),
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
        isLoanToken: true,
        limit: '0',
        mintable: false,
        minted: '0',
        name: '',
        symbol: expect.any(String),
        symbolKey: expect.any(String),
        tradeable: true
      },
      // NOTE(canonbrother): waitForIndexHeight is needed in ocean-js
      activePrice: {
        active: null,
        next: null,
        isLive: false,
        block: expect.any(Object)
      }
    })

    expect(result.data[1].tokenId.length).toStrictEqual(64)
    expect(result.data[2].tokenId.length).toStrictEqual(64)
    expect(result.data[3].tokenId.length).toStrictEqual(64)
  })

  it('should listLoanTokens with pagination', async () => {
    const first = await controller.listLoanToken({ size: 2 })

    expect(first.data.length).toStrictEqual(2)
    expect(first.page?.next?.length).toStrictEqual(64)

    const next = await controller.listLoanToken({
      size: 2,
      next: first.page?.next
    })

    expect(next.data.length).toStrictEqual(2)
    expect(next.page?.next?.length).toStrictEqual(64)

    const last = await controller.listLoanToken({
      size: 2,
      next: next.page?.next
    })

    expect(last.data.length).toStrictEqual(0)
    expect(last.page).toBeUndefined()
  })

  it('should listLoanTokens with an empty object if size 100 next 300 which is out of range', async () => {
    const result = await controller.listLoanToken({ size: 100, next: '300' })

    expect(result.data.length).toStrictEqual(0)
    expect(result.page).toBeUndefined()
  })
})

describe('get', () => {
  it('should get loan token by symbol', async () => {
    const data = await controller.getLoanToken('AAPL')
    expect(data).toStrictEqual({
      tokenId: expect.any(String),
      fixedIntervalPriceId: 'AAPL/USD',
      interest: '0.01',
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
        id: '1',
        isDAT: true,
        isLPS: false,
        isLoanToken: true,
        limit: '0',
        mintable: false,
        minted: '0',
        name: '',
        symbol: 'AAPL',
        symbolKey: 'AAPL',
        tradeable: true
      },
      // NOTE(canonbrother): waitForIndexHeight is needed in ocean-js
      activePrice: {
        active: null,
        next: null,
        isLive: false,
        block: expect.any(Object)
      }
    })
  })

  it('should throw error while getting non-existent loan token id', async () => {
    expect.assertions(2)
    try {
      await controller.getLoanToken('999')
    } catch (err: any) {
      expect(err).toBeInstanceOf(WhaleApiException)
      expect(err.error).toStrictEqual({
        code: 404,
        type: 'NotFound',
        at: expect.any(Number),
        message: 'Unable to find loan token',
        url: '/v0/regtest/loans/tokens/999'
      })
    }
  })
})
