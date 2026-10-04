/**
 * 角色编辑器里那张权限树的**分组规则**。
 *
 * 权限码是**后端**的（`backend/seed.py` 的 `DEFAULT_PERMISSIONS`），而「哪个码归哪个
 * 分组、中文名叫什么」是**前端**的展示决定——两者之间没有任何自动对应，所以每加一个
 * 权限码，这里就得登记一次。
 *
 * 没登记会发生什么：`groupOf` 退化成拿前缀当分组名，于是面板上冒出一个分组叫
 * `translation`（英文原样）、图标是个通用文件夹，而且因为排名的 `indexOf` 是 -1，
 * 它会**排到所有正常分组前面**。功能没坏（勾还是勾得上），但一眼就看得出是漏登记。
 * 2026-10-04 的 `translation:use` 就是这么冒出来的。
 *
 * 抽成模块而不是留在 `.vue` 里，是为了能测——见 permission-groups.test.ts。
 *
 * 这里对权限项只要求有 ``code``（泛型），不 import `PermissionItem`：分组是纯粹的
 * 字符串处理，不该把 API 类型拖进来，测试也就不用造一整套假数据。
 */

/** 顶层分组 → 它包含哪些权限码前缀。顺序即渲染顺序。 */
export const GROUP_SUB_PREFIXES: Record<string, string[]> = {
  system: [
    'dashboard',
    'admin',
    'users',
    'registration',
    'invite',
    'audit',
    'bot',
  ],
  // 机器人侧的能力。`translation` 也在这里：它管的是「这个人能不能让 bot 替他翻译」，
  // 和 messages / conversation / visitors 是同一类东西（都不对应面板上的某个页面）。
  bot_features: ['messages', 'conversation', 'visitors', 'translation'],
};

const PREFIX_TO_GROUP: Record<string, string> = {};
for (const [group, prefixes] of Object.entries(GROUP_SUB_PREFIXES)) {
  for (const prefix of prefixes) {
    PREFIX_TO_GROUP[prefix] = group;
  }
}

/** 顶层分组的名字与图标。导出是为了让测试能枚举它们——见下面 SUB_LABELS 的说明。 */
export const CATEGORY_LABELS: Record<string, string> = {
  bot_features: '机器人功能',
  system: '系统权限',
  profile: '个人设置',
};

const CATEGORY_ICONS: Record<string, string> = {
  bot_features: 'lucide:bot',
  system: 'lucide:shield',
  profile: 'lucide:settings',
};

/**
 * 子分组（= 权限码前缀）的中文名与图标。**新权限码在这里登记。**
 *
 * 两处 key 都要：`GROUP_SUB_PREFIXES` 里那些前缀，以及**单子分组分组的顶层 key**
 * （那种分组的子标题直接取顶层 key——`profile` 就是这么漏的：面板上「个人设置」组里
 * 那一行一直写着英文 `profile`，配一个通用文件夹图标）。
 */
const SUB_LABELS: Record<string, string> = {
  admin: '后台用户',
  audit: '日志审计',
  bot: '机器人设置',
  conversation: '对话',
  dashboard: '仪表盘',
  invite: '邀请码',
  messages: '消息',
  profile: '个人设置',
  registration: '注册设置',
  translation: '翻译',
  users: 'TG用户',
  visitors: '访客',
};

const SUB_ICONS: Record<string, string> = {
  admin: 'lucide:shield',
  audit: 'lucide:scroll-text',
  bot: 'lucide:bot',
  conversation: 'lucide:message-circle',
  dashboard: 'lucide:layout-dashboard',
  invite: 'lucide:gift',
  messages: 'lucide:message-square',
  profile: 'lucide:settings',
  registration: 'lucide:user-plus',
  translation: 'lucide:languages',
  users: 'lucide:users',
  visitors: 'lucide:ban',
};

export interface PermSubGroup<T> {
  icon: string;
  key: string;
  label: string;
  perms: T[];
}

export interface PermGroup<T> {
  icon: string;
  key: string;
  label: string;
  perms: T[];
  subgroups: PermSubGroup<T>[];
}

export function groupOf(code: string): string {
  const prefix = code.split(':')[0] || 'other';
  return PREFIX_TO_GROUP[prefix] || prefix;
}

function toSubGroup<T>(key: string, perms: T[]): PermSubGroup<T> {
  return {
    key,
    // 没登记时退回前缀本身：面板宁可显示一个 `translation` 也不能不显示（权限勾不上
    // 比名字难看严重得多）。测试里钉住了「已登记的都必须是中文」。
    label: SUB_LABELS[key] || key,
    icon: SUB_ICONS[key] || 'lucide:folder',
    perms,
  };
}

function subGroupsFor<T extends { code: string }>(
  perms: T[],
  groupKey: string,
): PermSubGroup<T>[] {
  const prefixes = GROUP_SUB_PREFIXES[groupKey] || [];
  const byPrefix: Record<string, T[]> = {};
  for (const perm of perms) {
    const prefix = perm.code.split(':')[0] || 'other';
    (byPrefix[prefix] ??= []).push(perm);
  }

  // 只按登记顺序取——这里**不可能**漏掉前缀，所以没有「兜底追加」那一步：
  // `groupOf` 只把权限路由进它认得的分组（`PREFIX_TO_GROUP` 就是从
  // `GROUP_SUB_PREFIXES` 生成出来的），而没登记的走到的是下面那条平铺分支。
  // 换句话说 `byPrefix` 的 key 必定都在 `prefixes` 里。
  const ordered: PermSubGroup<T>[] = [];
  for (const prefix of prefixes) {
    const subPerms = byPrefix[prefix];
    if (subPerms) ordered.push(toSubGroup(prefix, subPerms));
  }
  return ordered;
}

/**
 * 权限码 → 两层分组树。
 *
 * 顶层顺序：登记过的分组按 `CATEGORY_LABELS` 的顺序，**没登记的排最后**。原先用
 * `indexOf` 直接比大小，未登记的分组拿到 -1 就排到了最前面——一个新权限码能把整张
 * 权限树顶下来。
 */
export function groupPermissions<T extends { code: string }>(
  permissions: T[],
): PermGroup<T>[] {
  const byGroup: Record<string, T[]> = {};
  for (const perm of permissions) {
    const key = groupOf(perm.code);
    (byGroup[key] ??= []).push(perm);
  }

  const known = Object.keys(CATEGORY_LABELS);
  const rank = (key: string) => {
    const index = known.indexOf(key);
    return index === -1 ? known.length : index;
  };

  return Object.entries(byGroup)
    .toSorted(([a], [b]) => rank(a) - rank(b))
    .map(([key, perms]) => ({
      key,
      label: CATEGORY_LABELS[key] || key,
      icon: CATEGORY_ICONS[key] || 'lucide:folder',
      perms,
      subgroups: GROUP_SUB_PREFIXES[key]
        ? subGroupsFor(perms, key)
        : [toSubGroup(key, perms)],
    }));
}

/** 需要展开/折叠的子分组 key：只有渲染成嵌套折叠面板的分组（子分组多于一个）才有。 */
export function collapsibleSubKeys(groups: PermGroup<unknown>[]): string[] {
  return groups
    .filter((g) => g.subgroups.length > 1)
    .flatMap((g) => g.subgroups.map((s) => s.key));
}
