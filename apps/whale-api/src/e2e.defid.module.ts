/* eslint-disable  @typescript-eslint/explicit-function-return-type */
/* eslint-disable  @typescript-eslint/no-misused-promises */
/* eslint-disable @typescript-eslint/restrict-template-expressions */

import BigNumber from 'bignumber.js'
import { fetch } from 'cross-fetch'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import { ChildProcess, exec, spawn } from 'child_process'
import { RegTestFoundationKeys, RegTest } from '@defichain/jellyfish-network'
import { ApiPagedResponse } from './module.api/_core/api.paged.response'
import { AddressToken, AddressHistory } from '@defichain/whale-api-client/dist/api/address'
import { Block } from './module.model/block'
import { MasternodeData } from '@defichain/whale-api-client/dist/api/masternodes'
import {
  AllSwappableTokensResult,
  BestSwapPathResult, DexPricesResult,
  PoolPairData,
  PoolSwapAggregatedData,
  PoolSwapData,
  SwapPathsResult
} from '@defichain/whale-api-client/dist/api/poolpairs'
import { GovernanceProposal, ProposalVotesResult } from '@defichain/whale-api-client/dist/api/governance'
import { CollateralToken, LoanScheme, LoanToken, LoanVaultActive, LoanVaultLiquidated } from '@defichain/whale-api-client/dist/api/loan'
import { ListProposalsStatus, ListProposalsType, MasternodeType } from '@defichain/jellyfish-api-core/dist/category/governance'
import { Oracle } from './module.model/oracle'
import { OraclePriceAggregated } from './module.model/oracle.price.aggregated'
import { OraclePriceFeed } from './module.model/oracle.price.feed'
import { OraclePriceActive } from './module.model/oracle.price.active'
import { PriceTicker } from './module.model/price.ticker'
import { PriceFeedInterval, PriceOracle } from '@defichain/whale-api-client/dist/api/prices'
import { RawTransaction } from '@defichain/jellyfish-api-core/dist/category/rawtx'
import { ScriptActivity } from './module.model/script.activity'
import { ScriptAggregation } from './module.model/script.aggregation'
import { ScriptUnspent } from './module.model/script.unspent'
import { BurnData, RewardDistributionData, StatsData, SupplyData } from '@defichain/whale-api-client/dist/api/stats'
import { TokenData } from '@defichain/whale-api-client/dist/api/tokens'
import { Transaction } from './module.model/transaction'
import { TransactionVin } from './module.model/transaction.vin'
import { TransactionVout } from './module.model/transaction.vout'
import { DeFiDRpcError, waitForCondition } from '@defichain/testcontainers'
import { isSHA256Hash, parseHeight } from './module.api/block.controller'
import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc'
import { ClientApiError } from '@defichain/jellyfish-api-core/dist/index'
import waitForExpect from 'wait-for-expect'
import { TestingPoolPairAdd, TestingPoolPairCreate, TestingPoolPairRemove, TestingTokenBurn, TestingTokenCreate, TestingTokenDFI, TestingTokenMint, TestingTokenSend } from '@defichain/jellyfish-testing'
import { poolpair } from '@defichain/jellyfish-api-core'
import { Bech32, Elliptic, HRP, WIF } from '@defichain/jellyfish-crypto'
import { AddPoolLiquidityMetadata, CreatePoolPairOptions, CreateTokenOptions, CreateSignedTxnHexOptions, MintTokensOptions, PoolSwapMetadata, UtxosToAccountOptions } from '@defichain/testing'
import { VaultAuctionBatchHistory } from './module.model/vault.auction.batch.history'
import { WhaleApiClientOptions } from '@defichain/whale-api-client/dist/whale.api.client'
import { raiseIfError } from '@defichain/whale-api-client/dist/errors'

const SPAWNING_TIME = 60_000

export interface OceanListQuery {
  size: number
  next?: string
}

export interface OceanRawTxQuery {
  verbose: boolean
}

export interface OceanProposalQuery {
  masternode?: MasternodeType | string
  cycle?: number
  all?: boolean
  query?: OceanListQuery
}

interface RawTxDto {
  hex: string
  maxFeeRate?: number
}

interface RpcDto {
  method: string
  params: any[]
}

class DefidOceanApiClient {
  constructor (protected readonly options: WhaleApiClientOptions) {
    this.options = {
      // default
      url: '`http://127.0.0.1:3002', // DEFAULT_OCEAN_ARCHIVE_PORT: 3002
      timeout: 60000,
      version: 'v0',
      network: 'regtest',
      ...options
    }
  }

  async get (path: string): Promise<any> {
    // console.log('path: ', path)
    const res = await this.fetchTimeout(path, {
      method: 'GET',
      headers: {
        connection: 'open'
      }
    })
    const json = await res.json()
    raiseIfError(json)
    return json
  }

  async data (path: string): Promise<any> {
    const res = await this.get(path)
    return res.error !== undefined ? res.error : res.data
  }

  async post (path: string, body?: any): Promise<any> {
    const res = await this.fetchTimeout(path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        connection: 'open'
      },
      body: JSON.stringify(body)
    })
    const json = await res.json()
    raiseIfError(json)
    return json
  }

  private async fetchTimeout (path: string, init: RequestInit): Promise<Response> {
    const { url: endpoint, version, network, timeout } = this.options
    const url = `${endpoint}/${version}/${network}/${path}`

    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeout)

    const req = fetch(url, {
      cache: 'no-cache',
      signal: controller.signal,
      keepalive: true,
      ...init
    })

    try {
      const res = await req
      clearTimeout(id)
      return res
    } catch (err: any) {
      if (err.type === 'aborted') {
        throw new ClientApiError(`request aborted due to set timeout of ${timeout}ms`)
      }

      throw err
    }
  }
}

export class DAddressController {
  constructor (protected readonly client: DefidOceanApiClient) {
  }

  async getAccountHistory (address: string, height: number, txno: number): Promise<AddressHistory> {
    return await this.client.data(`address/${address}/history/${height}/${txno}`)
  }

  async listAccountHistory (address: string, query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<AddressHistory>> {
    return await this.client.get(`address/${address}/history?size=${query.size}&next=${query.next}`)
  }

  async getBalance (address: string): Promise<string> {
    return await this.client.data(`address/${address}/balance`)
  }

  async getAggregation (address: string): Promise<ScriptAggregation | undefined> {
    return await this.client.data(`address/${address}/aggregation`)
  }

  async listTokens (address: string, query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<AddressToken>> {
    return await this.client.get(`address/${address}/tokens?size=${query.size}&next=${query.next}`)
  }

  async listVaults (address: string, query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<LoanVaultActive | LoanVaultLiquidated>> {
    return await this.client.get(`address/${address}/vaults?size=${query.size}&next=${query.next}`)
  }

  async listTransactions (address: string, query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<ScriptActivity>> {
    return await this.client.get(`address/${address}/transactions?size=${query.size}&next=${query.next}`)
  }

  async listTransactionsUnspent (address: string, query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<ScriptUnspent>> {
    return await this.client.get(`address/${address}/transactions/unspent?size=${query.size}&next=${query.next}`)
  }
}

export class DBlockController {
  constructor (protected readonly client: DefidOceanApiClient) {
  }

  async list (query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<Block>> {
    // TODO(canonbrother): `next` should be height, not hash
    // const next = parseHeight(query.next)
    return await this.client.get(`blocks?size=${query.size}&next=${query.next}`)
  }

  async get (hashOrHeight: string): Promise<Block | undefined> {
    const height = parseHeight(hashOrHeight)
    if (height !== undefined) {
      return await this.client.data(`blocks/${height}`)
    }
    if (isSHA256Hash(hashOrHeight)) {
      return await this.client.data(`blocks/${hashOrHeight}`)
    }
    return undefined
  }

  async getTransactions (hash: string, query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<Transaction>> {
    if (!isSHA256Hash(hash)) {
      return ApiPagedResponse.empty()
    }
    return await this.client.get(`blocks/${hash}/transactions?size=${query.size}&next=${query.next}`)
  }

  async getHighest (): Promise<Block | undefined> {
    return await this.client.data('blocks/highest')
  }
}

export class DFeeController {
  constructor (protected readonly client: DefidOceanApiClient) {
  }

  async estimate (target: number = 10): Promise<number> {
    return await this.client.data(`fee/estimate?confirmationTarget=${target}`)
  }
}

export class DGovernanceController {
  constructor (protected readonly client: DefidOceanApiClient) {
  }

  async listProposals (
    status: ListProposalsStatus = ListProposalsStatus.ALL,
    type: ListProposalsType = ListProposalsType.ALL,
    cycle: number = 0,
    all: boolean = false,
    query: OceanListQuery = { size: 30 }
  ): Promise<ApiPagedResponse<GovernanceProposal>> {
    return await this.client.get(`governance/proposals?status=${status}&type=${type}&cycle=${cycle}&all=${all}&size=${query.size}&next=${query.next}`)
  }

  async getProposal (id: string): Promise<GovernanceProposal> {
    return await this.client.data(`governance/proposals/${id}`)
  }

  async listProposalVotes (
    id: string,
    masternode: MasternodeType = MasternodeType.MINE,
    cycle: number = 0,
    all: boolean = false,
    query: OceanListQuery = { size: 30 }
  ): Promise<ApiPagedResponse<ProposalVotesResult>> {
    return await this.client.get(`governance/proposals/${id}/votes?masternode=${masternode}&cycle=${cycle}&all=${all}&size=${query.size}&next=${query.next}`)
  }
}

export class DLoanController {
  constructor (protected readonly client: DefidOceanApiClient) {
  }

  async listScheme (query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<LoanScheme>> {
    return await this.client.get(`loans/schemes?size=${query.size}&next=${query.next}`)
  }

  async getScheme (id: string): Promise<LoanScheme> {
    return await this.client.data(`loans/schemes/${id}`)
  }

  async listCollateral (query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<CollateralToken>> {
    return await this.client.get(`loans/collaterals?size=${query.size}&next=${query.next}`)
  }

  async getCollateral (id: string): Promise<CollateralToken> {
    return await this.client.data(`loans/collaterals/${id}`)
  }

  async listLoanToken (query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<LoanToken>> {
    return await this.client.get(`loans/tokens?size=${query.size}&next=${query.next}`)
  }

  async getLoanToken (id: string): Promise<LoanToken> {
    return await this.client.data(`loans/tokens/${id}`)
  }

  async listVault (query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<LoanVaultActive | LoanVaultLiquidated>> {
    return await this.client.get(`loans/vaults?size=${query.size}&next=${query.next}`)
  }

  async getVault (id: string): Promise<LoanVaultActive | LoanVaultLiquidated> {
    return await this.client.data(`loans/vaults/${id}`)
  }

  async listVaultAuctionHistory (id: string, height: number, batchIndex: string, query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<VaultAuctionBatchHistory>> {
    return await this.client.get(`loans/vaults/${id}/auctions/${height}/batches/${batchIndex}/history?size=${query.size}&next=${query.next}`)
  }

  async listAuction (query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<LoanVaultLiquidated>> {
    return await this.client.get(`loans/auctions?size=${query.size}&next=${query.next}`)
  }
}

export class DMasternodeController {
  constructor (protected readonly client: DefidOceanApiClient) {
  }

  async list (query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<MasternodeData>> {
    return await this.client.get(`masternodes?size=${query.size}&next=${query.next}`)
  }

  async get (id: string): Promise<MasternodeData> {
    return await this.client.data(`masternodes/${id}`)
  }
}

export class DOracleController {
  constructor (protected readonly client: DefidOceanApiClient) {
  }

  async list (query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<Oracle>> {
    return await this.client.get(`oracles?size=${query.size}&next=${query.next}`)
  }

  async getPriceFeed (id: string, key: string): Promise<ApiPagedResponse<OraclePriceFeed>> {
    return await this.client.get(`oracles/${id}/${key}/feed`)
  }

  async getOracleByAddress (address: string): Promise<Oracle> {
    return await this.client.data(`oracles/${address}`)
  }
}

export class DPoolPairController {
  constructor (protected readonly client: DefidOceanApiClient) {
  }

  async list (query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<PoolPairData>> {
    return await this.client.get(`poolpairs?size=${query.size}&next=${query.next}`)
  }

  async get (id: string): Promise<PoolPairData> {
    return await this.client.data(`poolpairs/${id}`)
  }

  async listPoolSwaps (id: string, query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<PoolSwapData>> {
    return await this.client.get(`poolpairs/${id}/swaps?size=${query.size}&next=${query.next}`)
  }

  async listPoolSwapsVerbose (id: string, query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<PoolSwapData>> {
    return await this.client.get(`poolpairs/${id}/swaps/verbose?size=${query.size}&next=${query.next}`)
  }

  async listPoolSwapAggregates (id: string, interval: number, query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<PoolSwapAggregatedData>> {
    return await this.client.get(`poolpairs/${id}/swaps/aggregate/${interval}?size=${query.size}&next=${query.next}`)
  }

  async listSwappableTokens (id: string): Promise<AllSwappableTokensResult> {
    return await this.client.data(`poolpairs/paths/swappable/${id}`)
  }

  async listPaths (fromTokenId: string, toTokenId: string): Promise<SwapPathsResult> {
    return await this.client.data(`poolpairs/paths/from/${fromTokenId}/to/${toTokenId}`)
  }

  async getBestPath (fromTokenId: string, toTokenId: string): Promise<BestSwapPathResult> {
    return await this.client.data(`poolpairs/paths/best/from/${fromTokenId}/to/${toTokenId}`)
  }

  async listDexPrices (denomination: string): Promise<DexPricesResult> {
    return await this.client.data(`poolpairs/dexprices?denomination=${denomination}`)
  }
}

export class DPriceController {
  constructor (protected readonly client: DefidOceanApiClient) {
  }

  async list (query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<PriceTicker>> {
    return await this.client.get(`prices?size=${query.size}&next=${query.next}`)
  }

  async get (id: string): Promise<PriceTicker | undefined> {
    return await this.client.data(`prices/${id}`)
  }

  async getFeed (id: string): Promise<ApiPagedResponse<OraclePriceAggregated>> {
    return await this.client.get(`prices/${id}/feed`)
  }

  async getFeedActive (id: string): Promise<ApiPagedResponse<OraclePriceActive>> {
    return await this.client.get(`prices/${id}/feed/active`)
  }

  async getFeedWithInterval (id: string, interval: number): Promise<ApiPagedResponse<PriceFeedInterval>> {
    return await this.client.get(`prices/${id}/feed/interval/${interval}`)
  }

  async listPriceOracles (id: string): Promise<ApiPagedResponse<PriceOracle>> {
    return await this.client.get(`prices/${id}/oracles`)
  }
}

export class DRawTxController {
  constructor (protected readonly client: DefidOceanApiClient) {
  }

  async send (rawTxDto: RawTxDto): Promise<string> {
    return await this.client.post('rawtx/send', rawTxDto)
  }

  async test (rawTxDto: RawTxDto): Promise<void> {
    return await this.client.post('rawtx/test', rawTxDto)
  }

  async get (id: string, verbose = false): Promise<string | RawTransaction> {
    return await this.client.get(`rawtx/${id}?verbose=${verbose}`)
  }
}

export class DStatsController {
  constructor (protected readonly client: DefidOceanApiClient) {
  }

  async get (): Promise<StatsData> {
    return await this.client.get('stats')
  }

  async getSupply (): Promise<SupplyData> {
    return await this.client.get('stats/supply')
  }

  async getBurn (): Promise<BurnData> {
    return await this.client.get('stats/burn')
  }

  async getRewardDistribution (): Promise<RewardDistributionData> {
    return await this.client.data('stats/reward/distribution')
  }
}

export class DTokenController {
  constructor (protected readonly client: DefidOceanApiClient) {
  }

  async list (query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<TokenData>> {
    return await this.client.get(`tokens?size=${query.size}&next=${query.next}`)
  }

  async get (id: string): Promise<TokenData> {
    return await this.client.data(`tokens/${id}`)
  }
}

export class DTransactionController {
  constructor (protected readonly client: DefidOceanApiClient) {
  }

  async get (id: string): Promise<Transaction> {
    return await this.client.data(`transactions/${id}`)
  }

  async getVins (id: string, query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<TransactionVin>> {
    return await this.client.get(`transactions/${id}/vins?size=${query.size}&next=${query.next}`)
  }

  async getVouts (id: string, query: OceanListQuery = { size: 30 }): Promise<ApiPagedResponse<TransactionVout>> {
    return await this.client.get(`transactions/${id}/vouts?size=${query.size}&next=${query.next}`)
  }
}

export class DRpcController {
  constructor (protected readonly client: DefidOceanApiClient) {}

  async post (rpcDto: RpcDto): Promise<any> {
    return await this.client.post('rpc', rpcDto)
  }
}

export class DefidOcean {
  readonly addressController = new DAddressController(this.api)
  readonly blockController = new DBlockController(this.api)
  readonly feeController = new DFeeController(this.api)
  readonly governanceController = new DGovernanceController(this.api)
  readonly loanController = new DLoanController(this.api)
  readonly masternodeController = new DMasternodeController(this.api)
  readonly oracleController = new DOracleController(this.api)
  readonly poolPairController = new DPoolPairController(this.api)
  readonly priceController = new DPriceController(this.api)
  readonly rawTxController = new DRawTxController(this.api)
  readonly statsController = new DStatsController(this.api)
  readonly transactionController = new DTransactionController(this.api)
  readonly tokenController = new DTokenController(this.api)
  readonly rpcController = new DRpcController(this.api)

  constructor (
    readonly api: DefidOceanApiClient
  ) {
  }
}

export class DefidRpcToken {
  constructor (private readonly defid: DefidBin, private readonly rpc: DefidRpcClient) {
  }

  async create (options: TestingTokenCreate): Promise<string> {
    await this.defid.waitForWalletBalanceGTE(101) // token creation fee

    return await this.rpc.token.createToken({
      name: options.symbol,
      isDAT: true,
      mintable: true,
      tradeable: true,
      collateralAddress: await this.defid.getNewAddress(),
      ...options
    })
  }

  async dfi (options: TestingTokenDFI): Promise<string> {
    const { amount, address } = options
    await this.defid.waitForWalletBalanceGTE(new BigNumber(amount).toNumber())

    const to = address ?? await this.defid.getNewAddress()
    const account = `${new BigNumber(amount).toFixed(8)}@0`
    return await this.rpc.account.utxosToAccount({ [to]: account })
  }

  async mint (options: TestingTokenMint): Promise<string> {
    const { amount, symbol } = options
    const account = `${new BigNumber(amount).toFixed(8)}@${symbol}`
    return await this.rpc.token.mintTokens({ amounts: [account] })
  }

  async send (options: TestingTokenSend): Promise<string> {
    const { address, amount, symbol } = options
    const account = `${new BigNumber(amount).toFixed(8)}@${symbol}`
    const to = { [address]: [account] }
    return await this.rpc.account.sendTokensToAddress({}, to)
  }

  async getTokenId (symbol: string): Promise<string> {
    const tokenInfo = await this.rpc.token.getToken(symbol)
    return Object.keys(tokenInfo)[0]
  }

  async burn (options: TestingTokenBurn): Promise<string> {
    const { amount, symbol, from, context } = options
    const account = `${new BigNumber(amount).toFixed(8)}@${symbol}`
    return await this.rpc.token.burnTokens(account, from, context)
  }
}

export class DefidRpcPoolPair {
  constructor (
    private readonly defid: DefidBin,
    private readonly rpc: DefidRpcClient
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
      ownerAddress: await this.defid.getNewAddress(),
      ...options
    })
  }

  async add (options: TestingPoolPairAdd): Promise<string> {
    const accountA = `${new BigNumber(options.a.amount).toFixed(8)}@${options.a.symbol}`
    const accountB = `${new BigNumber(options.b.amount).toFixed(8)}@${options.b.symbol}`
    const from = { '*': [accountA, accountB] }
    const address = options.address ?? await this.defid.getNewAddress()
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

export class DefidRpcClient extends JsonRpcClient {
}

export class DefidRpc {
  readonly token = new DefidRpcToken(this.defid, this.client)
  readonly poolpair = new DefidRpcPoolPair(this.defid, this.client)

  private readonly addresses: Record<string, string> = {}

  constructor (
    private readonly defid: DefidBin,
    readonly client: DefidRpcClient
  ) {
  }

  async generate (n: number): Promise<void> {
    await this.defid.generate(n)
  }

  async address (key: number | string): Promise<string> {
    key = key.toString()
    if (this.addresses[key] === undefined) {
      this.addresses[key] = await this.generateAddress()
    }
    return this.addresses[key]
  }

  generateAddress (): Promise<string>
  generateAddress (n: 1): Promise<string>
  generateAddress (n: number): Promise<string[]>

  async generateAddress (n?: number): Promise<string | string[]> {
    if (n === undefined || n === 1) {
      return await this.defid.getNewAddress()
    }

    const addresses: string[] = []
    for (let i = 0; i < n; i++) {
      addresses[i] = await this.defid.getNewAddress()
    }
    return addresses
  }
}

export class DefidBin {
  tmpDir = `/tmp/${uuidv4()}`
  binary: ChildProcess | null = null

  port = this.randomPort()

  rpcPort = this.randomPort()
  wsPort = this.randomPort()
  ethRpcPort = this.randomPort()
  rpcUrl = `http://test:test@127.0.0.1:${this.rpcPort}`
  rpcClient = new DefidRpcClient(this.rpcUrl)
  rpc = new DefidRpc(this, this.rpcClient)

  oceanPort = this.randomPort(3000, 3999)
  oceanClient = new DefidOceanApiClient({ url: `http://127.0.0.1:${this.oceanPort}` })
  ocean = new DefidOcean(this.oceanClient)

  private randomPort (min: number = 10000, max: number = 19999): number {
    return Math.floor(Math.random() * max) + min
  }

  async start (opts: string[] = []): Promise<void> {
    fs.mkdirSync(this.tmpDir)

    if (process.env.DEFID === undefined) {
      throw new Error('`process.env.DEFID` is required')
    }

    const args = [
      // prepend
      `-datadir=${this.tmpDir}`,
      '-printtoconsole',
      '-rpcuser=test',
      '-rpcpassword=test',
      `-rpcport=${this.rpcPort}`,
      `-port=${this.port}`,
      `-wsport=${this.wsPort}`,
      `-ethrpcport=${this.ethRpcPort}`,
      '-rpcallowip=0.0.0.0/0',
      // regtest
      '-regtest',
      '-jellyfish_regtest=1',
      '-regtest-skip-loan-collateral-validation',
      '-regtest-minttoken-simulate-mainnet=0',
      '-rpc-governance-accept-neutral=1',
      '-txnotokens=0',
      '-logtimemicros',
      '-txindex=1',
      '-acindex=1',
      // mn
      '-dummypos=0',
      '-spv=1',
      '-anchorquorum=2',
      `-masternode_operator=${RegTestFoundationKeys[1].operator.address}`,
      // ocean
      '-oceanarchive',
      '-oceanarchiveserver',
      `-oceanarchiveport=${this.oceanPort}`,
      '-oceanarchivebind=0.0.0.0',
      // hf
      '-amkheight=0',
      '-bayfrontheight=1',
      '-bayfrontgardensheight=2',
      '-clarkequayheight=3',
      '-dakotaheight=4',
      '-dakotacrescentheight=5',
      '-eunosheight=6',
      '-eunospayaheight=7',
      '-fortcanningheight=8',
      '-fortcanningmuseumheight=9',
      '-fortcanninghillheight=10',
      '-fortcanningroadheight=11',
      '-fortcanningcrunchheight=12',
      '-fortcanningspringheight=13',
      '-fortcanninggreatworldheight=14',
      '-fortcanningepilogueheight=15',
      '-grandcentralheight=16',
      '-grandcentralepilogueheight=17',
      '-metachainheight=18',
      ...opts
    ]

    const binary = spawn(process.env.DEFID, args)

    binary.on('error', err => {
      if ((err as any).errno === 'ENOENT') {
        console.error('\x1b[31mMissing Defid binary.\nPlease compile the Defid\x1b[0m')
      } else {
        console.error(err)
      }
      process.exit(1)
    })

    const logs: string[] = []

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        console.error('\x1b[31m Failed to start Defid node.\x1b[0m')
        console.error(logs.map(chunk => chunk.toString()).join('\n'))
        process.exit(1)
      }, SPAWNING_TIME - 2_000)

      const onData = async (chunk: any) => {
        logs.push(chunk)

        /* eslint-disable-next-line @typescript-eslint/strict-boolean-expressions */
        if (chunk.toString().match(/addcon thread start/)) {
          // wait for ocean
          await new Promise((resolve) => setTimeout(resolve, 1_000))

          try {
            await this.ocean.blockController.get('0')
            // console.log('[DefidBin.start()] blockController.get genesis.hash: ', res?.hash)
          } catch (err) {
            console.log('[DefidBin.start()] blockController.get genesis err: ', err)
          }

          clearTimeout(timer)

          binary.stderr.off('data', onData)
          binary.stdout.off('data', onData)

          await this.call('importprivkey', [RegTestFoundationKeys[1].owner.privKey])
          await this.call('importprivkey', [RegTestFoundationKeys[1].operator.privKey])

          // setgov
          // generate(2)

          resolve()
        }
      }

      binary.stderr.on('data', onData)
      binary.stdout.on('data', onData)
    })

    this.binary = binary
  }

  async stop (): Promise<void> {
    const interval = setInterval(() => {
      if (this.binary?.pid !== undefined) {
        clearInterval(interval)
        exec(`kill -9 ${this.binary?.pid}`)
        fs.rmdirSync(this.tmpDir, { recursive: true })
      }
    }, 500)
    this.binary?.kill()
  }

  async call (method: string, params: any = []): Promise<any> {
    const body = JSON.stringify({
      jsonrpc: '1.0',
      id: Math.floor(Math.random() * 100000000000000),
      method: method,
      params: params
    })

    const text = await this.post(body)
    const {
      result,
      error
    } = JSON.parse(text)

    if (error !== undefined && error !== null) {
      throw new DeFiDRpcError(error)
    }

    return result
  }

  async post (body: string): Promise<string> {
    const response = await fetch(this.rpcUrl, {
      method: 'POST',
      body: body
    })
    return await response.text()
  }

  async generate (
    nblocks: number,
    address?: string | undefined,
    maxTries: number = 1000000
  ): Promise<void> {
    if (address === undefined) {
      address = await this.call('getnewaddress')
    }
    for (let minted = 0, tries = 0; minted < nblocks && tries < maxTries; tries++) {
      const result = await this.call('generatetoaddress', [1, address, 1])
      if (result === 1) {
        minted += 1
      }
    }
  }

  async waitForBlockHeight (height: number, timeout = 590000): Promise<void> {
    return await waitForCondition(async () => {
      const count = await this.getBlockCount()
      if (count > height) {
        return true
      }
      await this.generate(1)
      return false
    }, timeout, 100, 'waitForBlockHeight')
  }

  async waitForIndexedHeight (height: number, timeout: number = 30000): Promise<void> {
    await waitForExpect(async () => {
      const block = await this.ocean.blockController.getHighest()
      expect(block?.height).toBeGreaterThan(height)
    }, timeout)
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  async waitForWalletCoinbaseMaturity (timeout: number = 180000, mockTime: boolean = true): Promise<void> {
    if (!mockTime) {
      return await this.waitForBlockHeight(100, timeout)
    }

    let fakeTime: number = 1579045065
    await this.call('setmocktime', [fakeTime])

    const intervalId = setInterval(() => {
      fakeTime += 3
      void this.call('setmocktime', [fakeTime])
    }, 200)

    await this.waitForBlockHeight(100, timeout)

    clearInterval(intervalId)
    await this.call('setmocktime', [0])
  }

  async waitForAddressTxCount (controller: DAddressController, address: string, txCount: number, timeout: number = 15000): Promise<void> {
    return await waitForCondition(async () => {
      const agg = await controller.getAggregation(address)
      if (agg?.statistic.txCount === txCount) {
        return true
      }
      await this.generate(1)
      return false
    }, timeout, 100, 'waitForAddressTxCcount')
  }

  async waitForWalletBalanceGTE (balance: number, timeout: number = 300000): Promise<void> {
    return await waitForCondition(async () => {
      const getbalance = await this.call('getbalance')
      if (getbalance >= balance) {
        return true
      }
      await this.generate(1)
      return false
    }, timeout, 100, 'waitForWalletBalanceGTE')
  }

  async waitForPath (controller: DPoolPairController, timeout: number = 300000): Promise<void> {
    return await waitForCondition(async () => {
      const res = await controller.listSwappableTokens('0')
      if (res.swappableTokens.length > 0) {
        return true
      }
      return false
    }, timeout, 100, 'waitForPath')
  }

  async waitForActivePrice (fixedIntervalPriceId: string, activePrice: string, timeout = 30000): Promise<void> {
    return await waitForCondition(async () => {
      const data: any = await this.call('getfixedintervalprice', [fixedIntervalPriceId])
      // eslint-disable-next-line
      if (data.activePrice.toString() !== activePrice) {
        await this.generate(1)
        return false
      }
      return true
    }, timeout, 100, 'waitForActivePrice')
  }

  async fundAddress (address: string, amount: number): Promise<{ txid: string, vout: number }> {
    const txid = await this.call('sendtoaddress', [address, amount])
    await this.generate(1)

    const { vout }: {
      vout: Array<{
        n: number
        scriptPubKey: {
          addresses: string[]
        }
      }>
    } = await this.call('getrawtransaction', [txid, true])
    for (const out of vout) {
      if (out.scriptPubKey.addresses.includes(address)) {
        return {
          txid,
          vout: out.n
        }
      }
    }
    throw new Error('getrawtransaction will always return the required vout')
  }

  async getNewAddress (label: string = '', addressType: 'legacy' | 'p2sh-segwit' | 'bech32' | 'eth' | string = 'bech32'): Promise<string> {
    return await this.call('getnewaddress', [label, addressType])
  }

  async getBlockCount (): Promise<number> {
    return await this.call('getblockcount', [])
  }

  async utxosToAccount (
    amount: number,
    options?: UtxosToAccountOptions
  ): Promise<void> {
    await this.waitForWalletBalanceGTE(amount + 0.1)

    const address = options?.address ?? await this.getNewAddress()
    const payload: { [key: string]: string } = {}
    payload[address] = `${amount.toString()}@0`
    await this.call('utxostoaccount', [payload])
    await this.generate(1)
  }

  async sendTokensToAddress (
    address: string,
    amount: number,
    symbol: string
  ): Promise<string> {
    const txid = await this.call('sendtokenstoaddress', [{}, { [address]: [`${amount}@${symbol}`] }])
    await this.generate(1)
    return txid
  }

  async createToken (symbol: string, options?: CreateTokenOptions): Promise<number> {
    const metadata = {
      symbol,
      name: options?.name ?? symbol,
      isDAT: options?.isDAT ?? true,
      mintable: options?.mintable ?? true,
      tradeable: options?.tradeable ?? true,
      collateralAddress: options?.collateralAddress ?? await this.getNewAddress()
    }

    await this.waitForWalletBalanceGTE(101)
    await this.call('createtoken', [metadata])
    await this.generate(1)

    const res = await this.call('gettoken', [symbol])
    return Number.parseInt(Object.keys(res)[0])
  }

  async mintTokens (
    symbol: string,
    options?: MintTokensOptions
  ): Promise<string> {
    const address = options?.address ?? await this.getNewAddress()
    const utxoAmount = options?.utxoAmount ?? 2000
    const mintAmount = options?.mintAmount ?? 2000

    await this.utxosToAccount(utxoAmount, { address })

    const hashed = await this.call('minttokens', [`${mintAmount}@${symbol}`])
    await this.generate(1)

    return hashed
  }

  async createPoolPair (aToken: string, bToken: string, options?: CreatePoolPairOptions): Promise<string> {
    const metadata = {
      tokenA: aToken,
      tokenB: bToken,
      commission: options?.commission ?? 0,
      status: options?.status ?? true,
      ownerAddress: options?.ownerAddress ?? await this.getNewAddress()
    }
    const txid = await this.call('createpoolpair', [metadata, options?.utxos])
    await this.generate(1)
    return txid
  }

  async addPoolLiquidity (
    metadata: AddPoolLiquidityMetadata
  ): Promise<BigNumber> {
    const { amountA, amountB, tokenA, tokenB, shareAddress } = metadata
    const from = { '*': [`${amountA}@${tokenA}`, `${amountB}@${tokenB}`] }
    await this.call('addpoolliquidity', [from, shareAddress])
    await this.generate(1)

    const tokens: string[] = await this.call('getaccount', [shareAddress])
    const lpToken = tokens.find(value => value.endsWith(`@${tokenA}-${tokenB}`))
    if (lpToken === undefined) {
      throw new Error('LP token not found in account')
    }

    const amount = lpToken.replace(`@${tokenA}-${tokenB}`, '')
    return new BigNumber(amount)
  }

  async poolSwap (
    metadata: PoolSwapMetadata
  ): Promise<string> {
    const txid = await this.call('poolswap', [metadata])
    await this.generate(1)
    return txid
  }

  async createSignedTxnHex (
    aAmount: number,
    bAmount: number,
    options: CreateSignedTxnHexOptions = {
      aEllipticPair: Elliptic.fromPrivKey(Buffer.alloc(32, Math.random().toString(), 'ascii')),
      bEllipticPair: Elliptic.fromPrivKey(Buffer.alloc(32, Math.random().toString(), 'ascii'))
    }
  ): Promise<string> {
    const aBech32 = Bech32.fromPubKey(await options.aEllipticPair.publicKey(), RegTest.bech32.hrp as HRP)
    const bBech32 = Bech32.fromPubKey(await options.bEllipticPair.publicKey(), RegTest.bech32.hrp as HRP)

    const { txid, vout } = await this.fundAddress(aBech32, aAmount)
    const inputs = [{ txid: txid, vout: vout }]

    const unsigned = await this.call('createrawtransaction', [inputs, {
      [bBech32]: new BigNumber(bAmount)
    }])

    const signed = await this.call('signrawtransactionwithkey', [unsigned, [
      WIF.encode(RegTest.wifPrefix, await options.aEllipticPair.privateKey())
    ]])

    return signed.hex
  }
}
