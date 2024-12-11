import BigNumber from 'bignumber.js'
import { DLoanController, DefidBin, DefidRpc } from '../../e2e.defid.module'
import { WhaleApiException } from '@defichain/whale-api-client/dist/errors'

let testing: DefidRpc
let app: DefidBin
let controller: DLoanController

let address1: string
let vaultId1: string

beforeAll(async () => {
  app = new DefidBin()
  await app.start()
  controller = app.ocean.loanController
  testing = app.rpc
  await app.waitForWalletCoinbaseMaturity()
  await app.waitForWalletBalanceGTE(100)

  // loan schemes
  await testing.client.loan.createLoanScheme({
    minColRatio: 150,
    interestRate: new BigNumber(1.5),
    id: 'default'
  })
  await testing.generate(1)

  await testing.client.loan.createLoanScheme({
    minColRatio: 100,
    interestRate: new BigNumber(2.5),
    id: 'scheme'
  })
  await testing.generate(1)

  // Create vaults
  address1 = await testing.generateAddress()
  vaultId1 = await testing.client.loan.createVault({
    ownerAddress: address1,
    loanSchemeId: 'default'
  })
  await testing.generate(1)

  await testing.client.loan.createVault({
    ownerAddress: await testing.generateAddress(),
    loanSchemeId: 'default'
  })
  await testing.generate(1)

  await testing.client.loan.createVault({
    ownerAddress: await testing.generateAddress(),
    loanSchemeId: 'default'
  })
  await testing.generate(1)

  await testing.client.loan.createVault({
    ownerAddress: await testing.generateAddress(),
    loanSchemeId: 'default'
  })
  await testing.generate(1)
})

afterAll(async () => {
  await app.stop()
})

describe('loan', () => {
  it('should listVaults with size only', async () => {
    const result = await controller.listVault({
      size: 100
    })
    expect(result.data.length).toStrictEqual(4)
    result.data.forEach(e =>
      expect(e).toStrictEqual({
        vaultId: expect.any(String),
        loanScheme: {
          id: 'default',
          interestRate: '1.5',
          minColRatio: '150'
        },
        ownerAddress: expect.any(String),
        state: expect.any(String),
        informativeRatio: '-1',
        collateralRatio: '-1',
        collateralValue: '0',
        loanValue: '0',
        interestValue: '0',
        collateralAmounts: [],
        loanAmounts: [],
        interestAmounts: []
      })
    )
  })
})

describe('get', () => {
  it('should get vault by vaultId', async () => {
    const data = await controller.getVault(vaultId1)
    expect(data).toStrictEqual({
      vaultId: vaultId1,
      loanScheme: {
        id: 'default',
        interestRate: '1.5',
        minColRatio: '150'
      },
      ownerAddress: address1,
      // state: LoanVaultState.ACTIVE,
      state: 'active',
      informativeRatio: '-1',
      collateralRatio: '-1',
      collateralValue: '0',
      loanValue: '0',
      interestValue: '0',
      collateralAmounts: [],
      loanAmounts: [],
      interestAmounts: []
    })
  })

  it('should throw error while getting non-existent vault', async () => {
    expect.assertions(4)
    try {
      await controller.getVault('0530ab29a9f09416a014a4219f186f1d5d530e9a270a9f941275b3972b43ebb7')
    } catch (err: any) {
      expect(err).toBeInstanceOf(WhaleApiException)
      expect(err.error).toStrictEqual({
        code: 404,
        type: 'NotFound',
        at: expect.any(Number),
        message: 'Unable to find vault',
        url: '/v0/regtest/loans/vaults/0530ab29a9f09416a014a4219f186f1d5d530e9a270a9f941275b3972b43ebb7'
      })
    }

    try {
      await controller.getVault('999')
    } catch (err: any) {
      expect(err).toBeInstanceOf(WhaleApiException)
      expect(err.error).toStrictEqual({
        code: 404,
        type: 'NotFound',
        at: expect.any(Number),
        message: 'Unable to find vault',
        url: '/v0/regtest/loans/vaults/999'
      })
    }
  })
})
