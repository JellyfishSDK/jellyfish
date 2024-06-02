import { MasterNodeRegTestContainer } from '@defichain/testcontainers'
import { Testing } from '@defichain/jellyfish-testing'
import { RpcApiError } from '@defichain/jellyfish-api-core'

describe('Invalidate block', () => {
  const testing = Testing.create(new MasterNodeRegTestContainer())

  beforeAll(async () => {
    await testing.container.start()
  })

  afterAll(async () => {
    await testing.container.stop()
  })

  it('should throw error if no blockhash provided', async () => {
    const promise = testing.rpc.blockchain.invalidateBlock('')

    await expect(promise).rejects.toThrow(RpcApiError)
    await expect(promise).rejects.toMatchObject({
      payload: {
        code: -8,
        message: 'blockhash must be of length 64 (not 0, for \'\')',
        method: 'invalidateblock'
      }
    })
  })

  it('should throw error if invalid blockhash provided - invalid length', async () => {
    const promise = testing.rpc.blockchain.invalidateBlock('invalidblockhash')

    await expect(promise).rejects.toThrow(RpcApiError)
    await expect(promise).rejects.toMatchObject({
      payload: {
        code: -8,
        message: 'blockhash must be of length 64 (not 16, for \'invalidblockhash\')',
        method: 'invalidateblock'
      }
    })
  })

  it('should throw error if invalid blockhash provided - invalid hex string', async () => {
    const promise = testing.rpc.blockchain.invalidateBlock('d744db74fb70ed42767aj028a129365fb4d7de54ba1b6575fb047490554f8a7b')

    await expect(promise).rejects.toThrow(RpcApiError)
    await expect(promise).rejects.toMatchObject({
      payload: {
        code: -8,
        message: 'blockhash must be hexadecimal string (not \'d744db74fb70ed42767aj028a129365fb4d7de54ba1b6575fb047490554f8a7b\')',
        method: 'invalidateblock'
      }
    })
  })

  it('should throw error if block is not found', async () => {
    const promise = testing.rpc.blockchain.reconsiderBlock('a9b5faec3324361a842df4302ce987f5fe1c5ce9ba53650f3a54397a36fea3b2')

    await expect(promise).rejects.toThrow(RpcApiError)
    await expect(promise).rejects.toMatchObject({
      payload: {
        code: -5,
        message: 'Block not found',
        method: 'reconsiderblock'
      }
    })
  })

  it('should invalidate block', async () => {
    await testing.generate(1) // generate some blocks to have a chain history
    const blockToInvalidate = await testing.rpc.blockchain.getBestBlockHash()

    await testing.generate(2) // generate new blocks
    await expect(testing.rpc.blockchain.getBestBlockHash()).not.toStrictEqual(blockToInvalidate) // confirm that new blocks were generated
    const promise = testing.rpc.blockchain.invalidateBlock(blockToInvalidate)

    await expect(promise).toBeTruthy()
  })
})
