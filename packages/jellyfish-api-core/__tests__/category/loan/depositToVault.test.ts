import { LoanMasterNodeRegTestContainer } from './loan_container'
import { GenesisKeys } from '@defichain/testcontainers'
import BigNumber from 'bignumber.js'
import { TestingGroup } from '@defichain/jellyfish-testing'
import { RpcApiError } from '@defichain/jellyfish-api-core'

describe('Loan', () => {
  const tGroup = TestingGroup.create(2, i => new LoanMasterNodeRegTestContainer(GenesisKeys[i]))
  let vaultId: string
  // let vaultId1: string
  let liqVaultId: string
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
    await tGroup.get(0).token.dfi({ address: collateralAddress, amount: 30000 })
    await tGroup.get(0).generate(1)
    await tGroup.get(0).token.create({ symbol: 'BTC', collateralAddress })
    await tGroup.get(0).generate(1)
    await tGroup.get(0).token.mint({ symbol: 'BTC', amount: 20000 })
    await tGroup.get(0).generate(1)
    await tGroup.get(0).token.create({ symbol: 'CAT', collateralAddress })
    await tGroup.get(0).generate(1)
    await tGroup.get(0).token.mint({ symbol: 'CAT', amount: 10000 })
    await tGroup.get(0).generate(1)

    // oracle setup
    const addr = await tGroup.get(0).generateAddress()
    const priceFeeds = [
      { token: 'DFI', currency: 'USD' },
      { token: 'BTC', currency: 'USD' },
      { token: 'TSLA', currency: 'USD' },
      { token: 'CAT', currency: 'USD' }
    ]
    const oracleId = await tGroup.get(0).rpc.oracle.appointOracle(addr, priceFeeds, { weightage: 1 })
    await tGroup.get(0).generate(1)
    const timestamp = Math.floor(new Date().getTime() / 1000)
    await tGroup.get(0).rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '1@DFI', currency: 'USD' }] })
    await tGroup.get(0).rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '10000@BTC', currency: 'USD' }] })
    await tGroup.get(0).rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '2@TSLA', currency: 'USD' }] })
    await tGroup.get(0).rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '10000@CAT', currency: 'USD' }] })
    await tGroup.get(0).generate(1)

    // collateral token
    await tGroup.get(0).rpc.loan.setCollateralToken({
      token: 'DFI',
      factor: new BigNumber(1),
      fixedIntervalPriceId: 'DFI/USD'
    })
    await tGroup.get(0).generate(1)

    await tGroup.get(0).rpc.loan.setCollateralToken({
      token: 'BTC',
      factor: new BigNumber(0.5),
      fixedIntervalPriceId: 'BTC/USD'
    })
    await tGroup.get(0).generate(1)

    await tGroup.get(0).rpc.loan.setCollateralToken({
      token: 'CAT',
      factor: new BigNumber(0.1),
      fixedIntervalPriceId: 'CAT/USD'
    })
    await tGroup.get(0).generate(1)

    // loan token
    await tGroup.get(0).rpc.loan.setLoanToken({
      symbol: 'TSLA',
      fixedIntervalPriceId: 'TSLA/USD'
    })
    await tGroup.get(0).generate(1)

    // loan scheme set up
    await tGroup.get(0).rpc.loan.createLoanScheme({
      minColRatio: 150,
      interestRate: new BigNumber(3),
      id: 'scheme'
    })
    await tGroup.get(0).generate(1)

    vaultAddress = await tGroup.get(0).generateAddress()
    vaultId = await tGroup.get(0).rpc.loan.createVault({
      ownerAddress: vaultAddress,
      loanSchemeId: 'scheme'
    })
    await tGroup.get(0).generate(1)

    // vaultId1 =
    await tGroup.get(0).rpc.loan.createVault({
      ownerAddress: await tGroup.get(0).generateAddress(),
      loanSchemeId: 'scheme'
    })
    await tGroup.get(0).generate(1)

    // set up liquidated vault here
    liqVaultId = await tGroup.get(0).rpc.loan.createVault({
      ownerAddress: await tGroup.get(0).generateAddress(),
      loanSchemeId: 'scheme'
    })
    await tGroup.get(0).generate(1)

    await tGroup.get(0).rpc.loan.depositToVault({
      vaultId: liqVaultId, from: collateralAddress, amount: '10000@DFI'
    })
    await tGroup.get(0).generate(1)

    await tGroup.get(0).rpc.loan.depositToVault({
      vaultId: liqVaultId, from: collateralAddress, amount: '1@CAT'
    })
    await tGroup.get(0).generate(1)

    await tGroup.get(0).rpc.loan.takeLoan({
      vaultId: liqVaultId,
      amounts: '100@TSLA'
    })
    await tGroup.get(0).generate(1)

    // liquidated: true
    await tGroup.get(0).rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '100000@TSLA', currency: 'USD' }] })
    await tGroup.get(0).generate(1)
    await tGroup.waitForSync()
  }

  it('should depositToVault', async () => {
    // {
    // const depositId =
    await tGroup.get(0).rpc.loan.depositToVault({
      vaultId: vaultId, from: collateralAddress, amount: '10000@DFI'
    })
    await tGroup.get(0).generate(1)
    await tGroup.waitForSync()
    // }

    {
      const depositId = await tGroup.get(0).rpc.loan.depositToVault({
        vaultId: vaultId, from: collateralAddress, amount: '1@BTC'
      })
      expect(typeof depositId).toStrictEqual('string')
      await tGroup.get(0).generate(1)
      await tGroup.waitForSync()
    }
  })

  it('should be able to depositToVault by anyone', async () => {
    // const vaultBefore = await tGroup.get(0).container.call('getvault', [vaultId])
    //
    // const vaultBeforeDFIAcc = vaultBefore.collateralAmounts.length > 0
    //   ? vaultBefore.collateralAmounts.find((amt: string) => amt.split('@')[1] === 'DFI')
    //   : undefined
    // const vaultBeforeDFIAmt = vaultBeforeDFIAcc !== undefined ? Number(vaultBeforeDFIAcc.split('@')[0]) : 0

    // test node1 deposits to vault
    const addr = await tGroup.get(1).generateAddress()
    await tGroup.get(1).token.dfi({ address: addr, amount: 100 })
    await tGroup.get(1).generate(1)
    const depositId = await tGroup.get(1).rpc.loan.depositToVault({
      vaultId: vaultId, from: addr, amount: '2@DFI'
    })
    expect(typeof depositId).toStrictEqual('string')
    await tGroup.get(1).generate(1)
    await tGroup.waitForSync()
    // const vaultAfter = await tGroup.get(0).container.call('getvault', [vaultId])

    // // compare colalteralAmounts
    // const vaultAfterDFIAcc = vaultAfter.collateralAmounts.find((amt: string) => amt.split('@')[1] === 'DFI')
    // const vaultAFterDFIAmt = Number(vaultAfterDFIAcc.split('@')[0])
    // expect(vaultAFterDFIAmt - vaultBeforeDFIAmt).toStrictEqual(2)
    //
    // // compare collateralValue
    // // calculate DFI collateral value with factor
    // const dfiDeposit = 2 * 1 * 1 // deposit 10000 DFI * priceFeed 1 USD * 1 factor
    // expect(vaultAfter.collateralValue - vaultBefore.collateralValue).toStrictEqual(dfiDeposit)
  })

  it('should depositToVault with utxos', async () => {
    // const utxo =
    await tGroup.get(0).container.fundAddress(collateralAddress, 250)
    // const depositId = await tGroup.get(0).rpc.loan.depositToVault({
    //   vaultId: vaultId, from: collateralAddress, amount: '250@DFI'
    // }, [utxo])
    // expect(typeof depositId).toStrictEqual('string')
    await tGroup.get(0).generate(1)
    await tGroup.waitForSync()
  })

  it('should not deposit to liquidated vault', async () => {
    const liqVault = await tGroup.get(0).container.call('getvault', [liqVaultId])
    expect(liqVault.isUnderLiquidation).toStrictEqual(true)

    const promise = tGroup.get(0).rpc.loan.depositToVault({
      vaultId: liqVaultId, from: collateralAddress, amount: '1000@DFI'
    })
    await expect(promise).rejects.toThrow(RpcApiError)
    await expect(promise).rejects.toThrow('Cannot deposit to vault under liquidation')
  })
})
