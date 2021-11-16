import { SmartBuffer } from 'smart-buffer'
import {
  CSetLoanScheme,
  SetLoanScheme
} from '../../../../src/script/dftx/dftx_loans'
import { OP_CODES } from '../../../../src/script'
import { toBuffer, toOPCodes } from '../../../../src/script/_buffer'
import { OP_DEFI_TX } from '../../../../src/script/dftx'
import BigNumber from 'bignumber.js'

it('should bi-directional buffer-object-buffer', () => {
  const fixtures = [
    '6a20446654784cc800000080b2e60e0000000006736368656d650000000000000000'
  ]

  fixtures.forEach(hex => {
    const stack = toOPCodes(
      SmartBuffer.fromBuffer(Buffer.from(hex, 'hex'))
    )
    const buffer = toBuffer(stack)
    expect(buffer.toString('hex')).toStrictEqual(hex)
    expect((stack[1] as OP_DEFI_TX).tx.type).toStrictEqual(0x4c)
  })
})

const header = '6a20446654784c' // OP_RETURN(0x6a) (length 32 = 0x20) CDfTx.SIGNATURE(0x44665478) CSetLoanScheme.OP_CODE(0x4c)
const data = 'c800000080b2e60e0000000006736368656d650000000000000000'
const setLoanScheme: SetLoanScheme = {
  ratio: 200,
  rate: new BigNumber(2.5),
  identifier: 'scheme',
  update: new BigNumber(0)
}

it('should craft dftx with OP_CODES._()', () => {
  const stack = [
    OP_CODES.OP_RETURN,
    OP_CODES.OP_DEFI_TX_SET_LOAN_SCHEME(setLoanScheme)
  ]

  const buffer = toBuffer(stack)
  expect(buffer.toString('hex')).toStrictEqual(header + data)
})

describe('Composable', () => {
  it('should compose from buffer to composable', () => {
    const buffer = SmartBuffer.fromBuffer(Buffer.from(data, 'hex'))
    const composable = new CSetLoanScheme(buffer)

    expect(composable.toObject()).toStrictEqual(setLoanScheme)
  })

  it('should compose from composable to buffer', () => {
    const composable = new CSetLoanScheme(setLoanScheme)
    const buffer = new SmartBuffer()
    composable.toBuffer(buffer)

    expect(buffer.toBuffer().toString('hex')).toStrictEqual(data)
  })
})
