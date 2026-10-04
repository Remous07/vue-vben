import { describe, expect, it } from 'vitest';

import {
  CATEGORY_LABELS,
  collapsibleSubKeys,
  GROUP_SUB_PREFIXES,
  groupOf,
  groupPermissions,
} from './permission-groups';

const CJK = /[一-鿿]/;

interface Row {
  code: string;
  id: number;
}

function rows(...codes: string[]): Row[] {
  return codes.map((code, index) => ({ code, id: index + 1 }));
}

describe('groupOf', () => {
  it('把权限码前缀映射到顶层分组', () => {
    expect(groupOf('translation:use')).toBe('bot_features');
    expect(groupOf('visitors:manage')).toBe('bot_features');
    expect(groupOf('admin:view')).toBe('system');
    expect(groupOf('profile:bind')).toBe('profile');
  });

  it('没登记的前缀退回前缀本身，而不是抛异常', () => {
    // 后端加了新权限码、前端还没跟上时，权限**必须仍然渲染得出来**——勾不上比
    // 分组名难看严重得多。这条钉住「别让未知前缀把页面搞崩」。
    expect(groupOf('brand_new:thing')).toBe('brand_new');
    expect(groupOf('')).toBe('other');
  });
});

describe('groupPermissions', () => {
  it('翻译归到「机器人功能 · 翻译」', () => {
    // 2026-10-04：`translation:use` 加进后端之后，面板上冒出来一个叫 `translation`
    // 的英文分组、图标是通用文件夹，而且排在最前面——因为没登记的前缀会被当成一个
    // 独立顶层分组。这条是那次漏登记的回归。
    const groups = groupPermissions(rows('translation:use', 'messages:view'));

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('bot_features');
    const sub = groups[0]?.subgroups.find((s) => s.key === 'translation');
    expect(sub?.label).toBe('翻译');
    expect(sub?.perms.map((p) => p.code)).toEqual(['translation:use']);
  });

  it('每个子分组都必须有中文名', () => {
    // 漏登记的表现就是显示成 `translation`、`profile` 这种英文原样。逐个 key 造一个
    // 码来验，而不是列一份手写清单——清单不会跟着这两张注册表变。
    //
    // 覆盖两类 key：登记在 GROUP_SUB_PREFIXES 里的前缀，以及**单子分组分组的顶层
    // key**（那种分组的子标题直接取顶层 key，`profile` 就是从这里漏的）。
    const codes = [
      ...new Set([
        ...Object.values(GROUP_SUB_PREFIXES).flat(),
        ...Object.keys(CATEGORY_LABELS),
      ]),
    ].map((key) => `${key}:view`);

    for (const group of groupPermissions(rows(...codes))) {
      for (const sub of group.subgroups) {
        expect(
          CJK.test(sub.label),
          `子分组 ${sub.key} 没有中文分组名（显示成了 ${sub.label}）`,
        ).toBe(true);
      }
    }
  });

  it('任何权限码都不会从树上消失', () => {
    // 丢权限是这个模块最糟的失败形态：勾不上，而面板上什么都看不出来——没有报错、
    // 没有空行，只是那个勾不存在。
    //
    // 这条覆盖的是**分组内**的丢失（`subGroupsFor` 只按登记过的前缀取子分组）。
    // 顺带一提，未登记的**顶层**前缀走的是平铺那条路，不会丢——见 groupOf。
    const codes = [
      'messages:view',
      'conversation:code',
      'visitors:manage',
      'admin:view',
      'profile:bind',
      'brand_new:thing',
      'nogroup',
    ];
    const tree = groupPermissions(rows(...codes));
    const rendered = tree.flatMap((g) =>
      g.subgroups.flatMap((s) => s.perms.map((p) => p.code)),
    );

    expect(rendered.toSorted()).toEqual(codes.toSorted());
  });

  it('顶层顺序按登记顺序，没登记的排最后', () => {
    // 原先用 `indexOf` 直接比大小：未登记的分组拿到 -1，于是**排到了所有分组前面**
    // ——加一个新权限码就能把整张权限树顶下来。
    const groups = groupPermissions(
      rows('brand_new:thing', 'profile:bind', 'admin:view', 'messages:view'),
    );

    expect(groups.map((g) => g.key)).toEqual([
      'bot_features',
      'system',
      'profile',
      'brand_new',
    ]);
  });

  it('没登记的分组照样渲染出权限，只是名字退回前缀', () => {
    const groups = groupPermissions(rows('brand_new:thing'));
    const [group] = groups;

    expect(group?.label).toBe('brand_new');
    expect(group?.perms.map((p) => p.code)).toEqual(['brand_new:thing']);
    expect(group?.subgroups[0]?.perms).toHaveLength(1);
  });

  it('同一个前缀的权限聚在一个子分组里', () => {
    const [group] = groupPermissions(rows('visitors:view', 'visitors:manage'));

    expect(group?.subgroups).toHaveLength(1);
    expect(group?.subgroups[0]?.perms).toHaveLength(2);
  });

  it('空列表给空树', () => {
    expect(groupPermissions([])).toEqual([]);
  });
});

describe('collapsibleSubKeys', () => {
  it('只返回子分组多于一个的分组', () => {
    // 「机器人功能」下有 messages 和 visitors 两个子分组 → 渲染成嵌套折叠面板。
    // 单个子分组的分组是平铺渲染的，没有面板可折叠——把它们也算进来，「全部展开」
    // 会永远显示成没展开。
    const groups = groupPermissions(rows('messages:view', 'visitors:view'));
    const keys = collapsibleSubKeys(groups);

    expect(keys).toEqual(['messages', 'visitors']);
  });

  it('只有单子分组的分组不贡献 key', () => {
    const keys = collapsibleSubKeys(groupPermissions(rows('profile:bind')));

    expect(keys).toEqual([]);
  });
});
