import type { VNode } from 'vue';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { expiredAtCell } from './expiry';

/** VNode 里的文字：普通元素的文本子节点，或组件默认插槽的返回值。 */
function textOf(node: string | undefined | VNode): string {
  if (node === undefined || typeof node === 'string') {
    return node ?? '';
  }
  const children = node.children;
  if (typeof children === 'string') {
    return children;
  }
  if (Array.isArray(children)) {
    return textOf(children[0] as string | VNode);
  }
  const slot = (children as null | { default?: unknown })?.default;
  return typeof slot === 'function' ? textOf(slot() as string | VNode) : '';
}

/** 把渲染结果拆成「标签文字 / 标签颜色 / 过期时刻文字」。 */
function parts(expiresAt: string) {
  const [tag, when] = expiredAtCell(expiresAt).children as [VNode, VNode];
  return {
    color: tag.props?.color,
    label: textOf(tag),
    when: textOf(when),
  };
}

describe('过期单元格', () => {
  it('说清楚「已过期」并留下过期的那一刻', () => {
    const cell = parts('2026-10-01T12:00:00+08:00');
    expect(cell.label).toBe('已过期');
    expect(cell.color).toBe('red');
    // 关键：过期之后时间还在，不是只剩一枚标签
    expect(cell.when).toBe('2026/10/1 12:00:00');
  });

  it('时刻按北京时间显示，不跟浏览器时区走', () => {
    // 09-30 20:00Z = 北京 10-01 04:00；纽约的浏览器也显示这个
    expect(parts('2026-09-30T20:00:00Z').when).toBe('2026/10/1 04:00:00');
  });
});

describe('两个列表都接上了', () => {
  // 识别码和邀请码是两张表、两份渲染代码。哪一份漏掉，对应那个列表就又只剩
  // 「已过期」——所以这里盯住调用点，而不是只验工具函数本身。
  const VIEWS = [
    '../views/account/conversation-codes/index.vue',
    '../views/system/invite-codes/index.vue',
  ];

  it.each(VIEWS)('%s 的过期分支使用 shared renderer', (view) => {
    const source = readFileSync(
      fileURLToPath(new URL(view, import.meta.url)),
      'utf8',
    );
    expect(source).toContain('expiredAtCell(record.expires_at)');
  });
});
