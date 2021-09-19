import BigNumber from 'bignumber.js'
import { BufferComposer, ComposableBuffer } from '@defichain/jellyfish-buffer'
import { Script } from '../../tx'
import { CScript } from '../../tx_composer'

export interface TokenBalance {
  token: number // ---------------------| 4 bytes unsigned
  amount: BigNumber // -----------------| 8 bytes unsigned
}

/**
 * Composable TokenBalance, C stands for Composable.
 * Immutable by design, bi-directional fromBuffer, toBuffer deep composer.
 */
export class CTokenBalance extends ComposableBuffer<TokenBalance> {
  composers (tb: TokenBalance): BufferComposer[] {
    return [
      ComposableBuffer.uInt32(() => tb.token, v => tb.token = v),
      ComposableBuffer.satoshiAsBigNumber(() => tb.amount, v => tb.amount = v)
    ]
  }
}

export interface ScriptBalances {
  script: Script // --------------------| n = VarUInt{1-9 bytes}, + n bytes
  balances: TokenBalance[] // ----------| c = VarUInt{1-9 bytes}, + c txn_builder_update_loan_token1.test.ts TokenBalance
}

/**
 * Composable ScriptBalances, C stands for Composable.
 * Immutable by design, bi-directional fromBuffer, toBuffer deep composer.
 */
export class CScriptBalances extends ComposableBuffer<ScriptBalances> {
  composers (sb: ScriptBalances): BufferComposer[] {
    return [
      ComposableBuffer.single<Script>(() => sb.script, v => sb.script = v, v => new CScript(v)),
      ComposableBuffer.varUIntArray(() => sb.balances, v => sb.balances = v, v => new CTokenBalance(v))
    ]
  }
}
