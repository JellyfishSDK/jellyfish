import { ListProposalsStatus, ListProposalsType, MasternodeType, VoteDecision } from '@defichain/jellyfish-api-core/dist/category/governance'
import { RegTestFoundationKeys } from '@defichain/jellyfish-network'
import {
  GovernanceProposalStatus,
  GovernanceProposalType,
  ProposalVoteResultType
} from '@defichain/whale-api-client/dist/api/governance'
import BigNumber from 'bignumber.js'
import { DGovernanceController, DefidBin, DefidRpc } from '../../e2e.defid.module'

let testing: DefidRpc
let app: DefidBin
let controller: DGovernanceController
let cfpProposalId: string
let vocProposalId: string
let payoutAddress: string

describe('governance - listProposals and getProposal', () => {
  beforeAll(async () => {
    app = new DefidBin()
    await app.start([
      `-masternode_operator=${RegTestFoundationKeys[2].operator.address}`,
      `-masternode_operator=${RegTestFoundationKeys[3].operator.address}`
    ])
    controller = app.ocean.governanceController
    testing = app.rpc
    await app.waitForWalletCoinbaseMaturity()
    await app.waitForWalletBalanceGTE(100)
    await app.call('setgov', [
      { ATTRIBUTES: { 'v0/params/feature/gov': 'true' } }
    ])
    await app.generate(1)

    // Create 1 CFP + 1 VOC
    payoutAddress = await testing.generateAddress()
    cfpProposalId = await testing.client.governance.createGovCfp({
      title: 'CFP proposal',
      context: 'github',
      amount: new BigNumber(1.23),
      payoutAddress: payoutAddress,
      cycles: 2
    })
    await app.generate(1)

    vocProposalId = await testing.client.governance.createGovVoc({
      title: 'VOC proposal',
      context: 'github'
    })
    await app.generate(1)
  })

  afterAll(async () => {
    await app.stop()
  })

  // Listing related tests
  it('should listProposals', async () => {
    const result = await controller.listProposals()
    const cfpResult = result.data.find(proposal => proposal.type === GovernanceProposalType.COMMUNITY_FUND_PROPOSAL)
    const vocResult = result.data.find(proposal => proposal.type === GovernanceProposalType.VOTE_OF_CONFIDENCE)
    expect(result.data.length).toStrictEqual(2)
    expect(cfpResult).toStrictEqual({
      proposalId: cfpProposalId,
      creationHeight: expect.any(Number),
      title: 'CFP proposal',
      context: 'github',
      contextHash: '',
      status: GovernanceProposalStatus.VOTING,
      type: GovernanceProposalType.COMMUNITY_FUND_PROPOSAL,
      amount: new BigNumber(1.23).toFixed(8),
      payoutAddress: payoutAddress,
      currentCycle: 1,
      totalCycles: 2,
      cycleEndHeight: expect.any(Number),
      proposalEndHeight: expect.any(Number),
      votingPeriod: expect.any(Number),
      quorum: expect.any(String),
      approvalThreshold: expect.any(String),
      fee: expect.any(Number)
    })
    expect(vocResult).toStrictEqual({
      proposalId: vocProposalId,
      creationHeight: expect.any(Number),
      title: 'VOC proposal',
      context: 'github',
      contextHash: '',
      status: GovernanceProposalStatus.VOTING,
      type: GovernanceProposalType.VOTE_OF_CONFIDENCE,
      // amount: undefined,
      currentCycle: 1,
      totalCycles: 1,
      cycleEndHeight: expect.any(Number),
      proposalEndHeight: expect.any(Number),
      votingPeriod: expect.any(Number),
      quorum: expect.any(String),
      approvalThreshold: expect.any(String),
      fee: expect.any(Number)
    })
  })

  it('should listProposals with size', async () => {
    const result = await controller.listProposals(undefined, undefined, undefined, undefined, { size: 1 })
    expect(result.data.length).toStrictEqual(1)
  })

  it('should listProposals with status', async () => {
    const result = await controller.listProposals(ListProposalsStatus.VOTING)
    expect(result.data.length).toStrictEqual(2)
  })

  it('should listProposals with type', async () => {
    const result = await controller.listProposals(undefined, ListProposalsType.CFP)
    expect(result.data.length).toStrictEqual(1)
  })

  it('should listProposals with cycle', async () => {
    const result = await controller.listProposals(undefined, undefined, 0)
    expect(result.data.length).toStrictEqual(2)
  })

  it('should listProposals with status and type', async () => {
    const result = await controller.listProposals(ListProposalsStatus.VOTING, ListProposalsType.CFP)
    expect(result.data.length).toStrictEqual(1)
  })

  it('should listProposals with status, type and cycle', async () => {
    const result = await controller.listProposals(ListProposalsStatus.VOTING, ListProposalsType.CFP, 0)
    expect(result.data.length).toStrictEqual(1)
  })

  it('should listProposals with pagination', async () => {
    const resultPage1 = await controller.listProposals(undefined, undefined, undefined, undefined, {
      size: 1
    })
    expect(resultPage1.data.length).toStrictEqual(1)
    const resultPage2 = await controller.listProposals(undefined, undefined, undefined, undefined, {
      next: resultPage1.page?.next,
      size: 1
    })
    expect(resultPage2.data.length).toStrictEqual(1)
  })

  it('should listProposals with all record when limit is 0', async () => {
    const result = await controller.listProposals(undefined, undefined, undefined, undefined, {
      size: 0
    })
    expect(result.data.length).toStrictEqual(2)
    const emptyResult = await controller.listProposals(ListProposalsStatus.REJECTED, undefined, undefined, undefined, {
      size: 0
    })
    expect(emptyResult.data.length).toStrictEqual(0)
  })

  it('should listProposals with all record when all flag is true', async () => {
    const result = await controller.listProposals(undefined, undefined, undefined, true)
    expect(result.data.length).toStrictEqual(2)
  })

  it('should listProposals with status and pagination', async () => {
    const resultPage1 = await controller.listProposals(ListProposalsStatus.VOTING, undefined, undefined, undefined, {
      size: 1
    })
    expect(resultPage1.data.length).toStrictEqual(1)
    const resultPage2 = await controller.listProposals(ListProposalsStatus.VOTING, undefined, undefined, undefined, {
      next: resultPage1.page?.next,
      size: 1
    })
    expect(resultPage2.data.length).toStrictEqual(1)
  })

  it('should listProposals with type and pagination', async () => {
    const resultPage1 = await controller.listProposals(undefined, ListProposalsType.CFP, undefined, undefined, {
      size: 1
    })
    expect(resultPage1.data.length).toStrictEqual(1)
    const resultPage2 = await controller.listProposals(undefined, ListProposalsType.CFP, undefined, undefined, {
      next: resultPage1.page?.next,
      size: 1
    })
    expect(resultPage2.data.length).toStrictEqual(0)
  })

  it('should listProposals with status, type and pagination', async () => {
    const resultPage1 = await controller.listProposals(ListProposalsStatus.VOTING, ListProposalsType.CFP, undefined, undefined, {
      size: 1
    })
    expect(resultPage1.data.length).toStrictEqual(1)
    const resultPage2 = await controller.listProposals(ListProposalsStatus.VOTING, ListProposalsType.CFP, undefined, undefined, {
      next: resultPage1.page?.next,
      size: 1
    })
    expect(resultPage2.data.length).toStrictEqual(0)
  })

  // Get single related tests
  it('should getProposal for CFP', async () => {
    const result = await controller.getProposal(cfpProposalId)
    expect(result).toStrictEqual({
      proposalId: cfpProposalId,
      creationHeight: expect.any(Number),
      title: 'CFP proposal',
      context: 'github',
      contextHash: '',
      status: GovernanceProposalStatus.VOTING,
      type: GovernanceProposalType.COMMUNITY_FUND_PROPOSAL,
      amount: new BigNumber(1.23).toFixed(8),
      payoutAddress: payoutAddress,
      currentCycle: 1,
      totalCycles: 2,
      cycleEndHeight: expect.any(Number),
      proposalEndHeight: expect.any(Number),
      votingPeriod: expect.any(Number),
      quorum: expect.any(String),
      approvalThreshold: expect.any(String),
      fee: expect.any(Number)
    })
  })

  it('should getProposal for VOC', async () => {
    const result = await controller.getProposal(vocProposalId)
    expect(result).toStrictEqual({
      proposalId: vocProposalId,
      creationHeight: 104,
      title: 'VOC proposal',
      context: 'github',
      contextHash: '',
      status: GovernanceProposalStatus.VOTING,
      type: GovernanceProposalType.VOTE_OF_CONFIDENCE,
      currentCycle: 1,
      totalCycles: 1,
      cycleEndHeight: expect.any(Number),
      proposalEndHeight: expect.any(Number),
      votingPeriod: expect.any(Number),
      quorum: expect.any(String),
      approvalThreshold: expect.any(String),
      fee: expect.any(Number)
      // amount: undefined
    })
  })
})

describe('governance - listProposalVotes', () => {
  beforeAll(async () => {
    app = new DefidBin()
    await app.start([
      `-masternode_operator=${RegTestFoundationKeys[1].operator.address}`,
      `-masternode_operator=${RegTestFoundationKeys[2].operator.address}`,
      `-masternode_operator=${RegTestFoundationKeys[3].operator.address}`
    ])
    controller = app.ocean.governanceController
    testing = app.rpc
    await app.waitForWalletCoinbaseMaturity()
    await app.waitForWalletBalanceGTE(100)
    await app.call('setgov', [
      { ATTRIBUTES: { 'v0/params/feature/gov': 'true' } }
    ])
    await app.generate(1)

    /**
     * Import the private keys of the masternode_operator in order to be able to mint blocks and vote on proposals.
     * This setup uses the default masternode + two additional masternodes for a total of 3 masternodes.
     */
    await testing.client.wallet.importPrivKey(RegTestFoundationKeys[1].owner.privKey)
    await testing.client.wallet.importPrivKey(RegTestFoundationKeys[1].operator.privKey)
    await testing.client.wallet.importPrivKey(RegTestFoundationKeys[2].owner.privKey)
    await testing.client.wallet.importPrivKey(RegTestFoundationKeys[2].operator.privKey)
    await testing.client.wallet.importPrivKey(RegTestFoundationKeys[3].owner.privKey)
    await testing.client.wallet.importPrivKey(RegTestFoundationKeys[3].operator.privKey)

    // Create 1 CFP + 1 VOC
    payoutAddress = await testing.generateAddress()
    cfpProposalId = await testing.client.governance.createGovCfp({
      title: 'CFP proposal',
      context: 'github',
      amount: new BigNumber(1.23),
      payoutAddress: payoutAddress,
      cycles: 2
    })
    await app.generate(1)

    vocProposalId = await testing.client.governance.createGovVoc({
      title: 'VOC proposal',
      context: 'github'
    })
    await app.generate(1)

    // Vote on CFP
    await testing.client.governance.voteGov({
      proposalId: cfpProposalId,
      masternodeId: await getVotableMasternodeId(),
      decision: VoteDecision.YES
    })
    await app.generate(1)

    // Expires cycle 1
    const creationHeight = await testing.client.governance.getGovProposal(cfpProposalId).then(proposal => proposal.creationHeight)
    const votingPeriod = 70
    const cycle1 = creationHeight + (votingPeriod - creationHeight % votingPeriod) + votingPeriod
    await app.generate(cycle1 - await app.getBlockCount())

    // Vote on cycle 2
    const masternodes = await testing.client.masternode.listMasternodes()
    const votes = [VoteDecision.YES, VoteDecision.NO, VoteDecision.NEUTRAL]
    let index = 0
    for (const [id, data] of Object.entries(masternodes)) {
      if (data.operatorIsMine) {
        await app.generate(1, data.operatorAuthAddress) // Generate a block to operatorAuthAddress to be allowed to vote on proposal
        await testing.client.governance.voteGov({
          proposalId: cfpProposalId,
          masternodeId: id,
          decision: votes[index]
        })
        index++ // all masternodes vote in second cycle
      }
    }
    await app.generate(1)
  })

  afterAll(async () => {
    await app.stop()
  })

  it('should listProposalVotes', async () => {
    const result = await controller.listProposalVotes(cfpProposalId)
    const yesVote = result.data.find(vote => vote.vote === ProposalVoteResultType.YES)
    const noVote = result.data.find(vote => vote.vote === ProposalVoteResultType.NO)
    const neutralVote = result.data.find(vote => vote.vote === ProposalVoteResultType.NEUTRAL)
    expect(result.data.length).toStrictEqual(3)
    expect(yesVote).toStrictEqual({
      proposalId: cfpProposalId,
      masternodeId: expect.any(String),
      cycle: 2,
      vote: ProposalVoteResultType.YES,
      valid: true
    })
    expect(noVote).toStrictEqual({
      proposalId: cfpProposalId,
      masternodeId: expect.any(String),
      cycle: 2,
      vote: ProposalVoteResultType.NO,
      valid: true
    })
    expect(neutralVote).toStrictEqual({
      proposalId: cfpProposalId,
      masternodeId: expect.any(String),
      cycle: 2,
      vote: ProposalVoteResultType.NEUTRAL,
      valid: true
    })
  })

  it('should listProposalVotes with cycle', async () => {
    const result = await controller.listProposalVotes(cfpProposalId, undefined, 2)
    expect(result.data.length).toStrictEqual(3)
  })

  it('should listProposalVotes with all records when limit is 0', async () => {
    const result = await controller.listProposalVotes(cfpProposalId, undefined, undefined, undefined, { size: 0 })
    expect(result.data.length).toStrictEqual(3)
  })

  it('should listProposalVotes with all records when all flag is true', async () => {
    const result = await controller.listProposalVotes(cfpProposalId, undefined, undefined, true)
    expect(result.data.length).toStrictEqual(3)
    const emptyResult = await controller.listProposalVotes(vocProposalId, undefined, undefined, true)
    expect(emptyResult.data.length).toStrictEqual(0)
  })

  it('should listProposalVotes with all masternodes', async () => {
    const result = await controller.listProposalVotes(cfpProposalId, MasternodeType.ALL)
    expect(result.data.length).toStrictEqual(3)
  })

  it('should listProposalVotes with all masternodes and cycle', async () => {
    const result = await controller.listProposalVotes(cfpProposalId, MasternodeType.ALL, -1)
    expect(result.data.length).toStrictEqual(4)

    const result2 = await controller.listProposalVotes(cfpProposalId, MasternodeType.ALL, 0)
    expect(result2.data.length).toStrictEqual(3)
  })

  it('should listProposalVotes with all masternodes, cycle and pagination', async () => {
    const resultPage1 = await controller.listProposalVotes(cfpProposalId, MasternodeType.ALL, 2, undefined, { size: 2 })
    expect(resultPage1.data.length).toStrictEqual(2)
    const resultPage2 = await controller.listProposalVotes(cfpProposalId, MasternodeType.ALL, 2, undefined, { next: resultPage1.page?.next, size: 2 })
    expect(resultPage2.data.length).toStrictEqual(1)
  })
})

/**
 * Return masternode that mined at least one block to vote on proposal
 */
async function getVotableMasternodeId (): Promise<string> {
  const masternodes = await testing.client.masternode.listMasternodes()
  let masternodeId = ''
  for (const id in masternodes) {
    const masternode = masternodes[id]
    if (masternode.mintedBlocks > 0) {
      masternodeId = id
      break
    }
  }
  if (masternodeId === '') {
    throw new Error('No masternode is available to vote')
  }
  return masternodeId
}
