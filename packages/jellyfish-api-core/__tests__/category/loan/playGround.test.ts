import { LoanMasterNodeRegTestContainer } from './loan_container'
import BigNumber from 'bignumber.js'
import { Testing } from '@defichain/jellyfish-testing'
import { GenesisKeys } from '@defichain/testcontainers'

describe('Loan', () => {
  const container = new LoanMasterNodeRegTestContainer()
  const testing = Testing.create(container)

  beforeAll(async () => {
    await testing.container.start()
    await testing.container.waitForWalletCoinbaseMaturity()
  })

  afterAll(async () => {
    await testing.container.stop()
  })

  it('Should takeLoan', async () => {
    // Story > A guy has 10000 DFI and 100 BTC.
    // He want to borrow some TSLA
    // He choose a scheme that has @minColRatio and @interest and create a vault
    const minColRatio = 150 // Vault's minColRatio
    const interestRate = new BigNumber(3) // Vault's interest
    const DFIPrice = 1 // Current DFI Price
    const BTCPrice = 100 // Current BTC price
    const TSLAFirstPrice = 10 // First TSLA Price
    const TSLALatestPrice = 5000 // Latest TSLA Price (Set the value same with TSLAFirstPrice if you don't want trigger liquidation)
    const depositDFIAmount = 100 // How much DFI has He deposited to vault?, (Value must less than 10000, which is the DFI amount he has)
    const depositBTCAmount = 1 // How much BTC has He deposited to vault?, (Value must less than 100, which is the BTC amount he has)
    const borrowedTSLAAmount = 10 // How much TSLA that he wants to borrow?

    const genesisAddress = GenesisKeys[0].owner.address
    const otherAddress = await testing.generateAddress()

    // 1 - Create vault that tie to a loanScheme
    await testing.rpc.loan.createLoanScheme({
      minColRatio, // Affect the amount when you take loan
      interestRate,
      id: 'LOAN0001'
    })
    await testing.generate(1)

    const vaultId = await testing.rpc.loan.createVault({
      ownerAddress: otherAddress,
      loanSchemeId: 'LOAN0001'
    })
    await testing.generate(1)

    // 2 - Get DFI
    await container.call('utxostoaccount', [{ [genesisAddress]: '10000@DFI' }])
    await container.generate(1)

    // 3 - Get BTC Token (Create, mint)
    const metadata = {
      symbol: 'DBTC',
      name: 'BTC token',
      isDAT: true,
      collateralAddress: genesisAddress
    }
    await container.call('createtoken', [metadata])
    await container.generate(1)

    // Mint a BTC token
    await container.call('minttokens', ['100@DBTC'])
    await container.generate(1)

    // 4 - AppointOracle and setOracleData for Collateral Token = DFI, BTC and LoanToken = TSLA
    const priceFeeds = [
      { token: 'DFI', currency: 'USD' },
      { token: 'DBTC', currency: 'USD' },
      { token: 'TSLA', currency: 'USD' }
    ]

    const oracleId = await testing.rpc.oracle.appointOracle(otherAddress, priceFeeds, { weightage: 1 })
    await container.generate(1)

    const timestamp = Math.floor(new Date().getTime() / 1000)

    const prices1 = [{ tokenAmount: `${DFIPrice}@DFI`, currency: 'USD' }]
    await testing.rpc.oracle.setOracleData(oracleId, timestamp, { prices: prices1 })
    await container.generate(1)

    const prices2 = [{ tokenAmount: `${BTCPrice}@DBTC`, currency: 'USD' }]
    await testing.rpc.oracle.setOracleData(oracleId, timestamp, { prices: prices2 })
    await container.generate(1)

    const prices3 = [{ tokenAmount: `${TSLAFirstPrice}@TSLA`, currency: 'USD' }]
    await testing.rpc.oracle.setOracleData(oracleId, timestamp, { prices: prices3 })
    await container.generate(1)

    // 6 - setCollateralToken for DFI and DBTC
    await testing.rpc.loan.setCollateralToken({
      token: 'DFI',
      factor: new BigNumber(1),
      priceFeedId: oracleId
    })
    await container.generate(1)

    await testing.rpc.loan.setCollateralToken({
      token: 'DBTC',
      factor: new BigNumber(1),
      priceFeedId: oracleId
    })
    await container.generate(1)

    // 7 - setLoanToken for TSLA
    await testing.rpc.loan.setLoanToken({
      symbol: 'TSLA',
      priceFeedId: oracleId
    })
    await container.generate(1)

    // 8 - Deposit DFI and BTC to vault
    await testing.container.call('deposittovault', [vaultId, genesisAddress, `${depositDFIAmount}@DFI`])
    await container.generate(1)

    await testing.container.call('deposittovault', [vaultId, genesisAddress, `${depositBTCAmount}@DBTC`])
    await container.generate(1)

    // 9 - Take loan TSLA
    await testing.container.call('takeloan', [{ vaultId: vaultId, amounts: `${borrowedTSLAAmount}@TSLA` }])
    await container.generate(1)

    {
      const vault = await testing.container.call('getvault', [vaultId])
      console.log(vault)
    }

    {
      const auctionList = await testing.container.call('listauctions', [])
      console.log(JSON.stringify(auctionList)) // aution should be empty
    }

    // 10 - Trigger liquidation if TSLA price increase
    const prices4 = [{ tokenAmount: `${TSLALatestPrice}@TSLA`, currency: 'USD' }]
    await testing.rpc.oracle.setOracleData(oracleId, timestamp, { prices: prices4 })
    await container.generate(1)

    {
      const vault = await testing.container.call('getvault', [vaultId])
      console.log(vault)
    }

    {
      const auctionList = await testing.container.call('listauctions', [])
      console.log(JSON.stringify(auctionList))
    }
  })
})
