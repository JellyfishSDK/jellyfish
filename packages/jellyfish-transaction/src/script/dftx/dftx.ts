import { SmartBuffer } from 'smart-buffer'
import { BufferComposer, ComposableBuffer } from '@defichain/jellyfish-buffer'
import {
  AccountToAccount,
  AccountToUtxos,
  AnyAccountToAccount,
  CAccountToAccount,
  CAccountToUtxos,
  CAnyAccountToAccount,
  CUtxosToAccount,
  UtxosToAccount
} from './dftx_account'
import { CCreateMasternode, CreateMasternode, CResignMasternode, ResignMasternode } from './dftx_masternode'
import { CAutoAuthPrep } from './dftx_misc'
import {
  CPoolAddLiquidity,
  CPoolCreatePair,
  CPoolRemoveLiquidity,
  CPoolSwap,
  CPoolUpdatePair,
  PoolAddLiquidity,
  PoolCreatePair,
  PoolRemoveLiquidity,
  PoolSwap,
  PoolUpdatePair
} from './dftx_pool'
import {
  CTokenCreate,
  CTokenMint,
  CTokenUpdate,
  CTokenUpdateAny,
  TokenCreate,
  TokenMint,
  TokenUpdate,
  TokenUpdateAny
} from './dftx_token'
import {
  AppointOracle,
  CAppointOracle,
  CRemoveOracle,
  CSetOracleData,
  CUpdateOracle,
  RemoveOracle,
  SetOracleData,
  UpdateOracle
} from './dftx_oracles'
import { CDeFiOpUnmapped, DeFiOpUnmapped } from './dftx_unmapped'
import {
  CICXCreateOrder,
  ICXCreateOrder,
  CICXMakeOffer,
  ICXMakeOffer,
  CICXCloseOrder,
  ICXCloseOrder,
  CICXCloseOffer,
  ICXCloseOffer,
  CICXSubmitDFCHTLC,
  ICXSubmitDFCHTLC,
  CICXSubmitEXTHTLC,
  ICXSubmitEXTHTLC,
  CICXClaimDFCHTLC,
  ICXClaimDFCHTLC
} from './dftx_icxorderbook'
import {
  CSetGovernance,
  SetGovernance,
  CCreateCfp,
  CCreateVoc,
  CreateProposal,
  CVote,
  Vote
} from './dftx_governance'
import {
  CCreateLoanScheme,
  CUpdateLoanScheme,
  LoanScheme,
  CDestroyLoanScheme,
  DestroyLoanScheme,
  CSetDefaultLoanScheme,
  SetDefaultLoanScheme,
  CSetCollateralToken,
  SetCollateralToken,
  CSetLoanToken,
  SetLoanToken,
  CUpdateLoanToken,
  UpdateLoanToken,
  CCreateVault,
  CreateVault,
  DepositToVault,
  CDepositToVault,
  CloseVault,
  CCloseVault
} from './dftx_loans'

/**
 * DeFi Transaction
 * [OP_RETURN, OP_PUSHDATA] Custom Transaction
 */
export interface DfTx<T> {
  signature: number // -------------------| 4 bytes, 0x44665478, DfTx
  type: number // ------------------------| 1 byte
  data: T // -----------------------------| varying bytes, 0-n

  /**
   * Not composed into buffer, for readability only.
   *
   * Name of operation in human readable string.
   * Structured as 'OP_DEFI_TX_<...>'
   */
  name: string
}

/**
 * Composable DfTx, C stands for Composable.
 * Immutable by design, bi-directional fromBuffer, toBuffer deep composer.
 */
export class CDfTx extends ComposableBuffer<DfTx<any>> {
  static SIGNATURE = 0x44665478

  composers (dftx: DfTx<any>): BufferComposer[] {
    return [
      CDfTx.signature(dftx),
      ComposableBuffer.uInt8(() => dftx.type, v => dftx.type = v),
      {
        // This is not exactly an performant design, but it is succinct
        fromBuffer (buffer: SmartBuffer) {
          return CDfTx.data(dftx).fromBuffer(buffer)
        },
        toBuffer (buffer: SmartBuffer) {
          return CDfTx.data(dftx).toBuffer(buffer)
        }
      }
    ]
  }

  /**
   * Signature read/write with error handling if not recognized
   */
  static signature (dftx: DfTx<any>): BufferComposer {
    return {
      fromBuffer (buffer: SmartBuffer): void {
        const signature = buffer.readUInt32BE()
        if (signature !== CDfTx.SIGNATURE) {
          throw new Error(`CDfTx attempt to read a signature that is not recognized: ${signature}`)
        }
        dftx.signature = signature
      },
      toBuffer (buffer: SmartBuffer): void {
        if (dftx.signature !== CDfTx.SIGNATURE) {
          throw new Error(`CDfTx attempt to write a signature that is not recognized: ${dftx.signature}`)
        }
        buffer.writeUInt32BE(dftx.signature)
      }
    }
  }

  /**
   * Operation data read/write composing
   */
  static data (dftx: DfTx<any>): BufferComposer {
    function compose<T> (name: string, asC: (data: SmartBuffer | T) => ComposableBuffer<T>): BufferComposer {
      dftx.name = name
      return ComposableBuffer.single<T>(() => dftx.data, v => dftx.data = v, asC)
    }

    switch (dftx.type) {
      case CPoolSwap.OP_CODE:
        return compose<PoolSwap>(CPoolSwap.OP_NAME, d => new CPoolSwap(d))
      case CPoolAddLiquidity.OP_CODE:
        return compose<PoolAddLiquidity>(CPoolAddLiquidity.OP_NAME, d => new CPoolAddLiquidity(d))
      case CPoolRemoveLiquidity.OP_CODE:
        return compose<PoolRemoveLiquidity>(CPoolRemoveLiquidity.OP_NAME, d => new CPoolRemoveLiquidity(d))
      case CPoolCreatePair.OP_CODE:
        return compose<PoolCreatePair>(CPoolCreatePair.OP_NAME, d => new CPoolCreatePair(d))
      case CPoolUpdatePair.OP_CODE:
        return compose<PoolUpdatePair>(CPoolUpdatePair.OP_NAME, d => new CPoolUpdatePair(d))
      case CTokenMint.OP_CODE:
        return compose<TokenMint>(CTokenMint.OP_NAME, d => new CTokenMint(d))
      case CTokenCreate.OP_CODE:
        return compose<TokenCreate>(CTokenCreate.OP_NAME, d => new CTokenCreate(d))
      case CTokenUpdate.OP_CODE:
        return compose<TokenUpdate>(CTokenUpdate.OP_NAME, d => new CTokenUpdate(d))
      case CTokenUpdateAny.OP_CODE:
        return compose<TokenUpdateAny>(CTokenUpdateAny.OP_NAME, d => new CTokenUpdateAny(d))
      case CUtxosToAccount.OP_CODE:
        return compose<UtxosToAccount>(CUtxosToAccount.OP_NAME, d => new CUtxosToAccount(d))
      case CAccountToUtxos.OP_CODE:
        return compose<AccountToUtxos>(CAccountToUtxos.OP_NAME, d => new CAccountToUtxos(d))
      case CAccountToAccount.OP_CODE:
        return compose<AccountToAccount>(CAccountToAccount.OP_NAME, d => new CAccountToAccount(d))
      case CAnyAccountToAccount.OP_CODE:
        return compose<AnyAccountToAccount>(CAnyAccountToAccount.OP_NAME, d => new CAnyAccountToAccount(d))
      case CAppointOracle.OP_CODE:
        return compose<AppointOracle>(CAppointOracle.OP_NAME, d => new CAppointOracle(d))
      case CRemoveOracle.OP_CODE:
        return compose<RemoveOracle>(CRemoveOracle.OP_NAME, d => new CRemoveOracle(d))
      case CUpdateOracle.OP_CODE:
        return compose<UpdateOracle>(CUpdateOracle.OP_NAME, d => new CUpdateOracle(d))
      case CSetOracleData.OP_CODE:
        return compose<SetOracleData>(CSetOracleData.OP_NAME, d => new CSetOracleData(d))
      case CAutoAuthPrep.OP_CODE:
        return compose(CAutoAuthPrep.OP_NAME, () => new CAutoAuthPrep())
      case CCreateMasternode.OP_CODE:
        return compose<CreateMasternode>(CCreateMasternode.OP_NAME, d => new CCreateMasternode(d))
      case CResignMasternode.OP_CODE:
        return compose<ResignMasternode>(CResignMasternode.OP_NAME, d => new CResignMasternode(d))
      case CSetGovernance.OP_CODE:
        return compose<SetGovernance>(CSetGovernance.OP_NAME, d => new CSetGovernance(d))
      case CICXCreateOrder.OP_CODE:
        return compose<ICXCreateOrder>(CICXCreateOrder.OP_NAME, d => new CICXCreateOrder(d))
      case CICXMakeOffer.OP_CODE:
        return compose<ICXMakeOffer>(CICXMakeOffer.OP_NAME, d => new CICXMakeOffer(d))
      case CICXCloseOrder.OP_CODE:
        return compose<ICXCloseOrder>(CICXCloseOrder.OP_NAME, d => new CICXCloseOrder(d))
      case CICXCloseOffer.OP_CODE:
        return compose<ICXCloseOffer>(CICXCloseOffer.OP_NAME, d => new CICXCloseOffer(d))
      case CCreateCfp.OP_CODE:
        return compose<CreateProposal>(CCreateCfp.OP_NAME, d => new CCreateCfp(d))
      case CCreateVoc.OP_CODE:
        return compose<CreateProposal>(CCreateVoc.OP_NAME, d => new CCreateVoc(d))
      case CVote.OP_CODE:
        return compose<Vote>(CVote.OP_NAME, d => new CVote(d))
      case CICXSubmitDFCHTLC.OP_CODE:
        return compose<ICXSubmitDFCHTLC>(CICXSubmitDFCHTLC.OP_NAME, d => new CICXSubmitDFCHTLC(d))
      case CCreateLoanScheme.OP_CODE:
        return compose<LoanScheme>(CCreateLoanScheme.OP_NAME, d => new CCreateLoanScheme(d))
      case CUpdateLoanScheme.OP_CODE:
        return compose<LoanScheme>(CUpdateLoanScheme.OP_NAME, d => new CUpdateLoanScheme(d))
      case CDestroyLoanScheme.OP_CODE:
        return compose<DestroyLoanScheme>(CDestroyLoanScheme.OP_NAME, d => new CDestroyLoanScheme(d))
      case CSetDefaultLoanScheme.OP_CODE:
        return compose<SetDefaultLoanScheme>(CSetDefaultLoanScheme.OP_NAME, d => new CSetDefaultLoanScheme(d))
      case CSetCollateralToken.OP_CODE:
        return compose<SetCollateralToken>(CSetCollateralToken.OP_NAME, d => new CSetCollateralToken(d))
      case CSetLoanToken.OP_CODE:
        return compose<SetLoanToken>(CSetLoanToken.OP_NAME, d => new CSetLoanToken(d))
      case CUpdateLoanToken.OP_CODE:
        return compose<UpdateLoanToken>(CUpdateLoanToken.OP_NAME, d => new CUpdateLoanToken(d))
      case CICXSubmitEXTHTLC.OP_CODE:
        return compose<ICXSubmitEXTHTLC>(CICXSubmitEXTHTLC.OP_NAME, d => new CICXSubmitEXTHTLC(d))
      case CICXClaimDFCHTLC.OP_CODE:
        return compose<ICXClaimDFCHTLC>(CICXClaimDFCHTLC.OP_NAME, d => new CICXClaimDFCHTLC(d))
      case CCreateVault.OP_CODE:
        return compose<CreateVault>(CCreateVault.OP_NAME, d => new CCreateVault(d))
      case CDepositToVault.OP_CODE:
        return compose<DepositToVault>(CDepositToVault.OP_NAME, d => new CDepositToVault(d))
      case CCloseVault.OP_CODE:
        return compose<CloseVault>(CCloseVault.OP_NAME, d => new CCloseVault(d))
      default:
        return compose<DeFiOpUnmapped>(CDeFiOpUnmapped.OP_NAME, d => new CDeFiOpUnmapped(d))
    }
  }
}
