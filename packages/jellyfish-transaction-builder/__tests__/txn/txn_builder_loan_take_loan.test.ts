import { DeFiDRpcError, GenesisKeys } from '@defichain/testcontainers'
import { getProviders, MockProviders } from '../provider.mock'
import { P2WPKHTransactionBuilder } from '../../src'
import { fundEllipticPair, sendTransaction } from '../test.utils'
import { WIF } from '@defichain/jellyfish-crypto'
import BigNumber from 'bignumber.js'
import { LoanMasterNodeRegTestContainer } from './loan_container'
import { TestingGroup } from '@defichain/jellyfish-testing'
import { RegTest } from '@defichain/jellyfish-network'
// import { Script } from '@defichain/jellyfish-transaction'
import { P2WPKH } from '@defichain/jellyfish-address'

const tGroup = TestingGroup.create(2, i => new LoanMasterNodeRegTestContainer(GenesisKeys[i]))
const alice = tGroup.get(0)
const bob = tGroup.get(1)
let bobVaultId: string
let bobVaultAddr: string
let bobVault: any
let liqVaultId: string
let liqVaultAddr: string
let mayLiqVaultId: string
let mayLiqVaultAddr: string
let frozenVaultId: string
let frozenVaultAddr: string
let oracleId: string
let timestamp: number
let aProviders: MockProviders
let aBuilder: P2WPKHTransactionBuilder
let bProviders: MockProviders
let bBuilder: P2WPKHTransactionBuilder
// const netInterest = (3 + 0) / 100 // (scheme.rate + loanToken.interest) / 100
// const blocksPerDay = (60 * 60 * 24) / (10 * 60) // 144 in regtest

async function fundForFeesIfUTXONotAvailable (amount = 10): Promise<void> {
  const prevouts = await bProviders.prevout.all()
  if (prevouts.length === 0) {
    // Fund 10 DFI UTXO to bProviders.getAddress() for fees
    await fundEllipticPair(bob.container, bProviders.ellipticPair, amount)
    await bProviders.setupMocks()
  }
}

async function setup (): Promise<void> {
  // token setup
  const aliceAddr = await alice.container.getNewAddress()
  await alice.token.dfi({ address: aliceAddr, amount: 70000 })
  await alice.generate(1)
  await alice.token.create({ symbol: 'BTC', collateralAddress: aliceAddr })
  await alice.generate(1)
  await alice.token.mint({ symbol: 'BTC', amount: 30000 })
  await alice.generate(1)

  // oracle setup
  const addr = await alice.generateAddress()
  const priceFeeds = [
    { token: 'DFI', currency: 'USD' },
    { token: 'BTC', currency: 'USD' },
    { token: 'TSLA', currency: 'USD' },
    { token: 'AMZN', currency: 'USD' },
    { token: 'UBER', currency: 'USD' },
    { token: 'CAT', currency: 'USD' },
    { token: 'XYZ', currency: 'USD' }
  ]
  oracleId = await alice.rpc.oracle.appointOracle(addr, priceFeeds, { weightage: 1 })
  await alice.generate(1)
  timestamp = Math.floor(new Date().getTime() / 1000)
  await alice.rpc.oracle.setOracleData(
    oracleId,
    timestamp,
    {
      prices: [
        { tokenAmount: '1@DFI', currency: 'USD' },
        { tokenAmount: '10000@BTC', currency: 'USD' },
        { tokenAmount: '2@TSLA', currency: 'USD' },
        { tokenAmount: '4@AMZN', currency: 'USD' },
        { tokenAmount: '4@UBER', currency: 'USD' },
        { tokenAmount: '2@CAT', currency: 'USD' },
        { tokenAmount: '4@XYZ', currency: 'USD' }
      ]
    })
  await alice.generate(1)

  // collateral token
  await alice.rpc.loan.setCollateralToken({
    token: 'DFI',
    factor: new BigNumber(1),
    fixedIntervalPriceId: 'DFI/USD'
  })
  await alice.generate(1)

  await alice.rpc.loan.setCollateralToken({
    token: 'BTC',
    factor: new BigNumber(0.5),
    fixedIntervalPriceId: 'BTC/USD'
  })
  await alice.generate(1)

  // loan token
  await tGroup.get(0).rpc.loan.setLoanToken({
    symbol: 'TSLA',
    fixedIntervalPriceId: 'TSLA/USD'
  })
  await tGroup.get(0).generate(1)

  await tGroup.get(0).rpc.loan.setLoanToken({
    symbol: 'AMZN',
    fixedIntervalPriceId: 'AMZN/USD'
  })
  await tGroup.get(0).generate(1)

  await tGroup.get(0).rpc.loan.setLoanToken({
    symbol: 'UBER',
    fixedIntervalPriceId: 'UBER/USD'
  })
  await tGroup.get(0).generate(1)

  await tGroup.get(0).rpc.loan.setLoanToken({
    symbol: 'CAT',
    fixedIntervalPriceId: 'CAT/USD'
  })
  await tGroup.get(0).generate(1)

  await tGroup.get(0).rpc.loan.setLoanToken({
    symbol: 'XYZ',
    fixedIntervalPriceId: 'XYZ/USD'
  })
  await tGroup.get(0).generate(1)

  // loan scheme set up
  await alice.rpc.loan.createLoanScheme({
    minColRatio: 200,
    interestRate: new BigNumber(3),
    id: 'scheme'
  })
  await alice.generate(1)
  await tGroup.waitForSync()

  bobVaultAddr = await bProviders.getAddress()
  bobVaultId = await bob.rpc.loan.createVault({
    ownerAddress: bobVaultAddr,
    loanSchemeId: 'scheme'
  })
  await bob.generate(1)

  liqVaultAddr = await bob.generateAddress()
  liqVaultId = await bob.rpc.loan.createVault({
    ownerAddress: liqVaultAddr,
    loanSchemeId: 'scheme'
  })
  await bob.generate(1)

  mayLiqVaultAddr = await bob.generateAddress()
  mayLiqVaultId = await bob.rpc.loan.createVault({
    ownerAddress: mayLiqVaultAddr,
    loanSchemeId: 'scheme'
  })
  await bob.generate(1)

  frozenVaultAddr = await bob.generateAddress()
  frozenVaultId = await bob.rpc.loan.createVault({
    ownerAddress: frozenVaultAddr,
    loanSchemeId: 'scheme'
  })
  await bob.generate(1)
  await tGroup.waitForSync()

  // deposit on active vault
  await alice.rpc.loan.depositToVault({
    vaultId: bobVaultId, from: aliceAddr, amount: '10000@DFI'
  })
  await alice.generate(1)

  await alice.rpc.loan.depositToVault({
    vaultId: bobVaultId, from: aliceAddr, amount: '1@BTC'
  })
  await alice.generate(1)

  // deposit on liqVault
  await alice.rpc.loan.depositToVault({
    vaultId: liqVaultId, from: aliceAddr, amount: '10000@DFI'
  })
  await alice.generate(1)

  // deposit on mayLiqVault
  await alice.rpc.loan.depositToVault({
    vaultId: mayLiqVaultId, from: aliceAddr, amount: '10000@DFI'
  })
  await alice.generate(1)

  // deposit on frozenVault
  await alice.rpc.loan.depositToVault({
    vaultId: frozenVaultId, from: aliceAddr, amount: '10000@DFI'
  })
  await alice.generate(1)
  await tGroup.waitForSync()

  bobVault = await bob.rpc.loan.getVault(bobVaultId)
  expect(bobVault.loanSchemeId).toStrictEqual('scheme')
  expect(bobVault.ownerAddress).toStrictEqual(bobVaultAddr)
  expect(bobVault.state).toStrictEqual('active')
  expect(bobVault.collateralAmounts).toStrictEqual(['10000.00000000@DFI', '1.00000000@BTC'])
  expect(bobVault.collateralValue).toStrictEqual(new BigNumber(15000))
  expect(bobVault.loanAmounts).toStrictEqual([])
  expect(bobVault.loanValue).toStrictEqual(new BigNumber(0))
  expect(bobVault.interestAmounts).toStrictEqual([])
  expect(bobVault.interestValue).toStrictEqual(new BigNumber(0))
  expect(bobVault.collateralRatio).toStrictEqual(-1) // empty loan
  expect(bobVault.informativeRatio).toStrictEqual(new BigNumber(-1)) // empty loan
}

describe('loans.takeLoan success', () => {
  beforeEach(async () => {
    await tGroup.start()
    await alice.container.waitForWalletCoinbaseMaturity()

    aProviders = await getProviders(alice.container)
    aProviders.setEllipticPair(WIF.asEllipticPair(GenesisKeys[0].owner.privKey))
    aBuilder = new P2WPKHTransactionBuilder(aProviders.fee, aProviders.prevout, aProviders.elliptic, RegTest)

    bProviders = await getProviders(alice.container)
    bProviders.setEllipticPair(WIF.asEllipticPair(GenesisKeys[1].owner.privKey))
    bBuilder = new P2WPKHTransactionBuilder(bProviders.fee, bProviders.prevout, bProviders.elliptic, RegTest)

    await setup()
  })

  afterEach(async () => {
    await tGroup.stop()
  })

  it('should takeLoan', async () => {
    // fund if UTXO is not available for fees
    await fundForFeesIfUTXONotAvailable(10)
    const script = await bProviders.elliptic.script()

    const txn = await bBuilder.loans.takeLoan({
      vaultId: bobVaultId,
      to: { stack: [] },
      tokenAmounts: [{ token: 2, amount: new BigNumber(40) }] // 40@TSLA
    }, script)

    // Ensure the created txn is correct
    const outs = await sendTransaction(bob.container, txn)
    expect(outs[0].value).toStrictEqual(0)
    expect(outs[1].value).toBeLessThan(10)
    expect(outs[1].value).toBeGreaterThan(9.999)
    expect(outs[1].scriptPubKey.addresses[0]).toStrictEqual(await bProviders.getAddress())

    // Ensure you don't send all your balance away
    const prevouts = await bProviders.prevout.all()
    expect(prevouts.length).toStrictEqual(1)
    expect(prevouts[0].value.toNumber()).toBeLessThan(10)
    expect(prevouts[0].value.toNumber()).toBeGreaterThan(9.999)

    await bob.generate(1)

    const vaultAfter = await bob.rpc.loan.getVault(bobVaultId)
    const interestAfter = await alice.rpc.loan.getInterest('scheme', 'TSLA')

    const vaultBeforeLoanTSLAAcc = bobVault.loanAmounts?.find((amt: string) => amt.split('@')[1] === 'TSLA')
    const vaultBeforeLoanTSLAAmount = vaultBeforeLoanTSLAAcc !== undefined ? Number(vaultBeforeLoanTSLAAcc?.split('@')[0]) : 0
    const vaultAfterLoanTSLAAcc = vaultAfter.loanAmounts?.find((amt: string) => amt.split('@')[1] === 'TSLA')
    const vaultAfterLoanTSLAAmount = Number(vaultAfterLoanTSLAAcc?.split('@')[0])

    const interestAfterTSLA = interestAfter.find((interest: { 'token': string }) => interest.token === 'TSLA')

    expect(new BigNumber(vaultAfterLoanTSLAAmount - vaultBeforeLoanTSLAAmount)).toStrictEqual(new BigNumber(40).plus(interestAfterTSLA?.totalInterest as BigNumber))
    // check the account of the vault address
    expect(await alice.rpc.account.getAccount(await bProviders.getAddress())).toStrictEqual(['40.00000000@TSLA'])
  })

  it('should takeLoan to a given address', async () => {
    // fund if UTXO is not available for fees
    await fundForFeesIfUTXONotAvailable(10)

    const vaultBefore = await bob.rpc.loan.getVault(bobVaultId)
    const script = await bProviders.elliptic.script()
    const toAddress = await bob.generateAddress()
    const txn = await bBuilder.loans.takeLoan({
      vaultId: bobVaultId,
      to: P2WPKH.fromAddress(RegTest, toAddress, P2WPKH).getScript(),
      tokenAmounts: [{ token: 5, amount: new BigNumber(40) }]
    }, script)

    // Ensure the created txn is correct
    const outs = await sendTransaction(bob.container, txn)
    expect(outs[0].value).toStrictEqual(0)
    expect(outs[1].value).toBeLessThan(10)
    expect(outs[1].value).toBeGreaterThan(9.999)
    expect(outs[1].scriptPubKey.addresses[0]).toStrictEqual(await bProviders.getAddress())

    // Ensure you don't send all your balance away
    const prevouts = await bProviders.prevout.all()
    expect(prevouts.length).toStrictEqual(1)
    expect(prevouts[0].value.toNumber()).toBeLessThan(10)
    expect(prevouts[0].value.toNumber()).toBeGreaterThan(9.999)

    await bob.generate(1)

    const vaultAfter = await bob.rpc.loan.getVault(bobVaultId)
    const interestAfter = await bob.rpc.loan.getInterest('scheme', 'CAT')

    const vaultBeforeLoanTSLAAcc = vaultBefore.loanAmounts?.find((amt: string) => amt.split('@')[1] === 'CAT')
    const vaultBeforeLoanTSLAAmount = vaultBeforeLoanTSLAAcc !== undefined ? Number(vaultBeforeLoanTSLAAcc?.split('@')[0]) : 0
    const vaultAfterLoanTSLAAcc = vaultAfter.loanAmounts?.find((amt: string) => amt.split('@')[1] === 'CAT')
    const vaultAfterLoanTSLAAmount = Number(vaultAfterLoanTSLAAcc?.split('@')[0])

    const interestAfterTSLA = interestAfter.find((interest: { 'token': string }) => interest.token === 'CAT')
    const interestAccuredTSLA = interestAfterTSLA?.totalInterest

    expect(new BigNumber(vaultAfterLoanTSLAAmount - vaultBeforeLoanTSLAAmount)).toStrictEqual(new BigNumber(40).plus(interestAccuredTSLA as BigNumber))
    // check toAddress account
    expect(await bob.rpc.account.getAccount(toAddress)).toStrictEqual(['40.00000000@CAT'])
  })

  it('should takeLoan multiple tokens', async () => {
    // fund if UTXO is not available for fees
    await fundForFeesIfUTXONotAvailable(10)

    const script = await bProviders.elliptic.script()
    const txn = await bBuilder.loans.takeLoan({
      vaultId: bobVaultId,
      to: { stack: [] },
      tokenAmounts: [{ token: 3, amount: new BigNumber(40) }, { token: 4, amount: new BigNumber(30) }] // 40@AMZN, 30@UBER
    }, script)

    // Ensure the created txn is correct
    const outs = await sendTransaction(bob.container, txn)
    expect(outs[0].value).toStrictEqual(0)
    expect(outs[1].value).toBeLessThan(10)
    expect(outs[1].value).toBeGreaterThan(9.999)
    expect(outs[1].scriptPubKey.addresses[0]).toStrictEqual(await bProviders.getAddress())

    // Ensure you don't send all your balance away
    const prevouts = await bProviders.prevout.all()
    expect(prevouts.length).toStrictEqual(1)
    expect(prevouts[0].value.toNumber()).toBeLessThan(10)
    expect(prevouts[0].value.toNumber()).toBeGreaterThan(9.999)

    await bob.generate(1)

    const vaultAfter = await bob.rpc.loan.getVault(bobVaultId)
    const interestAfter = await bob.rpc.loan.getInterest('scheme')

    const vaultBeforeLoanAMZNAcc = bobVault.loanAmounts?.find((amt: string) => amt.split('@')[1] === 'AMZN')
    const vaultBeforeLoanAMZNAmount = vaultBeforeLoanAMZNAcc !== undefined ? Number(vaultBeforeLoanAMZNAcc?.split('@')[0]) : 0
    const vaultBeforeLoanUBERAcc = bobVault.loanAmounts?.find((amt: string) => amt.split('@')[1] === 'UBER')
    const vaultBeforeLoanUBERAmount = vaultBeforeLoanUBERAcc !== undefined ? Number(vaultBeforeLoanUBERAcc?.split('@')[0]) : 0

    const vaultAfterLoanAMZNAcc = vaultAfter.loanAmounts?.find((amt: string) => amt.split('@')[1] === 'AMZN')
    const vaultAfterLoanAMZNAmount = Number(vaultAfterLoanAMZNAcc?.split('@')[0])
    const vaultAfterLoanUBERAcc = vaultAfter.loanAmounts?.find((amt: string) => amt.split('@')[1] === 'UBER')
    const vaultAfterLoanUBERAmount = Number(vaultAfterLoanUBERAcc?.split('@')[0])

    const interestAfterAMZN = interestAfter.find((interest: { 'token': string }) => interest.token === 'AMZN')
    const interestAfterUBER = interestAfter.find((interest: { 'token': string }) => interest.token === 'UBER')

    expect(new BigNumber(vaultAfterLoanAMZNAmount - vaultBeforeLoanAMZNAmount)).toStrictEqual(new BigNumber(40).plus(interestAfterAMZN?.totalInterest as BigNumber))
    expect(new BigNumber(vaultAfterLoanUBERAmount - vaultBeforeLoanUBERAmount)).toStrictEqual(new BigNumber(30).plus(interestAfterUBER?.totalInterest as BigNumber))

    // check the account of the vault address
    expect(await bob.rpc.account.getAccount(await bProviders.getAddress())).toStrictEqual(expect.arrayContaining(['40.00000000@AMZN', '30.00000000@UBER']))
  })
})

describe('loans.takeLoan failed', () => {
  beforeAll(async () => {
    await tGroup.start()
    await alice.container.waitForWalletCoinbaseMaturity()

    aProviders = await getProviders(alice.container)
    aProviders.setEllipticPair(WIF.asEllipticPair(GenesisKeys[0].owner.privKey))
    aBuilder = new P2WPKHTransactionBuilder(aProviders.fee, aProviders.prevout, aProviders.elliptic, RegTest)

    bProviders = await getProviders(alice.container)
    bProviders.setEllipticPair(WIF.asEllipticPair(GenesisKeys[1].owner.privKey))
    bBuilder = new P2WPKHTransactionBuilder(bProviders.fee, bProviders.prevout, bProviders.elliptic, RegTest)

    await setup()
  })

  afterAll(async () => {
    await tGroup.stop()
  })

  it('should not takeLoan on nonexistent vault', async () => {
    // fund if UTXO is not available for fees
    await fundForFeesIfUTXONotAvailable(10)

    const script = await bProviders.elliptic.script()
    const txn = await bBuilder.loans.takeLoan({
      vaultId: '0'.repeat(64),
      to: { stack: [] },
      tokenAmounts: [{ token: 2, amount: new BigNumber(40) }]
    }, script)

    const promise = sendTransaction(bob.container, txn)
    await expect(promise).rejects.toThrow(DeFiDRpcError)
    await expect(promise).rejects.toThrow(`Vault <${'0'.repeat(64)}> not found`)
  })

  it('should not takeLoan on nonexistent loan token', async () => {
    // fund if UTXO is not available for fees
    await fundForFeesIfUTXONotAvailable(10)

    const script = await bProviders.elliptic.script()
    const txn = await bBuilder.loans.takeLoan({
      vaultId: bobVaultId,
      to: { stack: [] },
      tokenAmounts: [{ token: 1, amount: new BigNumber(40) }] // BTC(1) is not a loan token
    }, script)

    const promise = sendTransaction(bob.container, txn)
    await expect(promise).rejects.toThrow(DeFiDRpcError)
    await expect(promise).rejects.toThrow('Loan token with id (1) does not exist!')
  })

  it('should not takeLoan by other than the vault owner', async () => {
    // node1 tries to take a loan from node0's vault
    const aScript = await aProviders.elliptic.script()

    // Fund 10 DFI UTXO to newProviders.getAddress() for fees
    await fundEllipticPair(alice.container, aProviders.ellipticPair, 10)

    const txn = await aBuilder.loans.takeLoan({
      vaultId: bobVaultId,
      to: P2WPKH.fromAddress(RegTest, await aProviders.getAddress(), P2WPKH).getScript(),
      tokenAmounts: [{ token: 2, amount: new BigNumber(40) }]
    }, aScript)

    const promise = sendTransaction(alice.container, txn)
    await expect(promise).rejects.toThrow(DeFiDRpcError)
    await expect(promise).rejects.toThrow('tx must have at least one input from vault owner')
  })

  it('should not takeLoan while exceed vault collateralization ratio', async () => {
    // fund if UTXO is not available for fees
    await fundForFeesIfUTXONotAvailable(10)

    const script = await bProviders.elliptic.script()
    const txn = await bBuilder.loans.takeLoan({
      vaultId: bobVaultId,
      to: { stack: [] },
      tokenAmounts: [{ token: 2, amount: new BigNumber(300000) }]
    }, script)

    const promise = sendTransaction(bob.container, txn)
    await expect(promise).rejects.toThrow(DeFiDRpcError)
    await expect(promise).rejects.toThrow('Vault does not have enough collateralization ratio defined by loan scheme')
  })

  it('should not takeLoan on mintable:false token', async () => {
    await alice.container.call('updateloantoken', ['TSLA', { mintable: false }])
    await alice.generate(1)
    await tGroup.waitForSync()

    // fund if UTXO is not available for fees
    await fundForFeesIfUTXONotAvailable(10)

    const script = await bProviders.elliptic.script()
    const txn = await bBuilder.loans.takeLoan({
      vaultId: bobVaultId,
      to: { stack: [] },
      tokenAmounts: [{ token: 2, amount: new BigNumber(30) }]
    }, script)

    const promise = sendTransaction(bob.container, txn)
    await expect(promise).rejects.toThrow(DeFiDRpcError)
    await expect(promise).rejects.toThrow('Loan cannot be taken on token with id (2) as "mintable" is currently false')

    await alice.container.call('updateloantoken', ['TSLA', { mintable: true }])
    await alice.generate(1)
    await tGroup.waitForSync()
  })

  it('should not takeLoan on inLiquidation vault', async () => {
    await bob.rpc.loan.takeLoan({
      vaultId: liqVaultId,
      amounts: '2000@UBER'
    })
    await bob.generate(1)
    await tGroup.waitForSync()

    await alice.rpc.oracle.setOracleData(
      oracleId,
      timestamp,
      { prices: [{ tokenAmount: '6@UBER', currency: 'USD' }] })
    await alice.generate(12)
    await tGroup.waitForSync()

    const liqVault = await bob.rpc.loan.getVault(liqVaultId)
    expect(liqVault.state).toStrictEqual('inLiquidation')

    // fund if UTXO is not available for fees
    await fundForFeesIfUTXONotAvailable(10)
    const script = await bProviders.elliptic.script()

    const txn = await bBuilder.loans.takeLoan({
      vaultId: liqVaultId,
      to: { stack: [] },
      tokenAmounts: [{ token: 6, amount: new BigNumber(30) }]
    }, script)

    const promise = sendTransaction(alice.container, txn)
    await expect(promise).rejects.toThrow(DeFiDRpcError)
    await expect(promise).rejects.toThrow('Cannot take loan on vault under liquidation')
  })

  it('should not takeLoan on mayLiquidate vault', async () => {
    await bob.rpc.loan.takeLoan({
      vaultId: mayLiqVaultId,
      amounts: '2500@CAT'
    })
    await bob.generate(1)
    await tGroup.waitForSync()

    await alice.rpc.oracle.setOracleData(
      oracleId,
      timestamp,
      { prices: [{ tokenAmount: '2.2@CAT', currency: 'USD' }] })
    await alice.generate(6)
    await tGroup.waitForSync()

    const mayLiqVault = await bob.rpc.loan.getVault(mayLiqVaultId)
    expect(mayLiqVault.state).toStrictEqual('mayLiquidate')

    // fund if UTXO is not available for fees
    await fundForFeesIfUTXONotAvailable(10)
    const script = await bProviders.elliptic.script()

    const txn = await bBuilder.loans.takeLoan({
      vaultId: mayLiqVaultId,
      to: { stack: [] },
      tokenAmounts: [{ token: 4, amount: new BigNumber(1) }]
    }, script)

    const promise = sendTransaction(bob.container, txn)
    await expect(promise).rejects.toThrow(DeFiDRpcError)
    await expect(promise).rejects.toThrow('TakeLoanTx: Cannot take loan on vault under liquidation')
  })

  it('should not takeLoan on frozen vault', async () => {
    await bob.rpc.loan.takeLoan({
      vaultId: frozenVaultId,
      amounts: '200@AMZN'
    })
    await bob.generate(1)
    await tGroup.waitForSync()

    await alice.rpc.oracle.setOracleData(
      oracleId,
      timestamp,
      { prices: [{ tokenAmount: '6@AMZN', currency: 'USD' }] })
    await alice.generate(6)
    await tGroup.waitForSync()

    const frozenVault = await bob.rpc.loan.getVault(frozenVaultId)
    expect(frozenVault.state).toStrictEqual('frozen')

    // fund if UTXO is not available for fees
    await fundForFeesIfUTXONotAvailable(10)
    const script = await bProviders.elliptic.script()

    const txn = await bBuilder.loans.takeLoan({
      vaultId: frozenVaultId,
      to: { stack: [] },
      tokenAmounts: [{ token: 5, amount: new BigNumber(1) }]
    }, script)

    const promise = sendTransaction(bob.container, txn)
    await expect(promise).rejects.toThrow(DeFiDRpcError)
    await expect(promise).rejects.toThrow('Cannot take loan while any of the asset\'s price in the vault is not live')
  })
})
