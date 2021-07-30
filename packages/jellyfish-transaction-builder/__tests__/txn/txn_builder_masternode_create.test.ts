import { JsonRpcClient } from '@defichain/jellyfish-api-jsonrpc'
import { RegTest } from '@defichain/jellyfish-network'
import { CreateMasterNode } from '@defichain/jellyfish-transaction'
import { P2PKH } from '@defichain/jellyfish-address'
import { MasterNodeRegTestContainer } from '@defichain/testcontainers'
import { getProviders, MockProviders } from '../provider.mock'
import { P2WPKHTransactionBuilder } from '../../src'
import {
  fundEllipticPair,
  sendTransaction
} from '../test.utils'
import { HASH160 } from '@defichain/jellyfish-crypto'

const container = new MasterNodeRegTestContainer()
let providers: MockProviders
let builder: P2WPKHTransactionBuilder
let jsonRpc: JsonRpcClient

beforeAll(async () => {
  await container.start()
  await container.waitForReady()
  await container.waitForWalletCoinbaseMaturity()
  await container.waitForWalletBalanceGTE(1001)

  jsonRpc = new JsonRpcClient(await container.getCachedRpcUrl())
  providers = await getProviders(container)
  // providers.setEllipticPair(WIF.asEllipticPair(GenesisKeys[GenesisKeys.length - 1].owner.privKey))
  // builder = new P2WPKHTransactionBuilder(providers.fee, providers.prevout, providers.elliptic)
})

afterAll(async () => {
  await container.stop()
})

beforeEach(async () => {
  await providers.randomizeEllipticPair()
  builder = new P2WPKHTransactionBuilder(providers.fee, providers.prevout, providers.elliptic)

  // Note(canonbrother): in regtest, collateral amount must be equal to 2 and creation fee must be greater than 1
  // https://github.com/DeFiCh/ain/blob/85360ad432ae8c5ecbfbfc7d63dd5bc6fe41e875/src/masternodes/mn_checks.cpp#L439-L446
  // 0.00000745 is added for calculateFeeP2WPKH deduction, 3(total) - 1(creationFee) = 2(collateralAmount)
  await fundEllipticPair(container, providers.ellipticPair, 3 + 0.00000745)
  await providers.setupMocks()
})

it('should create', async () => {
  // const masternodesBefore = await jsonRpc.masternode.listMasternodes()
  // console.log('masternodesBefore: ', masternodesBefore.length)

  const address = await container.getNewAddress('', 'legacy')
  const addressDest: P2PKH = P2PKH.fromAddress(RegTest, address, P2PKH)
  const collateralPubKeyHash = addressDest.hex

  const createMasternode: CreateMasterNode = {
    type: 0x01,
    collateralPubKeyHash: collateralPubKeyHash
  }

  const script = await providers.elliptic.script()

  const txn: any = await builder.masternode.create(createMasternode, script)

  // ISSUE(canonbrother): nValue same as value, nTokenId same as tokenId, its inconsistent vout struct issue
  // https://github.com/DeFiCh/ain/blob/c812f0283a52840996659121a755a9f723be2392/src/masternodes/mn_checks.cpp#L441-L442
  txn.vout = txn.vout.map((v: any) => {
    return {
      nValue: v.value,
      script: v.script,
      nTokenId: v.tokenId
    }
  })

  const outs = await sendTransaction(container, txn)
  expect(outs.length).toStrictEqual(2)
  expect(outs[0].value).toStrictEqual(1)
  expect(outs[0].tokenId).toStrictEqual(0)
  expect(outs[0].scriptPubKey.asm.startsWith('OP_RETURN 4466547843')).toBeTruthy()
  expect(outs[0].scriptPubKey.hex.startsWith('6a1a4466547843')).toBeTruthy()
  expect(outs[0].scriptPubKey.type).toStrictEqual('nulldata')

  expect(outs[1].value).toStrictEqual(2)
  expect(outs[1].tokenId).toStrictEqual(0)
  expect(outs[1].scriptPubKey.type).toStrictEqual('witness_v0_keyhash')
  expect(outs[1].scriptPubKey.addresses[0]).toStrictEqual(await providers.getAddress())

  await container.generate(1)

  // const masternodesAfter = await jsonRpc.masternode.listMasternodes()
  // console.log('masternodesAfter: ', masternodesAfter.length)
})

it.only('should create with operator address', async () => {
  const masternodesBefore = await jsonRpc.masternode.listMasternodes()
  console.log('masternodesBefore: ', masternodesBefore.length)

  const operatorPubKey = await providers.ellipticPair.publicKey()
  console.log('operatorPubKey: ', operatorPubKey.toString('hex'))

  const operatorPubKeyHash = `${HASH160(operatorPubKey).toString('hex')}`
  console.log('operatorPubKeyHash: ', operatorPubKeyHash)
  // 2679c28d803f75e91f41132f4397dd4b76d9049d

  const address = await container.getNewAddress('', 'legacy')
  console.log('address: ', address)

  const addressDest: P2PKH = P2PKH.fromAddress(RegTest, address, P2PKH)
  console.log('addressDest: ', addressDest)
  // const collateralPubKeyHash = addressDest.pubKeyHash
  const collateralPubKeyHash = addressDest.hex
  console.log('collateralPubKeyHash: ', collateralPubKeyHash)

  const createMasternode: CreateMasterNode = {
    type: 0x01,
    collateralPubKeyHash: collateralPubKeyHash,
    operatorPubKeyHash: operatorPubKeyHash
  }

  const script = await providers.elliptic.script()

  const txn: any = await builder.masternode.create(createMasternode, script)

  // ISSUE(canonbrother): nValue same as value, nTokenId same as tokenId, its inconsistent vout struct issue
  // https://github.com/DeFiCh/ain/blob/c812f0283a52840996659121a755a9f723be2392/src/masternodes/mn_checks.cpp#L441-L442
  txn.vout = txn.vout.map((v: any) => {
    return {
      nValue: v.value,
      script: v.script,
      nTokenId: v.tokenId
    }
  })

  const outs = await sendTransaction(container, txn)
  console.log('outs: ', outs)
  // expect(outs.length).toStrictEqual(2)
  // expect(outs[0].value).toStrictEqual(1)
  // expect(outs[0].tokenId).toStrictEqual(0)
  // expect(outs[0].scriptPubKey.asm.startsWith('OP_RETURN 4466547843')).toBeTruthy()
  // expect(outs[0].scriptPubKey.hex.startsWith('6a1a4466547843')).toBeTruthy()
  // expect(outs[0].scriptPubKey.type).toStrictEqual('nulldata')

  // expect(outs[1].value).toStrictEqual(2)
  // expect(outs[1].tokenId).toStrictEqual(0)
  // expect(outs[1].scriptPubKey.type).toStrictEqual('witness_v0_keyhash')
  // expect(outs[1].scriptPubKey.addresses[0]).toStrictEqual(await providers.getAddress())

  // await container.generate(1)

  // const masternodesAfter = await jsonRpc.masternode.listMasternodes()
  // console.log('masternodesAfter: ', masternodesAfter.length)
})
