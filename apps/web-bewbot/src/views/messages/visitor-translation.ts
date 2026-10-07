/**
 * 「我的访客」页上那一列和那个抽屉的**全部文案与判定**。
 *
 * 抽成模块而不是留在 `.vue` 里，是为了能测：这一页是只读视图，正确性全在「什么情况下
 * 显示成什么」——而那正是最容易被一次顺手改动弄坏的东西（同目录族里的
 * `roles/permission-groups.ts`、`audit-logs/action-color.ts` 都是这个模式）。
 * 文案集中在这里还有个好处：措辞要统一时只改一处，不必在模板里翻。
 *
 * ── 它和机器人侧那张卡是**同一条记录** ────────────────
 *
 * 「访客翻译」是「管理员 × 访客」一对一份的（`docs/adr/0003`、`CONTEXT.md`）。这一页
 * 只显示**登录者自己的**，所以「这是谁的设置」在这页上没有歧义，界面上也不必标。
 */

export const TRANSLATION_PERMISSION = 'translation:use';

export interface VisitorTranslation {
  read_enabled: boolean;
  read_lang: string;
  read_provider: string;
  write_enabled: boolean;
  write_lang: string;
  write_provider: string;
  last_used_at: null | string;
}

/**
 * 两个方向。
 *
 * 「读 / 发」这一对是从机器人侧那张卡继承来的，不是这里另起的——同一样东西在两处
 * 叫不同的名字，看的人就得在两套语汇之间翻译一次。抽屉里展开成完整说法（「读取
 * 方向」），是因为那里有地方把话说全。
 */
const DIRECTIONS = [
  {
    key: 'read',
    label: '读',
    langField: 'read_lang',
    // 开着 / 关着各写一句，**不靠 replace 拼**：那种拼法在「发」方向上会拼出
    // 「你发出的消息不译，按原文显示」这种坏句子，而且只在那一侧坏。
    offText: '访客发来的消息按原文显示',
    onPrefix: '访客发来的消息会译成 ',
    onField: 'read_enabled',
    providerField: 'read_provider',
    title: '读取方向',
  },
  {
    key: 'write',
    label: '发',
    langField: 'write_lang',
    offText: '你发出的消息按原文发出',
    onPrefix: '你发出的消息会译成 ',
    onField: 'write_enabled',
    providerField: 'write_provider',
    title: '发送方向',
  },
] as const;

export type Direction = (typeof DIRECTIONS)[number];

/** 任一方向开着就算「在翻」。列表那一列据此上色。 */
export function isTranslating(
  translation: null | undefined | VisitorTranslation,
): boolean {
  if (!translation) return false;
  return DIRECTIONS.some((d) => translation[d.onField]);
}

/**
 * 列表那一列的文字：`读+发` / `读` / `发`；两个方向都关就是空串（调用方显示 `-`）。
 *
 * 带上方向而不是只写「翻译中」：两个字的信息量，扫一眼就知道往哪个方向翻——只翻
 * 「读」的人和两个方向都翻的人，看这一列时想知道的是不一样的东西。
 */
export function directionTag(
  translation: null | undefined | VisitorTranslation,
): string {
  if (!translation) return '';
  return DIRECTIONS.filter((d) => translation[d.onField])
    .map((d) => d.label)
    .join('+');
}

export interface DirectionRow {
  /** 开着时：这条路现在是怎么走的 */
  description: string;
  enabled: boolean;
  key: string;
  /** 这一行在标签列上的字（`Descriptions` 的 label） */
  label: string;
  /** 服务商那一行；关着时为空串（不展示留存的配置，见下） */
  providerLine: string;
  /** 「已启用」/「未启用」 */
  statusText: string;
}

/**
 * 抽屉里那两行（每个方向一行）。
 *
 * **关着的方向不展示它留着的语言与服务商**，只说「按原文显示」：抽屉回答的是「他现在
 * 在翻什么」，关着的方向不生效，把留存的配置摆出来只是让人多看两行（机器人侧那张卡上
 * 「关着就不画那一行」是同一条取舍）。
 */
export function directionRows(translation: VisitorTranslation): DirectionRow[] {
  return DIRECTIONS.map((d) => {
    const enabled = translation[d.onField];
    return {
      key: d.key,
      label: d.title,
      enabled,
      statusText: enabled ? '已启用' : '未启用',
      description: enabled
        ? `${d.onPrefix}${translation[d.langField]}`
        : d.offText,
      providerLine: enabled
        ? `翻译服务商：${translation[d.providerField]}`
        : '',
    };
  });
}

/**
 * 「上次翻译」那一行的值；从没译过时返回 ``null``（那一行整个不显示）。
 *
 * 它同时把「从没设置过」和「设置过、后来关了」分开——而那是这张卡存在的理由之一：
 * 没有任何东西会自动关掉一位访客的翻译，得让人有材料自己判断。
 *
 * *formatTime* 由调用方给（面板用 `#/utils/datetime` 的北京时间格式化）：这个模块
 * 只管形状，不碰时区。
 */
export function lastUsedText(
  translation: VisitorTranslation,
  formatTime: (iso: string) => string,
): null | string {
  return translation.last_used_at ? formatTime(translation.last_used_at) : null;
}
