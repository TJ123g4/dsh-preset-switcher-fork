const RUN_CODE = 'run_code';
const SERIES = 'series';

export function messageOf(error) {
  if (error && typeof error === 'object' && typeof error.message === 'string') return error.message;
  return String(error);
}

export function stripDeferred(tool) {
  if (tool === null || typeof tool !== 'object') return tool;
  if (tool.deferLoading === undefined) return tool;
  const copy = { ...tool };
  delete copy.deferLoading;
  return copy;
}

export function faceOf(tools, agent) {
  const schemas = tools.schemas(agent);
  const ptc = schemas.some((tool) => tool.name === RUN_CODE);
  const list = ptc ? schemas.filter((tool) => tool.name === RUN_CODE) : schemas;
  return { ptc, list: list.map(stripDeferred) };
}

export function namesOf(list) {
  if (!Array.isArray(list)) return '';
  return list.map((tool) => (tool && tool.name) || '').join('\u0000');
}

export function declaredSet(history) {
  const declared = new Map();
  const base = (history && history.tools) || [];
  for (const tool of base) if (tool && tool.name) declared.set(tool.name, tool);
  const updates = (history && history.updates) || [];
  for (const update of updates) {
    const additions = (update && update.additions) || [];
    for (const tool of additions) {
      if (!tool || !tool.name) continue;
      if (!declared.has(tool.name)) declared.set(tool.name, { ...tool, deferLoading: true });
    }
  }
  const all = [...declared.values()];
  let deferred = 0;
  for (const tool of all) if (tool.deferLoading === true) deferred += 1;
  return { total: all.length, deferred, nonDeferred: all.length - deferred, updates: updates.length };
}

export function cheapState(agent) {
  const baseline = agent.session.requestHeader();
  const baseTools = baseline && Array.isArray(baseline.tools) ? baseline.tools : [];
  const folded = declaredSet(agent.session.toolHistory());
  const needsDeep = folded.updates > 0 || baseTools.length === 0 || folded.nonDeferred === 0;
  return { hasBaseline: baseline !== undefined, baseline: baseTools.length, baseTools, folded, needsDeep };
}

export function reBaseline(tools, agent) {
  const face = faceOf(tools, agent);
  if (face.list.length === 0) return null;
  const previous = agent.session.requestHeader();
  const config = previous && previous.config ? previous.config : undefined;
  if (config === undefined) return null;
  agent.session.append('request/header', { header: { config, tools: face.list }, reason: SERIES });
  return { ptc: face.ptc, count: face.list.length };
}

export function inspect(tools, agent) {
  const cheap = cheapState(agent);
  const face = faceOf(tools, agent);
  const sameFace = namesOf(cheap.baseTools) === namesOf(face.list);
  const needsHeal = cheap.hasBaseline && (cheap.needsDeep || !sameFace);
  return { ptc: face.ptc, faceCount: face.list.length, baseline: cheap.baseline, sameFace, folded: cheap.folded, needsHeal };
}

export function guard(tools, agent) {
  const cheap = cheapState(agent);
  const face = faceOf(tools, agent);
  const sameFace = namesOf(cheap.baseTools) === namesOf(face.list);
  if (!cheap.hasBaseline) return reBaseline(tools, agent);
  if (sameFace && cheap.folded.updates === 0 && cheap.folded.nonDeferred > 0) return null;
  return reBaseline(tools, agent);
}

export function describe(agent, state) {
  const mode = state.ptc ? 'ptc' : 'native';
  const head = '会话 ' + agent.id + ' · 呈现=' + mode;
  const fold = '基线 ' + state.baseline + ' 个 / 当前面 ' + state.faceCount + ' 个 / 历史 update ' + state.folded.updates + ' 条';
  const risk = '投影后 ' + state.folded.total + ' 个工具，非 defer ' + state.folded.nonDeferred + ' 个';
  const verdict = state.needsHeal ? ' 需要重建基线（保持原样会全 defer）' : ' 健康';
  return head + '\n' + fold + '\n' + risk + '\n' + verdict;
}
