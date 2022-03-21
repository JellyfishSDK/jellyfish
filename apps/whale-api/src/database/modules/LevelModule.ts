import { Global, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import fs from 'fs'

import { Database } from '../Database'
import { LevelDatabase } from '../providers/LevelDatabase'

/**
 * LevelUp will fail to create if directory does not exist.
 */
function mkdir (location: string): void {
  if (fs.existsSync(location)) {
    return
  }
  fs.mkdirSync(location, { recursive: true })
}

@Global()
@Module({
  providers: [
    {
      provide: 'LEVEL_UP_LOCATION',
      /**
       * if isProd, resolve to .leveldb/{network}
       * else, resolve to .leveldb/{network}/time-now
       */
      useFactory: (configService: ConfigService): string => {
        const isProd = configService.get<boolean>('isProd', false)
        const network = configService.get<string>('network', 'unknown')
        const defaultLocation = isProd ? `.leveldb/${network}` : `.leveldb/${network}/${Date.now()}`

        const location = configService.get<string>('database.level.location', defaultLocation)
        mkdir(location)
        return location
      },
      inject: [ConfigService]
    },
    {
      provide: Database,
      useClass: LevelDatabase
    }
  ],
  exports: [
    Database
  ]
})
export class LevelDatabaseModule {
}
