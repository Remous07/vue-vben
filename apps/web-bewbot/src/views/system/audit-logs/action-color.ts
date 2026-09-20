/**
 * 操作记录那一列标签的颜色。
 *
 * 分类方式是 `action.includes(子串)`，所以**顺序就是这个函数的全部正确性**：成对的
 * 动作（施加/解除、成功/失败）共享同一个子串，谁先匹配谁定色。原先踩了两处：
 *
 * 1. `auth.login.failed` 命中 `includes('login')` → 和「登录成功」**同一个绿色标签**。
 *    审计页的用处就是「扫一眼发现异常」，而这里把失败画成了成功。
 * 2. `user.unban` / `admin.unban` 命中 `includes('ban')` → 「解除拉黑」和「拉黑」同色。
 *    解除是恢复性的，涂成危险色等于把一次修复读成一次破坏。
 *
 * 顺带补齐原先没有规则、落进中性灰 `default` 的两类：
 *
 * - `security.*`（密钥校验失败 / webhook 校验失败 / 重认证失败）——全是「有人被挡在
 *   门外」，却和「查看消息」一个颜色。安全类事件在列表里最不显眼，这是反的。
 * - `audit.clear_*`（清空操作记录 / 清空运行日志）与 `audit.retention`（改保留天数）
 *   ——不可逆的清空，以及缩短留痕窗口（把窗口改小是让已有痕迹更快消失的那一步），
 *   都是事后一定会被追问的动作。
 *
 * 抽成模块而不是留在 `.vue` 里，是为了能测：这几条都是「两个动作撞了子串」的配对
 * 性质，写成测试才钉得住（见 action-color.test.ts）。
 */
export function actionColor(action: string): string {
  // ① 失败 / 被拒排在最前：它比它所属的领域更该被看见，而且必须抢在 `login` 之前
  //    ——`auth.login.failed` 也含 'login'。
  if (action.includes('failed') || action.includes('reject')) return 'red';

  // ② 解除类必须先于施加类判：`user.unban` 里含 'ban'。
  if (action.includes('unban')) return 'green';
  if (
    action.includes('ban') ||
    action.includes('delete') ||
    action.includes('clear')
  ) {
    return 'red';
  }

  if (action.includes('login') || action.includes('logout')) return 'green';
  if (action.includes('role')) return 'purple';
  if (action.includes('invite') || action.includes('code')) return 'geekblue';
  if (
    action.includes('settings') ||
    action.includes('rotate') ||
    action.includes('retention')
  ) {
    return 'orange';
  }
  if (action.includes('rate_limit')) return 'volcano';
  if (
    action.includes('profile') ||
    action.includes('account') ||
    action.includes('register')
  ) {
    return 'cyan';
  }
  return 'default';
}
