/**
 * Seed a starter set of LibreChat Prompts (AGENT_BUILD_INSTRUCTIONS.md §5.6:
 * "The skill library becomes LibreChat Prompts. Migrate content, not
 * mechanism.")
 *
 * SyteRay's "skill library" (packages/connector/src/chat/skillStore.ts) was a
 * generic, no-code custom-agent builder backed by its own Postgres table
 * (name + system prompt + tool allow-list + example prompts, user-created).
 * There is no FIXED catalog of "skill" content to port the way the 5 role
 * personas had 5 concrete, named prompts — it was a MECHANISM for customers
 * to build their own, and LibreChat's native Prompts feature already
 * replaces that mechanism directly (save a reusable template, share it,
 * parameterize it with {{variables}}). Reimplementing skillStore's Postgres
 * table would be building a second, worse copy of a feature LibreChat
 * already ships.
 *
 * What DOES port is the underlying idea — reusable, parameterized business
 * question "recipes" — as a starter set demonstrating the pattern against
 * ERPray's own domain, the same way a fresh install of any product ships a
 * few example templates rather than a blank slate.
 *
 * Usage:
 *   node config/seed-starter-prompts.js --owner=admin@example.com
 *   node config/seed-starter-prompts.js            (uses the sole user, if only one exists)
 *
 * Idempotent: skips any prompt group whose name already exists.
 */
const path = require('path');
const { logger } = require('@librechat/data-schemas');
const { AccessRoleIds, ResourceType, PrincipalType, Constants } = require('librechat-data-provider');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');
const { createPromptGroup, getPromptGroups } = require('~/models/Prompt');
const { getProjectByName, addGroupIdsToProject } = require('~/models/Project');
const { grantPermission } = require('~/server/services/PermissionService');
const { User } = require('~/db/models');

/** {{variable}} placeholders — LibreChat's own Prompts dynamic-variable
 *  syntax; a user is prompted to fill these in before sending. */
const STARTER_PROMPTS = [
  {
    name: 'Customer 360',
    oneliner: "A full picture on one customer — revenue, AR, credit status.",
    category: 'erpray',
    prompt:
      'Give me a full picture on {{customer}}: revenue this year, AR outstanding, any overdue invoices, ' +
      "and whether they're on credit hold.",
  },
  {
    name: 'Weekly AR digest',
    oneliner: 'Total AR position and the biggest overdue balances.',
    category: 'erpray',
    prompt:
      'Summarize our AR position: total outstanding, total overdue, and the 5 customers with the largest ' +
      'overdue balances.',
  },
  {
    name: 'Vendor risk check',
    oneliner: 'What we owe a vendor, and whether any of their POs are overdue.',
    category: 'erpray',
    prompt:
      'How much do we owe {{vendor}}, and do we have any purchase orders with them that are overdue for receipt?',
  },
  {
    name: 'Late order chase list',
    oneliner: 'Every late sales order, worst first.',
    category: 'erpray',
    prompt: 'List every late sales order, sorted by how many days overdue, with the customer name and order value.',
  },
  {
    name: 'Margin check',
    oneliner: 'Gross margin for a period, compared to the prior one.',
    category: 'erpray',
    prompt: "What's our gross margin {{period}}, and how does it compare to last {{period}}?",
  },
  {
    name: 'New customer follow-up',
    oneliner: 'Recently added customers who have not ordered yet.',
    category: 'erpray',
    prompt: "Show me every customer created in the last {{days}} days, and whether they've placed an order yet.",
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
          'Pass --owner=<email> to pick which account owns these prompts.',
      );
    }
    owner = users[0];
  }

  // getPromptGroups(req, filter) — req is unused inside (dead `req.user.projects`
  // TODO in api/models/Prompt.js), but the real param order is (req, filter), not
  // (filter) alone; passing filter positionally as `req` silently drops it.
  const existing = await getPromptGroups(null, { author: owner._id, pageSize: 100 });
  const existingNames = new Set((existing?.promptGroups ?? []).map((g) => g.name));

  const globalProject = await getProjectByName(Constants.GLOBAL_PROJECT_NAME, ['_id']);

  for (const starter of STARTER_PROMPTS) {
    if (existingNames.has(starter.name)) {
      logger.info(`[seed-starter-prompts] "${starter.name}" already exists, skipping.`);
      continue;
    }

    const result = await createPromptGroup({
      prompt: { prompt: starter.prompt, type: 'text' },
      group: { name: starter.name, oneliner: starter.oneliner, category: starter.category },
      author: owner._id,
      authorName: owner.name || owner.email,
    });

    const groupId = result.prompt?.groupId;
    if (!groupId) {
      logger.error(`[seed-starter-prompts] "${starter.name}" did not return a groupId — skipping permissions.`);
      continue;
    }

    await Promise.all([
      grantPermission({
        principalType: PrincipalType.USER,
        principalId: owner._id,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: groupId,
        accessRoleId: AccessRoleIds.PROMPTGROUP_OWNER,
        grantedBy: owner._id,
      }),
      // Instance-wide starter content, same reasoning as seed-role-agents.js:
      // meant as a shared example set, not one admin's private prompts.
      grantPermission({
        principalType: PrincipalType.PUBLIC,
        principalId: null,
        resourceType: ResourceType.PROMPTGROUP,
        resourceId: groupId,
        accessRoleId: AccessRoleIds.PROMPTGROUP_VIEWER,
        grantedBy: owner._id,
      }),
    ]);

    if (globalProject) {
      await addGroupIdsToProject(globalProject._id, [String(groupId)]);
    }

    logger.info(`[seed-starter-prompts] Created "${starter.name}" (${groupId}), owned by ${owner.email}, public.`);
  }

  logger.info('[seed-starter-prompts] Done.');
  process.exit(0);
}

main().catch((err) => {
  logger.error('[seed-starter-prompts] Failed:', err);
  process.exit(1);
});
