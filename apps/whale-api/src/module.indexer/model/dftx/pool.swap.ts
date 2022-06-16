import { DfTxIndexer, DfTxTransaction } from './_abstract'
import { CPoolSwap, PoolSwap } from '@defichain/jellyfish-transaction'
import { RawBlock } from '../_abstract'
import { Inject, Injectable } from '@nestjs/common'
import { NetworkName } from '@defichain/jellyfish-network'
import BigNumber from 'bignumber.js'
import { PoolSwapMapper } from '../../../module.model/pool.swap'
import { HexEncoder } from '../../../module.model/_hex.encoder'
import { PoolSwapAggregatedMapper } from '../../../module.model/pool.swap.aggregated'
import { AggregatedIntervals } from './pool.swap.aggregated'
import { DeFiDCache, PoolPairInfoWithId } from '../../../module.api/cache/defid.cache'
import { IndexerError } from '../../error'

@Injectable()
export class PoolSwapIndexer extends DfTxIndexer<PoolSwap> {
  OP_CODE: number = CPoolSwap.OP_CODE

  constructor (
    private readonly poolSwapMapper: PoolSwapMapper,
    private readonly aggregatedMapper: PoolSwapAggregatedMapper,
    private readonly poolPairPathMapping: PoolPairPathMapping,
    @Inject('NETWORK') protected readonly network: NetworkName
  ) {
    super()
  }

  async indexTransaction (block: RawBlock, transaction: DfTxTransaction<PoolSwap>): Promise<void> {
    const data = transaction.dftx.data
    const poolPair = await this.getPair(data.fromTokenId, data.toTokenId)
    await this.indexSwap(block, transaction, poolPair.id, data.fromTokenId, data.fromAmount)
  }

  async indexSwap (block: RawBlock, transaction: DfTxTransaction<any>, poolPairId: string, fromTokenId: number, fromAmount: BigNumber): Promise<void> {
    await this.poolSwapMapper.put({
      id: `${poolPairId}-${transaction.txn.txid}`,
      txid: transaction.txn.txid,
      txno: transaction.txnNo,
      poolPairId: poolPairId,
      sort: HexEncoder.encodeHeight(block.height) + HexEncoder.encodeHeight(transaction.txnNo),
      fromAmount: fromAmount.toFixed(8),
      fromTokenId: fromTokenId,
      block: {
        hash: block.hash,
        height: block.height,
        time: block.time,
        medianTime: block.mediantime
      }
    })

    for (const interval of AggregatedIntervals) {
      const previous = await this.aggregatedMapper.query(`${poolPairId}-${interval}`, 1)
      const aggregate = previous[0]
      const amount = new BigNumber(aggregate.aggregated.amounts[`${fromTokenId}`] ?? '0')

      aggregate.aggregated.amounts[`${fromTokenId}`] = amount.plus(fromAmount).toFixed(8)
      await this.aggregatedMapper.put(aggregate)
    }
  }

  async invalidateTransaction (_: RawBlock, transaction: DfTxTransaction<PoolSwap>): Promise<void> {
    const data = transaction.dftx.data
    const poolPair = await this.getPair(data.fromTokenId, data.toTokenId)
    await this.invalidateSwap(transaction, poolPair.id, data.fromTokenId, data.fromAmount)
  }

  async invalidateSwap (transaction: DfTxTransaction<any>, poolPairId: string, fromTokenId: number, fromAmount: BigNumber): Promise<void> {
    await this.poolSwapMapper.delete(`${poolPairId}-${transaction.txn.txid}`)

    for (const interval of AggregatedIntervals) {
      const previous = await this.aggregatedMapper.query(`${poolPairId}-${interval as number}`, 1)
      const aggregate = previous[0]
      const amount = new BigNumber(aggregate.aggregated.amounts[`${fromTokenId}`])

      aggregate.aggregated.amounts[`${fromTokenId}`] = amount.minus(fromAmount).toFixed(8)
      await this.aggregatedMapper.put(aggregate)
    }
  }

  async getPair (tokenA: number, tokenB: number): Promise<PoolPairInfoWithId> {
    const pair = await this.poolPairPathMapping.findPair(tokenA, tokenB)
    if (pair !== undefined) {
      return pair
    }

    throw new IndexerError(`Pool for pair ${tokenA}, ${tokenB} not found in PoolPairPathMapping`)
  }
}

@Injectable()
export class PoolPairPathMapping {
  constructor (
    protected readonly deFiDCache: DeFiDCache,
    private readonly paths: Record<string, PoolPairInfoWithId>
  ) {
  }

  async findPair (tokenA: number, tokenB: number): Promise<PoolPairInfoWithId | undefined> {
    const pair = this.paths[`${tokenA}-${tokenB}`]
    if (pair !== undefined) {
      return pair
    }

    await this.updateMapping()
    return this.paths[`${tokenA}-${tokenB}`]
  }

  private async updateMapping (): Promise<void> {
    const pairs = await this.deFiDCache.getPoolPairs(true)

    for (const pair of pairs) {
      this.paths[`${pair.idTokenA}-${pair.idTokenB}`] = pair
      this.paths[`${pair.idTokenB}-${pair.idTokenA}`] = pair
    }
  }
}
