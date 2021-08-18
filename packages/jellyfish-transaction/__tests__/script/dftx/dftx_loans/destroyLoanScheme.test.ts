import { SmartBuffer } from 'smart-buffer'
import {
  CDestroyLoanScheme,
  DestroyLoanScheme
} from '../../../../src/script/dftx/dftx_loans'
import { OP_CODES } from '../../../../src/script'
import { toBuffer, toOPCodes } from '../../../../src/script/_buffer'
import { OP_DEFI_TX } from '../../../../src/script/dftx'
import BigNumber from 'bignumber.js'

it('should bi-directional buffer-object-buffer', () => {
  const fixtures = [
    '6a14446654784406736368656d65c800000000000000'
  ]

  fixtures.forEach(hex => {
    const stack = toOPCodes(
      SmartBuffer.fromBuffer(Buffer.from(hex, 'hex'))
    )
    const buffer = toBuffer(stack)
    expect(buffer.toString('hex')).toStrictEqual(hex)
    expect((stack[1] as OP_DEFI_TX).tx.type).toStrictEqual(0x44)
  })
})

const header = '6a144466547844' // OP_RETURN(0x1a) (length 20 = 0x14) CDfTx.SIGNATURE(0x44665478) CDestroyLoanScheme.OP_CODE(0x44)

const data = '06736368656d65c800000000000000'
const destroyLoanScheme: DestroyLoanScheme = {
  identifier: 'scheme',
  height: new BigNumber(200)
}

it('should craft dftx with OP_CODES._()', () => {
  const stack = [
    OP_CODES.OP_RETURN,
    OP_CODES.OP_DEFI_TX_DESTROY_LOAN_SCHEME(destroyLoanScheme)
  ]

  const buffer = toBuffer(stack)
  expect(buffer.toString('hex')).toStrictEqual(header + data)
})

describe('Composable', () => {
  it('should compose from buffer to composable', () => {
    const buffer = SmartBuffer.fromBuffer(Buffer.from(data, 'hex'))
    const composable = new CDestroyLoanScheme(buffer)

    expect(composable.toObject()).toStrictEqual(destroyLoanScheme)
  })

  it('should compose from composable to buffer', () => {
    const composable = new CDestroyLoanScheme(destroyLoanScheme)
    const buffer = new SmartBuffer()
    composable.toBuffer(buffer)

    expect(buffer.toBuffer().toString('hex')).toStrictEqual(data)
  })
})
