import {
  OP_CODES, Script, TransactionSegWit,
  DestroyLoanScheme
} from '@defichain/jellyfish-transaction'
import { P2WPKHTxnBuilder } from './txn_builder'

export class TxnBuilderLoans extends P2WPKHTxnBuilder {
  async destroyLoanScheme (destroyLoanScheme: DestroyLoanScheme, changeScript: Script): Promise<TransactionSegWit> {
    return await super.createDeFiTx(
      OP_CODES.OP_DEFI_TX_DESTROY_LOAN_SCHEME(destroyLoanScheme),
      changeScript
    )
  }
}
