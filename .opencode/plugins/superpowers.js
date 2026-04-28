/**
 * Superpowers plugin for OpenCode.ai
 *
 * Injects superpowers bootstrap context, registers skills and fork-specific
 * agents, and provides Claude-style task tools that the forked skills rely on.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

import { tool } from '@opencode-ai/plugin';

const __filename = fs.realpathSync(fileURLToPath(import.meta.url));
const __dirname = path.dirname(__filename);
const TASK_STATE_FILENAME = '.superpowers-opencode-tasks.json';
const WORKFLOW_STATE_FILENAME = '.claude-workflow-state.json';
const FILTERED_SKILLS_DIRNAME = '.superpowers-opencode-skills';
const TASK_STATUSES = new Set(['pending', 'in_progress', 'completed', 'cancelled']);

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const extractAndStripFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content };

  const frontmatterStr = match[1];
  const body = match[2];
  const frontmatter = {};

  for (const line of frontmatterStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      frontmatter[key] = value;
    }
  }

  return { frontmatter, content: body };
};

const toIsoTimestamp = () => new Date().toISOString();

const slugifyPath = (value) => String(value).replace(/[^a-zA-Z0-9._-]+/g, '-');

const readJsonFile = (filePath, fallback) => {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
};

const writeJsonFile = (filePath, value) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
};

const removePathIfExists = (targetPath) => {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
};

const relativeToWorktree = (worktree, filePath) => {
  const rel = path.relative(worktree, filePath);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : filePath;
};

const getTaskStorePath = (worktree) => path.join(worktree, TASK_STATE_FILENAME);
const getWorkflowStatePath = (worktree) => path.join(worktree, WORKFLOW_STATE_FILENAME);

const createTaskStore = (worktree) => ({
  version: 1,
  worktree,
  nextTaskId: 1,
  tasks: [],
  lastUpdated: toIsoTimestamp(),
});

const cloneTask = (task) => JSON.parse(JSON.stringify(task));

const extractEmbeddedMetadata = (description) => {
  const match = String(description ?? '').match(/```json:metadata\r?\n([\s\S]*?)\r?\n```/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[1]);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeTaskRecord = (task) => {
  const description = String(task.description ?? '').trim();
  const embeddedMetadata = extractEmbeddedMetadata(description);
  const explicitMetadata = isRecord(task.metadata) ? task.metadata : {};

  return {
    id: Number(task.id),
    subject: String(task.subject ?? '').trim(),
    description,
    status: TASK_STATUSES.has(task.status) ? task.status : 'pending',
    activeForm: task.activeForm ? String(task.activeForm).trim() || null : null,
    blockedBy: Array.isArray(task.blockedBy)
      ? [...new Set(task.blockedBy.map((value) => Number(value)).filter(Number.isInteger))].sort((a, b) => a - b)
      : [],
    metadata: {
      ...embeddedMetadata,
      ...explicitMetadata,
    },
    createdAt: typeof task.createdAt === 'string' ? task.createdAt : toIsoTimestamp(),
    lastUpdated: typeof task.lastUpdated === 'string' ? task.lastUpdated : toIsoTimestamp(),
  };
};

const normalizeTaskStore = (worktree, raw) => {
  const tasks = Array.isArray(raw.tasks) ? raw.tasks.map(normalizeTaskRecord) : [];
  const maxTaskId = tasks.reduce((max, task) => Math.max(max, task.id), 0);
  const requestedNextTaskId = Number(raw.nextTaskId);

  return {
    version: 1,
    worktree,
    nextTaskId: Number.isInteger(requestedNextTaskId) && requestedNextTaskId > maxTaskId
      ? requestedNextTaskId
      : maxTaskId + 1,
    tasks,
    lastUpdated: typeof raw.lastUpdated === 'string' ? raw.lastUpdated : toIsoTimestamp(),
  };
};

const readWorkflowState = (worktree) => {
  const workflow = readJsonFile(getWorkflowStatePath(worktree), null);
  return isRecord(workflow) ? workflow : null;
};

const resolvePlanContext = (worktree) => {
  const workflow = readWorkflowState(worktree);
  const artifacts = isRecord(workflow?.artifacts) ? workflow.artifacts : {};
  const rawPlanPath = typeof artifacts.planPath === 'string' ? artifacts.planPath.trim() : '';
  if (!rawPlanPath) return null;

  const absolutePlanPath = path.isAbsolute(rawPlanPath)
    ? path.resolve(rawPlanPath)
    : path.resolve(worktree, rawPlanPath);

  if (!fs.existsSync(absolutePlanPath)) {
    return null;
  }

  const planPath = relativeToWorktree(worktree, absolutePlanPath);
  const tasksPath = `${absolutePlanPath}.tasks.json`;

  return {
    planPath,
    tasksPath,
    relativeTasksPath: relativeToWorktree(worktree, tasksPath),
  };
};

const loadPlanTaskStore = (worktree) => {
  const planContext = resolvePlanContext(worktree);
  if (!planContext || !fs.existsSync(planContext.tasksPath)) {
    return null;
  }

  const raw = readJsonFile(planContext.tasksPath, null);
  if (!isRecord(raw) || !Array.isArray(raw.tasks)) {
    return null;
  }

  const lastUpdated = typeof raw.lastUpdated === 'string' ? raw.lastUpdated : toIsoTimestamp();

  return {
    version: 1,
    worktree,
    nextTaskId: 1,
    tasks: raw.tasks.map((task) => normalizeTaskRecord({
      ...task,
      createdAt: typeof task.createdAt === 'string' ? task.createdAt : lastUpdated,
      lastUpdated: typeof task.lastUpdated === 'string' ? task.lastUpdated : lastUpdated,
    })),
    lastUpdated,
  };
};

const loadTaskStore = (worktree) => {
  const storePath = getTaskStorePath(worktree);
  const rawStore = readJsonFile(storePath, null);
  const localStore = isRecord(rawStore) ? normalizeTaskStore(worktree, rawStore) : createTaskStore(worktree);
  const planStore = loadPlanTaskStore(worktree);

  if (!planStore) {
    return localStore;
  }

  if (localStore.tasks.length === 0) {
    return normalizeTaskStore(worktree, planStore);
  }

  const localUpdatedAt = Date.parse(localStore.lastUpdated);
  const planUpdatedAt = Date.parse(planStore.lastUpdated);

  if (!Number.isNaN(planUpdatedAt) && (Number.isNaN(localUpdatedAt) || planUpdatedAt > localUpdatedAt)) {
    return normalizeTaskStore(worktree, planStore);
  }

  return localStore;
};

const saveTaskStore = (worktree, store) => {
  const normalized = normalizeTaskStore(worktree, {
    ...store,
    lastUpdated: toIsoTimestamp(),
  });
  writeJsonFile(getTaskStorePath(worktree), normalized);
  return normalized;
};

const getTaskSummaryLine = (task) => {
  const dependencyText = task.blockedBy.length
    ? ` blocked by #${task.blockedBy.join(', #')}`
    : '';
  return `#${task.id} [${task.status}] ${task.subject}${dependencyText}`;
};

const ensureTask = (store, taskId) => {
  const numericId = Number(taskId);
  if (!Number.isInteger(numericId)) {
    throw new Error(`Invalid task id: ${taskId}`);
  }

  const task = store.tasks.find((entry) => entry.id === numericId);
  if (!task) {
    throw new Error(`Task #${numericId} not found`);
  }

  return task;
};

const syncWorkflowArtifacts = (worktree, store) => {
  const workflowPath = getWorkflowStatePath(worktree);
  if (!fs.existsSync(workflowPath)) {
    return null;
  }

  const current = readWorkflowState(worktree);
  if (!current) {
    return null;
  }

  const artifacts = isRecord(current.artifacts) ? current.artifacts : {};
  const updated = {
    ...current,
    artifacts: {
      ...artifacts,
      taskIds: store.tasks.map((task) => task.id),
    },
    lastUpdated: toIsoTimestamp(),
  };

  writeJsonFile(workflowPath, updated);
  return updated;
};

const serializeTaskForPlanFile = (task, existingTask) => {
  const output = isRecord(existingTask) ? { ...existingTask } : {};

  output.id = task.id;
  output.subject = task.subject;
  output.status = task.status;
  output.lastUpdated = task.lastUpdated;

  if (task.description) {
    output.description = task.description;
  } else {
    delete output.description;
  }

  if (task.activeForm) {
    output.activeForm = task.activeForm;
  } else {
    delete output.activeForm;
  }

  if (task.blockedBy.length > 0) {
    output.blockedBy = [...task.blockedBy];
  } else {
    delete output.blockedBy;
  }

  if (Object.keys(task.metadata).length > 0) {
    output.metadata = { ...task.metadata };
  } else {
    delete output.metadata;
  }

  return output;
};

const syncPlanTaskFile = (worktree, store) => {
  const planContext = resolvePlanContext(worktree);
  if (!planContext) {
    return null;
  }

  const current = readJsonFile(planContext.tasksPath, {});
  const existingTasks = Array.isArray(current.tasks) ? current.tasks : [];
  const existingTasksById = new Map(
    existingTasks
      .filter(isRecord)
      .map((task) => [Number(task.id), task]),
  );

  const updated = {
    ...(isRecord(current) ? current : {}),
    planPath: planContext.planPath,
    tasks: store.tasks.map((task) => serializeTaskForPlanFile(task, existingTasksById.get(task.id))),
    lastUpdated: toIsoTimestamp(),
  };

  writeJsonFile(planContext.tasksPath, updated);

  return {
    planPath: planContext.planPath,
    tasksPath: planContext.relativeTasksPath,
  };
};

const persistTaskState = (worktree, store) => {
  const persisted = saveTaskStore(worktree, store);
  const workflow = syncWorkflowArtifacts(worktree, persisted);
  const planTasks = syncPlanTaskFile(worktree, persisted);

  return {
    store: persisted,
    workflow,
    planTasks,
  };
};

const upsertTask = (store, input) => {
  const now = toIsoTimestamp();
  const embeddedMetadata = extractEmbeddedMetadata(input.description);
  const mergedMetadata = {
    ...embeddedMetadata,
    ...(isRecord(input.metadata) ? input.metadata : {}),
  };

  const task = normalizeTaskRecord({
    id: store.nextTaskId,
    subject: input.subject,
    description: input.description,
    status: input.status ?? 'pending',
    activeForm: input.activeForm ?? null,
    blockedBy: input.blockedBy ?? [],
    metadata: mergedMetadata,
    createdAt: now,
    lastUpdated: now,
  });

  store.tasks.push(task);
  store.nextTaskId += 1;

  return task;
};

const updateTaskRecord = (task, input) => {
  if (input.subject !== undefined) {
    task.subject = String(input.subject).trim();
  }

  if (input.description !== undefined) {
    task.description = String(input.description).trim();
    task.metadata = {
      ...extractEmbeddedMetadata(task.description),
      ...(task.metadata && isRecord(task.metadata) ? task.metadata : {}),
    };
  }

  if (input.activeForm !== undefined) {
    task.activeForm = input.activeForm ? String(input.activeForm).trim() || null : null;
  }

  if (input.status !== undefined) {
    if (!TASK_STATUSES.has(input.status)) {
      throw new Error(`Invalid task status: ${input.status}`);
    }
    task.status = input.status;
  }

  if (Array.isArray(input.addBlockedBy) && input.addBlockedBy.length > 0) {
    const merged = new Set(task.blockedBy);
    for (const dependency of input.addBlockedBy) {
      const numeric = Number(dependency);
      if (!Number.isInteger(numeric)) {
        throw new Error(`Invalid blockedBy task id: ${dependency}`);
      }
      merged.add(numeric);
    }
    task.blockedBy = [...merged].sort((a, b) => a - b);
  }

  if (Array.isArray(input.removeBlockedBy) && input.removeBlockedBy.length > 0) {
    const removed = new Set(input.removeBlockedBy.map((value) => Number(value)));
    task.blockedBy = task.blockedBy.filter((dependency) => !removed.has(dependency));
  }

  if (input.clearBlockedBy === true) {
    task.blockedBy = [];
  }

  if (input.metadata && isRecord(input.metadata)) {
    task.metadata = {
      ...(task.metadata && isRecord(task.metadata) ? task.metadata : {}),
      ...input.metadata,
    };
  }

  task.lastUpdated = toIsoTimestamp();
  return task;
};

const renderTaskList = (store, worktree) => {
  const planContext = resolvePlanContext(worktree);

  if (store.tasks.length === 0) {
    return {
      output: 'No tasks found.',
      metadata: {
        count: 0,
        tasks: [],
        statePath: relativeToWorktree(worktree, getTaskStorePath(worktree)),
        tasksPath: planContext?.relativeTasksPath ?? null,
      },
    };
  }

  return {
    output: store.tasks.map(getTaskSummaryLine).join('\n'),
    metadata: {
      count: store.tasks.length,
      tasks: store.tasks.map(cloneTask),
      statePath: relativeToWorktree(worktree, getTaskStorePath(worktree)),
      tasksPath: planContext?.relativeTasksPath ?? null,
    },
  };
};

const makeReviewerPrompt = (templatePath, replacements) => {
  const template = fs.readFileSync(templatePath, 'utf8');
  let output = template;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(key, value);
  }
  return output;
};

const normalizeSearchText = (value) => String(value)
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const parseConfiguredModel = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const normalized = value.trim();
  const slashIdx = normalized.indexOf('/');
  if (slashIdx <= 0 || slashIdx === normalized.length - 1) {
    return null;
  }

  return {
    id: normalized,
    providerID: normalized.slice(0, slashIdx),
    modelID: normalized.slice(slashIdx + 1),
    lowerID: normalized.toLowerCase(),
    lowerModelID: normalized.slice(slashIdx + 1).toLowerCase(),
  };
};

const createModelDescriptor = (providerID, modelID, modelConfig = null) => {
  const parsed = parseConfiguredModel(`${providerID}/${modelID}`);
  if (!parsed) {
    return null;
  }

  const matchText = [
    parsed.id,
    parsed.modelID,
    isRecord(modelConfig) ? modelConfig.id : null,
    isRecord(modelConfig) ? modelConfig.name : null,
    isRecord(modelConfig) ? modelConfig.family : null,
  ]
    .filter((value) => typeof value === 'string' && value.trim())
    .map(normalizeSearchText)
    .join(' ');

  return {
    ...parsed,
    matchText,
  };
};

const collectAvailableModels = (config) => {
  const models = [];

  const configuredDefaultModel = parseConfiguredModel(config.model);
  if (configuredDefaultModel) {
    const configuredDefaultModelConfig = isRecord(config.provider?.[configuredDefaultModel.providerID]?.models?.[configuredDefaultModel.modelID])
      ? config.provider[configuredDefaultModel.providerID].models[configuredDefaultModel.modelID]
      : null;
    const defaultDescriptor = createModelDescriptor(
      configuredDefaultModel.providerID,
      configuredDefaultModel.modelID,
      configuredDefaultModelConfig,
    );
    if (defaultDescriptor) {
      models.push(defaultDescriptor);
    }
  }

  if (isRecord(config.provider)) {
    for (const [providerName, providerConfig] of Object.entries(config.provider)) {
      if (!isRecord(providerConfig) || !isRecord(providerConfig.models)) {
        continue;
      }

      for (const [modelName, modelConfig] of Object.entries(providerConfig.models)) {
        const descriptor = createModelDescriptor(providerName, modelName, modelConfig);
        if (descriptor) {
          models.push(descriptor);
        }
      }
    }
  }

  const deduped = new Map();
  for (const model of models) {
    deduped.set(model.id, model);
  }

  return [...deduped.values()];
};

const rankModels = (models, preferredPatterns) => models
  .map((model) => ({
    ...model,
    matchText: model.matchText || normalizeSearchText(model.id),
  }))
  .map((model) => ({
    ...model,
    matchIndex: preferredPatterns
      .map(normalizeSearchText)
      .findIndex((pattern) => model.matchText.includes(pattern)),
  }))
  .filter((model) => model.matchIndex !== -1)
  .sort((left, right) => {
    if (left.matchIndex !== right.matchIndex) {
      return left.matchIndex - right.matchIndex;
    }

    if (left.providerID !== right.providerID) {
      return left.providerID.localeCompare(right.providerID);
    }

    return left.modelID.localeCompare(right.modelID);
  });

const selectPreferredModel = (candidates, preferredProviderID = null, excludedModelIDs = new Set()) => {
  const remaining = candidates.filter((candidate) => !excludedModelIDs.has(candidate.id));
  if (remaining.length === 0) {
    return null;
  }

  if (preferredProviderID) {
    const crossProvider = remaining.find((candidate) => candidate.providerID !== preferredProviderID);
    if (crossProvider) {
      return crossProvider;
    }
  }

  return remaining[0];
};

const selectAlternateModel = (candidates, primaryModel, preferredProviderID = null) => {
  if (!primaryModel) {
    return null;
  }

  const excluded = new Set([primaryModel.id]);
  const remaining = candidates.filter((candidate) => !excluded.has(candidate.id));
  if (remaining.length === 0) {
    return null;
  }

  const differentProviderThanPrimary = remaining.find((candidate) => candidate.providerID !== primaryModel.providerID);
  if (differentProviderThanPrimary) {
    return differentProviderThanPrimary;
  }

  if (preferredProviderID) {
    const differentThanDefault = remaining.find((candidate) => candidate.providerID !== preferredProviderID);
    if (differentThanDefault) {
      return differentThanDefault;
    }
  }

  return remaining[0];
};

const resolveAgentModels = (config) => {
  const models = collectAvailableModels(config);
  const defaultModel = parseConfiguredModel(config.model);
  const defaultProviderID = defaultModel?.providerID ?? null;

  const heavyReviewCandidates = rankModels(models, [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
  ]);
  const standardCandidates = rankModels(models, [
    'claude-sonnet-4-6',
    'claude-opus-4-6',
  ]);

  const primaryReviewModel = selectPreferredModel(heavyReviewCandidates, defaultProviderID);
  const alternateReviewModel = selectAlternateModel(heavyReviewCandidates, primaryReviewModel, defaultProviderID)
    ?? selectAlternateModel(standardCandidates, primaryReviewModel, defaultProviderID)
    ?? primaryReviewModel;
  const implementerModel = defaultModel
    ?? primaryReviewModel
    ?? selectPreferredModel(standardCandidates);

  return {
    defaultModel: defaultModel?.id ?? null,
    primaryReviewModel: primaryReviewModel?.id ?? defaultModel?.id ?? null,
    alternateReviewModel: alternateReviewModel?.id ?? primaryReviewModel?.id ?? defaultModel?.id ?? null,
    implementerModel: implementerModel?.id ?? defaultModel?.id ?? null,
  };
};

const mergeAgentDefinition = (config, name, definition) => {
  const existing = isRecord(config.agent?.[name]) ? config.agent[name] : {};
  config.agent[name] = {
    ...definition,
    ...existing,
  };

  if (isRecord(definition.permission) || isRecord(existing.permission)) {
    config.agent[name].permission = {
      ...(isRecord(definition.permission) ? definition.permission : {}),
      ...(isRecord(existing.permission) ? existing.permission : {}),
    };

    if (isRecord(definition.permission?.bash) || isRecord(existing.permission?.bash)) {
      config.agent[name].permission.bash = {
        ...(isRecord(definition.permission?.bash) ? definition.permission.bash : {}),
        ...(isRecord(existing.permission?.bash) ? existing.permission.bash : {}),
      };
    }
  }
};

const buildImplementerPrompt = () => `You are the implementer subagent for a single Superpowers task.

The parent agent will provide the full task description, structured metadata, and any required context. Treat that dispatch message as the source of truth.

Rules:
- Implement exactly what the task asks for.
- Stay within the declared file scope unless the parent explicitly expands it.
- Ask for clarification before coding if requirements, dependencies, or acceptance criteria are unclear.
- Run the required verification steps before you report back.
- Do not run git commit.
- If you hit scope drift, missing context, or a blocker, stop and report it instead of guessing.

When you finish, report in this format:
- Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented
- Files changed
- Acceptance criteria status
- Verify command output
- Test results
- Concerns or follow-ups`;

const buildSpecReviewerPrompt = () => `You are the spec compliance reviewer for a single Superpowers task.

The parent agent will provide the requested task requirements, the implementer's report, and the code or git range to inspect.

Rules:
- Do not trust the implementer's report by itself.
- Verify the actual code and diff directly.
- Check for missing requirements, extra scope, and misread requirements.
- Do not make edits.

Return either:
- Spec compliant

or

- Issues found, with file:line references and a short explanation of what is missing, extra, or incorrect.`;

const buildAdversarialReviewerPrompt = ({ target, stance, returnShape }) => `You are the ${stance} reviewer for a Superpowers ${target}.

The parent agent will provide the ${target} content or a path to inspect.

Rules:
- Focus on substantive review, not formatting nits.
- Do not make edits.
- Keep your response under 500 words.
- If the parent gives you both a file path and content, trust the content as the exact review target and use the file path only for context.

Your stance:
- ${stance === 'ADVOCATE'
    ? 'Defend the design. Identify strengths, confirm feasibility, and call out only real risks that still matter.'
    : 'Challenge the design. Find gaps, ambiguities, flawed assumptions, missing edge cases, and better alternatives.'}

Return:
- ${returnShape.join('\n- ')}`;

const readSkillNamesFromRoot = (rootPath) => {
  if (!rootPath || !fs.existsSync(rootPath)) {
    return new Set();
  }

  const names = new Set();

  for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillFile = path.join(rootPath, entry.name, 'SKILL.md');
    if (fs.existsSync(skillFile)) {
      names.add(entry.name);
    }
  }

  return names;
};

const getProjectSkillRoots = (startDir, worktree) => {
  const roots = [];
  const resolvedWorktree = path.resolve(worktree);
  let current = path.resolve(startDir || worktree);

  while (true) {
    roots.push(path.join(current, '.opencode', 'skills'));
    roots.push(path.join(current, '.claude', 'skills'));
    roots.push(path.join(current, '.agents', 'skills'));

    if (current === resolvedWorktree) {
      break;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return roots;
};

const getGlobalSkillRoots = (homeDir, configDir) => [
  path.join(configDir, 'skills'),
  path.join(homeDir, '.claude', 'skills'),
  path.join(homeDir, '.agents', 'skills'),
];

const resolveSkillFile = (startDir, worktree, homeDir, configDir, bundledSkillsDir, skillName) => {
  const candidateRoots = [
    ...getProjectSkillRoots(startDir, worktree),
    ...getGlobalSkillRoots(homeDir, configDir),
    bundledSkillsDir,
  ];

  for (const rootPath of candidateRoots) {
    const candidate = path.join(rootPath, skillName, 'SKILL.md');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const collectBuiltinOverrideNames = (startDir, worktree, homeDir, configDir, bundledSkillsDir, configuredPaths = []) => {
  const names = new Set();

  for (const rootPath of [
    ...getProjectSkillRoots(startDir, worktree),
    ...getGlobalSkillRoots(homeDir, configDir),
  ]) {
    for (const name of readSkillNamesFromRoot(rootPath)) {
      names.add(name);
    }
  }

  for (const extraPath of configuredPaths) {
    const normalized = path.resolve(extraPath);
    if (normalized === path.resolve(bundledSkillsDir)) {
      continue;
    }
    for (const name of readSkillNamesFromRoot(normalized)) {
      names.add(name);
    }
  }

  return names;
};

const buildFilteredSkillsDir = (startDir, worktree, homeDir, configDir, bundledSkillsDir, configuredPaths = []) => {
  const overrides = collectBuiltinOverrideNames(
    startDir,
    worktree,
    homeDir,
    configDir,
    bundledSkillsDir,
    configuredPaths,
  );
  const filteredRoot = path.join(
    configDir,
    FILTERED_SKILLS_DIRNAME,
    slugifyPath(path.resolve(bundledSkillsDir)),
  );

  removePathIfExists(filteredRoot);
  fs.mkdirSync(filteredRoot, { recursive: true });

  for (const entry of fs.readdirSync(bundledSkillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const sourceDir = path.join(bundledSkillsDir, entry.name);
    const skillFile = path.join(sourceDir, 'SKILL.md');
    if (!fs.existsSync(skillFile)) {
      continue;
    }

    if (overrides.has(entry.name)) {
      continue;
    }

    const targetDir = path.join(filteredRoot, entry.name);
    fs.cpSync(sourceDir, targetDir, { recursive: true });
  }

  return filteredRoot;
};

export const SuperpowersPlugin = async ({ worktree, directory }) => {
  const superpowersSkillsDir = path.resolve(__dirname, '../../skills');
  const homeDir = os.homedir();
  const configDir = process.env.OPENCODE_CONFIG_DIR
    ? path.resolve(process.env.OPENCODE_CONFIG_DIR)
    : path.join(homeDir, '.config', 'opencode');
  const skillSearchStart = path.resolve(directory || worktree);

  const getBootstrapContent = () => {
    const skillPath = resolveSkillFile(
      skillSearchStart,
      worktree,
      homeDir,
      configDir,
      superpowersSkillsDir,
      'using-superpowers',
    );
    if (!skillPath || !fs.existsSync(skillPath)) return null;

    const fullContent = fs.readFileSync(skillPath, 'utf8');
    const { content } = extractAndStripFrontmatter(fullContent);

    const toolMapping = `**Tool Mapping for OpenCode:**
When skills reference Claude Code tools you do not have, substitute these OpenCode equivalents:
- \`Skill\` tool -> OpenCode's native \`skill\` tool
- \`TodoWrite\` -> \`todowrite\`
- \`TaskCreate\`, \`TaskList\`, \`TaskGet\`, \`TaskUpdate\` -> the custom tools with those exact names provided by this plugin
- Generic \`Task\` subagent dispatch -> use OpenCode subagents via \`@general\`, \`@explore\`, or the injected \`@code-reviewer\`, \`@plan-reviewer\`, \`@plan-advocate\`, \`@plan-challenger\`, \`@implementer\`, \`@spec-reviewer\`, \`@spec-advocate\`, and \`@spec-challenger\` agents
- \`EnterPlanMode\` / \`ExitPlanMode\` -> do not call them in OpenCode; stay in the normal session

The fork-specific task tools persist state in \`${TASK_STATE_FILENAME}\` at the worktree root. When \`${WORKFLOW_STATE_FILENAME}\` includes \`artifacts.planPath\`, they also keep \`<plan>.tasks.json\` in sync for cross-session resume.

Reviewer-style agents choose from the configured OpenCode model inventory. When a comparable Claude Opus 4.6 or Claude Sonnet 4.6 model exists on a different provider than your default model, the plugin prefers that alternate provider for review agents.`;

    return `<EXTREMELY_IMPORTANT>
You have superpowers.

**IMPORTANT: The using-superpowers skill content is included below. It is ALREADY LOADED and you are currently following it. Do NOT use the skill tool to load using-superpowers again.**

${content}

${toolMapping}
</EXTREMELY_IMPORTANT>`;
  };

  return {
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      const configuredSkillPaths = [...config.skills.paths];
      const filteredSkillsDir = buildFilteredSkillsDir(
        skillSearchStart,
        worktree,
        homeDir,
        configDir,
        superpowersSkillsDir,
        configuredSkillPaths,
      );

      if (!config.skills.paths.includes(filteredSkillsDir)) {
        config.skills.paths.push(filteredSkillsDir);
      }

      config.agent = config.agent || {};

      const {
        primaryReviewModel,
        alternateReviewModel,
        implementerModel,
      } = resolveAgentModels(config);

      const codeReviewer = {
        description: 'Reviews code changes for production readiness using the Superpowers review rubric',
        mode: 'subagent',
        permission: {
          edit: 'deny',
          bash: {
            '*': 'ask',
            'git diff *': 'allow',
            'git log *': 'allow',
            'git rev-parse *': 'allow',
            'git status *': 'allow',
          },
        },
        prompt: makeReviewerPrompt(
          path.join(superpowersSkillsDir, 'requesting-code-review', 'code-reviewer.md'),
          {
            '{WHAT_WAS_IMPLEMENTED}': 'the implementation under review',
            '{PLAN_OR_REQUIREMENTS}': 'the referenced plan or requirements',
            '{DESCRIPTION}': 'Review the diff in the requested git range and assess production readiness.',
            '{PLAN_REFERENCE}': 'Use the task description or plan file provided in the dispatch prompt.',
            '{BASE_SHA}': 'BASE_SHA',
            '{HEAD_SHA}': 'HEAD_SHA',
          },
        ),
      };
      if (primaryReviewModel) {
        codeReviewer.model = primaryReviewModel;
      }
      mergeAgentDefinition(config, 'code-reviewer', codeReviewer);

      const planReviewer = {
        description: 'Reviews a Superpowers plan document for completeness, sequencing, and implementation quality',
        mode: 'subagent',
        permission: {
          edit: 'deny',
          bash: 'deny',
        },
        prompt: fs.readFileSync(
          path.join(superpowersSkillsDir, 'writing-plans', 'plan-document-reviewer-prompt.md'),
          'utf8',
        ),
      };
      if (primaryReviewModel) {
        planReviewer.model = primaryReviewModel;
      }
      mergeAgentDefinition(config, 'plan-reviewer', planReviewer);

      const planAdvocate = {
        description: 'Defends a plan during adversarial review by validating strengths, sequencing, and feasibility',
        mode: 'subagent',
        permission: {
          edit: 'deny',
          bash: 'deny',
        },
        prompt: buildAdversarialReviewerPrompt({
          target: 'plan',
          stance: 'ADVOCATE',
          returnShape: [
            'Strengths',
            'Acknowledged Risks',
            'Defense of Design Choices',
          ],
        }),
      };
      if (primaryReviewModel) {
        planAdvocate.model = primaryReviewModel;
      }
      mergeAgentDefinition(config, 'plan-advocate', planAdvocate);

      const planChallenger = {
        description: 'Challenges a plan during adversarial review by finding gaps, ambiguity, and missing execution detail',
        mode: 'subagent',
        permission: {
          edit: 'deny',
          bash: 'deny',
        },
        prompt: buildAdversarialReviewerPrompt({
          target: 'plan',
          stance: 'CHALLENGER',
          returnShape: [
            'Gaps',
            'Ambiguities',
            'Flawed Assumptions',
            'Better Alternatives',
            'Daily-Use Friction Risks',
          ],
        }),
      };
      if (alternateReviewModel) {
        planChallenger.model = alternateReviewModel;
      }
      mergeAgentDefinition(config, 'plan-challenger', planChallenger);

      const implementer = {
        description: 'Implements one planned Superpowers task and reports structured completion status',
        mode: 'subagent',
        prompt: buildImplementerPrompt(),
      };
      if (implementerModel) {
        implementer.model = implementerModel;
      }
      mergeAgentDefinition(config, 'implementer', implementer);

      const specReviewer = {
        description: 'Checks whether an implementation matches its Superpowers task requirements',
        mode: 'subagent',
        permission: {
          edit: 'deny',
          bash: {
            '*': 'ask',
            'git diff *': 'allow',
            'git log *': 'allow',
            'git rev-parse *': 'allow',
            'git status *': 'allow',
          },
        },
        prompt: buildSpecReviewerPrompt(),
      };
      if (primaryReviewModel) {
        specReviewer.model = primaryReviewModel;
      }
      mergeAgentDefinition(config, 'spec-reviewer', specReviewer);

      const specAdvocate = {
        description: 'Defends a spec during adversarial review by validating completeness, feasibility, and design choices',
        mode: 'subagent',
        permission: {
          edit: 'deny',
          bash: 'deny',
        },
        prompt: buildAdversarialReviewerPrompt({
          target: 'spec',
          stance: 'ADVOCATE',
          returnShape: [
            'Strengths',
            'Acknowledged Risks',
            'Defense of Design Choices',
          ],
        }),
      };
      if (primaryReviewModel) {
        specAdvocate.model = primaryReviewModel;
      }
      mergeAgentDefinition(config, 'spec-advocate', specAdvocate);

      const specChallenger = {
        description: 'Challenges a spec during adversarial review by finding gaps, ambiguity, and flawed assumptions',
        mode: 'subagent',
        permission: {
          edit: 'deny',
          bash: 'deny',
        },
        prompt: buildAdversarialReviewerPrompt({
          target: 'spec',
          stance: 'CHALLENGER',
          returnShape: [
            'Gaps',
            'Ambiguities',
            'Flawed Assumptions',
            'Better Alternatives',
            'Daily-Use Friction Risks',
          ],
        }),
      };
      if (alternateReviewModel) {
        specChallenger.model = alternateReviewModel;
      }
      mergeAgentDefinition(config, 'spec-challenger', specChallenger);
    },

    tool: {
      TaskCreate: tool({
        description: 'Create a Superpowers task with subject, description, active form, metadata, and dependency support.',
        args: {
          subject: tool.schema.string().describe('Short task subject.'),
          description: tool.schema.string().describe('Structured task description, often including embedded json:metadata.'),
          activeForm: tool.schema.string().optional().describe('Present-tense active label, for example Implementing API validation.'),
          metadata: tool.schema.record(tool.schema.string(), tool.schema.any()).optional().describe('Optional metadata object to merge into embedded metadata.'),
          blockedBy: tool.schema.array(tool.schema.number().int()).optional().describe('Optional prerequisite task IDs.'),
          status: tool.schema.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional().describe('Initial task status.'),
        },
        async execute(args, context) {
          const store = loadTaskStore(context.worktree);
          const task = upsertTask(store, args);
          const persisted = persistTaskState(context.worktree, store);

          context.metadata({
            title: `Created task #${task.id}`,
            metadata: {
              task: cloneTask(task),
              statePath: relativeToWorktree(context.worktree, getTaskStorePath(context.worktree)),
              tasksPath: persisted.planTasks?.tasksPath ?? null,
            },
          });

          return {
            output: `Created task #${task.id}: ${task.subject}`,
            metadata: {
              task: cloneTask(task),
              count: persisted.store.tasks.length,
              tasksPath: persisted.planTasks?.tasksPath ?? null,
            },
          };
        },
      }),

      TaskList: tool({
        description: 'List all Superpowers tasks in the current worktree, including statuses and dependencies.',
        args: {},
        async execute(_args, context) {
          const store = loadTaskStore(context.worktree);
          const result = renderTaskList(store, context.worktree);

          context.metadata({
            title: store.tasks.length === 0 ? 'No tasks found' : `Listed ${store.tasks.length} task(s)`,
            metadata: result.metadata,
          });

          return result;
        },
      }),

      TaskGet: tool({
        description: 'Get a single Superpowers task by numeric ID.',
        args: {
          taskId: tool.schema.number().int().describe('Task ID to retrieve.'),
        },
        async execute(args, context) {
          const store = loadTaskStore(context.worktree);
          const task = ensureTask(store, args.taskId);

          context.metadata({
            title: `Loaded task #${task.id}`,
            metadata: { task: cloneTask(task) },
          });

          return {
            output: `${getTaskSummaryLine(task)}\n\n${task.description}`,
            metadata: { task: cloneTask(task) },
          };
        },
      }),

      TaskUpdate: tool({
        description: 'Update task status, dependencies, subject, description, or metadata for a Superpowers task.',
        args: {
          taskId: tool.schema.number().int().describe('Task ID to update.'),
          status: tool.schema.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional().describe('Optional next task status.'),
          subject: tool.schema.string().optional().describe('Optional replacement subject.'),
          description: tool.schema.string().optional().describe('Optional replacement description.'),
          activeForm: tool.schema.string().optional().describe('Optional replacement active form.'),
          addBlockedBy: tool.schema.array(tool.schema.number().int()).optional().describe('Dependency IDs to add.'),
          removeBlockedBy: tool.schema.array(tool.schema.number().int()).optional().describe('Dependency IDs to remove.'),
          clearBlockedBy: tool.schema.boolean().optional().describe('Clear all dependencies when true.'),
          metadata: tool.schema.record(tool.schema.string(), tool.schema.any()).optional().describe('Optional metadata patch.'),
        },
        async execute(args, context) {
          const store = loadTaskStore(context.worktree);
          const task = ensureTask(store, args.taskId);
          updateTaskRecord(task, args);
          const persisted = persistTaskState(context.worktree, store);

          context.metadata({
            title: `Updated task #${task.id}`,
            metadata: {
              task: cloneTask(task),
              tasksPath: persisted.planTasks?.tasksPath ?? null,
            },
          });

          return {
            output: `Updated task #${task.id}: ${task.subject} [${task.status}]`,
            metadata: {
              task: cloneTask(task),
              tasksPath: persisted.planTasks?.tasksPath ?? null,
            },
          };
        },
      }),
    },

    event: async ({ event }) => {
      if (event.type !== 'session.idle') {
        return;
      }

      const store = loadTaskStore(worktree);
      if (store.tasks.length === 0) {
        return;
      }

      syncWorkflowArtifacts(worktree, store);
      syncPlanTaskFile(worktree, store);
    },

    'experimental.chat.messages.transform': async (_input, output) => {
      const bootstrap = getBootstrapContent();
      if (!bootstrap || !output.messages.length) return;

      const firstUser = output.messages.find((message) => message.info.role === 'user');
      if (!firstUser || !firstUser.parts.length) return;

      if (firstUser.parts.some((part) => part.type === 'text' && part.text.includes('EXTREMELY_IMPORTANT'))) {
        return;
      }

      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: 'text', text: bootstrap });
    },
  };
};
