import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  REDACTED_SECRET,
  secretFieldAfterSave,
  secretFieldConfigured,
  secretFieldDisplay,
} from './secret-field';

describe('secretField', () => {
  it('占位符不进输入框', () => {
    // 这是用户报的那个 bug：占位符当值渲染 → 遮罩成「•••」、点眼睛显示 *** 本身
    expect(secretFieldDisplay(REDACTED_SECRET)).toBe('');
  });

  it('真值原样显示', () => {
    // 用户在输入框里现场填的那把要看得见（密码框自己遮罩）
    expect(secretFieldDisplay('sk-live-123')).toBe('sk-live-123');
    expect(secretFieldDisplay('')).toBe('');
  });

  it('「已配置」只在读到占位符时成立', () => {
    expect(secretFieldConfigured(REDACTED_SECRET)).toBe(true);
    // 没配过的部署读到空串——不能把它说成「已配置」
    expect(secretFieldConfigured('')).toBe(false);
    expect(secretFieldConfigured('sk-live-123')).toBe(false);
  });

  it('保存后收回占位符状态，清空过就保持空', () => {
    expect(secretFieldAfterSave('sk-live-123')).toBe(REDACTED_SECRET);
    expect(secretFieldAfterSave('')).toBe('');
  });

  it('显示层和值层是分开的：值本身不许被改写', () => {
    // 保存逻辑靠原值判断「改没改」——显示层只负责看不看见，不负责存什么
    const stored = REDACTED_SECRET;
    expect(secretFieldDisplay(stored)).toBe('');
    expect(stored).toBe(REDACTED_SECRET);
  });

  it('组件里的输入框绑的是显示层，不是后端的原值', () => {
    // 上面几条测的是这几个函数本身——**管不住接线**。这个 bug 恰恰就是接线错：
    // 函数写对了，但输入框还是绑着 auditApiKey（后端原值），占位符照样被当值显示。
    // 所以这里扫一眼组件源码，把「别绑回去」也钉住。
    //
    // 路径按 `pnpm test:unit` 的工作目录（admin-panel 根）写。读不到就直接失败——
    // 目录变了的话要吵，不能静默跳过（否则这条会变成一条什么都不查的绿测试）。
    const viewPath = 'apps/web-bewbot/src/views/system/invite-codes/index.vue';
    let view: string;
    try {
      view = readFileSync(viewPath, 'utf8');
    } catch {
      throw new Error(
        `读不到 ${viewPath}（cwd=${process.cwd()}）——这条测试要扫组件源码，路径得跟着改`,
      );
    }
    expect(view).toContain('v-model:value="auditApiKeyInput"');
    expect(view).not.toContain('v-model:value="auditApiKey"');
  });
});
