import BigNumber from 'bignumber.js'
import { MasterNodeRegTestContainer } from '@defichain/testcontainers'
import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc'
import { poolpair } from '@defichain/jellyfish-api-core'

export class TestingPoolPair {
  constructor (
    private readonly container: MasterNodeRegTestContainer,
    private readonly rpc: JsonRpcClient
  ) {
  }

  async get (symbol: string): Promise<poolpair.PoolPairInfo> {
    const values = await this.rpc.poolpair.getPoolPair(symbol, true)
    return Object.values(values)[0]
  }

  async create (options: TestingPoolPairCreate): Promise<string> {
    return await this.rpc.poolpair.createPoolPair({
      commission: 0,
      status: true,
      ownerAddress: await this.container.getNewAddress(),
      ...options
    })
  }

  async add (options: TestingPoolPairAdd): Promise<string> {
    const accountA = `${new BigNumber(options.a.amount).toFixed(8)}@${options.a.symbol}`
    const accountB = `${new BigNumber(options.b.amount).toFixed(8)}@${options.b.symbol}`
    const from = { '*': [accountA, accountB] }
    const address = options.address ?? await this.container.getNewAddress()
    return await this.rpc.poolpair.addPoolLiquidity(from, address)
  }

  async remove (options: TestingPoolPairRemove): Promise<string> {
    const { address, symbol, amount } = options
    const account = `${new BigNumber(amount).toFixed(8)}@${symbol}`
    return await this.rpc.poolpair.removePoolLiquidity(address, account)
  }

  async swap (options: poolpair.PoolSwapMetadata): Promise<string> {
    return await this.rpc.poolpair.poolSwap(options)
  }
}

export interface TestingPoolPairCreate {
  tokenA: string
  tokenB: string
  commission?: number
  status?: boolean
  ownerAddress?: string
  customRewards?: string[]
  pairSymbol?: string
}

export interface TestingPoolPairAdd {
  a: {
    symbol: string
    amount: number | string
  }
  b: {
    symbol: string
    amount: number | string
  }
  address?: string
}

export interface TestingPoolPairRemove {
  address: string
  symbol: string
  amount: number | string
}
