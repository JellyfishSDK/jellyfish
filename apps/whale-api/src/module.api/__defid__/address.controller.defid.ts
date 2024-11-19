import { WIF } from '@defichain/jellyfish-crypto'
import { ForbiddenException } from '@nestjs/common'
import BigNumber from 'bignumber.js'
import { RegTestFoundationKeys } from '@defichain/jellyfish-network'
import { DAddressController, DefidBin, DefidRpc } from '../../e2e.defid.module'
import { WhaleApiException } from '@defichain/whale-api-client/dist/errors'

let testing: DefidRpc
let app: DefidBin
let controller: DAddressController

let colAddr: string
let usdcAddr: string
let poolAddr: string
let emptyAddr: string
let dfiUsdc

async function setup (app: DefidBin, testing: DefidRpc): Promise<void> {
  colAddr = await testing.generateAddress()
  usdcAddr = await testing.generateAddress()
  poolAddr = await testing.generateAddress()
  emptyAddr = await testing.generateAddress()

  await testing.token.dfi({
    address: colAddr,
    amount: 20000
  })
  await testing.generate(1)

  await testing.token.create({
    symbol: 'USDC',
    collateralAddress: colAddr
  })
  await testing.generate(1)

  await testing.token.mint({
    symbol: 'USDC',
    amount: 10000
  })
  await testing.generate(1)

  await testing.client.account.accountToAccount(colAddr, { [usdcAddr]: '10000@USDC' })
  await testing.generate(1)

  await testing.client.poolpair.createPoolPair({
    tokenA: 'DFI',
    tokenB: 'USDC',
    commission: 0,
    status: true,
    ownerAddress: poolAddr
  })
  await testing.generate(1)

  const poolPairsKeys = Object.keys(await testing.client.poolpair.listPoolPairs())
  expect(poolPairsKeys.length).toStrictEqual(1)
  dfiUsdc = poolPairsKeys[0]

  // set LP_SPLIT, make LM gain rewards, MANDATORY
  // ensure `no_rewards` flag turned on
  // ensure do not get response without txid
  await app.call('setgov', [{ LP_SPLITS: { [dfiUsdc]: 1.0 } }])
  await testing.generate(1)

  await testing.client.poolpair.addPoolLiquidity({
    [colAddr]: '5000@DFI',
    [usdcAddr]: '5000@USDC'
  }, poolAddr)
  await testing.generate(1)

  await testing.client.poolpair.poolSwap({
    from: colAddr,
    tokenFrom: 'DFI',
    amountFrom: 555,
    to: usdcAddr,
    tokenTo: 'USDC'
  })
  await testing.generate(1)

  await testing.client.poolpair.removePoolLiquidity(poolAddr, '2@DFI-USDC')
  await testing.generate(1)

  // for testing same block pagination
  await testing.token.create({
    symbol: 'APE',
    collateralAddress: colAddr
  })
  await testing.generate(1)

  await testing.token.create({
    symbol: 'CAT',
    collateralAddress: colAddr
  })
  await testing.token.create({
    symbol: 'DOG',
    collateralAddress: colAddr
  })
  await testing.generate(1)

  await testing.token.create({
    symbol: 'ELF',
    collateralAddress: colAddr
  })
  await testing.token.create({
    symbol: 'FOX',
    collateralAddress: colAddr
  })
  await testing.token.create({
    symbol: 'RAT',
    collateralAddress: colAddr
  })
  await testing.token.create({
    symbol: 'BEE',
    collateralAddress: colAddr
  })
  await testing.token.create({
    symbol: 'COW',
    collateralAddress: colAddr
  })
  await testing.token.create({
    symbol: 'OWL',
    collateralAddress: colAddr
  })
  await testing.token.create({
    symbol: 'ELK',
    collateralAddress: colAddr
  })
  await testing.generate(1)

  await testing.token.create({
    symbol: 'PIG',
    collateralAddress: colAddr
  })
  await testing.token.create({
    symbol: 'KOI',
    collateralAddress: colAddr
  })
  await testing.token.create({
    symbol: 'FLY',
    collateralAddress: colAddr
  })
  await testing.generate(1)

  await testing.generate(1)

  // to test rewards listing (only needed if `no_rewards` flag disabled)
  // const height = await testing.container.getBlockCount()
  // await testing.container.waitForBlockHeight(Math.max(500, height))
}

// not being used
describe.skip('listAccountHistory', () => {
  beforeAll(async () => {
    app = new DefidBin()
    await app.start()
    controller = app.ocean.addressController
    testing = app.rpc
    await app.waitForWalletCoinbaseMaturity()
    await app.waitForWalletBalanceGTE(100)

    await setup(app, testing)
  })

  afterAll(async () => {
    await app.stop()
  })

  it('should not listAccountHistory with mine filter', async () => {
    const promise = controller.listAccountHistory('mine', { size: 30 })
    await expect(promise).rejects.toThrow(ForbiddenException)
    await expect(promise).rejects.toThrow('mine is not allowed')
  })

  it('should list empty account history', async () => {
    const history = await controller.listAccountHistory(emptyAddr, { size: 30 })
    expect(history.data.length).toStrictEqual(0)
  })

  it('should list account history without rewards', async () => {
    const history = await controller.listAccountHistory(poolAddr, { size: 30 })
    expect(history.data.length).toStrictEqual(4)
    expect(history.data.every(history => !(['Rewards', 'Commission'].includes(history.type))))
  })

  // skip test, API currently no included rewards (missing txid/txn will crash query with `next`)
  // rewards listing requires extra implementation for pagination
  it.skip('should list account history include rewards', async () => {
    // benchmarking `listaccounthistory` with `no_rewards` false
    // generate couple hundred blocks to check RPC resource impact

    let page = 0
    let next: string | undefined

    while (page >= 0) {
      console.log('benchmarking, page: ', page)
      console.time('listrewards')
      const history = await controller.listAccountHistory(poolAddr, {
        size: 30,
        next
      })
      console.timeEnd('listrewards')

      if (history.page?.next === undefined) {
        page = -1
      } else {
        page += 1
        next = history.page.next
      }
    }
  })

  it('should listAccountHistory', async () => {
    const history = await controller.listAccountHistory(colAddr, { size: 30 })
    expect(history.data.length).toStrictEqual(30)
    for (let i = 0; i < history.data.length; i += 1) {
      const accountHistory = history.data[i]
      expect(typeof accountHistory.owner).toStrictEqual('string')
      expect(typeof accountHistory.block.height).toStrictEqual('number')
      expect(typeof accountHistory.block.hash).toStrictEqual('string')
      expect(typeof accountHistory.block.time).toStrictEqual('number')
      expect(typeof accountHistory.type).toStrictEqual('string')
      expect(typeof accountHistory.txn).toStrictEqual('number')
      expect(typeof accountHistory.txid).toStrictEqual('string')
      expect(accountHistory.amounts.length).toBeGreaterThan(0)
      expect(typeof accountHistory.amounts[0]).toStrictEqual('string')
    }
  })

  it('should listAccountHistory with size', async () => {
    const history = await controller.listAccountHistory(colAddr, { size: 10 })
    expect(history.data.length).toStrictEqual(10)
  })

  it('test listAccountHistory pagination', async () => {
    const full = await controller.listAccountHistory(colAddr, { size: 12 })

    const first = await controller.listAccountHistory(colAddr, { size: 3 })
    expect(first.data[0]).toStrictEqual(full.data[0])
    expect(first.data[1]).toStrictEqual(full.data[1])
    expect(first.data[2]).toStrictEqual(full.data[2])

    const firstLast = first.data[first.data.length - 1]
    const secondToken = `${firstLast.txid}-${firstLast.type}-${firstLast.block.height}`
    const second = await controller.listAccountHistory(colAddr, {
      size: 3,
      next: secondToken
    })
    expect(second.data[0]).toStrictEqual(full.data[3])
    expect(second.data[1]).toStrictEqual(full.data[4])
    expect(second.data[2]).toStrictEqual(full.data[5])

    const secondLast = second.data[second.data.length - 1]
    const thirdToken = `${secondLast.txid}-${secondLast.type}-${secondLast.block.height}`
    const third = await controller.listAccountHistory(colAddr, {
      size: 3,
      next: thirdToken
    })
    expect(third.data[0]).toStrictEqual(full.data[6])
    expect(third.data[1]).toStrictEqual(full.data[7])
    expect(third.data[2]).toStrictEqual(full.data[8])

    const thirdLast = third.data[third.data.length - 1]
    const forthToken = `${thirdLast.txid}-${thirdLast.type}-${thirdLast.block.height}`
    const forth = await controller.listAccountHistory(colAddr, {
      size: 3,
      next: forthToken
    })
    expect(forth.data[0]).toStrictEqual(full.data[9])
    expect(forth.data[1]).toStrictEqual(full.data[10])
    expect(forth.data[2]).toStrictEqual(full.data[11])
  })
})

describe('getAccountHistory', () => {
  beforeAll(async () => {
    app = new DefidBin()
    await app.start()
    controller = app.ocean.addressController
    testing = app.rpc

    await app.waitForWalletCoinbaseMaturity()

    await setup(app, testing)
  })

  afterAll(async () => {
    await app.stop()
  })

  it('should getAccountHistory', async () => {
    const history = await app.rpcClient.account.listAccountHistory(colAddr)
    for (const h of history) {
      if (['sent', 'receive'].includes(h.type)) {
        continue
      }
      const acc = await controller.getAccountHistory(colAddr, h.blockHeight, h.txn)
      expect(acc?.owner).toStrictEqual(h.owner)
      expect(acc?.txid).toStrictEqual(h.txid)
      expect(acc?.txn).toStrictEqual(h.txn)
    }

    const poolHistory = await app.rpcClient.account.listAccountHistory(poolAddr)
    for (const h of poolHistory) {
      if (['sent', 'receive', 'Rewards'].includes(h.type)) {
        continue
      }
      const acc = await controller.getAccountHistory(poolAddr, h.blockHeight, h.txn)
      expect(acc?.owner).toStrictEqual(h.owner)
      expect(acc?.txid).toStrictEqual(h.txid)
      expect(acc?.txn).toStrictEqual(h.txn)
    }
  })

  it('should be failed for non-existence data', async () => {
    const addr = await app.getNewAddress()
    try {
      await controller.getAccountHistory(addr, Number(`${'0'.repeat(64)}`), 1)
    } catch (err: any) {
      expect(err).toBeInstanceOf(WhaleApiException)
      expect(err.error).toStrictEqual({
        at: expect.any(Number),
        code: 500,
        message: 'Record not found',
        type: 'Unknown',
        url: `/v0/regtest/address/${addr}/history/0/1`
      })
    }
  })

  it('should be failed as invalid height', async () => {
    { // NaN
      const addr = await app.getNewAddress()
      try {
        await controller.getAccountHistory(addr, Number('NotANumber'), 1)
      } catch (err: any) {
        expect(err.error).toStrictEqual({
          at: expect.any(Number),
          code: 400,
          message: 'key: height, Cannot parse `height` with value `"NaN"` to a `u32`', // JSON value is not an integer as expected
          type: 'BadRequest',
          url: `/${addr}/history/NaN/1`
        })
      }
    }

    { // negative height
      const addr = await app.getNewAddress()
      try {
        await controller.getAccountHistory(addr, -1, 1)
      } catch (err: any) {
        expect(err.error).toStrictEqual({
          at: expect.any(Number),
          code: 400,
          message: 'key: height, Cannot parse `height` with value `"-1"` to a `u32`', // Record not found
          type: 'BadRequest',
          url: `/${addr}/history/-1/1`
        })
      }
    }
  })

  it('should be failed as getting unsupport tx type - sent, received, blockReward', async () => {
    const history = await app.rpcClient.account.listAccountHistory(colAddr)
    for (const h of history) {
      if (['sent', 'receive'].includes(h.type)) {
        try {
          await controller.getAccountHistory(colAddr, h.blockHeight, h.txn)
        } catch (err: any) {
          expect(err.error).toStrictEqual({
            at: expect.any(Number),
            code: 500,
            message: 'Record not found',
            type: 'Unknown',
            url: expect.any(String)
          })
        }
      }
    }

    // TOOD(): retrieve empty
    const operatorAccHistory = await app.call('listaccounthistory', [RegTestFoundationKeys[1].operator.address])
    for (const h of operatorAccHistory) {
      if (['blockReward'].includes(h.type)) {
        try {
          const res = await controller.getAccountHistory(RegTestFoundationKeys[1].operator.address, h.blockHeight, h.txn)
          console.log('res 4: ', res)
        } catch (err) {
          console.log('err4: ', err)
        }
        // await expect(promise).rejects.toThrow('Record not found')
      }
    }
  })
})

describe('getBalance', () => {
  beforeAll(async () => {
    app = new DefidBin()
    await app.start()
    controller = app.ocean.addressController

    await app.waitForBlockHeight(100)
  })

  afterAll(async () => {
    await app.stop()
  })

  it('getBalance should be zero', async () => {
    const address = await app.getNewAddress()
    const balance = await controller.getBalance(address)
    expect(balance).toStrictEqual('0.00000000')
  })

  it('should getBalance non zero with bech32 address', async () => {
    const address = 'bcrt1qf5v8n3kfe6v5mharuvj0qnr7g74xnu9leut39r'

    await app.fundAddress(address, 1.23)
    await app.waitForAddressTxCount(controller, address, 1)

    const balance = await controller.getBalance(address)
    expect(balance).toStrictEqual('1.23000000')
  })

  it('should getBalance non zero with legacy address', async () => {
    const address = await app.getNewAddress('', 'legacy')

    await app.fundAddress(address, 0.00100000)
    await app.waitForAddressTxCount(controller, address, 1)

    const balance = await controller.getBalance(address)
    expect(balance).toStrictEqual('0.00100000')
  })

  it('should getBalance non zero with p2sh-segwit address', async () => {
    const address = await app.getNewAddress('', 'p2sh-segwit')

    await app.fundAddress(address, 10.99999999)
    await app.waitForAddressTxCount(controller, address, 1)

    const balance = await controller.getBalance(address)
    expect(balance).toStrictEqual('10.99999999')
  })

  it('should throw error if getBalance with invalid address', async () => {
    await expect(controller.getBalance('invalid')).rejects.toThrow('InvalidDefiAddress')
  })

  it('should sum getBalance', async () => {
    const address = 'bcrt1qeq2g82kj99mqfvnwc2g5w0azzd298q0t84tc6s'

    await app.fundAddress(address, 0.12340001)
    await app.fundAddress(address, 4.32412313)
    await app.fundAddress(address, 12.93719381)
    await app.waitForAddressTxCount(controller, address, 3)

    const balance = await controller.getBalance(address)
    expect(balance).toStrictEqual('17.38471695')
  })
})

describe('getAggregation', () => {
  beforeAll(async () => {
    app = new DefidBin()
    await app.start()
    controller = app.ocean.addressController
    testing = app.rpc
    await app.waitForWalletCoinbaseMaturity()
    await app.waitForWalletBalanceGTE(100)

    await app.waitForBlockHeight(100)
  })

  afterAll(async () => {
    await app.stop()
  })

  it('should aggregate 3 txn', async () => {
    const address = 'bcrt1qxvvp3tz5u8t90nwwjzsalha66zk9em95tgn3fk'

    await app.fundAddress(address, 0.12340001)
    await app.fundAddress(address, 4.32412313)
    await app.fundAddress(address, 12.93719381)
    await app.waitForAddressTxCount(controller, address, 3)

    const agg = await controller.getAggregation(address)
    expect(agg).toStrictEqual({
      amount: {
        txIn: '17.38471695',
        txOut: '0.00000000',
        unspent: '17.38471695'
      },
      block: {
        hash: expect.stringMatching(/[0-f]{64}/),
        height: expect.any(Number),
        time: expect.any(Number),
        medianTime: expect.any(Number)
      },
      hid: expect.stringMatching(/[0-f]{64}/),
      id: expect.stringMatching(/[0-f]{72}/),
      script: {
        hex: '0014331818ac54e1d657cdce90a1dfdfbad0ac5cecb4',
        type: 'witness_v0_keyhash'
      },
      statistic: {
        txCount: 3,
        txInCount: 3,
        txOutCount: 0
      }
    })
  })

  it('should throw error if getAggregation with invalid address', async () => {
    await expect(controller.getAggregation('invalid')).rejects.toThrow('InvalidDefiAddress')
  })
})

describe('listTransactions', () => {
  beforeAll(async () => {
    app = new DefidBin()
    await app.start()
    controller = app.ocean.addressController
    testing = app.rpc
    await app.waitForWalletCoinbaseMaturity()
    await app.waitForWalletBalanceGTE(100)

    await app.waitForBlockHeight(100)

    await app.fundAddress(addressA.bech32, 34)
    await app.fundAddress(addressA.bech32, 0.12340001)
    await app.fundAddress(addressA.bech32, 1.32412313)
    await app.fundAddress(addressA.bech32, 2.93719381)

    await app.call('sendrawtransaction', [
      // This create vin & vout with 9.5
      await app.createSignedTxnHex(9.5, 9.4999, options)
    ])
    await app.call('sendrawtransaction', [
      // This create vin & vout with 1.123
      await app.createSignedTxnHex(1.123, 1.1228, options)
    ])
    await app.generate(1)
    await app.waitForAddressTxCount(controller, addressB.bech32, 2)
  })

  afterAll(async () => {
    await app.stop()
  })

  const addressA = {
    bech32: 'bcrt1qykj5fsrne09yazx4n72ue4fwtpx8u65zac9zhn',
    privKey: 'cQSsfYvYkK5tx3u1ByK2ywTTc9xJrREc1dd67ZrJqJUEMwgktPWN'
  }
  const addressB = {
    bech32: 'bcrt1qf26rj8895uewxcfeuukhng5wqxmmpqp555z5a7',
    privKey: 'cQbfHFbdJNhg3UGaBczir2m5D4hiFRVRKgoU8GJoxmu2gEhzqHtV'
  }
  const options = {
    aEllipticPair: WIF.asEllipticPair(addressA.privKey),
    bEllipticPair: WIF.asEllipticPair(addressB.privKey)
  }

  it('(addressA) should listTransactions', async () => {
    const response = await controller.listTransactions(addressA.bech32, {
      size: 30
    })

    expect(response.data.length).toStrictEqual(8)
    expect(response.page).toBeUndefined()

    expect(response.data[5]).toStrictEqual({
      block: {
        hash: expect.stringMatching(/[0-f]{64}/),
        height: expect.any(Number),
        time: expect.any(Number),
        medianTime: expect.any(Number)
      },
      hid: expect.stringMatching(/[0-f]{64}/),
      id: expect.stringMatching(/[0-f]{72}/),
      script: {
        hex: '001425a544c073cbca4e88d59f95ccd52e584c7e6a82',
        type: 'witness_v0_keyhash'
      },
      tokenId: 0,
      txid: expect.stringMatching(/[0-f]{64}/),
      type: 'vout',
      typeHex: '01',
      value: '1.32412313',
      vout: {
        n: expect.any(Number),
        txid: expect.stringMatching(/[0-f]{64}/)
      }
    })
  })

  it('(addressA) should listTransactions with pagination', async () => {
    const first = await controller.listTransactions(addressA.bech32, {
      size: 2
    })
    expect(first.data.length).toStrictEqual(2)
    expect(first.page?.next).toMatch(/[0-f]{82}/)
    expect(first.data[0].value).toStrictEqual('1.12300000')
    expect(first.data[0].type).toStrictEqual('vin')
    expect(first.data[1].value).toStrictEqual('1.12300000')
    expect(first.data[1].type).toStrictEqual('vout')

    const next = await controller.listTransactions(addressA.bech32, {
      size: 10,
      next: first.page?.next
    })

    expect(next.data.length).toStrictEqual(6)
    expect(next.page?.next).toBeUndefined()
    expect(next.data[0].value).toStrictEqual('9.50000000')
    expect(next.data[0].type).toStrictEqual('vin')
    expect(next.data[1].value).toStrictEqual('9.50000000')
    expect(next.data[1].type).toStrictEqual('vout')
    expect(next.data[2].value).toStrictEqual('2.93719381')
    expect(next.data[2].type).toStrictEqual('vout')
    expect(next.data[3].value).toStrictEqual('1.32412313')
    expect(next.data[3].type).toStrictEqual('vout')
    expect(next.data[4].value).toStrictEqual('0.12340001')
    expect(next.data[4].type).toStrictEqual('vout')
    expect(next.data[5].value).toStrictEqual('34.00000000')
    expect(next.data[5].type).toStrictEqual('vout')
  })

  it('should throw error if listTransactions with invalid address', async () => {
    await expect(controller.listTransactions('invalid', { size: 30 }))
      .rejects.toThrow('InvalidDefiAddress')
  })

  it('(addressB) should listTransactions', async () => {
    const response = await controller.listTransactions(addressB.bech32, {
      size: 30
    })

    expect(response.data.length).toStrictEqual(2)
    expect(response.page).toBeUndefined()

    expect(response.data[1]).toStrictEqual({
      block: {
        hash: expect.stringMatching(/[0-f]{64}/),
        height: expect.any(Number),
        time: expect.any(Number),
        medianTime: expect.any(Number)
      },
      hid: expect.stringMatching(/[0-f]{64}/),
      id: expect.stringMatching(/[0-f]{72}/),
      script: {
        hex: '00144ab4391ce5a732e36139e72d79a28e01b7b08034',
        type: 'witness_v0_keyhash'
      },
      tokenId: 0,
      txid: expect.stringMatching(/[0-f]{64}/),
      type: 'vout',
      typeHex: '01',
      value: '9.49990000',
      vout: {
        n: 0,
        txid: expect.stringMatching(/[0-f]{64}/)
      }
    })
  })

  it('(addressA) should listTransactions with undefined next pagination', async () => {
    const first = await controller.listTransactions(addressA.bech32, {
      size: 2,
      next: undefined
    })

    expect(first.data.length).toStrictEqual(2)
    expect(first.page?.next).toMatch(/[0-f]{82}/)
  })
})

describe('listTransactionsUnspent', () => {
  beforeAll(async () => {
    app = new DefidBin()
    await app.start()
    controller = app.ocean.addressController
    testing = app.rpc
    await app.waitForWalletCoinbaseMaturity()
    await app.waitForWalletBalanceGTE(100)

    await app.waitForBlockHeight(100)

    await app.fundAddress(addressA.bech32, 34)
    await app.fundAddress(addressA.bech32, 0.12340001)
    await app.fundAddress(addressA.bech32, 1.32412313)
    await app.fundAddress(addressA.bech32, 2.93719381)

    await app.call('sendrawtransaction', [
      // This create vin & vout with 9.5
      await app.createSignedTxnHex(9.5, 9.4999, options)
    ])
    await app.call('sendrawtransaction', [
      // This create vin & vout with 1.123
      await app.createSignedTxnHex(1.123, 1.1228, options)
    ])
    await app.generate(1)
    await app.waitForAddressTxCount(controller, addressB.bech32, 2)
  })

  afterAll(async () => {
    await app.stop()
  })

  const addressA = {
    bech32: 'bcrt1qykj5fsrne09yazx4n72ue4fwtpx8u65zac9zhn',
    privKey: 'cQSsfYvYkK5tx3u1ByK2ywTTc9xJrREc1dd67ZrJqJUEMwgktPWN'
  }
  const addressB = {
    bech32: 'bcrt1qf26rj8895uewxcfeuukhng5wqxmmpqp555z5a7',
    privKey: 'cQbfHFbdJNhg3UGaBczir2m5D4hiFRVRKgoU8GJoxmu2gEhzqHtV'
  }
  const addressC = {
    bech32: 'bcrt1qyf5c9593u8v5s7exh3mfndw28k6sz84788tlze',
    privKey: 'cPEKnsDLWGQXyFEaYxkcgwLddd7tGdJ2vZdEiFTzxMrY5dAMPKH1'
  }
  const options = {
    aEllipticPair: WIF.asEllipticPair(addressC.privKey),
    bEllipticPair: WIF.asEllipticPair(addressB.privKey)
  }

  it('(addressA) should listTransactionsUnspent', async () => {
    const response = await controller.listTransactionsUnspent(addressA.bech32, {
      size: 30
    })

    expect(response.data.length).toStrictEqual(4)
    expect(response.page).toBeUndefined()

    expect(response.data[3]).toStrictEqual({
      block: {
        hash: expect.stringMatching(/[0-f]{64}/),
        height: expect.any(Number),
        time: expect.any(Number),
        medianTime: expect.any(Number)
      },
      hid: expect.stringMatching(/[0-f]{64}/),
      id: expect.stringMatching(/[0-f]{72}/),
      script: {
        hex: '001425a544c073cbca4e88d59f95ccd52e584c7e6a82',
        type: 'witness_v0_keyhash'
      },
      sort: expect.stringMatching(/[0-f]{80}/),
      vout: {
        n: expect.any(Number),
        tokenId: 0,
        txid: expect.stringMatching(/[0-f]{64}/),
        value: '2.93719381'
      }
    })
  })

  it('(addressA) should listTransactionsUnspent with pagination', async () => {
    const first = await controller.listTransactionsUnspent(addressA.bech32, {
      size: 2
    })
    expect(first.data.length).toStrictEqual(2)
    expect(first.page?.next).toMatch(/[0-f]{72}/)
    expect(first.data[0].vout.value).toStrictEqual('34.00000000')
    expect(first.data[1].vout.value).toStrictEqual('0.12340001')

    const next = await controller.listTransactionsUnspent(addressA.bech32, {
      size: 10,
      next: first.page?.next
    })

    expect(next.data.length).toStrictEqual(2)
    expect(next.page?.next).toBeUndefined()
    expect(next.data[0].vout.value).toStrictEqual('1.32412313')
    expect(next.data[1].vout.value).toStrictEqual('2.93719381')
  })
  it('(addressB) should listTransactionsUnspent', async () => {
    const response = await controller.listTransactionsUnspent(addressB.bech32, {
      size: 30
    })

    expect(response.data.length).toStrictEqual(2)
    expect(response.page).toBeUndefined()

    expect(response.data[1]).toStrictEqual({
      block: {
        hash: expect.stringMatching(/[0-f]{64}/),
        height: expect.any(Number),
        time: expect.any(Number),
        medianTime: expect.any(Number)
      },
      hid: expect.stringMatching(/[0-f]{64}/),
      id: expect.stringMatching(/[0-f]{72}/),
      script: {
        hex: '00144ab4391ce5a732e36139e72d79a28e01b7b08034',
        type: 'witness_v0_keyhash'
      },
      sort: expect.stringMatching(/[0-f]{80}/),
      vout: {
        n: expect.any(Number),
        tokenId: 0,
        txid: expect.stringMatching(/[0-f]{64}/),
        value: '1.12280000'
      }
    })
  })

  it('should listTransactionsUnspent with undefined next pagination', async () => {
    const first = await controller.listTransactionsUnspent(addressA.bech32, {
      size: 2,
      next: undefined
    })

    expect(first.data.length).toStrictEqual(2)
    expect(first.page?.next).toMatch(/[0-f]{72}/)
  })
})

describe('listTokens', () => {
  async function setupLoanToken (): Promise<void> {
    const oracleId = await testing.client.oracle.appointOracle(await testing.generateAddress(), [
      {
        token: 'DFI',
        currency: 'USD'
      },
      {
        token: 'LOAN',
        currency: 'USD'
      }
    ], { weightage: 1 })
    await testing.generate(1)

    await testing.client.oracle.setOracleData(oracleId, Math.floor(new Date().getTime() / 1000), {
      prices: [
        {
          tokenAmount: '2@DFI',
          currency: 'USD'
        },
        {
          tokenAmount: '2@LOAN',
          currency: 'USD'
        }
      ]
    })
    await testing.generate(1)

    await testing.client.loan.setCollateralToken({
      token: 'DFI',
      factor: new BigNumber(1),
      fixedIntervalPriceId: 'DFI/USD'
    })
    await testing.client.loan.setLoanToken({
      symbol: 'LOAN',
      name: 'LOAN',
      fixedIntervalPriceId: 'LOAN/USD',
      mintable: true,
      interest: new BigNumber(0.02)
    })
    await testing.generate(1)

    await testing.token.dfi({
      address: await testing.address('DFI'),
      amount: 100
    })

    await testing.client.loan.createLoanScheme({
      id: 'scheme',
      minColRatio: 110,
      interestRate: new BigNumber(1)
    })
    await testing.generate(1)

    const vaultId = await testing.client.loan.createVault({
      ownerAddress: await testing.address('VAULT'),
      loanSchemeId: 'scheme'
    })
    await testing.generate(1)

    await testing.client.oracle.setOracleData(oracleId, Math.floor(new Date().getTime() / 1000), {
      prices: [
        {
          tokenAmount: '2@DFI',
          currency: 'USD'
        },
        {
          tokenAmount: '2@LOAN',
          currency: 'USD'
        }
      ]
    })
    await testing.generate(1)

    await testing.client.loan.depositToVault({
      vaultId: vaultId,
      from: await testing.address('DFI'),
      amount: '100@DFI'
    })
    await testing.generate(1)
    await testing.client.loan.takeLoan({
      vaultId: vaultId,
      amounts: '10@LOAN',
      to: address
    })
    await testing.generate(1)
  }

  beforeAll(async () => {
    app = new DefidBin()
    await app.start()
    controller = app.ocean.addressController
    testing = app.rpc
    await app.waitForWalletCoinbaseMaturity()
    await app.waitForWalletBalanceGTE(100)

    await app.waitForBlockHeight(100)

    for (const token of tokens) {
      await app.waitForWalletBalanceGTE(110)
      await app.createToken(token)
      await app.mintTokens(token, { mintAmount: 1000 })
      await app.sendTokensToAddress(address, 10, token)
    }
    await app.generate(1)

    await setupLoanToken()
  })

  afterAll(async () => {
    await app.stop()
  })

  const address = 'bcrt1qf5v8n3kfe6v5mharuvj0qnr7g74xnu9leut39r'
  const tokens = ['A', 'B', 'C', 'D', 'E', 'F']

  it('should listTokens', async () => {
    const response = await controller.listTokens(address, {
      size: 30
    })

    expect(response.data.length).toStrictEqual(7)
    expect(response.page).toBeUndefined()

    expect(response.data[5]).toStrictEqual({
      id: '6',
      amount: '10.00000000',
      symbol: 'F',
      displaySymbol: 'dF',
      symbolKey: 'F',
      name: 'F',
      isDAT: true,
      isLPS: false,
      isLoanToken: false
    })

    expect(response.data[6]).toStrictEqual({
      id: '7',
      amount: '10.00000000',
      symbol: 'LOAN',
      displaySymbol: 'dLOAN',
      symbolKey: 'LOAN',
      name: 'LOAN',
      isDAT: true,
      isLPS: false,
      isLoanToken: true
    })
  })

  it('should listTokens with pagination', async () => {
    const first = await controller.listTokens(address, {
      size: 2
    })
    expect(first.data.length).toStrictEqual(2)
    expect(first.page?.next).toStrictEqual('2')
    expect(first.data[0].symbol).toStrictEqual('A')
    expect(first.data[1].symbol).toStrictEqual('B')

    const next = await controller.listTokens(address, {
      size: 10,
      next: first.page?.next
    })

    expect(next.data.length).toStrictEqual(5)
    expect(next.page?.next).toBeUndefined()
    expect(next.data[0].symbol).toStrictEqual('C')
    expect(next.data[1].symbol).toStrictEqual('D')
    expect(next.data[2].symbol).toStrictEqual('E')
    expect(next.data[3].symbol).toStrictEqual('F')
    expect(next.data[4].symbol).toStrictEqual('LOAN')
  })

  it('should listTokens with undefined next pagination', async () => {
    const first = await controller.listTokens(address, {
      size: 2,
      next: undefined
    })

    expect(first.data.length).toStrictEqual(2)
    expect(first.page?.next).toStrictEqual('2')
  })

  it('should return empty and page undefined while listTokens with invalid address', async () => {
    try {
      await controller.listTokens('invalid', { size: 30 })
    } catch (err: any) {
      expect(err).toBeInstanceOf(WhaleApiException)
      expect(err.error).toStrictEqual({
        code: 404,
        type: 'NotFound',
        at: expect.any(Number),
        message: 'Invalid owner address',
        url: '/v0/regtest/address/invalid/tokens?size=30&next=undefined'
      })
    }
  })
})

describe('listVaults', () => {
  let vaultId: string
  const address = 'bcrt1qf5v8n3kfe6v5mharuvj0qnr7g74xnu9leut39r'

  beforeAll(async () => {
    app = new DefidBin()
    await app.start()
    controller = app.ocean.addressController
    testing = app.rpc
    await app.waitForWalletCoinbaseMaturity()
    await app.waitForWalletBalanceGTE(100)

    await app.waitForBlockHeight(100)

    await testing.client.loan.createLoanScheme({
      id: 'scheme',
      minColRatio: 110,
      interestRate: new BigNumber(1)
    })
    await testing.generate(1)

    vaultId = await testing.client.vault.createVault({
      ownerAddress: address,
      loanSchemeId: 'scheme'
    })

    await testing.client.vault.createVault({
      ownerAddress: await testing.address('VaultId1'),
      loanSchemeId: 'scheme'
    })
    await app.generate(1)
  })

  afterAll(async () => {
    await app.stop()
  })

  it('should listVaults', async () => {
    const response = await controller.listVaults(address, {
      size: 30
    })
    expect(response.data.length).toStrictEqual(1)
    expect(response.data[0]).toStrictEqual({
      vaultId: vaultId,
      loanScheme: expect.any(Object),
      ownerAddress: address,
      state: 'active',
      informativeRatio: '-1',
      collateralRatio: '-1',
      collateralValue: '0',
      loanValue: '0',
      interestValue: '0',
      collateralAmounts: [],
      loanAmounts: [],
      interestAmounts: []
    })
  })

  it('should return empty for other address', async () => {
    const response = await controller.listVaults(await app.getNewAddress(), {
      size: 30
    })
    expect(response.data).toStrictEqual([])
  })

  it('should fail if providing empty address', async () => {
    try {
      await controller.listVaults('', {
        size: 30
      })
    } catch (err: any) {
      expect(err).toBeInstanceOf(WhaleApiException)
      expect(err.error).toStrictEqual({
        at: expect.any(Number),
        code: 404,
        message: 'recipient () does not refer to any valid address',
        type: 'NotFound',
        url: '/v0/regtest/address//vaults?size=30&next=undefined'
      })
    }
  })

  it('should fail if providing invalid address', async () => {
    try {
      await controller.listVaults('INVALID', {
        size: 30
      })
    } catch (err: any) {
      expect(err).toBeInstanceOf(WhaleApiException)
      expect(err.error).toStrictEqual({
        at: expect.any(Number),
        code: 404,
        message: 'recipient (INVALID) does not refer to any valid address',
        type: 'NotFound',
        url: '/v0/regtest/address/INVALID/vaults?size=30&next=undefined'
      })
    }
  })
})
