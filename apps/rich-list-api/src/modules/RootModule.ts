import * as Joi from 'joi'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { ControllerModule } from './ControllerModule'
import { ActuatorModule } from '@defichain-apps/libs/actuator'
import { BlockchainCppModule } from '@defichain-apps/libs/blockchaincpp'
import { TypeOrmModule } from '@nestjs/typeorm'
import { QueueItem, QueueModule } from './QueueModule'
import { CrawledBlockModel } from '../models/CrawledBlock'
import { AddressBalanceModel } from '../models/AddressBalance'
import { RichListDatabaseModule } from './RichListDatabaseModule'
import { RichListModule } from './RichListModule'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validationSchema: ENV_VALIDATION_SCHEMA()
    }),
    ActuatorModule,
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTGRES_HOST'),
        port: configService.get<number>('POSTGRES_PORT'),
        username: configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('POSTGRES_PASS'),
        database: configService.get<string>('POSTGRES_DB'),
        migrations: [/* TODO(@ivan-zynesis): create table if not exists */],
        // FIXME(@ivan-zynesis): remove sync after entities loading can be done via migration
        entities: [
          QueueItem,
          CrawledBlockModel,
          AddressBalanceModel
        ],
        synchronize: true
      }),
      inject: [ConfigService]
    }),
    QueueModule,
    BlockchainCppModule,
    RichListDatabaseModule,
    RichListModule,
    ControllerModule
  ]
})
export class RootModule {
}

function ENV_VALIDATION_SCHEMA (): any {
  return Joi.object({
    NODE_ENV: Joi.string().valid('production', 'test').default('test'),
    PORT: Joi.number().default(3000),
    API_VERSION: Joi.string().regex(/^v[0-9]+(\.[0-9]+)?$/).default('v1'),
    API_NETWORK: Joi.string().valid('regtest', 'testnet', 'mainnet').default('regtest'),

    POSTGRES_HOST: Joi.string().ip(),
    POSTGRES_PORT: Joi.number().default(5432),
    POSTGRES_USER: Joi.string(),
    POSTGRES_PASS: Joi.string(),
    POSTGRES_DB: Joi.string(),

    WHALE_API_URL: Joi.string()
  })
}
