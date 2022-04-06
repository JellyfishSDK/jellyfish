import { MasterNodeRegTestContainer } from '../RegTestContainer/Masternode'
import { SanityContainer } from '.'
import { waitForCondition } from '../../utils'

export class WhaleSanityContainer extends SanityContainer {
  constructor (port?: number, blockchain?: MasterNodeRegTestContainer) {
    super('whale', port, blockchain)
  }

  public async start (): Promise<void> {
    // Create whale container and bind defid url
    const { hostRegTestIp, hostRegTestPort } = await this.initialize()
    this.container = await this.docker.createContainer({
      name: this.name,
      Image: this.image,
      Tty: true,
      Env: [
        `WHALE_DEFID_URL=http://testcontainers-user:testcontainers-password@${hostRegTestIp}:${hostRegTestPort}`,
        'WHALE_NETWORK=regtest',
        'WHALE_DATABASE_PROVIDER=memory'
      ],
      ExposedPorts: { '3000/tcp': {} },
      HostConfig: {
        PortBindings: { '3000/tcp': [{ HostPort: this.port.toString() }] },
        PublishAllPorts: true
      }
    })

    // Start containers concurrently
    await this.container.start()

    // Wait for whale to start listening on its container port
    await waitForCondition(async () => {
      const res = await this.get('/_actuator/probes/liveness')
      return res.status === 200
    }, 30_000) // 30s
  }
}
