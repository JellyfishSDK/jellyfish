import { MasterNodeRegTestContainer } from '@defichain/testcontainers'
import { Elliptic } from '@defichain/jellyfish-crypto'
import {
  createSignedTxnHex, getFixtureAsHexString
} from '../src'

describe('rawtx', () => {
  const container = new MasterNodeRegTestContainer()

  beforeAll(async () => {
    await container.start()
    await container.waitForReady()
    await container.waitForWalletCoinbaseMaturity()
    await container.waitForWalletBalanceGTE(300)
  })

  afterAll(async () => {
    await container.stop()
  })

  describe('createSignedTxnHex', () => {
    it('should createSignedTxnHex', async () => {
      const aPrivKey = '619c335025c7f4012e556c2a58b2506e30b8511b53ade95ea316fd8c3286feb9'
      const bPrivKey = '557c4bdff86e59015987c1c7f3328a1fb4c2177b5e834f09c8cd10fae51af93b'
      const aPrivateKey = Buffer.from(aPrivKey, 'hex')
      const bPrivateKey = Buffer.from(bPrivKey, 'hex')
      const aEllipticPair = Elliptic.fromPrivKey(aPrivateKey)
      const bEllipticPair = Elliptic.fromPrivKey(bPrivateKey)

      const signedTxnHex = await createSignedTxnHex(container, 10, 5, { aEllipticPair, bEllipticPair })
      expect(signedTxnHex.substr(0, 14)).toStrictEqual('04000000000101')
      expect(signedTxnHex.substr(86, 78)).toStrictEqual('00ffffffff010065cd1d0000000016001425a544c073cbca4e88d59f95ccd52e584c7e6a820002')
      expect(signedTxnHex).toContain('0121025476c2e83188368da1ff3e292e7acafcdb3566bb0ad253f62fc70f07aeee635700000000')
    })
  })

  describe('getFixtureAsHexString', () => {
    it('should getFixtureAsHexString', async () => {
      const address = 'bcrt1qaj5834r3snxfdsg7v2elccq3x7wlvnq367uqdj'
      const txid = await container.call('appointoracle', [address, [{ token: 'AAPL', currency: 'EUR' }], 1])

      const expectedFixture = '6a27446654786f160014eca878d47184cc96c11e62b3fc6011379df64c110101044141504c03455552'
      const fixture = await getFixtureAsHexString(container, txid)
      expect(fixture).toStrictEqual(expectedFixture)
    })
  })
})
