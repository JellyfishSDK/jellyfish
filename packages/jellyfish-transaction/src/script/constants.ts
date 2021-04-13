import { StaticCode } from './opcode'

/**
 * An empty array of bytes is pushed onto the stack.
 * (This is not a no-op: an item is added to the stack.)
 * @see OP_FALSE
 */
export class OP_0 extends StaticCode {
  constructor () {
    super(0x00)
  }

  asm (): string {
    return 'OP_0'
  }
}

/**
 * An empty array of bytes is pushed onto the stack.
 * (This is not a no-op: an item is added to the stack.)
 * @see OP_0
 */
export class OP_FALSE extends OP_0 {
  asm (): string {
    return 'OP_FALSE'
  }
}
