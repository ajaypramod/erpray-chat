/**
 * Seed the 5 role personas as real LibreChat Agents (AGENT_BUILD_INSTRUCTIONS.md
 * §5.6: "The 5 role personas... become LibreChat Agents — native per-agent
 * instructions + conversation starters, all pointing at the same connector
 * model. Migrate content, not mechanism.")
 *
 * "Content, not mechanism": SyteRay's version of this (openwebui/functions/
 * syteray_role_agents.py) was a Python OpenWebUI "pipe" — a whole separate
 * routing mechanism reimplementing what a LibreChat Agent already does
 * natively. The MECHANISM doesn't port (LibreChat Agents ARE the mechanism);
 * what ports is the actual idea each persona embodies — one shared engine,
 * several role-biased lenses onto it — and the specific tables/metrics each
 * one reaches for, adapted from SyteLine's schema to ERPray's own NetSuite
 * metric catalog (packages/core/src/metricCatalog.ts in erpray-app).
 *
 * Every agent points at the SAME connector model ('erpray-balanced') — the
 * persona lives entirely in `instructions` (a system-prompt bias), never in a
 * different backend. This is what "one engine, five lenses" means in
 * practice: nothing here duplicates the connector's own reasoning.
 *
 * Usage:
 *   node config/seed-role-agents.js --owner=admin@example.com
 *   node config/seed-role-agents.js            (uses the sole user, if only one exists)
 *
 * Run ONCE after the first admin account exists. Idempotent: re-running skips
 * personas that already exist (matched by name), so it's safe to run again
 * after adding a new one to the ROLES list below.
 */
const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { AccessRoleIds, ResourceType, PrincipalType, Constants } = require('librechat-data-provider');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');
const { createAgent, getAgents } = require('~/models/Agent');
const { getProjectByName, addAgentIdsToProject } = require('~/models/Project');
const { grantPermission } = require('~/server/services/PermissionService');
const { User } = require('~/db/models');

/** One shared engine, five lenses — same pattern SyteRay's role agents used,
 *  content re-grounded in ERPray's own NetSuite metric catalog and action
 *  catalog rather than SyteLine's table names. */
const ROLES = [
  {
    // Fixed, not nanoid-random: deploy/librechat.yaml's modelSpecs reference
    // these exact ids (endpoint: 'agents', agent_id: '<this>') so the agent
    // is actually reachable through ERPray's curated, modelSpecs.enforce:true
    // picker — a random id generated at seed time could never be written into
    // a static YAML file ahead of time. Only "agent_" + [a-zA-Z0-9_-]
    // characters — the schema itself imposes no format, but a raw `agent_`
    // prefix is what packages/data-provider/src/parsers.ts's isEphemeralAgent
    // check keys off elsewhere, so it stays consistent with a normal agent id.
    id: 'agent_erpray_controller',
    name: 'ERPray · Controller',
    description: 'Financial-controller lens: revenue, margin, AP/AR, period health.',
    instructions:
      "You are ERPray's Financial Controller copilot. Bias toward finance: sales revenue, gross margin, " +
      'AR/AP outstanding, overdue receivables, period-over-period trends. When a request is ambiguous, prefer ' +
      'the financial reading over an operational one. Lead with the number and the assumption behind it ' +
      '(every ERPray answer carries one — never state a figure without it), then the drill-down a controller ' +
      'would ask next: is it trending, is it concentrated in one customer or subsidiary, is margin moving with it.',
    conversation_starters: [
      "What's our gross margin this quarter, and is it improving?",
      "What's our AR aging look like, and who's furthest overdue?",
      'How does revenue compare across subsidiaries?',
    ],
  },
  {
    id: 'agent_erpray_sales_ops',
    name: 'ERPray · Sales Ops',
    description: 'Sales-operations lens: open orders, backlog, top customers, late shipments.',
    instructions:
      "You are ERPray's Sales Ops copilot. Bias toward demand and order fulfillment: open sales orders and " +
      'their value, top customers by revenue, late orders, customer credit holds. Frame answers around what a ' +
      "sales operations lead needs to act on TODAY — which orders are at risk of shipping late, which customers " +
      "are concentrating too much revenue, who's on credit hold and blocking a deal.",
    conversation_starters: [
      'Which sales orders are late right now?',
      'Who are our top 10 customers this quarter?',
      'Which customers are on credit hold?',
    ],
  },
  {
    id: 'agent_erpray_purchasing',
    name: 'ERPray · Purchasing',
    description: 'Procurement lens: open POs, overdue receipts, vendor exposure.',
    instructions:
      "You are ERPray's Purchasing copilot. Bias toward procurement: open purchase orders, overdue PO " +
      'receipts, vendor spend concentration, AP outstanding by vendor. When writes are enabled, you can change ' +
      "a PO's expected receipt date or memo — always preview the change and explain it in plain English before " +
      'confirming. Frame answers around what to expedite or escalate with a vendor.',
    conversation_starters: [
      'Which purchase orders are overdue for receipt?',
      'What do we currently owe our vendors?',
      'Change the expected receipt date on a purchase order.',
    ],
  },
  {
    id: 'agent_erpray_warehouse',
    name: 'ERPray · Warehouse',
    description: 'Inventory & fulfillment lens: on-hand stock, shipments, returns.',
    instructions:
      "You are ERPray's Warehouse & Fulfillment copilot. Bias toward physical operations: inventory on hand by " +
      'item and location, shipments recorded in the period, open return authorizations awaiting receipt. Frame ' +
      'answers around stock risk (what is running low, what is backordered) and fulfillment throughput.',
    conversation_starters: [
      'How much inventory do we have on hand right now?',
      'How many shipments went out this week?',
      'How many open returns are we waiting to receive?',
    ],
  },
  {
    id: 'agent_erpray_collections',
    name: 'ERPray · Collections',
    description: 'AR & credit lens: overdue invoices, credit holds, follow-up priority.',
    instructions:
      "You are ERPray's Collections copilot. Bias narrowly on accounts receivable follow-up: overdue invoice " +
      'balances, which customers are furthest past due, who is on credit hold and why that matters for new ' +
      'orders. When writes are enabled, you can put a customer on or take them off credit hold — always preview ' +
      'the change first. Frame answers around who to call today and how much is at stake.',
    conversation_starters: [
      'Which invoices are the most overdue right now?',
      "What's our total AR outstanding?",
      'Put a customer on credit hold.',
    ],
  },
];

async function main() {
  await connect();

  const ownerArg = process.argv.find((a) => a.startsWith('--owner='));
  const ownerEmail = ownerArg ? ownerArg.split('=')[1] : undefined;

  let owner;
  if (ownerEmail) {
    owner = await User.findOne({ email: ownerEmail });
    if (!owner) throw new Error(`No user found with email ${ownerEmail}`);
  } else {
    const users = await User.find({}).limit(2);
    if (users.length !== 1) {
      throw new Error(
        `Expected exactly one user when --owner is omitted, found ${users.length}. ` +
          'Pass --owner=<email> to pick which account owns these agents.',
      );
    }
    owner = users[0];
  }

  const existing = await getAgents({ author: owner._id });
  const existingNames = new Set(existing.map((a) => a.name));

  const globalProject = await getProjectByName(Constants.GLOBAL_PROJECT_NAME, ['_id']);

  for (const role of ROLES) {
    if (existingNames.has(role.name)) {
      logger.info(`[seed-role-agents] "${role.name}" already exists, skipping.`);
      continue;
    }

    const agent = await createAgent({
      id: role.id, // createAgent() does NOT generate this itself — the caller must (confirmed from api/server/controllers/agents/v1.js's own create route). Fixed, not random — see the comment on the first ROLES entry for why.
      name: role.name,
      description: role.description,
      instructions: role.instructions,
      conversation_starters: role.conversation_starters,
      provider: 'ERPray', // matches deploy/librechat.yaml's custom endpoint `name`
      model: 'erpray-balanced', // same connector model every persona delegates to
      author: owner._id,
      category: 'erpray-roles',
    });

    await Promise.all([
      grantPermission({
        principalType: PrincipalType.USER,
        principalId: owner._id,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_OWNER,
        grantedBy: owner._id,
      }),
      // Visible and usable by EVERY user of this instance, not just the owner
      // — these are meant as instance-wide starter personas (AGENT_BUILD_
      // INSTRUCTIONS.md's own framing: "Free plan gets 1; upgrades unlock
      // more" implies they're a shared offering, not one admin's private tool).
      grantPermission({
        principalType: PrincipalType.PUBLIC,
        principalId: null,
        resourceType: ResourceType.AGENT,
        resourceId: agent._id,
        accessRoleId: AccessRoleIds.AGENT_VIEWER,
        grantedBy: owner._id,
      }),
    ]);

    if (globalProject) {
      await addAgentIdsToProject(globalProject._id, [agent.id]);
    }

    logger.info(`[seed-role-agents] Created "${role.name}" (${agent.id}), owned by ${owner.email}, public.`);
  }

  logger.info('[seed-role-agents] Done.');
  process.exit(0);
}

main().catch((err) => {
  logger.error('[seed-role-agents] Failed:', err);
  process.exit(1);
});
