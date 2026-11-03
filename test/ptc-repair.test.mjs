import assert from 'node:assert/strict';
import { faceOf, reBaseline } from '../lib/ptc-repair.js';

const agent = {
  ctx: {},
  session: {
    header: { config: { model: 'test' } },
    requestHeader() {
      return { config: { model: 'test' }, tools: [] };
    },
    append(type, data) {
      assert.equal(type, 'request/header');
      assert.equal(data.reason, 'series');
      assert.deepEqual(data.header.tools.map((tool) => tool.name), ['run_code']);
      this.last = data;
    }
  }
};

const tools = {
  schemas(scope) {
    assert.equal(scope, agent, 'schemas must be resolved for the Agent, not agent.ctx');
    return [
      { name: 'run_code', description: 'ptc transport', parameters: {} },
      { name: 'read', description: 'native tool', parameters: {}, deferLoading: true }
    ];
  }
};

const face = faceOf(tools, agent);
assert.equal(face.ptc, true);
assert.equal(face.list.length, 1);
assert.equal(face.list[0].name, 'run_code');
assert.equal(face.list[0].deferLoading, undefined);

const baseline = reBaseline(tools, agent);
assert.deepEqual(baseline, { ptc: true, count: 1 });
assert.ok(agent.session.last);
console.log('PASS: PTC face and request/header baseline use the Agent scope');
