/**
 * 「我的访客」页上那一列和那个抽屉的**全部文案与判定**。
 *
 * 抽成模块而不是留在 `.vue` 里，是为了能测：这一页是只读视图，正确性全在「什么情况下
 * 显示成什么」——而那正是最容易被一次顺手改动弄坏的东西（同目录族里的
 * `roles/permission-groups.ts`、`audit-logs/action-color.ts` 都是这个模式）。
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
 * 两个方向的名字与含义。
 *
 * 「读 / 发」这一对是从机器人侧那张卡继承来的，不是这里另起的——同一样东西在两处
 * 叫不同的名字，看的人就得在两套语汇之间翻译一次。
 */
const DIRECTIONS = [
  {
    lang: 'read_lang',
    label: '读',
    on: 'read_enabled',
    provider: 'read_provider',
    who: '访客发来的',
  },
  {
    lang: 'write_lang',
    label: '发',
    on: 'write_enabled',
    provider: 'write_provider',
    who: '你发出去的',
  },
] as const;

export type Direction = (typeof DIRECTIONS)[number];

export function directions(): readonly Direction[] {
  return DIRECTIONS;
}

/** 任一方向开着就算「在翻」。列表那一列据此上色。 */
export function isTranslating(
  translation: null | undefined | VisitorTranslation,
): boolean {
  if (!translation) return false;
  return DIRECTIONS.some((d) => translation[d.on]);
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
  return DIRECTIONS.filter((d) => translation[d.on])
    .map((d) => d.label)
    .join('+');
}

export interface DetailRow {
  label: string;
  /** 值本身是「关」这类**状态**而不是配置时，界面上把它压暗 */
  muted: boolean;
  value: string;
}

/**
 * 抽屉里的行。
 *
 * **关着的方向只显示「关」**，不摊开它留着的语言与服务商：抽屉回答的是「他现在在翻
 * 什么」，关着的方向不生效，把留存的配置摆出来只是让人多看两行（机器人侧那张卡上
 * 「关着就不画那一行」是同一条取舍）。
 *
 * 「上次翻译」**有值才占一行**——它同时把「从没设置过」和「设置过、后来关了」分开，
 * 而那是这张卡存在的理由之一：没有任何东西会自动关掉一位访客的翻译，得让人有材料
 * 自己判断。
 *
 * *formatTime* 由调用方给（面板用 `#/utils/datetime` 的北京时间格式化）：这个模块
 * 只管形状，不碰时区。
 */
export function translationRows(
  translation: VisitorTranslation,
  formatTime: (iso: string) => string,
): DetailRow[] {
  const rows: DetailRow[] = DIRECTIONS.map((d) => {
    const enabled = translation[d.on];
    return {
      label: `${d.label}（${d.who}）`,
      muted: !enabled,
      value: enabled
        ? `开着 · ${translation[d.lang]} · ${translation[d.provider]}`
        : '关',
    };
  });
  if (translation.last_used_at) {
    rows.push({
      label: '上次翻译',
      muted: true,
      value: formatTime(translation.last_used_at),
    });
  }
  return rows;
}
