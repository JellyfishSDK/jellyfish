import fetch from 'cross-fetch'
import * as path from 'path'
import { pack } from 'tar-fs'

import { DockerContainer, hasImageLocally } from '../DockerContainer'
import { MasterNodeRegTestContainer } from '../RegTestContainer/Masternode'

const PROJECT_ROOT = path.resolve(__dirname, '../../../../../')

export abstract class SanityContainer extends DockerContainer {
  constructor (
    public readonly blockchain: MasterNodeRegTestContainer = new MasterNodeRegTestContainer(),
    public readonly app: string,
    public readonly tag: string
  ) {
    super(`${app}:${tag}`)
  }

  public async initialize (): Promise<{
    blockchain: {
      ip: string
      port: string
    }
  }> {
    if (!await hasImageLocally(this.image, this.docker)) {
      await this.build()
    }

    await this.blockchain.start()
    await this.blockchain.generate(3)

    const hostRegTestIp = 'host.docker.internal' // TODO(eli-lim): Works on linux?
    const hostRegTestPort = await this.blockchain.getPort('19554/tcp')

    return {
      blockchain: {
        ip: hostRegTestIp,
        port: hostRegTestPort
      }
    }
  }

  public abstract start (): Promise<void>

  public async stop (): Promise<void> {
    await this.container?.stop()
    await this.container?.remove({ v: true })
    await this.blockchain.stop()
  }

  public async build (): Promise<void> {
    // Build image with tar - see https://github.com/apocas/dockerode/issues/432
    const image = pack(PROJECT_ROOT)
    const stream = await this.docker.buildImage(image, {
      t: this.image,
      buildargs: {
        APP: this.app
      }
    })
    await new Promise((resolve, reject) => {
      this.docker.modem.followProgress(stream,
        (err, res) => (err != null) ? reject(err) : resolve(res),
        console.log)
    })
  }

  public generateName (): string {
    const rand = Math.floor(Math.random() * 10000000)
    return `${this.app}-${rand}`
  }

  public async post<T = any>(endpoint: string, data: any): Promise<T> {
    return await this.fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  public async get<T = any>(endpoint: string): Promise<T> {
    return await this.fetch(endpoint, {
      method: 'GET'
    })
  }

  public async fetch (endpoint: string, init: RequestInit = {}): Promise<any> {
    const url = await this.getUrl()
    const res = await fetch(`${url}${endpoint}`, init)
    return await res.json()
  }

  public async getUrl (): Promise<string> {
    const ip = await this.getIp('bridge')
    return `http://${ip}:3000`
  }
}
