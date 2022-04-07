import { DeFiDRpcError, MasterNodeRegTestContainer } from '@defichain/testcontainers'
import { RegTestFoundationKeys, RegTest } from '@defichain/jellyfish-network'
import { getProviders, MockProviders } from '../provider.mock'
import { P2WPKHTransactionBuilder } from '../../src'
import { fundEllipticPair, sendTransaction, TxOut } from '../test.utils'
import { WIF } from '@defichain/jellyfish-crypto'

import { FutureSwap, Script } from '@defichain/jellyfish-transaction'

import BigNumber from 'bignumber.js'
import { Testing } from '@defichain/jellyfish-testing'
import { DfTxType } from '@defichain/jellyfish-api-core/dist/category/account'

const container = new MasterNodeRegTestContainer()
const testing = Testing.create(container)
let collateralAddress: string
let oracleId: string
let idDUSD: string
let idTSLA: string
const attributeKey = 'ATTRIBUTES'
let futInterval: number
let futRewardPercentage: number
const contractAddress = 'bcrt1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpsqgljc'

let provider: MockProviders
let builder: P2WPKHTransactionBuilder
let script: Script

async function fundForFeesIfUTXONotAvailable (amount = 10): Promise<void> {
  const prevouts = await provider.prevout.all()
  if (prevouts.length === 0) {
    // Fund 10 DFI UTXO to provider.getAddress() for fees
    await fundEllipticPair(testing.container, provider.ellipticPair, amount)
    await provider.setupMocks()
  }
}

async function setup (): Promise<void> {
  collateralAddress = await testing.generateAddress()
  await testing.token.dfi({ address: collateralAddress, amount: 300000 })
  await testing.token.create({ symbol: 'BTC', collateralAddress })
  await testing.generate(1)
  await testing.token.mint({ symbol: 'BTC', amount: 20000 })
  await testing.generate(1)

  // loan scheme
  await testing.container.call('createloanscheme', [100, 1, 'default'])
  await testing.generate(1)

  // price oracle
  const priceFeeds = [
    { token: 'DFI', currency: 'USD' },
    { token: 'BTC', currency: 'USD' },
    { token: 'TSLA', currency: 'USD' },
    { token: 'AMZN', currency: 'USD' },
    { token: 'DUSD', currency: 'USD' }
  ]

  const addr = await testing.generateAddress()
  oracleId = await testing.rpc.oracle.appointOracle(addr, priceFeeds, { weightage: 1 })
  await testing.generate(1)

  const timestamp = Math.floor(new Date().getTime() / 1000)
  await testing.rpc.oracle.setOracleData(
    oracleId,
    timestamp,
    {
      prices: [
        { tokenAmount: '1@DFI', currency: 'USD' },
        { tokenAmount: '10000@BTC', currency: 'USD' },
        { tokenAmount: '2@TSLA', currency: 'USD' },
        { tokenAmount: '4@AMZN', currency: 'USD' },
        { tokenAmount: '1@DUSD', currency: 'USD' }
      ]
    }
  )
  await testing.generate(1)

  // collateral tokens
  await testing.rpc.loan.setCollateralToken({
    token: 'DFI',
    factor: new BigNumber(1),
    fixedIntervalPriceId: 'DFI/USD'
  })
  await testing.generate(1)

  await testing.rpc.loan.setCollateralToken({
    token: 'BTC',
    factor: new BigNumber(0.5),
    fixedIntervalPriceId: 'BTC/USD'
  })
  await testing.generate(1)

  // loan token
  await testing.rpc.loan.setLoanToken({
    symbol: 'TSLA',
    fixedIntervalPriceId: 'TSLA/USD'
  })
  await testing.generate(1)

  await testing.rpc.loan.setLoanToken({
    symbol: 'AMZN',
    fixedIntervalPriceId: 'AMZN/USD'
  })
  await testing.generate(1)

  await testing.rpc.loan.setLoanToken({
    symbol: 'DUSD',
    fixedIntervalPriceId: 'DUSD/USD'
  })
  await testing.generate(1)

  idTSLA = await testing.token.getTokenId('TSLA')
  idDUSD = await testing.token.getTokenId('DUSD')

  // create a vault and take loans
  const vaultAddr = await testing.generateAddress()
  const vaultId = await testing.rpc.loan.createVault({
    ownerAddress: vaultAddr,
    loanSchemeId: 'default'
  })
  await testing.generate(1)

  await testing.rpc.loan.depositToVault({
    vaultId: vaultId, from: collateralAddress, amount: '100000@DFI'
  })

  // wait till the price valid.
  await testing.container.waitForPriceValid('TSLA/USD')

  // take multiple loans
  await testing.rpc.loan.takeLoan({
    vaultId: vaultId,
    to: collateralAddress,
    amounts: ['300@TSLA', '500@DUSD', '100@AMZN']
  })
  await testing.generate(1)

  // Futures setup
  // set the dfip2203/active to false
  await testing.rpc.masternode.setGov({ [attributeKey]: { 'v0/params/dfip2203/active': 'false' } })
  await testing.generate(1)

  // set dfip2203 params
  futInterval = 25
  futRewardPercentage = 0.05
  await testing.rpc.masternode.setGov({ [attributeKey]: { 'v0/params/dfip2203/reward_pct': futRewardPercentage.toString(), 'v0/params/dfip2203/block_period': futInterval.toString() } })
  await testing.generate(1)

  // activat the dfip2203/active now
  await testing.rpc.masternode.setGov({ [attributeKey]: { 'v0/params/dfip2203/active': 'true' } })
  await testing.generate(1)

  // Retrive and verify gov vars
  const attributes = await testing.rpc.masternode.getGov('ATTRIBUTES')
  expect(attributes.ATTRIBUTES['v0/params/dfip2203/active']).toStrictEqual('true')
  expect(attributes.ATTRIBUTES['v0/params/dfip2203/reward_pct']).toStrictEqual(futRewardPercentage.toString())
  expect(attributes.ATTRIBUTES['v0/params/dfip2203/block_period']).toStrictEqual(futInterval.toString())
}

async function checkTxouts (outs: TxOut[]): Promise<void> {
  expect(outs[0].value).toStrictEqual(0)
  expect(outs[1].value).toBeLessThan(10)
  expect(outs[1].value).toBeGreaterThan(9.999)
  expect(outs[1].scriptPubKey.addresses[0]).toStrictEqual(await provider.getAddress())

  // Ensure you don't send all your balance away
  const prevouts = await provider.prevout.all()
  expect(prevouts.length).toStrictEqual(1)
  expect(prevouts[0].value.toNumber()).toBeLessThan(10)
  expect(prevouts[0].value.toNumber()).toBeGreaterThan(9.999)
}

describe('futureswap', () => {
  beforeEach(async () => {
    await testing.container.start()
    await testing.container.waitForWalletCoinbaseMaturity()

    provider = await getProviders(testing.container)
    provider.setEllipticPair(WIF.asEllipticPair(RegTestFoundationKeys[0].owner.privKey))
    builder = new P2WPKHTransactionBuilder(provider.fee, provider.prevout, provider.elliptic, RegTest)
    await setup()

    await fundForFeesIfUTXONotAvailable(10)
    script = await provider.elliptic.script()
  })

  afterEach(async () => {
    await testing.container.stop()
  })

  it('should create futureswap dtoken to dusd', async () => {
    const swapAmount = 1
    const tslaAddress = await provider.getAddress()
    await testing.rpc.account.accountToAccount(collateralAddress, { [tslaAddress]: `${swapAmount}@TSLA` })
    await testing.generate(1)

    await fundForFeesIfUTXONotAvailable(10)
    const txn = await builder.account.futureSwap({
      owner: await provider.elliptic.script(),
      source: { token: Number(idTSLA), amount: new BigNumber(swapAmount) },
      destination: 0,
      withdraw: false
    }, script)

    // Ensure the created txn is correct
    const outs = await sendTransaction(testing.container, txn)
    await checkTxouts(outs)

    // check the future is in effect
    {
      const pendingFutures = await testing.container.call('listpendingfutureswaps')
      expect(pendingFutures.length).toStrictEqual(1)
      expect(pendingFutures[0].owner).toStrictEqual(tslaAddress)
      expect(pendingFutures[0].source).toStrictEqual(`${swapAmount.toFixed(8)}@TSLA`)
      expect(pendingFutures[0].destination).toStrictEqual('DUSD')

      // check live/economy/dfip2203_*
      const attributes = await testing.rpc.masternode.getGov(attributeKey)
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_current']).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_burned']).toBeUndefined()
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_minted']).toBeUndefined()

      // dfip2203 burn should be empty
      const burnBefore = await testing.rpc.account.getBurnInfo()
      expect(burnBefore.dfip2203).toStrictEqual([])

      {
        // check contractAddress
        const balance = await testing.rpc.account.getAccount(contractAddress)
        expect(balance).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      }

      {
        // check tslaAddress
        const balance = await testing.rpc.account.getAccount(tslaAddress)
        expect(balance).toStrictEqual([])
      }
    }

    // get minted DUSD
    const dusdMintedBefore = (await testing.rpc.token.getToken(idDUSD))[idDUSD].minted

    // move to next settle block
    const nextSettleBlock = await testing.container.call('getfutureswapblock', [])
    await testing.generate(nextSettleBlock - await testing.rpc.blockchain.getBlockCount())

    let mintedDUSD: BigNumber
    // check future settled
    {
      // calclulate minted DUSD. dtoken goes for a discount.
      mintedDUSD = new BigNumber((1 - futRewardPercentage) * 2 * swapAmount).dp(8, BigNumber.ROUND_FLOOR) // (1 - reward percentage) * TSLADUSD value * TSLA swap amount;
      const dusdMintedAfter = (await testing.rpc.token.getToken(idDUSD))[idDUSD].minted
      expect(dusdMintedAfter).toStrictEqual(dusdMintedBefore.plus(mintedDUSD))

      const pendingFutures = await testing.container.call('listpendingfutureswaps')
      expect(pendingFutures.length).toStrictEqual(0)

      // check live/economy/dfip2203_*
      const attributes = await testing.rpc.masternode.getGov(attributeKey)
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_current']).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_burned']).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_minted']).toStrictEqual([`${mintedDUSD.toFixed(8)}@DUSD`])

      {
        // check contractAddress
        const balance = await testing.rpc.account.getAccount(contractAddress)
        expect(balance).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      }

      {
        // check tslaAddress
        const balance = await testing.rpc.account.getAccount(tslaAddress)
        expect(balance).toStrictEqual([`${mintedDUSD.toFixed(8)}@DUSD`])
      }
    }

    // check burn
    const burnAfter = await testing.rpc.account.getBurnInfo()
    expect(burnAfter.dfip2203).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])

    // check results can be retrived via account history
    const accountHistories = await testing.rpc.account.listAccountHistory('all', { txtype: DfTxType.FUTURE_SWAP_EXECUTION })
    expect(accountHistories[0]).toStrictEqual(expect.objectContaining({ owner: tslaAddress, type: 'FutureSwapExecution', amounts: [`${mintedDUSD.toFixed(8)}@DUSD`] }))
  })

  it('should create multiple futureswap dtoken to dusd', async () => {
    const swapAmount = 1
    const tslaAddress = await provider.getAddress()
    await testing.rpc.account.accountToAccount(collateralAddress, { [tslaAddress]: `${swapAmount}@TSLA` })
    await testing.generate(1)

    {
      // move to next settle block so that we have enough duration
      const nextSettleBlock = await testing.container.call('getfutureswapblock', [])
      await testing.generate(nextSettleBlock - await testing.rpc.blockchain.getBlockCount())
    }

    {
      await fundForFeesIfUTXONotAvailable(10)
      const txn = await builder.account.futureSwap({
        owner: await provider.elliptic.script(),
        source: { token: Number(idTSLA), amount: new BigNumber(swapAmount) },
        destination: 0,
        withdraw: false
      }, script)

      // Ensure the created txn is correct
      const outs = await sendTransaction(testing.container, txn)
      await checkTxouts(outs)
    }

    // check the futureswap is in effect
    {
      const pendingFutures = await testing.container.call('listpendingfutureswaps')
      expect(pendingFutures.length).toStrictEqual(1)
      expect(pendingFutures[0].owner).toStrictEqual(tslaAddress)
      expect(pendingFutures[0].source).toStrictEqual(`${swapAmount.toFixed(8)}@TSLA`)
      expect(pendingFutures[0].destination).toStrictEqual('DUSD')

      // check live/economy/dfip2203_*
      const attributes = await testing.rpc.masternode.getGov(attributeKey)
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_current']).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_burned']).toStrictEqual([])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_minted']).toStrictEqual([])

      // dfip2203 burn should be empty
      const burnBefore = await testing.rpc.account.getBurnInfo()
      expect(burnBefore.dfip2203).toStrictEqual([])

      {
        // check contractAddress
        const balance = await testing.rpc.account.getAccount(contractAddress)
        expect(balance).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      }

      {
        // check tslaAddress
        const balance = await testing.rpc.account.getAccount(tslaAddress)
        expect(balance).toStrictEqual([])
      }
    }

    {
      // create the futureswap again
      await testing.rpc.account.accountToAccount(collateralAddress, { [tslaAddress]: `${swapAmount}@TSLA` })
      await testing.generate(1)
      await fundForFeesIfUTXONotAvailable(10)

      const txn = await builder.account.futureSwap({
        owner: await provider.elliptic.script(),
        source: { token: Number(idTSLA), amount: new BigNumber(swapAmount) },
        destination: 0,
        withdraw: false
      }, script)

      // Ensure the created txn is correct
      const outs = await sendTransaction(testing.container, txn)
      await checkTxouts(outs)
    }

    // check the futures, second futureswap should also be there
    {
      const pendingFutures = await testing.container.call('listpendingfutureswaps')
      expect(pendingFutures.length).toStrictEqual(2)
      expect(pendingFutures[0].owner).toStrictEqual(tslaAddress)
      expect(pendingFutures[0].source).toStrictEqual(`${swapAmount.toFixed(8)}@TSLA`)
      expect(pendingFutures[0].destination).toStrictEqual('DUSD')
      expect(pendingFutures[1].owner).toStrictEqual(tslaAddress)
      expect(pendingFutures[1].source).toStrictEqual(`${swapAmount.toFixed(8)}@TSLA`)
      expect(pendingFutures[1].destination).toStrictEqual('DUSD')

      // check live/economy/dfip2203_*
      const attributes = await testing.rpc.masternode.getGov(attributeKey)
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_current']).toStrictEqual([`${(swapAmount * 2).toFixed(8)}@TSLA`])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_burned']).toStrictEqual([])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_minted']).toStrictEqual([])

      // dfip2203 burn should be empty
      const burnBefore = await testing.rpc.account.getBurnInfo()
      expect(burnBefore.dfip2203).toStrictEqual([])

      {
        // check contractAddress
        const balance = await testing.rpc.account.getAccount(contractAddress)
        expect(balance).toStrictEqual([`${(swapAmount * 2).toFixed(8)}@TSLA`])
      }

      {
        // check tslaAddress
        const balance = await testing.rpc.account.getAccount(tslaAddress)
        expect(balance).toStrictEqual([])
      }
    }

    // get minted DUSD
    const dusdMintedBefore = (await testing.rpc.token.getToken(idDUSD))[idDUSD].minted

    // move to next settle block
    const nextSettleBlock = await testing.container.call('getfutureswapblock', [])
    await testing.generate(nextSettleBlock - await testing.rpc.blockchain.getBlockCount())

    let mintedDUSD: BigNumber
    // check future settled
    {
      // calclulate minted DUSD. dtoken goes for a discount.
      mintedDUSD = new BigNumber((1 - futRewardPercentage) * 2 * swapAmount * 2).dp(8, BigNumber.ROUND_FLOOR) // (1 - reward percentage) * TSLADUSD value * TSLA swap amount;
      const dusdMintedAfter = (await testing.rpc.token.getToken(idDUSD))[idDUSD].minted
      expect(dusdMintedAfter).toStrictEqual(dusdMintedBefore.plus(mintedDUSD))

      const pendingFutures = await testing.container.call('listpendingfutureswaps')
      expect(pendingFutures.length).toStrictEqual(0)

      // check live/economy/dfip2203_*
      const attributes = await testing.rpc.masternode.getGov(attributeKey)
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_current']).toStrictEqual([`${(swapAmount * 2).toFixed(8)}@TSLA`])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_burned']).toStrictEqual([`${(swapAmount * 2).toFixed(8)}@TSLA`])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_minted']).toStrictEqual([`${mintedDUSD.toFixed(8)}@DUSD`])

      {
        // check contractAddress
        const balance = await testing.rpc.account.getAccount(contractAddress)
        expect(balance).toStrictEqual([`${(swapAmount * 2).toFixed(8)}@TSLA`])
      }

      {
        // check tslaAddress
        const balance = await testing.rpc.account.getAccount(tslaAddress)
        expect(balance).toStrictEqual([`${mintedDUSD.toFixed(8)}@DUSD`])
      }
    }

    // check burn
    const burnAfter = await testing.rpc.account.getBurnInfo()
    expect(burnAfter.dfip2203).toStrictEqual([`${(swapAmount * 2).toFixed(8)}@TSLA`])

    // check results can be retrived via account history
    const accountHistories = await testing.rpc.account.listAccountHistory('all', { txtype: DfTxType.FUTURE_SWAP_EXECUTION })
    expect(accountHistories[0]).toStrictEqual(expect.objectContaining({ owner: tslaAddress, type: 'FutureSwapExecution', amounts: [`${mintedDUSD.div(2).toFixed(8)}@DUSD`] }))
    expect(accountHistories[1]).toStrictEqual(expect.objectContaining({ owner: tslaAddress, type: 'FutureSwapExecution', amounts: [`${mintedDUSD.div(2).toFixed(8)}@DUSD`] }))
  })

  it('should create futureswap dtoken to dusd just before the next settle block', async () => {
    const swapAmount = 1
    const tslaAddress = await provider.getAddress()
    await testing.rpc.account.accountToAccount(collateralAddress, { [tslaAddress]: `${swapAmount}@TSLA` })
    await testing.generate(1)
    await fundForFeesIfUTXONotAvailable(10)

    // move to next settle block - 1
    const nextSettleBlock = await testing.container.call('getfutureswapblock', [])
    await testing.generate(nextSettleBlock - await testing.rpc.blockchain.getBlockCount() - 1)

    // get minted DUSD
    const dusdMintedBefore = (await testing.rpc.token.getToken(idDUSD))[idDUSD].minted

    const txn = await builder.account.futureSwap({
      owner: await provider.elliptic.script(),
      source: { token: Number(idTSLA), amount: new BigNumber(swapAmount) },
      destination: 0,
      withdraw: false
    }, script)

    // Ensure the created txn is correct
    const outs = await sendTransaction(testing.container, txn)
    await checkTxouts(outs)

    // check future settled
    {
      // calclulate minted DUSD. dtoken goes for a discount.
      const mintedDUSD = new BigNumber((1 - futRewardPercentage) * 2 * swapAmount).dp(8, BigNumber.ROUND_FLOOR) // (1 - reward percentage) * TSLADUSD value * TSLA swap amount;
      const dusdMintedAfter = (await testing.rpc.token.getToken(idDUSD))[idDUSD].minted
      expect(dusdMintedAfter).toStrictEqual(dusdMintedBefore.plus(mintedDUSD))

      const pendingFutures = await testing.container.call('listpendingfutureswaps')
      expect(pendingFutures.length).toStrictEqual(0)

      // check live/economy/dfip2203_*
      const attributes = await testing.rpc.masternode.getGov(attributeKey)
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_current']).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_burned']).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_minted']).toStrictEqual([`${mintedDUSD.toFixed(8)}@DUSD`])

      {
        // check contractAddress
        const balance = await testing.rpc.account.getAccount(contractAddress)
        expect(balance).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      }

      {
        // check tslaAddress
        const balance = await testing.rpc.account.getAccount(tslaAddress)
        expect(balance).toStrictEqual([`${mintedDUSD.toFixed(8)}@DUSD`])
      }
    }

    // check burn
    const burnAfter = await testing.rpc.account.getBurnInfo()
    expect(burnAfter.dfip2203).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
  })

  it('should consider new oracle active price, if changed before futureswap execution', async () => {
    const swapAmount = 1
    const tslaAddress = await provider.getAddress()
    await testing.rpc.account.accountToAccount(collateralAddress, { [tslaAddress]: `${swapAmount}@TSLA` })
    await testing.generate(1)

    let blockHeight = await testing.rpc.blockchain.getBlockCount()
    let nextSettleBlock = await testing.container.call('getfutureswapblock', [])

    // move to next settle block for better duration for the oracle price to kick in
    await testing.generate(nextSettleBlock - blockHeight)
    blockHeight = await testing.rpc.blockchain.getBlockCount()
    nextSettleBlock = await testing.container.call('getfutureswapblock', [])

    // create futureswap
    await fundForFeesIfUTXONotAvailable(10)
    const txn = await builder.account.futureSwap({
      owner: await provider.elliptic.script(),
      source: { token: Number(idTSLA), amount: new BigNumber(swapAmount) },
      destination: 0,
      withdraw: false
    }, script)

    // Ensure the created txn is correct
    const outs = await sendTransaction(testing.container, txn)
    await checkTxouts(outs)

    // change the oracle price
    const timestamp = Math.floor(new Date().getTime() / 1000)
    const nextTSLAPrice = 2.2
    await testing.rpc.oracle.setOracleData(
      oracleId,
      timestamp,
      {
        prices: [
          { tokenAmount: `${nextTSLAPrice}@TSLA`, currency: 'USD' }
        ]
      }
    )
    await testing.generate(1)
    await testing.container.waitForActivePrice('TSLA/USD', `${nextTSLAPrice}`)

    const blockHeightAfter = await testing.rpc.blockchain.getBlockCount()

    // check next settle block is not reached yet
    expect(blockHeightAfter).toBeLessThan(nextSettleBlock)

    // get minted DUSD
    const dusdMintedBefore = (await testing.rpc.token.getToken(idDUSD))[idDUSD].minted

    // move to nextSettleBlock
    await testing.generate(nextSettleBlock - blockHeightAfter)

    // check future settled
    {
      // calclulate minted DUSD. dtoken goes for a discount.
      const mintedDUSD = new BigNumber((1 - futRewardPercentage) * nextTSLAPrice * swapAmount).dp(8, BigNumber.ROUND_FLOOR) // (1 - reward percentage) * nextTSLAPrice * TSLA swap amount;
      const dusdMintedAfter = (await testing.rpc.token.getToken(idDUSD))[idDUSD].minted
      expect(dusdMintedAfter).toStrictEqual(dusdMintedBefore.plus(mintedDUSD))

      const pendingFutures = await testing.container.call('listpendingfutureswaps')
      expect(pendingFutures.length).toStrictEqual(0)

      // check live/economy/dfip2203_*
      const attributes = await testing.rpc.masternode.getGov(attributeKey)
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_current']).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_burned']).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_minted']).toStrictEqual([`${mintedDUSD.toFixed(8)}@DUSD`])

      {
        // check contractAddress
        const balance = await testing.rpc.account.getAccount(contractAddress)
        expect(balance).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      }

      {
        // check tslaAddress
        const balance = await testing.rpc.account.getAccount(tslaAddress)
        expect(balance).toStrictEqual([`${mintedDUSD.toFixed(8)}@DUSD`])
      }
    }

    // check burn
    const burnAfter = await testing.rpc.account.getBurnInfo()
    expect(burnAfter.dfip2203).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
  })

  it('should refund if the oracle price is invalid at futureswap execution block', async () => {
    const swapAmount = 1
    const tslaAddress = await provider.getAddress()
    await testing.rpc.account.accountToAccount(collateralAddress, { [tslaAddress]: `${swapAmount}@TSLA` })
    await testing.generate(1)

    let blockHeight = await testing.rpc.blockchain.getBlockCount()
    let nextSettleBlock = await testing.container.call('getfutureswapblock', [])

    // move to next settle block
    await testing.generate(nextSettleBlock - blockHeight)
    blockHeight = await testing.rpc.blockchain.getBlockCount()
    nextSettleBlock = await testing.container.call('getfutureswapblock', [])
    const nextPriceBlock = await testing.container.getImmediatePriceBlockBeforeBlock('TSLA/USD', nextSettleBlock)

    await fundForFeesIfUTXONotAvailable(10)
    const txn = await builder.account.futureSwap({
      owner: await provider.elliptic.script(),
      source: { token: Number(idTSLA), amount: new BigNumber(swapAmount) },
      destination: 0,
      withdraw: false
    }, script)

    // Ensure the created txn is correct
    const outs = await sendTransaction(testing.container, txn)
    await checkTxouts(outs)

    // check the futureswap is in effect
    const pendingFutures = await testing.container.call('listpendingfutureswaps')
    expect(pendingFutures.length).toStrictEqual(1)

    // move to nextPriceBlock - 1
    await testing.generate(nextPriceBlock - 1 - await testing.rpc.blockchain.getBlockCount())

    // change the oracle price
    const timestamp = Math.floor(new Date().getTime() / 1000)
    const nextTSLAPrice = 3
    await testing.rpc.oracle.setOracleData(
      oracleId,
      timestamp,
      {
        prices: [
          { tokenAmount: `${nextTSLAPrice}@TSLA`, currency: 'USD' }
        ]
      }
    )
    await testing.generate(1)
    {
      // now check the price invalid
      const priceDataInvalid = await testing.rpc.oracle.getFixedIntervalPrice('TSLA/USD')
      expect(priceDataInvalid.isLive).toBeFalsy()
    }

    // get minted DUSD
    const dusdMintedBefore = (await testing.rpc.token.getToken(idDUSD))[idDUSD].minted

    // move to nextSettleBlock
    await testing.generate(nextSettleBlock - nextPriceBlock)

    // check price is still invalid
    {
      const priceDataInvalid = await testing.rpc.oracle.getFixedIntervalPrice('TSLA/USD')
      expect(priceDataInvalid.isLive).toBeFalsy()
    }

    // check futureswap is not executed.
    {
      const dusdMintedAfter = (await testing.rpc.token.getToken(idDUSD))[idDUSD].minted
      expect(dusdMintedAfter).toStrictEqual(dusdMintedBefore)

      const pendingFutures = await testing.container.call('listpendingfutureswaps')
      expect(pendingFutures.length).toStrictEqual(0)

      // check live/economy/dfip2203_*
      const attributes = await testing.rpc.masternode.getGov(attributeKey)
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_current']).toStrictEqual([])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_burned']).toStrictEqual([])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_minted']).toStrictEqual([])

      {
        // check contractAddress
        const balance = await testing.rpc.account.getAccount(contractAddress)
        expect(balance).toStrictEqual([])
      }

      {
        // check tslaAddress
        const balance = await testing.rpc.account.getAccount(tslaAddress)
        expect(balance).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      }
    }

    // check burn
    const burnAfter = await testing.rpc.account.getBurnInfo()
    expect(burnAfter.dfip2203).toStrictEqual([])

    // check results can be retrived via account history
    const accountHistories = await testing.rpc.account.listAccountHistory('all', { txtype: DfTxType.FUTURE_SWAP_REFUND })
    expect(accountHistories[0]).toStrictEqual(expect.objectContaining({ owner: contractAddress, type: 'FutureSwapRefund', amounts: [`-${swapAmount.toFixed(8)}@TSLA`] }))
    expect(accountHistories[1]).toStrictEqual(expect.objectContaining({ owner: tslaAddress, type: 'FutureSwapRefund', amounts: [`${swapAmount.toFixed(8)}@TSLA`] }))
  })

  it('should create futureswap dusd to dtoken', async () => {
    const swapAmount = 1
    const tslaAddress = await provider.getAddress()
    await testing.rpc.account.accountToAccount(collateralAddress, { [tslaAddress]: `${swapAmount}@DUSD` })
    await testing.generate(1)

    await fundForFeesIfUTXONotAvailable(10)
    const txn = await builder.account.futureSwap({
      owner: await provider.elliptic.script(),
      source: { token: Number(idDUSD), amount: new BigNumber(swapAmount) },
      destination: Number(idTSLA),
      withdraw: false
    }, script)

    // Ensure the created txn is correct
    const outs = await sendTransaction(testing.container, txn)
    await checkTxouts(outs)

    // check the future is in effect
    {
      const pendingFutures = await testing.container.call('listpendingfutureswaps')
      expect(pendingFutures.length).toStrictEqual(1)
      expect(pendingFutures[0].owner).toStrictEqual(tslaAddress)
      expect(pendingFutures[0].source).toStrictEqual(`${swapAmount.toFixed(8)}@DUSD`)
      expect(pendingFutures[0].destination).toStrictEqual('TSLA')

      // check live/economy/dfip2203_*
      const attributes = await testing.rpc.masternode.getGov(attributeKey)
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_current']).toStrictEqual([`${swapAmount.toFixed(8)}@DUSD`])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_burned']).toBeUndefined()
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_minted']).toBeUndefined()

      // dfip2203 burn should be empty
      const burnBefore = await testing.rpc.account.getBurnInfo()
      expect(burnBefore.dfip2203).toStrictEqual([])

      {
        // check contractAddress
        const balance = await testing.rpc.account.getAccount(contractAddress)
        expect(balance).toStrictEqual([`${swapAmount.toFixed(8)}@DUSD`])
      }

      {
        // check tslaAddress
        const balance = await testing.rpc.account.getAccount(tslaAddress)
        expect(balance).toStrictEqual([])
      }
    }

    // get minted TSLA
    const tslaMintedBefore = (await testing.rpc.token.getToken(idTSLA))[idTSLA].minted

    // move to next settle block
    const nextSettleBlock = await testing.container.call('getfutureswapblock', [])
    await testing.generate(nextSettleBlock - await testing.rpc.blockchain.getBlockCount())

    // check future settled
    {
      // calclulate minted TSLA. dtoken goes for a premium.
      const mintedTSLA = new BigNumber((1 / (1 + futRewardPercentage)) * (1 / 2) * swapAmount).dp(8, BigNumber.ROUND_FLOOR) // (1/(1 + reward percentage)) * (DUSDTSLA) value * DUSD swap amount;
      const tslaMintedAfter = (await testing.rpc.token.getToken(idTSLA))[idTSLA].minted
      expect(tslaMintedAfter).toStrictEqual(tslaMintedBefore.plus(mintedTSLA))

      const pendingFutures = await testing.container.call('listpendingfutureswaps')
      expect(pendingFutures.length).toStrictEqual(0)

      // check live/economy/dfip2203_*
      const attributes = await testing.rpc.masternode.getGov(attributeKey)
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_current']).toStrictEqual([`${swapAmount.toFixed(8)}@DUSD`])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_burned']).toStrictEqual([`${swapAmount.toFixed(8)}@DUSD`])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_minted']).toStrictEqual([`${mintedTSLA.toFixed(8)}@TSLA`])

      {
        // check contractAddress
        const balance = await testing.rpc.account.getAccount(contractAddress)
        expect(balance).toStrictEqual([`${swapAmount.toFixed(8)}@DUSD`])
      }

      {
        // check tslaAddress
        const balance = await testing.rpc.account.getAccount(tslaAddress)
        expect(balance).toStrictEqual([`${mintedTSLA.toFixed(8)}@TSLA`])
      }
    }

    // check burn
    const burnAfter = await testing.rpc.account.getBurnInfo()
    expect(burnAfter.dfip2203).toStrictEqual([`${swapAmount.toFixed(8)}@DUSD`])
  })

  it('should not create futureswap when DFIP2203 is not active', async () => {
    const swapAmount = 1
    const tslaAddress = await provider.getAddress()
    await testing.rpc.account.accountToAccount(collateralAddress, { [tslaAddress]: `${swapAmount}@TSLA` })
    await testing.generate(1)

    // deactivate DFIP2203
    await testing.rpc.masternode.setGov({ [attributeKey]: { 'v0/params/dfip2203/active': 'false' } })
    await testing.generate(1)
    const attributes = await testing.rpc.masternode.getGov(attributeKey)
    expect(attributes.ATTRIBUTES['v0/params/dfip2203/active']).toStrictEqual('false')

    await fundForFeesIfUTXONotAvailable(10)
    const txn = await builder.account.futureSwap({
      owner: await provider.elliptic.script(),
      source: { token: Number(idTSLA), amount: new BigNumber(swapAmount) },
      destination: 0,
      withdraw: false
    }, script)

    const promise = sendTransaction(testing.container, txn)

    await expect(promise).rejects.toThrow(DeFiDRpcError)
    await expect(promise).rejects.toThrow('DeFiDRpcError: \'DFIP2203Tx: DFIP2203 not currently active (code 16)\', code: -26')
  })

  it('should refund the futureswap if DFIP2203 is disabled before execution', async () => {
    const swapAmount = 1
    const tslaAddress = await provider.getAddress()
    await testing.rpc.account.accountToAccount(collateralAddress, { [tslaAddress]: `${swapAmount}@TSLA` })
    await testing.generate(1)

    // create the futureswap
    await fundForFeesIfUTXONotAvailable(10)
    const txn = await builder.account.futureSwap({
      owner: await provider.elliptic.script(),
      source: { token: Number(idTSLA), amount: new BigNumber(swapAmount) },
      destination: 0,
      withdraw: false
    }, script)

    // Ensure the created txn is correct
    const outs = await sendTransaction(testing.container, txn)
    await checkTxouts(outs)

    const nextSettleBlock = await testing.container.call('getfutureswapblock', [])

    // check the futureswap is in effect
    const pendingFutures = await testing.container.call('listpendingfutureswaps')
    expect(pendingFutures.length).toStrictEqual(1)

    // get minted DUSD
    const dusdMintedBefore = (await testing.rpc.token.getToken(idDUSD))[idDUSD].minted

    // deactivate DFIP2203
    await testing.rpc.masternode.setGov({ [attributeKey]: { 'v0/params/dfip2203/active': 'false' } })
    await testing.generate(1)
    const attributes = await testing.rpc.masternode.getGov(attributeKey)
    expect(attributes.ATTRIBUTES['v0/params/dfip2203/active']).toStrictEqual('false')

    // move to nextSettleBlock
    await testing.generate(nextSettleBlock - await testing.rpc.blockchain.getBlockCount())

    // check futureswap is not executed.
    {
      const dusdMintedAfter = (await testing.rpc.token.getToken(idDUSD))[idDUSD].minted
      expect(dusdMintedAfter).toStrictEqual(dusdMintedBefore)

      const pendingFutures = await testing.container.call('listpendingfutureswaps')
      expect(pendingFutures.length).toStrictEqual(0)

      // check live/economy/dfip2203_*
      const attributes = await testing.rpc.masternode.getGov(attributeKey)
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_current']).toStrictEqual([])
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_burned']).toBeUndefined()
      expect(attributes.ATTRIBUTES['v0/live/economy/dfip2203_minted']).toBeUndefined()

      {
        // check contractAddress
        const balance = await testing.rpc.account.getAccount(contractAddress)
        expect(balance).toStrictEqual([])
      }

      {
        // check tslaAddress
        const balance = await testing.rpc.account.getAccount(tslaAddress)
        expect(balance).toStrictEqual([`${swapAmount.toFixed(8)}@TSLA`])
      }
    }

    // check burn
    const burnAfter = await testing.rpc.account.getBurnInfo()
    expect(burnAfter.dfip2203).toStrictEqual([])
  })

  it('should not create futureswap when invalid inputs given', async () => {
    const tslaAddress = await provider.getAddress()
    await testing.rpc.account.accountToAccount(collateralAddress, { [tslaAddress]: '1@TSLA' })
    await testing.generate(1)

    {
      // zero source amount is given
      await fundForFeesIfUTXONotAvailable(10)
      const txn = await builder.account.futureSwap({
        owner: await provider.elliptic.script(),
        source: { token: Number(idTSLA), amount: new BigNumber(0) },
        destination: 0,
        withdraw: false
      }, script)

      const promise = sendTransaction(testing.container, txn)
      await expect(promise).rejects.toThrow(DeFiDRpcError)
      await expect(promise).rejects.toThrow('DeFiDRpcError: \'DFIP2203Tx: Source amount must be more than zero (code 16)\', code: -26')
    }
    {
      // negative source amount is given
      await fundForFeesIfUTXONotAvailable(10)
      const futureSwap: FutureSwap = {
        owner: await provider.elliptic.script(),
        source: { token: Number(idTSLA), amount: new BigNumber(-1) },
        destination: 0,
        withdraw: false
      }

      await expect(builder.account.futureSwap(futureSwap, script)).rejects.toThrow('The value of "value" is out of range. It must be >= 0 and <= 4294967295. Received -1000000')
    }
    {
      // less than 1 sat source amount is given
      await fundForFeesIfUTXONotAvailable(10)
      const txn = await builder.account.futureSwap({
        owner: await provider.elliptic.script(),
        source: { token: Number(idTSLA), amount: new BigNumber(0.000000001) },
        destination: 0,
        withdraw: false
      }, script)

      const promise = sendTransaction(testing.container, txn)
      await expect(promise).rejects.toThrow(DeFiDRpcError)
      await expect(promise).rejects.toThrow('DeFiDRpcError: \'DFIP2203Tx: Source amount must be more than zero (code 16)\', code: -26')
    }
    {
      // invlaid source dtoken 100
      await fundForFeesIfUTXONotAvailable(10)
      const txn = await builder.account.futureSwap({
        owner: await provider.elliptic.script(),
        source: { token: Number(100), amount: new BigNumber(1) },
        destination: 0,
        withdraw: false
      }, script)

      const promise = sendTransaction(testing.container, txn)
      await expect(promise).rejects.toThrow(DeFiDRpcError)
      await expect(promise).rejects.toThrow('DeFiDRpcError: \'DFIP2203Tx: Could not get source loan token 100 (code 16)\', code: -26')
    }
    {
      // non loan source token 1(BTC)
      await fundForFeesIfUTXONotAvailable(10)
      const txn = await builder.account.futureSwap({
        owner: await provider.elliptic.script(),
        source: { token: Number(1), amount: new BigNumber(1) },
        destination: 0,
        withdraw: false
      }, script)

      const promise = sendTransaction(testing.container, txn)
      await expect(promise).rejects.toThrow(DeFiDRpcError)
      await expect(promise).rejects.toThrow('DeFiDRpcError: \'DFIP2203Tx: Could not get source loan token 1 (code 16)\', code: -26')
    }
    {
      // destination is given when futureswap dtoken to dusd
      await fundForFeesIfUTXONotAvailable(10)
      const txn = await builder.account.futureSwap({
        owner: await provider.elliptic.script(),
        source: { token: Number(idTSLA), amount: new BigNumber(1) },
        destination: 1,
        withdraw: false
      }, script)

      const promise = sendTransaction(testing.container, txn)
      await expect(promise).rejects.toThrow(DeFiDRpcError)
      await expect(promise).rejects.toThrow('DeFiDRpcError: \'DFIP2203Tx: Destination should not be set when source amount is a dToken (code 16)\', code: -26')
    }
    {
      // INVALID destination 100 is given when futureswap dusd to dtoken
      await fundForFeesIfUTXONotAvailable(10)
      const txn = await builder.account.futureSwap({
        owner: await provider.elliptic.script(),
        source: { token: Number(idDUSD), amount: new BigNumber(1) },
        destination: 100,
        withdraw: false
      }, script)

      const promise = sendTransaction(testing.container, txn)
      await expect(promise).rejects.toThrow(DeFiDRpcError)
      await expect(promise).rejects.toThrow('DeFiDRpcError: \'DFIP2203Tx: Could not get destination loan token 100. Set valid destination. (code 16)\', code: -26')
    }
  })

  it('should not create futureswap when DFIP2203 is disabled for the dtoken', async () => {
    const swapAmount = 1
    const tslaAddress = await provider.getAddress()
    await testing.rpc.account.accountToAccount(collateralAddress, { [tslaAddress]: `${swapAmount}@TSLA` })
    await testing.generate(1)

    // deactivate DFIP2203 for dtoken
    const key = `v0/token/${idTSLA}/dfip2203`

    await testing.rpc.masternode.setGov({ [attributeKey]: { [key]: 'false' } })
    await testing.generate(1)
    const attributes = await testing.rpc.masternode.getGov(attributeKey)
    expect(attributes.ATTRIBUTES[key]).toStrictEqual('false')

    await fundForFeesIfUTXONotAvailable(10)
    const txn = await builder.account.futureSwap({
      owner: await provider.elliptic.script(),
      source: { token: Number(idTSLA), amount: new BigNumber(swapAmount) },
      destination: 0,
      withdraw: false
    }, script)

    // Ensure the created txn is correct
    const promise = sendTransaction(testing.container, txn)
    await expect(promise).rejects.toThrow(DeFiDRpcError)
    await expect(promise).rejects.toThrow('DeFiDRpcError: \'DFIP2203Tx: DFIP2203 currently disabled for token 2 (code 16)\', code: -26')
  })
})
