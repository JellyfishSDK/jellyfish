import BigNumber from 'bignumber.js'
import { DLoanController, DefidBin, DefidRpc, DefidRpcClient } from '../../e2e.defid.module'
import { VaultLiquidation } from '@defichain/jellyfish-api-core/dist/category/vault'
import { HexEncoder } from '../../module.model/_hex.encoder'

let app: DefidBin
let rpc: DefidRpc
let client: DefidRpcClient
let controller: DLoanController

let colAddr: string
let bobColAddr: string
let vaultId: string
let batch: number
let batch1: number

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

  colAddr = await rpc.generateAddress()
  bobColAddr = await rpc.generateAddress()
  await rpc.token.dfi({ address: colAddr, amount: 300000 })
  await rpc.token.create({ symbol: 'BTC', collateralAddress: colAddr })
  await rpc.generate(1)

  await rpc.token.mint({ symbol: 'BTC', amount: 50 })
  await rpc.generate(1)

  await app.sendTokensToAddress(colAddr, 25, 'BTC')
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
    { token: 'AAPL', currency: 'USD' },
    { token: 'TSLA', currency: 'USD' },
    { token: 'MSFT', currency: 'USD' }
  ]
  const oracleId = await client.oracle.appointOracle(addr, priceFeeds, { weightage: 1 })
  await rpc.generate(1)

  await client.oracle.setOracleData(oracleId, now(), {
    prices: [
      { tokenAmount: '1@DFI', currency: 'USD' },
      { tokenAmount: '10000@BTC', currency: 'USD' },
      { tokenAmount: '2@AAPL', currency: 'USD' },
      { tokenAmount: '2@TSLA', currency: 'USD' },
      { tokenAmount: '2@MSFT', currency: 'USD' }
    ]
  })
  await rpc.generate(1)

  await client.loan.setCollateralToken({
    token: 'DFI',
    factor: new BigNumber(1),
    fixedIntervalPriceId: 'DFI/USD'
  })
  await rpc.generate(1)

  await client.loan.setCollateralToken({
    token: 'BTC',
    factor: new BigNumber(1),
    fixedIntervalPriceId: 'BTC/USD'
  })
  await rpc.generate(1)

  await client.loan.setLoanToken({
    symbol: 'AAPL',
    fixedIntervalPriceId: 'AAPL/USD'
  })
  await rpc.generate(1)

  await client.loan.setLoanToken({
    symbol: 'TSLA',
    fixedIntervalPriceId: 'TSLA/USD'
  })
  await rpc.generate(1)

  await client.loan.setLoanToken({
    symbol: 'MSFT',
    fixedIntervalPriceId: 'MSFT/USD'
  })
  await rpc.generate(1)

  const mVaultId = await client.vault.createVault({
    ownerAddress: await rpc.generateAddress(),
    loanSchemeId: 'default'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: mVaultId, from: colAddr, amount: '200001@DFI'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: mVaultId, from: colAddr, amount: '20@BTC'
  })
  await rpc.generate(1)

  await client.loan.takeLoan({
    vaultId: mVaultId,
    amounts: ['60000@TSLA', '60000@AAPL', '60000@MSFT'],
    to: colAddr
  })
  await rpc.generate(1)

  await app.sendTokensToAddress(bobColAddr, 30000, 'TSLA')
  await app.sendTokensToAddress(bobColAddr, 30000, 'AAPL')
  await app.sendTokensToAddress(bobColAddr, 30000, 'MSFT')
  await rpc.generate(1)

  vaultId = await client.vault.createVault({
    ownerAddress: await rpc.generateAddress(),
    loanSchemeId: 'default'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: vaultId, from: colAddr, amount: '10001@DFI'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: vaultId, from: colAddr, amount: '1@BTC'
  })
  await rpc.generate(1)

  await client.loan.takeLoan({
    vaultId: vaultId,
    amounts: '7500@AAPL',
    to: colAddr
  })
  await rpc.generate(1)

  await client.loan.takeLoan({
    vaultId: vaultId,
    amounts: '2500@TSLA',
    to: colAddr
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
      { tokenAmount: '2.2@TSLA', currency: 'USD' }
    ]
  })
  await app.waitForActivePrice('AAPL/USD', '2.2')
  await app.waitForActivePrice('TSLA/USD', '2.2')
  await rpc.generate(13)

  {
    const vaults = await client.vault.listVaults()
    expect(vaults.every(v => v.state === 'inLiquidation'))
  }

  let vault = await rpc.client.vault.getVault(vaultId) as VaultLiquidation
  batch = vault.liquidationHeight

  // bid #1
  await client.vault.placeAuctionBid({
    vaultId: vaultId,
    index: 0,
    from: colAddr,
    amount: '5300@AAPL'
  })
  await rpc.generate(1)

  await client.vault.placeAuctionBid({
    vaultId: vaultId,
    index: 0,
    from: bobColAddr,
    amount: '5355@AAPL'
  })
  await rpc.generate(1)

  await client.vault.placeAuctionBid({
    vaultId: vaultId,
    index: 0,
    from: colAddr,
    amount: '5408.55@AAPL'
  })
  await rpc.generate(1)

  // bid #2
  await client.vault.placeAuctionBid({
    vaultId: vaultId,
    index: 1,
    from: colAddr,
    amount: '2700.00012@AAPL'
  })
  await rpc.generate(1)

  await client.vault.placeAuctionBid({
    vaultId: vaultId,
    index: 1,
    from: bobColAddr,
    amount: '2730@AAPL'
  })
  await rpc.generate(1)

  await client.vault.placeAuctionBid({
    vaultId: vaultId,
    index: 1,
    from: colAddr,
    amount: '2760.0666069@AAPL'
  })
  await rpc.generate(1)

  // bid #3
  await client.vault.placeAuctionBid({
    vaultId: vaultId,
    index: 2,
    from: colAddr,
    amount: '2625.01499422@TSLA'
  })
  await rpc.generate(1)

  await rpc.generate(40)

  await client.vault.depositToVault({
    vaultId: vaultId, from: colAddr, amount: '10001@DFI'
  })
  await rpc.generate(1)

  await client.vault.depositToVault({
    vaultId: vaultId, from: colAddr, amount: '1@BTC'
  })
  await rpc.generate(1)

  await client.loan.takeLoan({
    vaultId: vaultId,
    amounts: '10000@MSFT',
    to: colAddr
  })
  await rpc.generate(1)

  // liquidated #2
  await client.oracle.setOracleData(oracleId, now(), {
    prices: [
      { tokenAmount: '2.2@MSFT', currency: 'USD' }
    ]
  })
  await app.waitForActivePrice('MSFT/USD', '2.2')
  await rpc.generate(13)

  vault = await rpc.client.vault.getVault(vaultId) as VaultLiquidation
  batch1 = vault.liquidationHeight

  await client.vault.placeAuctionBid({
    vaultId: vaultId,
    index: 0,
    from: colAddr,
    amount: '5300.123@MSFT'
  })
  await rpc.generate(1)

  await client.vault.placeAuctionBid({
    vaultId: vaultId,
    index: 0,
    from: bobColAddr,
    amount: '5355.123@MSFT'
  })
  await rpc.generate(1)

  const height = await app.call('getblockcount')
  await app.waitForBlockHeight(height - 1)
})

afterAll(async () => {
  await app.stop()
})

it('should listVaultAuctionHistory', async () => {
  {
    const list = await controller.listVaultAuctionHistory(vaultId, batch, '0', { size: 30 })
    expect(list.data.length).toStrictEqual(3)
    expect(list.data).toStrictEqual([
      {
        id: expect.any(String),
        key: `${vaultId}-0`,
        sort: `${HexEncoder.encodeHeight(list.data[0].block.height)}-${list.data[0].id.split('-')[2]}`,
        vaultId: vaultId,
        index: 0,
        from: expect.any(String),
        address: colAddr,
        amount: '5408.55',
        tokenId: 2,
        block: expect.any(Object)
      },
      {
        id: expect.any(String),
        key: `${vaultId}-0`,
        sort: `${HexEncoder.encodeHeight(list.data[1].block.height)}-${list.data[1].id.split('-')[2]}`,
        vaultId: vaultId,
        index: 0,
        from: expect.any(String),
        address: bobColAddr,
        amount: '5355',
        tokenId: 2,
        block: expect.any(Object)
      },
      {
        id: expect.any(String),
        key: `${vaultId}-0`,
        sort: `${HexEncoder.encodeHeight(list.data[2].block.height)}-${list.data[2].id.split('-')[2]}`,
        vaultId: vaultId,
        index: 0,
        from: expect.any(String),
        address: colAddr,
        amount: '5300',
        tokenId: 2,
        block: expect.any(Object)
      }
    ])
  }

  {
    const list = await controller.listVaultAuctionHistory(vaultId, batch1, '0', { size: 30 })
    expect(list.data.length).toStrictEqual(2)
    expect(list.data).toStrictEqual([
      {
        id: expect.any(String),
        key: `${vaultId}-0`,
        sort: `${HexEncoder.encodeHeight(list.data[0].block.height)}-${list.data[0].id.split('-')[2]}`,
        vaultId: vaultId,
        index: 0,
        from: expect.any(String),
        address: bobColAddr,
        amount: '5355.123',
        tokenId: 4,
        block: expect.any(Object)
      },
      {
        id: expect.any(String),
        key: `${vaultId}-0`,
        sort: `${HexEncoder.encodeHeight(list.data[1].block.height)}-${list.data[1].id.split('-')[2]}`,
        vaultId: vaultId,
        index: 0,
        from: expect.any(String),
        address: colAddr,
        amount: '5300.123',
        tokenId: 4,
        block: expect.any(Object)
      }
    ])
  }
})

it('should listVaultAuctionHistory with pagination', async () => {
  const first = await controller.listVaultAuctionHistory(vaultId, batch, '0', { size: 1 })
  expect(first.data.length).toStrictEqual(1)
  expect(first.data).toStrictEqual([
    {
      id: expect.any(String),
      key: `${vaultId}-0`,
      sort: `${HexEncoder.encodeHeight(first.data[0].block.height)}-${first.data[0].id.split('-')[2]}`,
      vaultId: vaultId,
      index: 0,
      from: expect.any(String),
      address: colAddr,
      amount: '5408.55',
      tokenId: 2,
      block: expect.any(Object)
    }
  ])
  expect(first.page).toStrictEqual({ next: first.data[0].sort })

  const next = await controller.listVaultAuctionHistory(vaultId, batch, '0', { size: 1, next: first?.page?.next })
  expect(next.data).toStrictEqual([
    {
      id: expect.any(String),
      key: `${vaultId}-0`,
      sort: `${HexEncoder.encodeHeight(next.data[0].block.height)}-${next.data[0].id.split('-')[2]}`,
      vaultId: vaultId,
      index: 0,
      from: expect.any(String),
      address: bobColAddr,
      amount: '5355',
      tokenId: 2,
      block: expect.any(Object)
    }
  ])
  expect(next.page).toStrictEqual({ next: next.data[0].sort })

  const last = await controller.listVaultAuctionHistory(vaultId, batch, '0', { size: 2, next: next?.page?.next })
  expect(last.data).toStrictEqual([
    {
      id: expect.any(String),
      key: `${vaultId}-0`,
      sort: `${HexEncoder.encodeHeight(last.data[0].block.height)}-${last.data[0].id.split('-')[2]}`,
      vaultId: vaultId,
      index: 0,
      from: expect.any(String),
      address: colAddr,
      amount: '5300',
      tokenId: 2,
      block: expect.any(Object)
    }
  ])
  expect(last.page).toStrictEqual(undefined)
})
