import BigNumber from 'bignumber.js'
import { MasterNodeRegTestContainer } from '@defichain/testcontainers'
import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc'

export class TestingToken {
  constructor (
    private readonly container: MasterNodeRegTestContainer,
    private readonly rpc: JsonRpcClient
  ) {
  }

  async create (options: TestingTokenCreate): Promise<string> {
    await this.container.waitForWalletBalanceGTE(101) // token creation fee

    return await this.rpc.token.createToken({
      name: options.symbol,
      isDAT: true,
      mintable: true,
      tradeable: true,
      collateralAddress: await this.container.getNewAddress(),
      ...options
    })
  }

  async dfi (options: TestingTokenDFI): Promise<string> {
    const { amount, address } = options
    await this.container.waitForWalletBalanceGTE(new BigNumber(amount).toNumber())

    const to = address ?? await this.container.getNewAddress()
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

export interface TestingTokenCreate {
  symbol: string
  name?: string
  isDAT?: boolean
  mintable?: boolean
  tradeable?: boolean
  collateralAddress?: string
}

export interface TestingTokenDFI {
  address?: string
  amount: number | string
}

export interface TestingTokenMint {
  amount: number | string
  symbol: string
}

export interface TestingTokenSend {
  address: string
  amount: number | string
  symbol: string
}

export interface TestingTokenBurn {
  amount: number | string
  symbol: string
  from: string
  context?: string
}
