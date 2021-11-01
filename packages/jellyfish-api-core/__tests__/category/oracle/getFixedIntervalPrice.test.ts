import { LoanMasterNodeRegTestContainer } from './loan_container'
import BigNumber from 'bignumber.js'
import { Testing } from '@defichain/jellyfish-testing'
import { RpcApiError } from '@defichain/jellyfish-api-core'

describe('Oracle', () => {
  const container = new LoanMasterNodeRegTestContainer()
  const testing = Testing.create(container)
  let oracleId: string
  let timestamp: number

  beforeAll(async () => {
    await testing.container.start()
    await testing.container.waitForWalletCoinbaseMaturity()
    await setup()
  })

  afterAll(async () => {
    await testing.container.stop()
  })

  async function setup (): Promise<void> {
    // token setup
    const aliceColAddr = await testing.container.getNewAddress()
    await testing.token.dfi({ address: aliceColAddr, amount: 100000 })
    await testing.generate(1)
    await testing.token.create({ symbol: 'BTC', collateralAddress: aliceColAddr })
    await testing.generate(1)
    await testing.token.mint({ symbol: 'BTC', amount: 30000 })
    await testing.generate(1)

    // oracle setup
    const addr = await testing.generateAddress()
    const priceFeeds = [
      { token: 'DFI', currency: 'USD' },
      { token: 'BTC', currency: 'USD' },
      { token: 'UBER', currency: 'USD' }
    ]
    oracleId = await testing.rpc.oracle.appointOracle(addr, priceFeeds, { weightage: 1 })
    await testing.generate(1)

    timestamp = Math.floor(new Date().getTime() / 1000)
    await testing.rpc.oracle.setOracleData(
      oracleId,
      timestamp,
      {
        prices: [
          { tokenAmount: '1@DFI', currency: 'USD' },
          { tokenAmount: '60000@BTC', currency: 'USD' },
          { tokenAmount: '8@UBER', currency: 'USD' }
        ]
      }
    )
    await testing.generate(1)

    // setCollateralToken DFI
    await testing.rpc.loan.setCollateralToken({
      token: 'DFI',
      factor: new BigNumber(1),
      fixedIntervalPriceId: 'DFI/USD'
    })
    await testing.generate(1)

    // setCollateralToken BTC
    await testing.rpc.loan.setCollateralToken({
      token: 'BTC',
      factor: new BigNumber(0.5),
      fixedIntervalPriceId: 'BTC/USD'
    })
    await testing.generate(1)

    // setLoanToken UBER
    await testing.rpc.loan.setLoanToken({
      symbol: 'UBER',
      fixedIntervalPriceId: 'UBER/USD'
    })
    await testing.generate(1)
  }

  it('should getFixedIntervalPrices', async () => {
    {
      const price = await testing.rpc.oracle.getFixedIntervalPrice('UBER/USD')
      expect(price).toStrictEqual({
        activePriceBlock: expect.any(Number),
        nextPriceBlock: expect.any(Number),
        fixedIntervalPriceId: 'UBER/USD',
        activePrice: new BigNumber('0'),
        nextPrice: new BigNumber('8'),
        timestamp: expect.any(Number),
        isLive: false
      })
    }

    {
      await testing.generate(6)
      const price = await testing.rpc.oracle.getFixedIntervalPrice('UBER/USD')
      expect(price).toStrictEqual({
        activePriceBlock: expect.any(Number),
        nextPriceBlock: expect.any(Number),
        fixedIntervalPriceId: 'UBER/USD',
        activePrice: new BigNumber('8'),
        nextPrice: new BigNumber('8'),
        timestamp: expect.any(Number),
        isLive: true
      })
    }

    {
      await testing.rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '32@UBER', currency: 'USD' }] })
      const price = await testing.rpc.oracle.getFixedIntervalPrice('UBER/USD')
      expect(price).toStrictEqual({
        activePriceBlock: expect.any(Number),
        nextPriceBlock: expect.any(Number),
        fixedIntervalPriceId: 'UBER/USD',
        activePrice: new BigNumber('8'),
        nextPrice: new BigNumber('8'),
        timestamp: expect.any(Number),
        isLive: true
      })
    }

    {
      await testing.generate(6)
      const price = await testing.rpc.oracle.getFixedIntervalPrice('UBER/USD')
      expect(price).toStrictEqual({
        activePriceBlock: expect.any(Number),
        nextPriceBlock: expect.any(Number),
        fixedIntervalPriceId: 'UBER/USD',
        activePrice: new BigNumber('8'),
        nextPrice: new BigNumber('32'),
        timestamp: expect.any(Number),
        isLive: false
      })
    }

    {
      await testing.generate(6)
      const price = await testing.rpc.oracle.getFixedIntervalPrice('UBER/USD')
      expect(price).toStrictEqual({
        activePriceBlock: expect.any(Number),
        nextPriceBlock: expect.any(Number),
        fixedIntervalPriceId: 'UBER/USD',
        activePrice: new BigNumber('32'),
        nextPrice: new BigNumber('32'),
        timestamp: expect.any(Number),
        isLive: true
      })
    }
  })

  it('test prices changes within 6 blocks while updating price feed', async () => {
    let activePriceBlock: number
    let nextPriceBlock: number
    let blockHeight: number
    {
      // make sure to have a valid price of 10@UBER
      await testing.rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '10@UBER', currency: 'USD' }] })
      await testing.generate(13)
      blockHeight = await testing.rpc.blockchain.getBlockCount()
      const price = await testing.rpc.oracle.getFixedIntervalPrice('UBER/USD')

      expect(price).toStrictEqual({
        activePriceBlock: expect.any(Number),
        nextPriceBlock: expect.any(Number),
        fixedIntervalPriceId: 'UBER/USD',
        activePrice: new BigNumber('10'),
        nextPrice: new BigNumber('10'),
        timestamp: expect.any(Number),
        isLive: true
      })

      expect(price.activePriceBlock).toStrictEqual(blockHeight)
      activePriceBlock = price.activePriceBlock
      nextPriceBlock = price.nextPriceBlock
    }

    // update the oracle price before nextPriceBlock
    await testing.rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '11@UBER', currency: 'USD' }] })
    await testing.generate(1)

    {
      blockHeight = await testing.rpc.blockchain.getBlockCount()
      const price = await testing.rpc.oracle.getFixedIntervalPrice('UBER/USD')
      expect(price).toStrictEqual({
        activePriceBlock: activePriceBlock,
        nextPriceBlock: nextPriceBlock,
        fixedIntervalPriceId: 'UBER/USD',
        activePrice: new BigNumber('10'),
        nextPrice: new BigNumber('10'),
        timestamp: expect.any(Number),
        isLive: true
      })
    }

    // generate another 5 blocks
    await testing.generate(5)
    {
      blockHeight = await testing.rpc.blockchain.getBlockCount()
      const price = await testing.rpc.oracle.getFixedIntervalPrice('UBER/USD')
      expect(price).toStrictEqual({
        activePriceBlock: nextPriceBlock,
        nextPriceBlock: nextPriceBlock + 6,
        fixedIntervalPriceId: 'UBER/USD',
        activePrice: new BigNumber('10'),
        nextPrice: new BigNumber('11'),
        timestamp: expect.any(Number),
        isLive: true
      })

      expect(price.activePriceBlock).toStrictEqual(blockHeight)
      activePriceBlock = price.activePriceBlock
      nextPriceBlock = price.nextPriceBlock
    }

    // do a price hike before nextPriceBlock
    await testing.rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '40@UBER', currency: 'USD' }] })
    await testing.generate(6)

    {
      blockHeight = await testing.rpc.blockchain.getBlockCount()
      const price = await testing.rpc.oracle.getFixedIntervalPrice('UBER/USD')
      expect(price).toStrictEqual({
        activePriceBlock: nextPriceBlock,
        nextPriceBlock: nextPriceBlock + 6,
        fixedIntervalPriceId: 'UBER/USD',
        activePrice: new BigNumber('11'),
        nextPrice: new BigNumber('40'),
        timestamp: expect.any(Number),
        isLive: false
      })

      expect(price.activePriceBlock).toStrictEqual(blockHeight)
      activePriceBlock = price.activePriceBlock
      nextPriceBlock = price.nextPriceBlock
    }

    // wait another 6 blocks for the new price to be valid
    await testing.generate(6)
    {
      blockHeight = await testing.rpc.blockchain.getBlockCount()
      const price = await testing.rpc.oracle.getFixedIntervalPrice('UBER/USD')
      expect(price).toStrictEqual({
        activePriceBlock: nextPriceBlock,
        nextPriceBlock: nextPriceBlock + 6,
        fixedIntervalPriceId: 'UBER/USD',
        activePrice: new BigNumber('40'),
        nextPrice: new BigNumber('40'),
        timestamp: expect.any(Number),
        isLive: true
      })

      expect(price.activePriceBlock).toStrictEqual(blockHeight)
      activePriceBlock = price.activePriceBlock
      nextPriceBlock = price.nextPriceBlock
    }

    // update the oracle price two times before nextPriceBlock. should only take the last price update into account.
    await testing.rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '41@UBER', currency: 'USD' }] })
    await testing.generate(1)

    await testing.rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '42@UBER', currency: 'USD' }] })
    await testing.generate(5)

    {
      blockHeight = await testing.rpc.blockchain.getBlockCount()
      const price = await testing.rpc.oracle.getFixedIntervalPrice('UBER/USD')
      expect(price).toStrictEqual({
        activePriceBlock: nextPriceBlock,
        nextPriceBlock: nextPriceBlock + 6,
        fixedIntervalPriceId: 'UBER/USD',
        activePrice: new BigNumber('40'),
        nextPrice: new BigNumber('42'),
        timestamp: expect.any(Number),
        isLive: true
      })

      expect(price.activePriceBlock).toStrictEqual(blockHeight)
      activePriceBlock = price.activePriceBlock
      nextPriceBlock = price.nextPriceBlock
    }
  })

  it('should not getFixedIntervalPrice as empty id', async () => {
    const promise = testing.rpc.oracle.getFixedIntervalPrice('')
    await expect(promise).rejects.toThrow(RpcApiError)
    await expect(promise).rejects.toThrow('Invalid parameters, argument "fixedIntervalPriceId" must be non-null')
  })

  it('should not getFixedIntervalPrice as non-existence price id', async () => {
    const promise = testing.rpc.oracle.getFixedIntervalPrice('DURIAN/USD')
    await expect(promise).rejects.toThrow(RpcApiError)
    await expect(promise).rejects.toThrow('fixedIntervalPrice with id <DURIAN/USD> not found')
  })
})
