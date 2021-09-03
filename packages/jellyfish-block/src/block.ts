import { BlockHeader, CBlockHeader } from './blockHeader'
import { BufferComposer, ComposableBuffer } from '@defichain/jellyfish-buffer'
import { CTransactionSegWit, TransactionSegWit } from '@defichain/jellyfish-transaction'

export interface Block {
  blockHeader: BlockHeader // -------------| 124 bytes + signature (n = VarUInt{1-9 bytes} + n bytes)
  transactions: TransactionSegWit[] // --| n = VarUInt{1-9 bytes}, + n transactions, list of transactions
}

/**
 * Composable Block, C stands for Composable.
 * Immutable by design, bi-directional fromBuffer, toBuffer deep composer.
 */
export class CBlock extends ComposableBuffer<Block> {
  composers (bh: Block): BufferComposer[] {
    return [
      ComposableBuffer.single<BlockHeader>(() => bh.blockHeader, v => bh.blockHeader = v, v => new CBlockHeader(v)),
      ComposableBuffer.varUIntArray<TransactionSegWit>(() => bh.transactions, v => bh.transactions = v, v => new CTransactionSegWit(v))
    ]
  }
}
