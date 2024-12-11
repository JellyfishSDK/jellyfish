import { MasterNodeRegTestContainer } from '@defichain/testcontainers'
import { getNewAddress } from './wallet'
import { utxosToAccount } from './account'

/**
 * Create a new token and return id of token.
 * This method will ensure there is enough DFI to create a token.
 *
 * @param {MasterNodeRegTestContainer} container
 * @param {string} symbol
 * @param {CreateTokenOptions} [options]
 * @param {string} [options.name]
 * @param {boolean} [options.isDAT=true]
 * @param {boolean} [options.mintable=true]
 * @param {boolean} [options.tradeable=true]
 * @param {string} [options.collateralAddress]
 * @return {Promise<number>} id of the created token
 * @deprecated use jellyfish-testing instead
 */
export async function createToken (
  container: MasterNodeRegTestContainer,
  symbol: string,
  options?: CreateTokenOptions
): Promise<number> {
  const metadata = {
    symbol,
    name: options?.name ?? symbol,
    isDAT: options?.isDAT ?? true,
    mintable: options?.mintable ?? true,
    tradeable: options?.tradeable ?? true,
    collateralAddress: options?.collateralAddress ?? await getNewAddress(container)
  }

  await container.waitForWalletBalanceGTE(101) // token creation fee
  await container.call('createtoken', [metadata])
  await container.generate(1)

  const result = await container.call('gettoken', [symbol])
  return Number.parseInt(Object.keys(result)[0])
}

/**
 * Mint tokens
 *
 * @param {MasterNodeRegTestContainer} container
 * @param {string} symbol
 * @param {MintTokensOptions} [options]
 * @param {string} [options.address]
 * @param {number} [options.utxoAmount]
 * @param {number} [options.mintAmount]
 * @return {Promise<string>}
 * @deprecated use jellyfish-testing instead
 */
export async function mintTokens (
  container: MasterNodeRegTestContainer,
  symbol: string,
  options?: MintTokensOptions
): Promise<string> {
  const address = options?.address ?? await getNewAddress(container)
  const utxoAmount = options?.utxoAmount ?? 2000
  const mintAmount = options?.mintAmount ?? 2000

  await utxosToAccount(container, utxoAmount, { address })

  const hashed = await container.call('minttokens', [`${mintAmount}@${symbol}`])
  await container.generate(1)

  return hashed
}

export interface MintTokensOptions {
  address?: string
  utxoAmount?: number
  mintAmount?: number
}

export interface CreateTokenOptions {
  name?: string
  isDAT?: boolean
  mintable?: boolean
  tradeable?: boolean
  collateralAddress?: string
}
