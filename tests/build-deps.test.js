import test from 'node:test';
import assert from 'node:assert/strict';
import merge from 'deepmerge';

test('Firefox linter cannot poison the merged object prototype', () => {
  for (const target of [JSON.parse('{"__proto__":{"auditInjected":true}}'), Object.assign(Object.create(null), JSON.parse('{"__proto__":{"auditInjected":true}}'))]) {
    const result = merge(target, {});
    assert.equal(Object.getPrototypeOf(result), Object.prototype);
    assert.equal(result.auditInjected, undefined);
    assert.equal(Object.getOwnPropertyDescriptor(result, '__proto__').value.auditInjected, true);
  }
  const nested = merge({ nested: JSON.parse('{"__proto__":{"auditInjected":true}}') }, {});
  assert.equal(nested.nested.auditInjected, undefined);
  assert.equal(({}).auditInjected, undefined);
  assert.deepEqual(merge({ values: [1], nested: { a: 1 } }, { values: [2], nested: { b: 2 } }), { values: [1, 2], nested: { a: 1, b: 2 } });
});
