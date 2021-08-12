import { SmartBuffer } from 'smart-buffer'
import { OP_DEFI_TX } from '../../../../src/script/dftx'
import { OP_CODES } from '../../../../src'
import { toBuffer, toOPCodes } from '../../../../src/script/_buffer'
import { CCreateMasterNode, CreateMasterNode } from '../../../../src/script/dftx/dftx_masternode'

it('should bi-directional buffer-object-buffer', () => {
  const fixtures = [
    '6a1a44665478430121978f97842d623b79acecd7201a60538c13e935', // undefined operator pkh, use collateral pkh
    '6a1a44665478430147bfb0a67b85a1718381558434fbfe7c4866cf2e', // p2pkh
    '6a1a4466547843040e12cde53c156560faa1d01d144d234a74b65395', // p2wpkh
    '6a1c4466547843040e12cde53c156560faa1d01d144d234a74b653950401', // with timelock 5 years (260)
    '6a1c4466547843040e12cde53c156560faa1d01d144d234a74b653950802' // with timelock 10 years (520)
  ]

  fixtures.forEach(hex => {
    const stack = toOPCodes(
      SmartBuffer.fromBuffer(Buffer.from(hex, 'hex'))
    )
    const buffer = toBuffer(stack)
    expect(buffer.toString('hex')).toStrictEqual(hex)
    expect((stack[1] as OP_DEFI_TX).tx.type).toStrictEqual(0x43)
  })
})

const header = '6a1c4466547843' // OP_RETURN(0x1a) (length 28 = 0x1c) CDfTx.SIGNATURE(0x44665478) CCreateMasterNode.OP_CODE(0x43)
const data = '01742b337e0f40d5f229a89d3a26d53ae1093b6cff0802' // CreateMasterNode.operatorType(0x01) CreateMasterNode.operatorAuthAddress(0x742b337e0f40d5f229a89d3a26d53ae1093b6cff) CreateMasterNode.timelock(0x0802)
const createMasterNode: CreateMasterNode = {
  operatorType: 0x01,
  operatorAuthAddress: '742b337e0f40d5f229a89d3a26d53ae1093b6cff',
  timelock: 0x0208
}

it('should craft dftx with OP_CODES._()', () => {
  const stack = [
    OP_CODES.OP_RETURN,
    OP_CODES.OP_DEFI_TX_CREATE_MASTER_NODE(createMasterNode)
  ]

  const buffer = toBuffer(stack)
  expect(buffer.toString('hex')).toStrictEqual(header + data)
})

describe('Composable', () => {
  it('should compose from buffer to composable', () => {
    const buffer = SmartBuffer.fromBuffer(Buffer.from(data, 'hex'))
    const composable = new CCreateMasterNode(buffer)
    expect(composable.toObject()).toStrictEqual(createMasterNode)
  })

  it('should compose from composable to buffer', () => {
    const composable = new CCreateMasterNode(createMasterNode)
    const buffer = new SmartBuffer()
    composable.toBuffer(buffer)

    expect(buffer.toBuffer().toString('hex')).toStrictEqual(data)
  })
})
