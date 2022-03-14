import { NetworkName } from '@defichain/jellyfish-network'
import { CPoolSwap, PoolSwap } from '@defichain/jellyfish-transaction'
import { Inject, Injectable } from '@nestjs/common'
import BigNumber from 'bignumber.js'

import { PoolPairToken, PoolPairTokenMapper } from '../../../models/PoolPairToken'
import { PoolSwapMapper } from '../../../models/PoolSwap'
import { PoolSwapAggregatedMapper } from '../../../models/PoolSwapAggregated'
import { HexEncoder } from '../../../utilities/HexEncoder'
import { IndexerError } from '../../Error'
import { RawBlock } from '../Indexer'
import { DfTxIndexer, DfTxTransaction } from './DfTxIndexer'
import { AggregatedIntervals } from './PoolSwapAggregatedIndexer'

@Injectable()
export class PoolSwapIndexer extends DfTxIndexer<PoolSwap> {
  OP_CODE: number = CPoolSwap.OP_CODE

  constructor (
    private readonly poolPairTokenMapper: PoolPairTokenMapper,
    private readonly poolSwapMapper: PoolSwapMapper,
    private readonly aggregatedMapper: PoolSwapAggregatedMapper,
    @Inject('NETWORK') protected readonly network: NetworkName
  ) {
    super()
  }

  async indexTransaction (block: RawBlock, transaction: DfTxTransaction<PoolSwap>): Promise<void> {
    const data = transaction.dftx.data
    const poolPair = await this.getPair(data.fromTokenId, data.toTokenId)
    await this.indexSwap(block, transaction, `${poolPair.poolPairId}`, data.fromTokenId, data.fromAmount)
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
    await this.invalidateSwap(transaction, `${poolPair.poolPairId}`, data.fromTokenId, data.fromAmount)
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

  async getPair (tokenA: number, tokenB: number): Promise<PoolPairToken> {
    // TODO(fuxingloh): caching

    const poolPairToken = await this.poolPairTokenMapper.getPair(tokenA, tokenB)
    if (poolPairToken === undefined) {
      throw new IndexerError(`Pool for pair ${tokenA}, ${tokenB} not found`)
    }

    return poolPairToken
  }
}
