import BigNumber from 'bignumber.js'
import { DLoanController, DefidBin, DefidRpc } from '../../e2e.defid.module'
import { WhaleApiException } from '@defichain/whale-api-client/dist/errors'

let testing: DefidRpc
let app: DefidBin
let controller: DLoanController

beforeAll(async () => {
  app = new DefidBin()
  await app.start()
  controller = app.ocean.loanController
  testing = app.rpc
  await app.waitForBlockHeight(101)

  await testing.client.loan.createLoanScheme({
    minColRatio: 100,
    interestRate: new BigNumber(6.5),
    id: 'default'
  })
  await app.generate(1)

  await testing.client.loan.createLoanScheme({
    minColRatio: 150,
    interestRate: new BigNumber(5.5),
    id: 'scheme1'
  })
  await app.generate(1)

  await testing.client.loan.createLoanScheme({
    minColRatio: 200,
    interestRate: new BigNumber(4.5),
    id: 'scheme2'
  })
  await app.generate(1)

  await testing.client.loan.createLoanScheme({
    minColRatio: 250,
    interestRate: new BigNumber(3.5),
    id: 'scheme3'
  })
  await app.generate(1)
})

afterAll(async () => {
  await app.stop()
})

describe('loan', () => {
  it('should listLoanSchemes', async () => {
    const result = await controller.listScheme({ size: 100 })
    expect(result.data.length).toStrictEqual(4)
    expect(result.data).toStrictEqual([
      {
        id: 'default',
        minColRatio: '100',
        interestRate: '6.5'
      },
      {
        id: 'scheme1',
        minColRatio: '150',
        interestRate: '5.5'
      },
      {
        id: 'scheme2',
        minColRatio: '200',
        interestRate: '4.5'
      },
      {
        id: 'scheme3',
        minColRatio: '250',
        interestRate: '3.5'
      }
    ])
  })

  it('should listSchemes with pagination', async () => {
    const first = await controller.listScheme({ size: 2 })

    expect(first.data.length).toStrictEqual(2)
    expect(first.page?.next).toStrictEqual('scheme1')

    expect(first.data[0].id).toStrictEqual('default')
    expect(first.data[1].id).toStrictEqual('scheme1')

    const next = await controller.listScheme({
      size: 2,
      next: first.page?.next
    })

    expect(next.data.length).toStrictEqual(2)
    expect(next.page?.next).toStrictEqual('scheme3')

    expect(next.data[0].id).toStrictEqual('scheme2')
    expect(next.data[1].id).toStrictEqual('scheme3')

    const last = await controller.listScheme({
      size: 2,
      next: next.page?.next
    })

    expect(last.data.length).toStrictEqual(0)
    expect(last.page).toBeUndefined()
  })

  it('should listSchemes with an empty object if size 100 next 300 which is out of range', async () => {
    const result = await controller.listScheme({ size: 100, next: '300' })

    expect(result.data.length).toStrictEqual(0)
    expect(result.page).toBeUndefined()
  })
})

describe('get', () => {
  it('should get scheme by symbol', async () => {
    const data = await controller.getScheme('default')
    expect(data).toStrictEqual(
      {
        id: 'default',
        minColRatio: '100',
        interestRate: '6.5'
      }
    )
  })

  it('should throw error while getting non-existent scheme', async () => {
    expect.assertions(2)
    try {
      await controller.getScheme('999')
    } catch (err: any) {
      expect(err).toBeInstanceOf(WhaleApiException)
      expect(err.error).toStrictEqual({
        code: 404,
        type: 'NotFound',
        at: expect.any(Number),
        message: 'Unable to find scheme',
        url: '/v0/regtest/loans/schemes/999'
      })
    }
  })
})
