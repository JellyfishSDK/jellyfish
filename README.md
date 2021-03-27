[![CI](https://github.com/DeFiCh/jellyfish/actions/workflows/ci.yml/badge.svg)](https://github.com/DeFiCh/jellyfish/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/DeFiCh/jellyfish/branch/main/graph/badge.svg?token=IYL9K0WROA)](https://codecov.io/gh/DeFiCh/jellyfish)
[![Maintainability](https://api.codeclimate.com/v1/badges/7019f1d74a0500951b2a/maintainability)](https://codeclimate.com/github/DeFiCh/jellyfish/maintainability)
[![TS-Standard](https://badgen.net/badge/code%20style/ts-standard/blue?icon=typescript)](https://github.com/standard/ts-standard)
[![npm](https://img.shields.io/npm/v/@defichain/jellyfish)](https://www.npmjs.com/package/@defichain/jellyfish)

# @defichain/jellyfish

A collection of TypeScript + JavaScript tools and libraries for DeFi Blockchain developers to build decentralized
finance on Bitcoin.

> 🚧 Work in progress, `3/193` rpc completed.

## Installation

### Node

```shell
npm install @defichain/jellyfish
```

### Browser

```html
<!-- TODO(fuxingloh): WIP -->
<script src="https://unpkg.com/@defichain/jellyfish@latest/dist/jellyfish.umd.js"/>
```

## Getting Started

### CJS for Node

```js
const jellyfish = require('@defichain/jellyfish')
const client = new jellyfish.Client('http://localhost:8554', {
  timeout: 20000
})

client.mining.getMintingInfo().then((info) => {
  console.log(info)
})
```

### ES6 Modules

```js
import {Client} from '@defichain/jellyfish'

const client = new Client('http://localhost:8554')
const info = await client.mining.getMintingInfo()
```

### Providers

```js
import {Client, HttpProvider, OceanProvider} from '@defichain/jellyfish'

const options = {} // optional

// TODO(fuxingloh): WIP, more coventional default will be introduced with convenience
const localClient = new Client(new HttpProvider('http://localhost:8554'), options)
const oceanClient = new Client(new OceanProvider(), options)
```

## Documentation & Community

[![Netlify Status](https://api.netlify.com/api/v1/badges/c5b7a65e-aeec-4e12-a7b7-300cbc1a8069/deploy-status)](https://app.netlify.com/sites/cranky-franklin-5e59ef/deploys)

Following the idea of everything in main is production ready; all pull request must be accompanied by a documentation
change under the `website/` folder. Hence, the main branch should be treated as a release with documentations.

```
// TODO(fuxingloh): 
Documentation can be found at `https://jellyfish.defichain.com`?
+ Community Links
```

## Packages

* `@defichain/jellyfish` bundled usage entrypoint with conventional defaults for 4 bundles: `umd`, `esm`, `cjs`
  and `d.ts`
* `@defichain/jellyfish-api-core` is a protocol agnostic DeFiChain client interfaces, with a "foreign function
  interface" design.
* `@defichain/jellyfish-api-jsonrpc` implements the [JSON-RPC 1.0](https://www.jsonrpc.org/specification_v1)
  specification.
* `@defichain/jellyfish-json` allows parsing of JSON with `'lossless'`, `'bignumber'` and `'number'` numeric precision.
* `@defichain/jellyfish-network` contains DeFi blockchain various network configuration for main, net and regtest.
* `@defichain/testcontainers` provides a lightweight, throw away instances for DeFiD node provisioned automatically in
  Docker container.

### Latest Releases

|package|@latest|@next|
|---|---|---|
|`@defichain/jellyfish`|[![npm](https://img.shields.io/npm/v/@defichain/jellyfish)](https://www.npmjs.com/package/@defichain/jellyfish/v/latest)|[![npm@next](https://img.shields.io/npm/v/@defichain/jellyfish/next)](https://www.npmjs.com/package/@defichain/jellyfish/v/next)|
|`@defichain/jellyfish-api-core`|[![npm](https://img.shields.io/npm/v/@defichain/jellyfish-api-core)](https://www.npmjs.com/package/@defichain/jellyfish-api-core/v/latest)|[![npm@next](https://img.shields.io/npm/v/@defichain/jellyfish-api-core/next)](https://www.npmjs.com/package/@defichain/jellyfish-api-core/v/next)|
|`@defichain/jellyfish-api-jsonrpc`|[![npm](https://img.shields.io/npm/v/@defichain/jellyfish-api-jsonrpc)](https://www.npmjs.com/package/@defichain/jellyfish-api-jsonrpc/v/latest)|[![npm@next](https://img.shields.io/npm/v/@defichain/jellyfish-api-jsonrpc/next)](https://www.npmjs.com/package/@defichain/jellyfish-api-jsonrpc/v/next)|
|`@defichain/jellyfish-json`|[![npm](https://img.shields.io/npm/v/@defichain/jellyfish-json)](https://www.npmjs.com/package/@defichain/jellyfish-json/v/latest)|[![npm@next](https://img.shields.io/npm/v/@defichain/jellyfish-json/next)](https://www.npmjs.com/package/@defichain/jellyfish-json/v/next)|
|`@defichain/jellyfish-network`|[![npm](https://img.shields.io/npm/v/@defichain/jellyfish-network)](https://www.npmjs.com/package/@defichain/jellyfish-network/v/latest)|[![npm@next](https://img.shields.io/npm/v/@defichain/jellyfish-network/next)](https://www.npmjs.com/package/@defichain/jellyfish-network/v/next)|
|`@defichain/testcontainers`|[![npm](https://img.shields.io/npm/v/@defichain/testcontainers)](https://www.npmjs.com/package/@defichain/testcontainers/v/latest)|[![npm@next](https://img.shields.io/npm/v/@defichain/testcontainers/next)](https://www.npmjs.com/package/@defichain/testcontainers/v/next)|

## Developing & Contributing

Thanks for contributing, appreciate all the help we can get. Feel free to make a pull-request, we will guide you along
the way to make it mergeable. Here are some of our documented [contributing guidelines](CONTRIBUTING.md).

We use `npm 7` for this project, it's required to set
up [npm workspaces](https://docs.npmjs.com/cli/v7/using-npm/workspaces).

```shell
npm install
```

### Testing

`jest.config.js` is set up at the root project level as well as at each sub module. You can run jest at root to test all
modules or individually at each sub module. By default, only regtest chain are used for normal testing. If you use
IntelliJ IDEA, you can right click any file to test it individually and have it reported to the IDE.

Docker is required to run the tests as [`@defichain/testcontainers`](./packages/testcontainers) will automatically spin
up `regtest` instances for testing. The number of containers it will spin up concurrently is dependent on your
jest `--maxConcurrency` count. Test are known to be flaky due to the usage of multiple Docker containers for test
concurrency.

Coverage is collected at each pull request to main with `codecov`; more testing 🚀 less 🐛 = 😎

```shell
jest
```

### Publishing

`"version": "0.0.0"` is used because publishing will be done automatically
by [GitHub releases](https://github.com/DeFiCh/jellyfish/releases) with connected workflows. On
release `types: [ published, prereleased ]`, GitHub Action will automatically build all packages in this repo and
publish it into npm.

* release are tagged as `@latest`
* prerelease are tagged as `@next` (please use this cautiously)

### IntelliJ IDEA

IntelliJ IDEA is the IDE of choice for writing and maintaining this library. IntelliJ's files are included for
convenience with basic toolchain setup but use of IntelliJ is totally optional.

### Security issues

If you discover a security vulnerability in
`@defichain/jellyfish`, [please see submit it privately](https://github.com/DeFiCh/.github/blob/main/SECURITY.md).

## License & Disclaimer

By using `@defichain/jellyfish` (this repo), you (the user) agree to be bound by [the terms of this license](LICENSE).

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FDeFiCh%2Fjellyfish.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FDeFiCh%2Fjellyfish?ref=badge_large)
