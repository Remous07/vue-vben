import { describe, expect, it } from 'vitest';

import { actionColor } from './action-color';

// 前两条测的是**配对性质**，不是具体颜色：它们是原先真实踩掉的两个 bug，而且都是
// 「两个动作撞了同一个子串」——这种错写出来看着完全正常，只有跑出来才知道。
// 断言「不同色」而不是「必须是某个色」，是为了让这条测试盯住那个性质本身，
// 以后换配色也不会把它变成一条需要跟着改的橡皮图章。

describe('actionColor', () => {
  it('失败不能和成功同色', () => {
    // 原先两条都命中 includes('login') → 和「登录成功」同一个绿色标签。
    expect(actionColor('auth.login.failed')).not.toBe(
      actionColor('auth.login'),
    );
    expect(actionColor('auth.login_totp.failed')).not.toBe(
      actionColor('auth.login_totp'),
    );
  });

  it('解除不能和施加同色', () => {
    // 原先两条都命中 includes('ban') → 「解除拉黑」和「拉黑」同色。
    expect(actionColor('user.unban')).not.toBe(actionColor('user.ban'));
    expect(actionColor('admin.unban')).not.toBe(actionColor('admin.ban'));
    expect(actionColor('visitor.unblock')).not.toBe(
      actionColor('visitor.block'),
    );
  });

  it('「有人被挡在门外」这类事件不用中性色', () => {
    // 这三个在 ACTION_LABELS 里是一组（后端 backend/audit.py），原先全落 default 灰
    // ——和「查看消息」一个颜色，在列表里最不显眼，正好是反的。
    for (const action of [
      'security.api_key_reject',
      'security.webhook_reject',
      'security.reauth_failed',
    ]) {
      expect(actionColor(action)).not.toBe('default');
    }
  });

  it('清空和缩短留痕窗口不是中性色', () => {
    // 清空不可逆；retention 是「把留痕窗口改小」，也就是让已有痕迹更快消失的那一步。
    expect(actionColor('audit.clear_operations')).not.toBe('default');
    expect(actionColor('audit.clear_runtime_logs')).not.toBe('default');
    expect(actionColor('audit.retention')).not.toBe('default');
  });

  it('已知动作的取色', () => {
    const expected: [string, string][] = [
      ['auth.login', 'green'],
      ['auth.login.failed', 'red'],
      ['auth.login_totp', 'green'],
      ['auth.login_totp.failed', 'red'],
      ['auth.logout', 'green'],
      ['auth.register', 'cyan'],
      ['user.ban', 'red'],
      ['user.unban', 'green'],
      ['admin.ban', 'red'],
      ['admin.unban', 'green'],
      ['user.delete', 'red'],
      ['visitor.block', 'red'],
      ['visitor.unblock', 'green'],
      ['account.delete', 'red'],
      ['code.delete', 'red'],
      ['audit.clear_operations', 'red'],
      ['audit.clear_runtime_logs', 'red'],
      ['audit.retention', 'orange'],
      ['settings.update', 'orange'],
      ['security.api_key_reject', 'red'],
      ['security.webhook_reject', 'red'],
      ['security.reauth_failed', 'red'],
      ['role.delete', 'red'],
      ['invite.create', 'geekblue'],
      ['profile.password', 'cyan'],
      ['rate_limit.silenced', 'volcano'],
    ];
    for (const [action, color] of expected) {
      expect([action, actionColor(action)]).toEqual([action, color]);
    }
  });

  it('认不出来的动作退回中性色，而不是报错', () => {
    // 后端新加了 action、前端还没跟上时，标签得照常渲染（文案由后端给的中文标签，
    // 颜色只是辅助）。这条钉住「别让未知动作把页面搞崩」。
    expect(actionColor('some.future_action')).toBe('default');
    expect(actionColor('')).toBe('default');
  });
});
