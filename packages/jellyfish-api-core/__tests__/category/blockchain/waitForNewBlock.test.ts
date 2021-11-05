import { MasterNodeRegTestContainer } from '@defichain/testcontainers'
import { ContainerAdapterClient } from '../../container_adapter_client'

const container = new MasterNodeRegTestContainer()
const client = new ContainerAdapterClient(container)

describe('new block height 10', () => {
  beforeAll(async () => {
    await container.start()
  })

  afterAll(async () => {
    await container.stop()
  })

  it('should wait for new block height', async () => {
    {
      const count = await client.blockchain.getBlockCount()
      expect(count).toStrictEqual(0)
    }

    {
      const promise = client.blockchain.waitForBlockHeight(10)
      await container.generate(10)

      expect(await promise).toStrictEqual({
        height: 10,
        hash: expect.stringMatching(/^[0-f]{64}$/)
      })

      const count = await client.blockchain.getBlockCount()
      expect(count).toStrictEqual(10)
    }
  })
})

describe('new block height 2 but expire', () => {
  beforeAll(async () => {
    await container.start()
  })

  afterAll(async () => {
    await container.stop()
  })

  it('should wait for new block with timeout and expire', async () => {
    const result = await client.blockchain.waitForBlockHeight(2, 3000)
    expect(result).toStrictEqual({
      height: 0,
      hash: expect.stringMatching(/^[0-f]{64}$/)
    })
  })
})
