import { PoolSwapData } from '@defichain/whale-api-client/dist/api/poolpairs'
import { DPoolPairController, DefidBin, DefidRpc } from '../../e2e.defid.module'
import { ApiPagedResponse } from '../_core/api.paged.response'

let app: DefidBin
let container: DefidRpc
let controller: DPoolPairController

beforeEach(async () => {
  app = new DefidBin()
  await app.start()
  controller = app.ocean.poolPairController
  container = app.rpc
  await app.waitForBlockHeight(101)

  const tokens = ['A', 'B', 'C']

  await app.rpc.token.dfi({ address: await app.rpc.address('swap'), amount: 10000 })
  await app.generate(1)

  for (const token of tokens) {
    await app.waitForWalletBalanceGTE(110)
    await app.rpc.token.create({ symbol: token })
    await container.generate(1)
    await app.rpc.token.mint({ amount: 10000, symbol: token })
    await container.generate(1)
    await app.rpc.token.send({ address: await app.rpc.address('swap'), symbol: token, amount: 1000 })
  }

  await app.rpc.poolpair.create({ tokenA: 'A', tokenB: 'B' })
  await container.generate(1)
  await app.rpc.poolpair.add({ a: { symbol: 'A', amount: 100 }, b: { symbol: 'B', amount: 200 } })

  await app.rpc.poolpair.create({ tokenA: 'C', tokenB: 'B' })
  await container.generate(1)
  await app.rpc.poolpair.add({ a: { symbol: 'C', amount: 100 }, b: { symbol: 'B', amount: 200 } })

  await app.rpc.poolpair.create({ tokenA: 'DFI', tokenB: 'C' })
  await container.generate(1)
  await app.rpc.poolpair.add({ a: { symbol: 'DFI', amount: 100 }, b: { symbol: 'C', amount: 200 } })
  await container.generate(1)
})

afterEach(async () => {
  await app.stop()
})

describe('poolswap buy-sell indicator', () => {
  it('should get pool swap details', async () => {
    await app.rpc.poolpair.swap({
      from: await app.rpc.address('swap'),
      tokenFrom: 'C',
      amountFrom: 15,
      to: await app.rpc.address('swap'),
      tokenTo: 'DFI'
    })

    const height = await app.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(height)

    const res = await controller.listPoolSwaps('6')
    expect(res.data.length).toStrictEqual(1)
    expect(res.page).toBeUndefined()

    expect(res.data[0]).toStrictEqual(
      {
        id: expect.any(String),
        txid: expect.stringMatching(/[0-f]{64}/),
        txno: expect.any(Number),
        poolPairId: '6',
        sort: expect.any(String),
        fromAmount: '15.00000000',
        fromTokenId: 3,
        block: {
          hash: expect.stringMatching(/[0-f]{64}/),
          height: expect.any(Number),
          time: expect.any(Number),
          medianTime: expect.any(Number)
        }
      }
    )
  })

  it('should get composite pool swap for 2 jumps', async () => {
    await app.rpc.client.poolpair.compositeSwap({
      from: await app.rpc.address('swap'),
      tokenFrom: 'B',
      amountFrom: 10,
      to: await app.rpc.address('swap'),
      tokenTo: 'DFI'
    })

    const height = await app.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(height)

    {
      const res: ApiPagedResponse<PoolSwapData> = await controller.listPoolSwaps('5')
      expect(res.data[0]).toStrictEqual(
        {
          id: expect.any(String),
          txid: expect.stringMatching(/[0-f]{64}/),
          txno: expect.any(Number),
          poolPairId: '5',
          sort: expect.any(String),
          fromAmount: '10.00000000',
          fromTokenId: 2,
          block: {
            hash: expect.stringMatching(/[0-f]{64}/),
            height: expect.any(Number),
            time: expect.any(Number),
            medianTime: expect.any(Number)
          }
        }
      )
    }

    {
      const res: ApiPagedResponse<PoolSwapData> = await controller.listPoolSwaps('6')
      expect(res.data[0]).toStrictEqual(
        {
          id: expect.any(String),
          txid: expect.stringMatching(/[0-f]{64}/),
          txno: expect.any(Number),
          poolPairId: '6',
          sort: expect.any(String),
          fromAmount: '10.00000000',
          fromTokenId: 2,
          block: {
            hash: expect.stringMatching(/[0-f]{64}/),
            height: expect.any(Number),
            time: expect.any(Number),
            medianTime: expect.any(Number)
          }
        }
      )
    }
  })

  it('should get composite pool swap for 2 jumps scenario 2', async () => {
    await app.rpc.client.poolpair.compositeSwap({
      from: await app.rpc.address('swap'),
      tokenFrom: 'DFI',
      amountFrom: 5,
      to: await app.rpc.address('swap'),
      tokenTo: 'B'
    })

    const height = await app.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(height)

    {
      const res: ApiPagedResponse<PoolSwapData> = await controller.listPoolSwaps('5')
      expect(res.data[0]).toStrictEqual(
        {
          id: expect.any(String),
          txid: expect.stringMatching(/[0-f]{64}/),
          txno: expect.any(Number),
          poolPairId: '5',
          sort: expect.any(String),
          fromAmount: '5.00000000',
          fromTokenId: 0,
          block: {
            hash: expect.stringMatching(/[0-f]{64}/),
            height: expect.any(Number),
            time: expect.any(Number),
            medianTime: expect.any(Number)
          }
        }
      )
    }

    {
      const res: ApiPagedResponse<PoolSwapData> = await controller.listPoolSwaps('6')
      expect(res.data[0]).toStrictEqual(
        {
          id: expect.any(String),
          txid: expect.stringMatching(/[0-f]{64}/),
          txno: expect.any(Number),
          poolPairId: '6',
          sort: expect.any(String),
          fromAmount: '5.00000000',
          fromTokenId: 0,
          block: {
            hash: expect.stringMatching(/[0-f]{64}/),
            height: expect.any(Number),
            time: expect.any(Number),
            medianTime: expect.any(Number)
          }
        }
      )
    }
  })

  it('should get composite pool swap for 3 jumps', async () => {
    await app.rpc.client.poolpair.compositeSwap({
      from: await app.rpc.address('swap'),
      tokenFrom: 'A',
      amountFrom: 20,
      to: await app.rpc.address('swap'),
      tokenTo: 'DFI'
    })

    const height = await app.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(height)

    {
      const res: ApiPagedResponse<PoolSwapData> = await controller.listPoolSwaps('4')
      expect(res.data[0]).toStrictEqual(
        {
          id: expect.any(String),
          txid: expect.stringMatching(/[0-f]{64}/),
          txno: expect.any(Number),
          poolPairId: '4',
          sort: expect.any(String),
          fromAmount: '20.00000000',
          fromTokenId: 1,
          block: {
            hash: expect.stringMatching(/[0-f]{64}/),
            height: expect.any(Number),
            time: expect.any(Number),
            medianTime: expect.any(Number)
          }
        }
      )
    }

    {
      const res: ApiPagedResponse<PoolSwapData> = await controller.listPoolSwaps('5')
      expect(res.data[0]).toStrictEqual(
        {
          id: expect.any(String),
          txid: expect.stringMatching(/[0-f]{64}/),
          txno: expect.any(Number),
          poolPairId: '5',
          sort: expect.any(String),
          fromAmount: '20.00000000',
          fromTokenId: 1,
          block: {
            hash: expect.stringMatching(/[0-f]{64}/),
            height: expect.any(Number),
            time: expect.any(Number),
            medianTime: expect.any(Number)
          }
        }
      )
    }

    {
      const res: ApiPagedResponse<PoolSwapData> = await controller.listPoolSwaps('6')
      expect(res.data[0]).toStrictEqual(
        {
          id: expect.any(String),
          txid: expect.stringMatching(/[0-f]{64}/),
          txno: expect.any(Number),
          poolPairId: '6',
          sort: expect.any(String),
          fromAmount: '20.00000000',
          fromTokenId: 1,
          block: {
            hash: expect.stringMatching(/[0-f]{64}/),
            height: expect.any(Number),
            time: expect.any(Number),
            medianTime: expect.any(Number)
          }
        }
      )
    }
  })

  it('should get direct pool swap for composite swap', async () => {
    await app.rpc.client.poolpair.compositeSwap({
      from: await app.rpc.address('swap'),
      tokenFrom: 'C',
      amountFrom: 10,
      to: await app.rpc.address('swap'),
      tokenTo: 'DFI'
    })

    await app.rpc.client.poolpair.compositeSwap({
      from: await app.rpc.address('swap'),
      tokenFrom: 'A',
      amountFrom: 10,
      to: await app.rpc.address('swap'),
      tokenTo: 'B'
    })

    const height = await app.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(height)

    {
      const res: ApiPagedResponse<PoolSwapData> = await controller.listPoolSwaps('6')
      expect(res.data[0]).toStrictEqual(
        {
          id: expect.any(String),
          txid: expect.stringMatching(/[0-f]{64}/),
          txno: expect.any(Number),
          poolPairId: '6',
          sort: expect.any(String),
          fromAmount: '10.00000000',
          fromTokenId: 3,
          block: {
            hash: expect.stringMatching(/[0-f]{64}/),
            height: expect.any(Number),
            time: expect.any(Number),
            medianTime: expect.any(Number)
          }
        }
      )
    }

    {
      const res: ApiPagedResponse<PoolSwapData> = await controller.listPoolSwaps('4')
      expect(res.data[0]).toStrictEqual(
        {
          id: expect.any(String),
          txid: expect.stringMatching(/[0-f]{64}/),
          txno: expect.any(Number),
          poolPairId: '4',
          sort: expect.any(String),
          fromAmount: '10.00000000',
          fromTokenId: 1,
          block: {
            hash: expect.stringMatching(/[0-f]{64}/),
            height: expect.any(Number),
            time: expect.any(Number),
            medianTime: expect.any(Number)
          }
        }
      )
    }
  })
})
