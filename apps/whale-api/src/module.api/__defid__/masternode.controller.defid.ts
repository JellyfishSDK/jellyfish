import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc'
import { MasternodeState } from '@defichain/whale-api-client/dist/api/masternodes'
import { MasternodeTimeLock } from '@defichain/jellyfish-api-core/dist/category/masternode'
import { DefidBin, DefidRpc, DMasternodeController } from '../../e2e.defid.module'

let container: DefidRpc
let app: DefidBin
let controller: DMasternodeController
let client: JsonRpcClient

describe('list', () => {
  beforeAll(async () => {
    app = new DefidBin()
    await app.start()
    controller = app.ocean.masternodeController
    container = app.rpc
    await app.waitForBlockHeight(101)
    client = new JsonRpcClient(app.rpcUrl)

    await container.generate(1)
    const height = await client.blockchain.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(height)
  })

  afterAll(async () => {
    await app.stop()
  })

  it('should list masternodes', async () => {
    const result = await controller.list({ size: 4 })
    expect(result.data.length).toStrictEqual(4)
    expect(Object.keys(result.data[0]).length).toStrictEqual(9)
  })

  it('should list masternodes with pagination', async () => {
    const first = await controller.list({ size: 4 })
    expect(first.data.length).toStrictEqual(4)

    const next = await controller.list({
      size: 4,
      next: first.page?.next
    })
    expect(next.data.length).toStrictEqual(4)
    expect(next.page?.next).toStrictEqual(`00000000${next.data[3].id}`)

    const last = await controller.list({
      size: 4,
      next: next.page?.next
    })
    expect(last.data.length).toStrictEqual(0)
    expect(last.page).toStrictEqual(undefined)
  })
})

describe('get', () => {
  beforeAll(async () => {
    app = new DefidBin()
    await app.start()
    controller = app.ocean.masternodeController
    container = app.rpc
    await app.waitForBlockHeight(101)
    client = new JsonRpcClient(app.rpcUrl)

    await container.generate(1)
    const height = await client.blockchain.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(height)
  })

  afterAll(async () => {
    await app.stop()
  })

  it('should get a masternode with id', async () => {
    // get a masternode from list
    const masternode = (await controller.list({ size: 1 })).data[0]

    const result = await controller.get(masternode.id)
    expect(Object.keys(result).length).toStrictEqual(9)
    expect(result).toStrictEqual({ ...masternode, mintedBlocks: expect.any(Number) })
  })

  it('should fail due to non-existent masternode', async () => {
    await expect(controller.get('8d4d987dee688e400a0cdc899386f243250d3656d802231755ab4d28178c9816')).rejects.toThrowError('404 - NotFound (/v0/regtest/masternodes/8d4d987dee688e400a0cdc899386f243250d3656d802231755ab4d28178c9816): Unable to find masternode')
  })
})

describe('resign', () => {
  beforeAll(async () => {
    app = new DefidBin()
    await app.start(['-eunospayaheight=200'])
    controller = app.ocean.masternodeController
    container = app.rpc
    await app.waitForBlockHeight(101)
    client = new JsonRpcClient(app.rpcUrl)

    await container.generate(1)
    const height = await client.blockchain.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(height)
  })

  afterAll(async () => {
    await app.stop()
  })

  it('should get masternode with pre-resigned state', async () => {
    await container.generate(1)

    const ownerAddress = await client.wallet.getNewAddress()
    const masternodeId = await client.masternode.createMasternode(ownerAddress)
    await container.generate(1)

    const height = await client.blockchain.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(height)

    const resignTx = await client.masternode.resignMasternode(masternodeId)

    await container.generate(1)
    const resignHeight = await client.blockchain.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(resignHeight)

    const result = await controller.get(masternodeId)
    expect(result.state).toStrictEqual(MasternodeState.PRE_RESIGNED)
    expect(result?.resign?.tx).toStrictEqual(resignTx)
    expect(result?.resign?.height).toStrictEqual(resignHeight)
  })
})

describe('timelock', () => {
  beforeAll(async () => {
    app = new DefidBin()
    await app.start()
    controller = app.ocean.masternodeController
    container = app.rpc
    await app.waitForBlockHeight(101)
    client = new JsonRpcClient(app.rpcUrl)

    await container.generate(1)
    const height = await client.blockchain.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(height)
  })

  afterAll(async () => {
    await app.stop()
  })

  it('should get masternode with timelock', async () => {
    await container.generate(1)

    const ownerAddress = await client.wallet.getNewAddress()
    const masternodeId = await client.masternode.createMasternode(ownerAddress, undefined, {
      timelock: MasternodeTimeLock.TEN_YEAR,
      utxos: []
    })

    await container.generate(1)
    const height = await client.blockchain.getBlockCount()
    await container.generate(1)
    await app.waitForBlockHeight(height)

    const result = await controller.get(masternodeId)
    expect(result.timelock).toStrictEqual(520)
  })
})
