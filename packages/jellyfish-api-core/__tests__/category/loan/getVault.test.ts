import { LoanMasterNodeRegTestContainer } from './loan_container'
import { Testing } from '@defichain/jellyfish-testing'
import BigNumber from 'bignumber.js'

describe('Loan getVault', () => {
  const container = new LoanMasterNodeRegTestContainer()
  const testing = Testing.create(container)
  let collateralAddress: string

  beforeAll(async () => {
    await testing.container.start()
    await testing.container.waitForWalletCoinbaseMaturity()
    collateralAddress = await testing.generateAddress()
    await testing.token.dfi({ address: collateralAddress, amount: 20000 })
    await testing.token.create({ symbol: 'BTC', collateralAddress })
    await testing.generate(1)
    await testing.token.mint({ symbol: 'BTC', amount: 20000 })
    await testing.generate(1)

    // loan scheme
    await testing.container.call('createloanscheme', [100, 1, 'default'])
    await testing.generate(1)

    // price oracle
    const addr = await testing.generateAddress()
    const priceFeeds = [
      { token: 'DFI', currency: 'USD' },
      { token: 'BTC', currency: 'USD' },
      { token: 'TSLA', currency: 'USD' }
    ]
    const oracleId = await testing.rpc.oracle.appointOracle(addr, priceFeeds, { weightage: 1 })
    await testing.generate(1)
    const timestamp = Math.floor(new Date().getTime() / 1000)
    await testing.rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '1@DFI', currency: 'USD' }] })
    await testing.rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '10000@BTC', currency: 'USD' }] })
    await testing.rpc.oracle.setOracleData(oracleId, timestamp, { prices: [{ tokenAmount: '2@TSLA', currency: 'USD' }] })

    // collateral tokens
    await testing.rpc.loan.setCollateralToken({
      token: 'DFI',
      factor: new BigNumber(1),
      priceFeedId: oracleId
      // activateAfterBlock: 130  // <- hit socket hang up
    })
    await testing.rpc.loan.setCollateralToken({
      token: 'BTC',
      factor: new BigNumber(0.5),
      priceFeedId: oracleId
    })
    await testing.generate(1)

    // loan token
    await testing.rpc.loan.setLoanToken({
      symbol: 'TSLA',
      priceFeedId: oracleId
    })
    await testing.generate(1)
  })

  afterAll(async () => {
    await testing.container.stop()
  })

  it('should getVault', async () => {
    const ownerAddress = await testing.generateAddress()
    const vaultId = await testing.rpc.container.call('createvault', [ownerAddress, 'default'])
    await container.generate(1)

    const data = await testing.rpc.loan.getVault(vaultId)
    expect(data).toStrictEqual({
      loanSchemeId: 'default', // Get default loan scheme
      ownerAddress: ownerAddress,
      isUnderLiquidation: false,
      collateralAmounts: [],
      loanAmount: [],
      collateralValue: expect.any(BigNumber),
      loanValue: expect.any(BigNumber),
      currentRatio: expect.any(BigNumber)
    })
  })

  it('should getVault with deposited collateral details', async () => {
    const ownerAddress = await testing.generateAddress()
    const vaultId = await testing.rpc.container.call('createvault', [ownerAddress, 'default'])
    await testing.generate(1)

    await testing.container.call('deposittovault', [vaultId, collateralAddress, '10000@DFI'])
    await testing.generate(1)
    await testing.container.call('deposittovault', [vaultId, collateralAddress, '1@BTC'])
    await testing.generate(1)

    const data = await testing.rpc.loan.getVault(vaultId)
    expect(data).toStrictEqual({
      loanSchemeId: 'default', // Get default loan scheme
      ownerAddress: ownerAddress,
      isUnderLiquidation: false,
      collateralAmounts: ['10000.00000000@DFI', '1.00000000@BTC'],
      loanAmount: [],
      // (10000 DFI * DFIUSD Price * DFI collaterization factor 1) + (1BTC * BTCUSD Price * BTC collaterization factor 0.5)
      collateralValue: new BigNumber(10000 * 1 * 1).plus(new BigNumber(1 * 10000 * 0.5)),
      loanValue: new BigNumber(0),
      currentRatio: new BigNumber(-1)
    })
  })

  it('should getVault with loan details', async () => {
    const ownerAddress = await testing.generateAddress()
    const vaultId = await testing.rpc.container.call('createvault', [ownerAddress, 'default'])
    await testing.generate(1)

    await testing.container.call('deposittovault', [vaultId, collateralAddress, '10000@DFI'])
    await testing.generate(1)
    await testing.container.call('deposittovault', [vaultId, collateralAddress, '1@BTC'])
    await testing.generate(1)

    // take loan
    await testing.container.call('takeloan', [{ vaultId: vaultId, amounts: '30@TSLA' }])
    await testing.generate(1)

    // interest info.
    const interestInfo: any = await testing.rpc.call('getinterest', ['default', 'TSLA'], 'bignumber')

    const data = await testing.rpc.loan.getVault(vaultId)
    expect(data).toStrictEqual({
      loanSchemeId: 'default', // Get default loan scheme
      ownerAddress: ownerAddress,
      isUnderLiquidation: false,
      collateralAmounts: ['10000.00000000@DFI', '1.00000000@BTC'],
      // 30 TSLA + (30 TSLA * total interest)
      loanAmount: [new BigNumber(30).plus(new BigNumber(30).multipliedBy(interestInfo[0].totalInterest)).toFixed(8) + '@TSLA'], // 30.00000570@TSLA
      // (10000 DFI * DFIUSD Price * DFI collaterization factor 1) + (1BTC * BTCUSD Price * BTC collaterization factor 0.5)
      collateralValue: new BigNumber(10000 * 1 * 1).plus(new BigNumber(1 * 10000 * 0.5)),
      // (30 TSLA + (30 TSLA * total interest)) * TSLAUSD Price
      loanValue: new BigNumber(30).plus(new BigNumber(30).multipliedBy(interestInfo[0].totalInterest)).multipliedBy(2),
      // lround ((collateral value / loan value) * 100)
      currentRatio: new BigNumber(data.collateralValue?.dividedBy(data.loanValue as BigNumber).multipliedBy(100).toFixed(0, 4) as string)
    })
  })

  it('should not getVault if vault id is invalid', async () => {
    // Pass non existing hex id
    const promise = testing.rpc.loan.getVault('2cca2e3be0504af2daac12255cb5a691447e0aa3c9ca9120fb634a96010d2b4f')
    await expect(promise).rejects.toThrow('RpcApiError: \'Vault <2cca2e3be0504af2daac12255cb5a691447e0aa3c9ca9120fb634a96010d2b4f> not found\', code: -20, method: getvault')

    // Pass non hex id
    const promise2 = testing.rpc.loan.getVault('INVALID_VAULT_ID')
    await expect(promise2).rejects.toThrow('RpcApiError: \'vaultId must be of length 64 (not 16, for \'INVALID_VAULT_ID\')\', code: -8, method: getvault')

    // Pass hex id with invalid length
    const promise3 = testing.rpc.loan.getVault(Buffer.from('INVALID_VAULT_ID').toString('hex'))
    await expect(promise3).rejects.toThrow('RpcApiError: \'vaultId must be of length 64 (not 32, for \'494e56414c49445f5641554c545f4944\')\', code: -8, method: getvault')
  })
})
