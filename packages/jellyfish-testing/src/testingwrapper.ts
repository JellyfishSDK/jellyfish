import { RegTestFoundationKeys } from '@defichain/jellyfish-network'
import { ContainerGroup, DeFiDContainer, MasterNodeRegTestContainer } from '@defichain/testcontainers'
import { Testing, TestingGroup } from '.'

export class TestingWrapper {
  create (): Testing
  create (n: number): TestingGroup
  create (n: number, init: (index: number) => DeFiDContainer): Testing | TestingGroup

  create (n?: number, init?: (index: number) => DeFiDContainer): Testing | TestingGroup {
    if (init === undefined) {
      init = (index: number) => new MasterNodeRegTestContainer(RegTestFoundationKeys[index])
    }

    if (n === undefined || n <= 1) {
      return Testing.createBase(init(0))
    }

    return TestingGroup.create(n, init)
  }

  group (testings: Testing[]): TestingGroup {
    const containers: MasterNodeRegTestContainer[] = []

    testings.forEach(testing => {
      containers.push(testing.container)
    })

    const group = new ContainerGroup(containers)
    return new TestingGroup(group, testings)
  }
}
