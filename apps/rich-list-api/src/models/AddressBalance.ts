import { Column, Entity, Index, PrimaryColumn, Between, FindManyOptions, Repository } from 'typeorm'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { SingleIndexDb, AddressBalance, Schema, FindOptions } from '@defichain/rich-list-core'

@Entity()
@Index(['tokenId', 'amount'])
export class AddressBalanceModel implements AddressBalance {
  @PrimaryColumn()
  id!: string

  @Column()
  tokenId!: string

  @Column()
  address!: string

  @Column()
  amount!: number
}

@Injectable()
export class AddressBalanceDbService implements SingleIndexDb<AddressBalance> {
  constructor (
    @InjectRepository(AddressBalanceModel)
    private readonly repo: Repository<AddressBalanceModel>
  ) {}

  async put (addressBalance: Schema<AddressBalance>): Promise<void> {
    await this.repo.save({
      id: addressBalance.id,
      tokenId: addressBalance.partition,
      address: addressBalance.data.address,
      amount: addressBalance.data.amount
    })
  }

  async get (id: string): Promise<Schema<AddressBalance> | undefined> {
    const raw = await this.repo.findOne(id)
    if (raw === undefined) {
      return undefined
    }
    return this._map(raw)
  }

  async list (filter: FindOptions): Promise<Array<Schema<AddressBalance>>> {
    const findOpt: FindManyOptions<AddressBalanceModel> = {
      where: {
        tokenId: filter.partition,
        amount: Between(
          filter.gt ?? Number.NEGATIVE_INFINITY,
          filter.lt ?? Number.POSITIVE_INFINITY
        )
      },
      order: { amount: filter.order },
      skip: filter.limit
    }

    const raw = await this.repo.find(findOpt)
    return raw.map(ab => this._map(ab))
  }

  async delete (id: string): Promise<void> {
    await this.repo.delete(id)
  }

  private _map (ab: AddressBalanceModel): Schema<AddressBalance> {
    return {
      id: ab.id,
      partition: ab.tokenId,
      sort: ab.amount,
      data: ab
    }
  }
}
