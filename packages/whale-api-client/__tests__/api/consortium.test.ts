import sinon from 'sinon'
import { TestingGroup } from '@defichain/jellyfish-testing'
import { StubWhaleApiClient } from '../stub.client'
import { StubService } from '../stub.service'
import { GlobalCache } from '@defichain-apps/libs/caches'

const tGroup = TestingGroup.create(2)
const alice = tGroup.get(0)
const bob = tGroup.get(1)
const symbolBTC = 'dBTC'
const symbolETH = 'dETH'
let accountAlice: string, accountBob: string
let idBTC: string
let idETH: string
let globalCacheGetStub: sinon.SinonStub

const service = new StubService(alice.container)
const client = new StubWhaleApiClient(service)

beforeAll(async () => {
  await tGroup.start()
  await service.start()
  await alice.container.waitForWalletCoinbaseMaturity()

  globalCacheGetStub = sinon.stub(GlobalCache.prototype, 'get')
  globalCacheGetStub.callsFake((prefix, id, fetch) => {
    return fetch()
  })
})

afterAll(async () => {
  try {
    await service.stop()
  } finally {
    await tGroup.stop()
    globalCacheGetStub.restore()
  }
})

async function setGovAttr (ATTRIBUTES: object): Promise<void> {
  const hash = await alice.rpc.masternode.setGov({ ATTRIBUTES })
  expect(hash).toBeTruthy()
  await alice.generate(1)
}

async function setMemberInfo (tokenId: string, memberInfo: Array<{ id: string, name: string, backingId: string, ownerAddress: string, mintLimit: string, dailyMintLimit: string }>): Promise<void> {
  const infoObjs = memberInfo.map(mi => `
      "${mi.id}":{
        "name":"${mi.name}", 
        "ownerAddress":"${mi.ownerAddress}",
        "backingId":"${mi.backingId}",
        "dailyMintLimit":${mi.dailyMintLimit},
        "mintLimit":${mi.mintLimit}
      }`
  )

  return await setGovAttr({ [`v0/consortium/${tokenId}/members`]: `{${infoObjs.join(',')}}` })
}

async function setup (): Promise<void> {
  accountAlice = await alice.generateAddress()
  accountBob = await bob.generateAddress()

  await alice.token.create({
    symbol: symbolBTC,
    name: symbolBTC,
    isDAT: true,
    mintable: true,
    tradeable: true,
    collateralAddress: accountAlice
  })
  await alice.generate(1)

  await alice.token.create({
    symbol: symbolETH,
    name: symbolETH,
    isDAT: true,
    mintable: true,
    tradeable: true,
    collateralAddress: accountAlice
  })
  await alice.generate(1)

  await alice.container.fundAddress(accountBob, 10)
  await alice.generate(1)
  idBTC = await alice.token.getTokenId(symbolBTC)
  idETH = await alice.token.getTokenId(symbolETH)

  await setGovAttr({
    'v0/params/feature/consortium': 'true',
    [`v0/consortium/${idBTC}/mint_limit`]: '10',
    [`v0/consortium/${idBTC}/mint_limit_daily`]: '5',
    [`v0/consortium/${idETH}/mint_limit`]: '20',
    [`v0/consortium/${idETH}/mint_limit_daily`]: '10'
  })

  await setMemberInfo(idBTC, [{
    id: '01',
    name: 'alice',
    ownerAddress: accountAlice,
    backingId: 'abc',
    dailyMintLimit: '5.00000000',
    mintLimit: '10.00000000'
  }, {
    id: '02',
    name: 'bob',
    ownerAddress: accountBob,
    backingId: 'def,hij',
    dailyMintLimit: '5.00000000',
    mintLimit: '10.00000000'
  }])

  await setMemberInfo(idETH, [{
    id: '01',
    name: 'alice',
    ownerAddress: accountAlice,
    backingId: '',
    dailyMintLimit: '10.00000000',
    mintLimit: '20.00000000'
  }, {
    id: '02',
    name: 'bob',
    ownerAddress: accountBob,
    backingId: ' lmn ,    opq',
    dailyMintLimit: '10.00000000',
    mintLimit: '20.00000000'
  }])

  await alice.rpc.token.mintTokens(`1@${symbolBTC}`)
  await alice.generate(5)

  await alice.rpc.token.mintTokens(`2@${symbolETH}`)
  await alice.generate(5)

  await alice.rpc.token.burnTokens(`1@${symbolETH}`, accountAlice)
  await alice.generate(5)

  await bob.rpc.token.mintTokens(`4@${symbolBTC}`)
  await bob.generate(5)

  await bob.rpc.token.burnTokens(`2@${symbolBTC}`, accountBob)
  await bob.generate(5)
}

it('should respond an empty list if theres no consortium members or tokens initialized', async () => {
  const info = await client.consortium.getAssetBreakdown()
  expect(info).toStrictEqual([])
})

it('should respond proper asset breakdown information', async () => {
  await setup()

  const info = await client.consortium.getAssetBreakdown()
  expect(info).toStrictEqual([{
    tokenSymbol: symbolBTC,
    memberInfo: [
      { id: '01', name: 'alice', minted: '1.00000000', burned: '0.00000000', backingAddresses: ['abc'], tokenId: idBTC },
      { id: '02', name: 'bob', minted: '4.00000000', burned: '2.00000000', backingAddresses: ['def', 'hij'], tokenId: idBTC }
    ]
  }, {
    tokenSymbol: symbolETH,
    memberInfo: [
      { id: '01', name: 'alice', minted: '2.00000000', burned: '1.00000000', backingAddresses: [], tokenId: idETH },
      { id: '02', name: 'bob', minted: '0.00000000', burned: '0.00000000', backingAddresses: ['lmn', 'opq'], tokenId: idETH }
    ]
  }])
})
