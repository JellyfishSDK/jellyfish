import { ApiClient } from '../.'

export enum MasternodeState {
  PRE_ENABLED = 'PRE_ENABLED',
  ENABLED = 'ENABLED',
  PRE_RESIGNED = 'PRE_RESIGNED',
  RESIGNED = 'RESIGNED',
  PRE_BANNED = 'PRE_BANNED',
  BANNED = 'BANNED',
  UNKNOWN = 'UNKNOWN'
}

export enum MasternodeTimeLock {
  FIVE_YEAR = 'FIVEYEARTIMELOCK',
  TEN_YEAR = 'TENYEARTIMELOCK'
}

/**
 * Masternode RPCs for DeFi Blockchain
 */
export class Masternode {
  private readonly client: ApiClient

  constructor (client: ApiClient) {
    this.client = client
  }

  /**
   * Creates a masternode creation transaction with given owner and operator addresses.
   *
   * @param {string} ownerAddress Any valid address for keeping collateral amount
   * @param {string} [operatorAddress]  Masternode operator auth address (P2PKH only, unique). If empty, owner address will be used.
   * @param {CreateMasternodeOptions} [options]
   * @param {UTXO[]} [options.utxos = []]
   * @param {string} [options.utxos.txid] The transaction id
   * @param {string} [options.utxos.vout] The output number
   * @param {MasternodeTimeLock} [options.timelock] specify a fix period (5 or 10 years) lock which cannot be resigned and cannot spend the collateral
   * @return {Promise<string>}
   */
  async createMasternode (
    ownerAddress: string,
    operatorAddress?: string,
    options: CreateMasternodeOptions = { utxos: [] }
  ): Promise<string> {
    operatorAddress = operatorAddress ?? ownerAddress
    const params = [ownerAddress, operatorAddress, options.utxos]
    if (options.timelock !== undefined) {
      params.push(options.timelock)
    }
    return await this.client.call('createmasternode', params, 'number')
  }

  /**
   * Returns information about multiple masternodes.
   *
   * @param {MasternodePagination} pagination
   * @param {string} [pagination.start]
   * @param {boolean} [pagination.including_start = true] Include starting position.
   * @param {string} [pagination.limit = 100] Maximum number of orders to return.
   * @param {boolean} [verbose = true] Flag for verbose list. Only ids are returned when false.
   * @return {Promise<MasternodeResult<MasternodeInfo>>}
   */
  listMasternodes (pagination?: MasternodePagination, verbose?: boolean): Promise<MasternodeResult<MasternodeInfo>>

  /**
   * Returns information about multiple masternodes.
   *
   * @param {MasternodePagination} pagination
   * @param {string} [pagination.start]
   * @param {boolean} [pagination.including_start = true] Include starting position.
   * @param {string} [pagination.limit = 100] Maximum number of orders to return.
   * @param {boolean} verbose true
   * @return {Promise<MasternodeResult<MasternodeInfo>>}
   */
  listMasternodes (pagination: MasternodePagination, verbose: true): Promise<MasternodeResult<MasternodeInfo>>

  /**
   * Returns information about multiple masternodes.
   *
   * @param {MasternodePagination} pagination
   * @param {string} [pagination.start]
   * @param {boolean} [pagination.including_start = true] Include starting position.
   * @param {string} [pagination.limit = 100] Maximum number of orders to return.
   * @param {boolean} verbose false.
   * @return {Promise<MasternodeResult<string>>}
   */
  listMasternodes (pagination: MasternodePagination, verbose: false): Promise<MasternodeResult<string>>

  /**
   * Returns information about multiple masternodes.
   *
   * @param {MasternodePagination} pagination
   * @param {string} [pagination.start]
   * @param {boolean} [pagination.including_start = true] Include starting position.
   * @param {string} [pagination.limit = 100] Maximum number of orders to return.
   * @param {boolean} [verbose = true] Flag for verbose list. Only ids are returned when false.
   * @return {Promise<MasternodeResult<T>>}
   */
  async listMasternodes<T> (
    pagination: MasternodePagination = {
      including_start: true,
      limit: 100
    },
    verbose: boolean = true
  ): Promise<MasternodeResult<T>> {
    return await this.client.call('listmasternodes', [pagination, verbose], 'number')
  }

  /**
   * Returns information about a single masternode
   *
   * @param {string} masternodeId The masternode's id.
   * @return {Promise<MasternodeResult>}
   */
  async getMasternode (masternodeId: string): Promise<MasternodeResult<MasternodeInfo>> {
    return await this.client.call('getmasternode', [masternodeId], 'number')
  }

  /**
   * Creates a transaction resigning a masternode.
   *
   * @param {string} masternodeId The masternode's id.
   * @param {UTXO[]} [utxos = []] Array of specified utxos to spend.
   * @param {string} [utxos.txid] The transaction id.
   * @param {number} [utxos.vout] The output number.
   * @return {Promise<string>} Resignation Transaction.
   */
  async resignMasternode (masternodeId: string, utxos: UTXO[] = []): Promise<string> {
    return await this.client.call('resignmasternode', [masternodeId, utxos], 'number')
  }

  /**
   * Set special governance variables
   *
   * @param {Record<string, any>} input json object
   * @return {Promise<string>} hash
   *
   */
  async setGov (input: Record<string, any>): Promise<string> {
    return await this.client.call('setgov', [input], 'number')
  }

  /**
   * Set special governance variables with activation height specified
   *
   * @param {Record<string, any>} input json object
   * @param {number} activationHeight
   * @return {Promise<string>} hash
   *
   */
  async setGovWithHeight (input: Record<string, any>, activationHeight: number): Promise<string> {
    const currentHeight: number = await this.client.call('getblockcount', [], 'number')
    if (activationHeight < currentHeight) {
      throw new Error('GovVar activation height must be higher than current block height')
    }
    return await this.client.call('setgovheight', [input, activationHeight], 'number')
  }

  /**
   * Pre Fort Canning: Get information about governance variable
   *
   * @deprecated use {@link getGovWithHeight} for post Fort Canning hardfork
   * @param {string} name governance name
   * @return {Promise<Record<string, any>} governance information as json object
   */
  async getGov (name: string): Promise<Record<string, any>> {
    return await this.client.call('getgov', [name], 'bignumber')
  }

  /**
   * Post Fort Canning: Get information about governance variable
   * To replace {@link getGov}
   *
   * @param {string} name governance name
   * @return {Promise<Array<Record<string, any>>} governance information as json object
   * @example
   * {
   *   "LP_SPLITS": { "3": BigNumber, "4": BigNumber },
   *   "5000": { "3": BigNumber, "4": BigNumber }, // value after block height 5000
   *   "8000": { "3": BigNumber, "4": BigNumber } // value after block height 8000
   * }
   */
  async getGovWithHeight (name: string): Promise<Array<Record<string, any>>> {
    return await this.client.call('getgov', [name], 'bignumber')
  }

  /**
   * Returns number of unique masternodes in the last specified number of blocks.
   *
   * @param {number} [blockCount=20160] The number of blocks to check for unique masternodes.
   * @return {Promise<number>} Number of unique masternodes seen
   */
  async getActiveMasternodeCount (blockCount: number = 20160): Promise<number> {
    return await this.client.call('getactivemasternodecount', [blockCount], 'number')
  }
}

export interface UTXO {
  txid: string
  vout: number
}

export interface CreateMasternodeOptions {
  utxos: UTXO[]
  timelock?: MasternodeTimeLock
}

export interface MasternodePagination {
  start?: string
  including_start?: boolean
  limit?: number
}

export interface MasternodeInfo {
  ownerAuthAddress: string
  operatorAuthAddress: string
  creationHeight: number
  resignHeight: number
  resignTx: string
  banTx: string
  state: MasternodeState
  mintedBlocks: number
  ownerIsMine: boolean
  operatorIsMine: boolean
  localMasternode: boolean
  targetMultiplier?: number
  targetMultipliers?: number[]
  timelock?: number
}

export interface MasternodeResult<T> {
  [id: string]: T
}
