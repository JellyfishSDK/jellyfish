import { LoanMasterNodeRegTestContainer } from './loan_container'
import { UTXO } from '@defichain/jellyfish-api-core/category/loan'
import BigNumber from 'bignumber.js'
import { Testing } from '@defichain/jellyfish-testing'

describe('Loan', () => {
  const container = new LoanMasterNodeRegTestContainer()
  const testing = Testing.create(container)

  beforeAll(async () => {
    await testing.container.start()
    await testing.container.waitForWalletCoinbaseMaturity()

    // NOTE(jingyi2811): Default scheme
    await testing.rpc.loan.createLoanScheme(100, new BigNumber(1.5), { id: 'default' })
    await testing.generate(1)
  })

  afterEach(async () => {
    const data = await testing.container.call('listloanschemes')
    const result = data.filter((d: { default: boolean }) => !d.default)

    for (let i = 0; i < result.length; i += 1) {
      // NOTE(jingyi2811): Delete all schemes except default scheme
      await testing.container.call('destroyloanscheme', [result[i].id])
      await testing.generate(1)
    }
  })

  afterAll(async () => {
    await testing.container.stop()
  })

  it('should createLoanScheme', async () => {
    const loanSchemeId = await testing.rpc.loan.createLoanScheme(200, new BigNumber(2.5), { id: 'scheme1' })
    expect(typeof loanSchemeId).toStrictEqual('string')
    expect(loanSchemeId.length).toStrictEqual(64)
    await testing.generate(1)

    const data = await testing.container.call('listloanschemes')
    const result = data.filter((d: { id: string }) => d.id === 'scheme1')
    expect(result.length).toStrictEqual(1)
    expect(result[0]).toStrictEqual(
      { id: 'scheme1', mincolratio: 200, interestrate: 2.5, default: false }
    )
  })

  it('should not createLoanScheme if minColRatio is less than 100', async () => {
    const promise = testing.rpc.loan.createLoanScheme(99, new BigNumber(2.5), { id: 'scheme2' })
    await expect(promise).rejects.toThrow('RpcApiError: \'Test LoanSchemeTx execution failed:\nminimum collateral ratio cannot be less than 100\', code: -32600, method: createloanscheme')
  })

  it('should not createLoanScheme if interestRate is less than 0.01', async () => {
    const promise = testing.rpc.loan.createLoanScheme(200, new BigNumber(0.00999), { id: 'scheme2' })
    await expect(promise).rejects.toThrow('RpcApiError: \'Test LoanSchemeTx execution failed:\ninterest rate cannot be less than 0.01\', code: -32600, method: createloanscheme')
  })

  it('should not createLoanScheme if same minColRatio and interestRate were created before', async () => {
    const promise = testing.rpc.loan.createLoanScheme(100, new BigNumber(1.5), { id: 'scheme2' }) // NOTE(jingyi2811): Failed because its minColRatio and interestRate are same as default
    await expect(promise).rejects.toThrow('RpcApiError: \'Test LoanSchemeTx execution failed:\nLoan scheme default with same interestrate and mincolratio already exists\', code: -32600, method: createloanscheme')
  })

  it('should not createLoanScheme if same id was created before', async () => {
    const promise = testing.rpc.loan.createLoanScheme(200, new BigNumber(2.5), { id: 'default' })
    await expect(promise).rejects.toThrow('RpcApiError: \'Test LoanSchemeTx execution failed:\nLoan scheme already exist with id default\', code: -32600, method: createloanscheme')
  })

  it('should not createLoanScheme if id is an empty string', async () => {
    const promise = testing.rpc.loan.createLoanScheme(200, new BigNumber(2.5), { id: '' })
    await expect(promise).rejects.toThrow('RpcApiError: \'Test LoanSchemeTx execution failed:\nid cannot be empty or more than 8 chars long\', code: -32600, method: createloanscheme')
  })

  it('should not createLoanScheme if id is more than 8 chars long', async () => {
    const promise = testing.rpc.loan.createLoanScheme(200, new BigNumber(2.5), { id: '123456789' })
    await expect(promise).rejects.toThrow('RpcApiError: \'Test LoanSchemeTx execution failed:\nid cannot be empty or more than 8 chars long\', code: -32600, method: createloanscheme')
  })

  it('should createLoanScheme with utxos', async () => {
    const masternodes = await testing.container.call('listmasternodes')
    let masternodeId = ''
    for (const id in masternodes) {
      const masternode = masternodes[id]
      if (masternode.mintedBlocks > 0) { // NOTE(jingyi2811): Find masternode that mined at least one block
        masternodeId = id
        break
      }
    }

    const utxos = await testing.container.call('listunspent', [1, 9999999, [masternodes[masternodeId].ownerAuthAddress]])
    const inputs: UTXO[] = utxos.map((utxo: UTXO) => {
      return {
        txid: utxo.txid,
        vout: utxo.vout
      }
    })

    const loanSchemeId = await testing.rpc.loan.createLoanScheme(200, new BigNumber(2.5), { id: 'scheme1', utxos: inputs })
    expect(typeof loanSchemeId).toStrictEqual('string')
    expect(loanSchemeId.length).toStrictEqual(64)
    await testing.generate(1)

    const rawtx = await testing.container.call('getrawtransaction', [loanSchemeId, true])
    expect(rawtx.vin[0].txid).toStrictEqual(utxos[0].txid)
    expect(rawtx.vin[0].vout).toStrictEqual(utxos[0].vout)

    const data = await testing.container.call('listloanschemes')
    const result = data.filter((d: { id: string }) => d.id === 'scheme1')
    expect(result.length).toStrictEqual(1)
    expect(result[0]).toStrictEqual(
      { id: 'scheme1', mincolratio: 200, interestrate: 2.5, default: false }
    )
  })

  it('should not createLoanScheme with arbritary utxos', async () => {
    const { txid, vout } = await testing.container.fundAddress(await testing.generateAddress(), 10)
    const promise = testing.rpc.loan.createLoanScheme(200, new BigNumber(2.5), { id: 'scheme', utxos: [{ txid, vout }] })
    await expect(promise).rejects.toThrow('RpcApiError: \'Test LoanSchemeTx execution failed:\ntx not from foundation member!\', code: -32600, method: createloanscheme')
  })
})
