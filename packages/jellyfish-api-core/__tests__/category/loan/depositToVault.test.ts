import { LoanMasterNodeRegTestContainer } from './loan_container'
import { GenesisKeys } from '@defichain/testcontainers'
import BigNumber from 'bignumber.js'
import { TestingGroup } from '@defichain/jellyfish-testing'
import { RpcApiError } from '@defichain/jellyfish-api-core'

describe('Loan', () => {
  const tGroup = TestingGroup.create(2, i => new LoanMasterNodeRegTestContainer(GenesisKeys[i]))
  let vaultId: string
  let vaultId1: string
  let collateralAddress: string
  let vaultAddress: string

  beforeAll(async () => {
    await tGroup.start()
    await tGroup.get(0).container.waitForWalletCoinbaseMaturity()
    await setup()
  })

  afterAll(async () => {
    await tGroup.stop()
  })

  async function setup (): Promise<void> {
    // token setup
    collateralAddress = await tGroup.get(0).container.getNewAddress()
    await tGroup.get(0).token.dfi({ address: collateralAddress, amount: 20000 })
    await tGroup.get(0).generate(1)
    await tGroup.get(0).token.create({ symbol: 'BTC', collateralAddress })
    await tGroup.get(0).generate(1)
    await tGroup.get(0).token.mint({ symbol: 'BTC', amount: 20000 })
    await tGroup.get(0).generate(1)
    await tGroup.waitForSync()

    // oracle setup
    const addr = await tGroup.get(0).generateAddress()
    const priceFeeds = [
      { token: 'DFI', currency: 'USD' },
      { token: 'BTC', currency: 'USD' },
      { token: 'TSLA', currency: 'USD' }
    ]
    const oracleId = await tGroup.get(0).rpc.oracle.appointOracle(addr, priceFeeds, { weightage: 1 })
    await tGroup.get(0).generate(1)
    await tGroup.waitForSync()
    const timestamp = Math.floor(new Date().getTime() / 1000)
    await tGroup.get(0).rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '1@DFI', currency: 'USD' }] })
    await tGroup.get(0).rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '10000@BTC', currency: 'USD' }] })
    await tGroup.get(0).rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '2@TSLA', currency: 'USD' }] })
    await tGroup.get(0).generate(1)
    await tGroup.waitForSync()

    // collateral token
    await tGroup.get(0).rpc.loan.setCollateralToken({
      token: 'DFI',
      factor: new BigNumber(1),
      priceFeedId: oracleId
      // activateAfterBlock: 130  // <- hit socket hang up
    })
    await tGroup.get(0).generate(1)

    await tGroup.get(0).rpc.loan.setCollateralToken({
      token: 'BTC',
      factor: new BigNumber(0.5),
      priceFeedId: oracleId
    })
    await tGroup.get(0).generate(1)

    // loan token
    await tGroup.get(0).rpc.loan.setLoanToken({
      symbol: 'TSLA',
      priceFeedId: oracleId
    })
    await tGroup.get(0).generate(1)
    await tGroup.waitForSync()

    // loan scheme set up
    await tGroup.get(0).rpc.loan.createLoanScheme({
      minColRatio: 150,
      interestRate: new BigNumber(3),
      id: 'scheme'
    })
    await tGroup.get(0).generate(1)
    await tGroup.waitForSync()

    vaultAddress = await tGroup.get(0).generateAddress()
    vaultId = await tGroup.get(0).rpc.loan.createVault({
      ownerAddress: vaultAddress,
      loanSchemeId: 'scheme'
    })
    await tGroup.get(0).generate(1)
    await tGroup.waitForSync()

    vaultId1 = await tGroup.get(0).rpc.loan.createVault({
      ownerAddress: await tGroup.get(0).generateAddress(),
      loanSchemeId: 'scheme'
    })
    await tGroup.get(0).generate(1)
    await tGroup.waitForSync()
  }

  it('should be failed as first deposit must be DFI', async () => {
    const promise = tGroup.get(0).rpc.loan.depositToVault({
      vaultId: vaultId, from: collateralAddress, amount: '1@BTC'
    })
    await expect(promise).rejects.toThrow(RpcApiError)
    await expect(promise).rejects.toThrow('At least 50% of the vault must be in DFI thus first deposit must be DFI')
  })

  it('should be failed as insufficient fund', async () => {
    const promise = tGroup.get(0).rpc.loan.depositToVault({
      vaultId: vaultId, from: collateralAddress, amount: '99999@DFI'
    })
    await expect(promise).rejects.toThrow(RpcApiError)
    await expect(promise).rejects.toThrow(`Insufficient funds: can't subtract balance of ${collateralAddress}: amount 20000.00000000 is less than 99999.00000000`)
  })

  it('should be failed as different auth address', async () => {
    const addr = await tGroup.get(1).generateAddress()
    const promise = tGroup.get(0).rpc.loan.depositToVault({
      vaultId: vaultId, from: addr, amount: '1@DFI'
    })
    await expect(promise).rejects.toThrow(RpcApiError)
    await expect(promise).rejects.toThrow(`Incorrect authorization for ${addr}`)
  })

  it('should be failed as deposit by other node', async () => {
    const promise = tGroup.get(1).rpc.loan.depositToVault({
      vaultId: vaultId, from: collateralAddress, amount: '300@DFI'
    })
    await expect(promise).rejects.toThrow(RpcApiError)
    await expect(promise).rejects.toThrow(`Incorrect authorization for ${collateralAddress}`)
  })

  it('should be failed as vault is not exists', async () => {
    const promise = tGroup.get(0).rpc.loan.depositToVault({
      vaultId: '0'.repeat(64), from: collateralAddress, amount: '10000@DFI'
    })
    await expect(promise).rejects.toThrow(RpcApiError)
    await expect(promise).rejects.toThrow(`Vault <${'0'.repeat(64)}> not found`)
  })

  it('should depositToVault', async () => {
    {
      const vaultBefore = await tGroup.get(0).container.call('getvault', [vaultId])
      expect(vaultBefore.loanSchemeId).toStrictEqual('scheme')
      expect(vaultBefore.ownerAddress).toStrictEqual(vaultAddress)
      expect(vaultBefore.isUnderLiquidation).toStrictEqual(false)
      expect(vaultBefore.loanAmount).toStrictEqual([])
      expect(vaultBefore.loanValue).toStrictEqual(0)
      expect(vaultBefore.currentRatio).toStrictEqual(-1) // empty loan

      const vaultBeforeDFIAcc = vaultBefore.collateralAmounts.length > 0
        ? vaultBefore.collateralAmounts.find((amt: string) => amt.split('@')[1] === 'DFI')
        : undefined
      const vaultBeforeDFIAmt = vaultBeforeDFIAcc !== undefined ? Number(vaultBeforeDFIAcc.split('@')[0]) : 0

      const depositId = await tGroup.get(0).rpc.loan.depositToVault({
        vaultId: vaultId, from: collateralAddress, amount: '10000@DFI'
      })
      expect(typeof depositId).toStrictEqual('string')
      await tGroup.get(0).generate(1)
      await tGroup.waitForSync()

      const vaultAfter = await tGroup.get(0).container.call('getvault', [vaultId])
      // check the changes after deposit
      expect(vaultAfter.loanSchemeId).toStrictEqual(vaultBefore.loanSchemeId)
      expect(vaultAfter.ownerAddress).toStrictEqual(vaultBefore.ownerAddress)
      expect(vaultAfter.isUnderLiquidation).toStrictEqual(vaultBefore.isUnderLiquidation)
      expect(vaultAfter.loanAmount).toStrictEqual(vaultBefore.loanAmount)
      expect(vaultAfter.loanValue).toStrictEqual(vaultBefore.loanValue)
      expect(vaultAfter.currentRatio).toStrictEqual(vaultBefore.currentRatio)

      // assert collateralAmounts
      const vaultAfterDFIAcc = vaultAfter.collateralAmounts.find((amt: string) => amt.split('@')[1] === 'DFI')
      const vaultAFterDFIAmt = Number(vaultAfterDFIAcc.split('@')[0])
      expect(vaultAFterDFIAmt - vaultBeforeDFIAmt).toStrictEqual(10000)

      // assert collateralValue
      // calculate DFI collateral value with factor
      const dfiDeposit = 10000 * 1 * 1 // deposit 10000 DFI * priceFeed 1 USD * 1 factor
      expect(vaultAfter.collateralValue - vaultBefore.collateralValue).toStrictEqual(dfiDeposit)
    }

    {
      const vaultBefore = await tGroup.get(0).container.call('getvault', [vaultId])
      const vaultBeforeBTCAcc = vaultBefore.collateralAmounts.length > 0
        ? vaultBefore.collateralAmounts.find((amt: string) => amt.split('@')[1] === 'BTC')
        : undefined
      const vaultBeforeBTCAmt = vaultBeforeBTCAcc !== undefined ? Number(vaultBeforeBTCAcc.split('@')[0]) : 0

      const depositId = await tGroup.get(0).rpc.loan.depositToVault({
        vaultId: vaultId, from: collateralAddress, amount: '1@BTC'
      })
      expect(typeof depositId).toStrictEqual('string')
      await tGroup.get(0).generate(1)
      await tGroup.waitForSync()

      const vaultAfter = await tGroup.get(0).container.call('getvault', [vaultId])
      // assert collateralAmounts
      const vaultAfterBTCAcc = vaultAfter.collateralAmounts.find((amt: string) => amt.split('@')[1] === 'BTC')
      const vaultAFterBTCAmt = Number(vaultAfterBTCAcc.split('@')[0])
      expect(vaultAFterBTCAmt - vaultBeforeBTCAmt).toStrictEqual(1)

      // assert collateralValue
      // calculate BTC collateral value with factor
      const btcDeposit = 1 * 10000 * 0.5 // deposit 1 BTC * priceFeed 10000 USD * 0.5 factor
      expect(vaultAfter.collateralValue - vaultBefore.collateralValue).toStrictEqual(btcDeposit)
    }
  })

  it('should depositToVault with utxos', async () => {
    const vaultBefore = await tGroup.get(0).container.call('getvault', [vaultId])
    const vaultBeforeDFIAcc = vaultBefore.collateralAmounts.length > 0
      ? vaultBefore.collateralAmounts.find((amt: string) => amt.split('@')[1] === 'DFI')
      : undefined
    const vaultBeforeDFIAmt = vaultBeforeDFIAcc !== undefined ? Number(vaultBeforeDFIAcc.split('@')[0]) : 0

    const utxo = await tGroup.get(0).container.fundAddress(collateralAddress, 250)
    const depositId = await tGroup.get(0).rpc.loan.depositToVault({
      vaultId: vaultId, from: collateralAddress, amount: '250@DFI'
    }, [utxo])
    expect(typeof depositId).toStrictEqual('string')
    await tGroup.get(0).generate(1)
    await tGroup.waitForSync()

    const vaultAfter = await tGroup.get(0).container.call('getvault', [vaultId])
    const vaultAfterDFIAcc = vaultAfter.collateralAmounts.find((amt: string) => amt.split('@')[1] === 'DFI')
    const vaultAFterDFIAmt = Number(vaultAfterDFIAcc.split('@')[0])
    expect(vaultAFterDFIAmt - vaultBeforeDFIAmt).toStrictEqual(250)

    const rawtx = await tGroup.get(0).container.call('getrawtransaction', [depositId, true])
    expect(rawtx.vin[0].txid).toStrictEqual(utxo.txid)
    expect(rawtx.vin[0].vout).toStrictEqual(utxo.vout)
  })

  it('should be failed as vault must contain min 50% of DFI', async () => {
    await tGroup.get(0).rpc.loan.depositToVault({
      vaultId: vaultId1, from: collateralAddress, amount: '100@DFI'
    })
    await tGroup.get(0).generate(1)
    await tGroup.waitForSync()

    const promise = tGroup.get(0).rpc.loan.depositToVault({
      vaultId: vaultId1, from: collateralAddress, amount: '100@BTC'
    })
    await expect(promise).rejects.toThrow(RpcApiError)
    await expect(promise).rejects.toThrow('At least 50% of the vault must be in DFI')
  })
})
