import BigNumber from 'bignumber.js'
import { DLoanController, DefidBin, DefidRpc, DefidRpcClient } from '../../e2e.defid.module'

let app: DefidBin
let rpc: DefidRpc
let client: DefidRpcClient
let controller: DLoanController

let vaultId1: string
let vaultId2: string
let vaultId3: string
let vaultId4: string

function now (): number {
  return Math.floor(new Date().getTime() / 1000)
}

beforeAll(async () => {
  app = new DefidBin()
  rpc = app.rpc
  client = app.rpcClient
  controller = app.ocean.loanController

  await app.start()
  await app.waitForWalletCoinbaseMaturity()

  const aliceColAddr = await rpc.generateAddress()
  await rpc.token.dfi({ address: aliceColAddr, amount: 300000 })
  await rpc.token.create({ symbol: 'BTC', collateralAddress: aliceColAddr })
  await rpc.generate(1)

  await rpc.token.mint({ symbol: 'BTC', amount: 100 })
  await rpc.generate(1)

  await client.loan.createLoanScheme({
    minColRatio: 100,
    interestRate: new BigNumber(1),
    id: 'default'
  })
  await rpc.generate(1)

  const addr = await rpc.generateAddress()
  const priceFeeds = [
    { token: 'DFI', currency: 'USD' },
    { token: 'BTC', currency: 'USD' },
    { token: 'DUSD', currency: 'USD' },
    { token: 'AAPL', currency: 'USD' },
    { token: 'TSLA', currency: 'USD' },
    { token: 'MSFT', currency: 'USD' },
    { token: 'FB', currency: 'USD' }
  ]
  const oracleId = await client.oracle.appointOracle(addr, priceFeeds, { weightage: 1 })
  await rpc.generate(1)

  await client.oracle.setOracleData(oracleId, now(), {
    prices: [
      { tokenAmount: '1@DFI', currency: 'USD' },
      { tokenAmount: '10000@BTC', currency: 'USD' },
      { tokenAmount: '1@DUSD', currency: 'USD' },
      { tokenAmount: '2@AAPL', currency: 'USD' },
      { tokenAmount: '2@TSLA', currency: 'USD' },
      { tokenAmount: '2@MSFT', currency: 'USD' },
      { tokenAmount: '2@FB', currency: 'USD' }
    ]
  })
  await rpc.generate(1)

  await client.loan.setCollateralToken({
    token: 'DFI',
    factor: new BigNumber(1),
    fixedIntervalPriceId: 'DFI/USD'
  })

  await client.loan.setCollateralToken({
    token: 'BTC',
    factor: new BigNumber(1),
    fixedIntervalPriceId: 'BTC/USD'
  })

  await client.loan.setLoanToken({
    symbol: 'DUSD',
    fixedIntervalPriceId: 'DUSD/USD'
  })

  await client.loan.setLoanToken({
    symbol: 'AAPL',
    fixedIntervalPriceId: 'AAPL/USD'
  })

  await client.loan.setLoanToken({
    symbol: 'TSLA',
    fixedIntervalPriceId: 'TSLA/USD'
  })

  await client.loan.setLoanToken({
    symbol: 'MSFT',
    fixedIntervalPriceId: 'MSFT/USD'
  })

  await client.loan.setLoanToken({
    symbol: 'FB',
    fixedIntervalPriceId: 'FB/USD'
  })
  await rpc.generate(1)

  const mVaultId = await client.vault.createVault({
    ownerAddress: await rpc.generateAddress(),
    loanSchemeId: 'default'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: mVaultId, from: aliceColAddr, amount: '100000@DFI'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: mVaultId, from: aliceColAddr, amount: '10@BTC'
  })
  await rpc.generate(1)

  await client.loan.takeLoan({
    vaultId: mVaultId,
    amounts: ['10000@AAPL', '10000@TSLA', '10000@MSFT', '10000@FB'],
    to: aliceColAddr
  })
  await rpc.generate(1)

  // Vault 1
  vaultId1 = await client.vault.createVault({
    ownerAddress: await rpc.generateAddress(),
    loanSchemeId: 'default'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: vaultId1, from: aliceColAddr, amount: '1000@DFI'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: vaultId1, from: aliceColAddr, amount: '0.05@BTC'
  })
  await rpc.generate(1)

  await client.loan.takeLoan({
    vaultId: vaultId1,
    amounts: '750@AAPL',
    to: aliceColAddr
  })
  await rpc.generate(1)

  // Vault 2
  vaultId2 = await client.vault.createVault({
    ownerAddress: await rpc.generateAddress(),
    loanSchemeId: 'default'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: vaultId2, from: aliceColAddr, amount: '2000@DFI'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: vaultId2, from: aliceColAddr, amount: '0.1@BTC'
  })
  await rpc.generate(1)

  await client.loan.takeLoan({
    vaultId: vaultId2,
    amounts: '1500@TSLA',
    to: aliceColAddr
  })
  await rpc.generate(1)

  // Vault 3
  vaultId3 = await client.vault.createVault({
    ownerAddress: await rpc.generateAddress(),
    loanSchemeId: 'default'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: vaultId3, from: aliceColAddr, amount: '3000@DFI'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: vaultId3, from: aliceColAddr, amount: '0.15@BTC'
  })
  await rpc.generate(1)

  await client.loan.takeLoan({
    vaultId: vaultId3,
    amounts: '2250@MSFT',
    to: aliceColAddr
  })
  await rpc.generate(1)

  // Vault 4
  vaultId4 = await client.vault.createVault({
    ownerAddress: await rpc.generateAddress(),
    loanSchemeId: 'default'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: vaultId4, from: aliceColAddr, amount: '4000@DFI'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: vaultId4, from: aliceColAddr, amount: '0.2@BTC'
  })
  await rpc.generate(1)

  await client.loan.takeLoan({
    vaultId: vaultId4,
    amounts: '3000@FB',
    to: aliceColAddr
  })
  await rpc.generate(1)

  const auctions = await client.vault.listAuctions()
  expect(auctions).toStrictEqual([])

  const vaults = await client.vault.listVaults()
  expect(vaults.every(v => v.state === 'active'))

  // Going to liquidate the vaults by price increase of the loan tokens
  await client.oracle.setOracleData(oracleId, now(), {
    prices: [
      { tokenAmount: '2.2@AAPL', currency: 'USD' },
      { tokenAmount: '2.2@TSLA', currency: 'USD' },
      { tokenAmount: '2.2@MSFT', currency: 'USD' },
      { tokenAmount: '2.2@FB', currency: 'USD' }
    ]
  })
  await app.waitForActivePrice('AAPL/USD', '2.2')
  await app.waitForActivePrice('TSLA/USD', '2.2')
  await app.waitForActivePrice('MSFT/USD', '2.2')
  await app.waitForActivePrice('FB/USD', '2.2')

  {
    const vaults = await client.vault.listVaults()
    expect(vaults.every(v => v.state === 'inLiquidation'))
  }

  const bobAddr = await rpc.generateAddress()
  const charlieAddr = await rpc.generateAddress()

  await client.wallet.sendToAddress(charlieAddr, 100)

  await client.account.accountToAccount(aliceColAddr, {
    [bobAddr]: '4000@AAPL',
    [charlieAddr]: '4000@AAPL'
  })
  await rpc.generate(1)

  await client.account.accountToAccount(aliceColAddr, {
    [bobAddr]: '4000@TSLA',
    [charlieAddr]: '4000@TSLA'
  })
  await rpc.generate(1)

  await client.account.accountToAccount(aliceColAddr, {
    [bobAddr]: '4000@MSFT',
    [charlieAddr]: '4000@MSFT'
  })
  await rpc.generate(1)

  // bid #1
  await client.vault.placeAuctionBid({
    vaultId: vaultId1,
    index: 0,
    from: bobAddr,
    amount: '800@AAPL'
  })
  await rpc.generate(1)

  await client.vault.placeAuctionBid({
    vaultId: vaultId1,
    index: 0,
    from: charlieAddr,
    amount: '900@AAPL'
  })
  await rpc.generate(1)

  // bid #2
  await client.vault.placeAuctionBid({
    vaultId: vaultId2,
    index: 0,
    from: bobAddr,
    amount: '2000@TSLA'
  })
  await rpc.generate(1)

  await client.vault.placeAuctionBid({
    vaultId: vaultId2,
    index: 0,
    from: aliceColAddr,
    amount: '2100@TSLA'
  })
  await rpc.generate(1)

  // bid #3
  await client.loan.placeAuctionBid({
    vaultId: vaultId3,
    index: 0,
    from: bobAddr,
    amount: '3000@MSFT'
  })
  await rpc.generate(1)

  await client.loan.placeAuctionBid({
    vaultId: vaultId3,
    index: 0,
    from: aliceColAddr,
    amount: '3100@MSFT'
  })
  await rpc.generate(1)

  await client.loan.placeAuctionBid({
    vaultId: vaultId3,
    index: 0,
    from: charlieAddr,
    amount: '3200@MSFT'
  })
  await rpc.generate(1)

  const height = await app.call('getblockcount')
  await app.waitForBlockHeight(height - 1)
})

afterAll(async () => {
  await app.stop()
})

describe('list', () => {
  it('should listAuctions', async () => {
    const result = await controller.listAuction({ size: 100 })
    expect(result.data.length).toStrictEqual(4)

    for (let i = 0; i < result.data.length; i += 1) {
      const auction = result.data[i]
      expect(auction).toStrictEqual({
        batchCount: expect.any(Number),
        batches: expect.any(Object),
        loanScheme: expect.any(Object),
        ownerAddress: expect.any(String),
        state: expect.any(String),
        liquidationHeight: expect.any(Number),
        liquidationPenalty: expect.any(Number),
        vaultId: expect.any(String)
      })

      for (let j = 0; j < auction.batches.length; j += 1) {
        const batch = auction.batches[j]
        expect(typeof batch.index).toBe('number')
        expect(typeof batch.collaterals).toBe('object')
        expect(typeof batch.loan).toBe('object')
        if (auction.vaultId === vaultId4) {
          expect(batch.froms.length).toStrictEqual(0)
        } else {
          expect(batch.froms.length).toBeGreaterThan(0)
          expect(batch.froms).toStrictEqual(
            expect.arrayContaining([expect.any(String)])
          )
        }
        expect(typeof batch.highestBid === 'object' || batch.highestBid === undefined).toBe(true)
      }
    }
  })

  it('should listAuctions with pagination', async () => {
    const first = await controller.listAuction({ size: 2 })
    expect(first.data.length).toStrictEqual(2)
    expect(first.page?.next).toStrictEqual(`${first.data[1].vaultId}${first.data[1].liquidationHeight}`)

    const next = await controller.listAuction({
      size: 2,
      next: first.page?.next
    })
    expect(next.data.length).toStrictEqual(2)
    expect(next.page?.next).toStrictEqual(`${next.data[1].vaultId}${next.data[1].liquidationHeight}`)

    const last = await controller.listAuction({
      size: 2,
      next: next.page?.next
    })
    expect(last.data.length).toStrictEqual(0)
    expect(last.page).toBeUndefined()
  })

  it('should listAuctions with an empty object if out of range', async () => {
    const result = await controller.listAuction({ size: 100, next: '51f6233c4403f6ce113bb4e90f83b176587f401081605b8a8bb723ff3b0ab5b6300' })

    expect(result.data.length).toStrictEqual(0)
    expect(result.page).toBeUndefined()
  })
})
