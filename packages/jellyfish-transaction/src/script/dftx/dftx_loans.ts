import { BufferComposer, ComposableBuffer } from '@defichain/jellyfish-buffer'
import BigNumber from 'bignumber.js'

/**
 * CreateLoanScheme / UpdateLoanScheme DeFi Transaction
 */
export interface LoanScheme {
  ratio: number // -----------------------| 4 bytes unsigned, Minimum collateralization ratio
  rate: BigNumber // ---------------------| 8 bytes unsigned, Interest rate
  identifier: string // ------------------| c = VarUInt{1-9 bytes}, + c bytes UTF encoded string, Unique identifier of the loan scheme
  update: BigNumber // -------------------| 8 bytes unsigned integer, Activation block height. 0 for createLoanScheme, > 0 for updateLoanScheme
}

/**
 * DestroyLoanScheme DeFi Transaction
 */
export interface DestroyLoanScheme {
  identifier: string // ------------------| c = VarUInt{1-9 bytes} + c bytes UTF encoded string, Unique identifier of the loan scheme
  height: BigNumber // -------------------| 8 bytes unsigned integer, Activation block height
}

/**
 * SetDefaultLoanScheme DeFi Transaction
 */
export interface SetDefaultLoanScheme {
  identifier: string // ------------------| c = VarUInt{1-9 bytes}, + c bytes UTF encoded string, Unique identifier of the loan scheme
}

/**
 * SetCollateralToken DeFi Transaction
 */
export interface SetCollateralToken {
  token: number // ----------------| VarUInt{1-9 bytes}, symbol or id of collateral token
  factor: BigNumber // ------------| 8 bytes unsigned, collateralization factor
  priceFeedId: string // ----------| 32 bytes, hex string Txid of oracle feeding the price
  activateAfterBlock: number // ---| 4 bytes, unsigned Changes will be active after the block height
}

/**
 * Composable CreateLoanScheme, C stands for Composable.
 * Immutable by design, bi-directional fromBuffer, toBuffer deep composer.
 */
export class CCreateLoanScheme extends ComposableBuffer<LoanScheme> {
  static OP_CODE = 0x4c // 'L'
  static OP_NAME = 'OP_DEFI_TX_CREATE_LOAN_SCHEME'

  composers (cls: LoanScheme): BufferComposer[] {
    return [
      ComposableBuffer.uInt32(() => cls.ratio, v => cls.ratio = v),
      ComposableBuffer.satoshiAsBigNumber(() => cls.rate, v => cls.rate = v),
      ComposableBuffer.varUIntUtf8BE(() => cls.identifier, v => cls.identifier = v),
      ComposableBuffer.bigNumberUInt64(() => cls.update, v => cls.update = v)
    ]
  }
}

/**
 * Composable UpdateLoanScheme, C stands for Composable.
 * Immutable by design, bi-directional fromBuffer, toBuffer deep composer.
 */
export class CUpdateLoanScheme extends ComposableBuffer<LoanScheme> {
  static OP_CODE = 0x4c // 'L'
  static OP_NAME = 'OP_DEFI_TX_UPDATE_LOAN_SCHEME'

  composers (cls: LoanScheme): BufferComposer[] {
    return [
      ComposableBuffer.uInt32(() => cls.ratio, v => cls.ratio = v),
      ComposableBuffer.satoshiAsBigNumber(() => cls.rate, v => cls.rate = v),
      ComposableBuffer.varUIntUtf8BE(() => cls.identifier, v => cls.identifier = v),
      ComposableBuffer.bigNumberUInt64(() => cls.update, v => cls.update = v)
    ]
  }
}

/**
 * Composable DestroyLoanScheme, C stands for Composable.
 * Immutable by design, bi-directional fromBuffer, toBuffer deep composer.
 */
export class CDestroyLoanScheme extends ComposableBuffer<DestroyLoanScheme> {
  static OP_CODE = 0x44 // 'D'
  static OP_NAME = 'OP_DEFI_TX_DESTROY_LOAN_SCHEME'

  composers (dls: DestroyLoanScheme): BufferComposer[] {
    return [
      ComposableBuffer.varUIntUtf8BE(() => dls.identifier, v => dls.identifier = v),
      ComposableBuffer.bigNumberUInt64(() => dls.height, v => dls.height = v)
    ]
  }
}

/**
 * Composable SetDefaultLoanScheme, C stands for Composable.
 * Immutable by design, bi-directional fromBuffer, toBuffer deep composer.
 */
export class CSetDefaultLoanScheme extends ComposableBuffer<SetDefaultLoanScheme> {
  static OP_CODE = 0x64 // 'd'
  static OP_NAME = 'OP_DEFI_TX_SET_DEFAULT_LOAN_SCHEME'

  composers (sdls: SetDefaultLoanScheme): BufferComposer[] {
    return [
      ComposableBuffer.varUIntUtf8BE(() => sdls.identifier, v => sdls.identifier = v)
    ]
  }
}

/**
* Composable SetCollateralToken, C stands for Composable.
* Immutable by design, bi-directional fromBuffer, toBuffer deep composer.
*/
export class CSetCollateralToken extends ComposableBuffer<SetCollateralToken> {
  static OP_CODE = 0x63 // 'c'
  static OP_NAME = 'OP_DEFI_TX_SET_COLLATERAL_TOKEN'

  composers (sct: SetCollateralToken): BufferComposer[] {
    return [
      ComposableBuffer.varUInt(() => sct.token, v => sct.token = v),
      ComposableBuffer.satoshiAsBigNumber(() => sct.factor, v => sct.factor = v),
      ComposableBuffer.hexBEBufferLE(32, () => sct.priceFeedId, v => sct.priceFeedId = v),
      ComposableBuffer.uInt32(() => sct.activateAfterBlock, v => sct.activateAfterBlock = v)
    ]
  }
}
