/**
 * 「只写不读」的密钥字段——后端永不回显明文，读接口给一个**字面量占位符**。
 *
 * 占位符是个**状态标记**（「库里有一把，但不给你看」），不是值。照原样填进密码框
 * 会同时坏两头：遮罩显示成「•••」，点眼睛「显示」出来的就是 `***` 本身——两个都
 * 看不出它不是一个真密钥（用户报的就是这个：看着很短、眼睛按钮也没用）。
 *
 * 所以这一层要把**显示**和**值**分开：
 *
 * * ``secretFieldDisplay`` —— 已配置时输入框留空（另给一句提示），别把标记当内容；
 * * ``secretFieldConfigured`` —— 面板据此说「已配置」。后端的约定是「有值才给
 *   占位符」（见 ``backend/api/routes/system_settings.py`` 的 ``_read_value``），
 *   所以这个等式成立；没配过的部署读到的是空串。
 *
 * **值本身一个字都不要改**：保存逻辑靠它判断「改没改」——原样回传占位符时，后端认
 * 它是「保持库里那把不变」。
 */

export const REDACTED_SECRET = '***';

/** 输入框里显示什么。占位符不显示，其余原样。 */
export function secretFieldDisplay(value: string): string {
  return value === REDACTED_SECRET ? '' : value;
}

/** 库里是不是已经有一把了（面板看不到它的内容）。 */
export function secretFieldConfigured(value: string): boolean {
  return value === REDACTED_SECRET;
}

/**
 * 保存成功之后这个字段该停在什么状态。
 *
 * 填过新值时收回占位符状态——面板不该继续留着明文，而且刷新页面看到的也正是这个
 * （后端不回显），两条路保持一致。清空过就保持空：那表示库里现在没有密钥。
 */
export function secretFieldAfterSave(value: string): string {
  return value ? REDACTED_SECRET : '';
}
