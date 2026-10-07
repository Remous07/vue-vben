import type { VisitorTranslation } from './visitor-translation';

import { describe, expect, it } from 'vitest';

import {
  directionTag,
  isTranslating,
  translationRows,
} from './visitor-translation';

/** 没设置过的访客拿到的那一份（后端给的默认态）。 */
const OFF: VisitorTranslation = {
  read_enabled: false,
  read_lang: '🇨🇳 简体中文',
  read_provider: '谷歌翻译',
  write_enabled: false,
  write_lang: '🇺🇸 英语',
  write_provider: '谷歌翻译',
  last_used_at: null,
};

function with_(fields: Partial<VisitorTranslation>): VisitorTranslation {
  return { ...OFF, ...fields };
}

const asIs = (iso: string) => `格式化(${iso})`;

describe('directionTag', () => {
  it('哪个方向开着就写哪个', () => {
    expect(directionTag(with_({ read_enabled: true }))).toBe('读');
    expect(directionTag(with_({ write_enabled: true }))).toBe('发');
    expect(
      directionTag(with_({ read_enabled: true, write_enabled: true })),
    ).toBe('读+发');
  });

  it('两个方向都关、或压根没有这一份时是空串', () => {
    // 空串而不是「—」：要写什么占位符是**表格**的事（这一页别处都写 '-'），
    // 这个函数只回答「有没有在翻」。
    expect(directionTag(OFF)).toBe('');
    expect(directionTag(null)).toBe('');
    expect(directionTag(undefined)).toBe('');
  });

  it('顺序恒为「读+发」，不跟着开启顺序变', () => {
    // 方向是固定两个，不该因为先开哪个就显示成「发+读」——同一份设置在同一张表里
    // 显示成两种样子，看着像两个人。
    expect(
      directionTag(with_({ write_enabled: true, read_enabled: true })),
    ).toBe('读+发');
  });
});

describe('isTranslating', () => {
  it('任一方向开着就算在翻', () => {
    expect(isTranslating(with_({ read_enabled: true }))).toBe(true);
    expect(isTranslating(with_({ write_enabled: true }))).toBe(true);
  });

  it('都关着、或没有这一份时不算', () => {
    expect(isTranslating(OFF)).toBe(false);
    expect(isTranslating(null)).toBe(false);
    expect(isTranslating(undefined)).toBe(false);
  });
});

describe('translationRows', () => {
  it('开着的方向给出语言与服务商', () => {
    const rows = translationRows(
      with_({
        read_enabled: true,
        read_lang: '🇯🇵 日语',
        read_provider: '微软翻译',
      }),
      asIs,
    );

    expect(rows[0]).toEqual({
      label: '读（访客发来的）',
      muted: false,
      value: '开着 · 🇯🇵 日语 · 微软翻译',
    });
  });

  it('关着的方向只显示「关」，不摊开留着的语言与服务商', () => {
    // 关掉不删行，语言和服务商还留着——但抽屉回答的是「他现在在翻什么」。把不生效的
    // 配置摆出来只是让人多看两行（机器人侧那张卡上「关着就不画那一行」是同一取舍）。
    const rows = translationRows(
      with_({
        read_enabled: false,
        read_lang: '🇯🇵 日语',
        read_provider: '微软翻译',
      }),
      asIs,
    );

    expect(rows[0]?.value).toBe('关');
    expect(rows[0]?.muted).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('日语');
  });

  it('两个方向都给，顺序恒为读在前', () => {
    const rows = translationRows(with_({ write_enabled: true }), asIs);

    expect(rows.map((r) => r.label)).toEqual([
      '读（访客发来的）',
      '发（你发出去的）',
    ]);
  });

  it('「上次翻译」有值才占一行', () => {
    const without = translationRows(OFF, asIs);
    expect(without).toHaveLength(2);

    const withIt = translationRows(
      with_({ last_used_at: '2026-08-01T12:00:00+08:00' }),
      asIs,
    );
    expect(withIt).toHaveLength(3);
    expect(withIt[2]).toEqual({
      label: '上次翻译',
      muted: true,
      value: '格式化(2026-08-01T12:00:00+08:00)',
    });
  });

  it('「设置过、后来关了」和「从没设置过」不是同一行', () => {
    // 这是这张卡存在的理由之一：没有任何东西会自动关掉一位访客的翻译，得让人有材料
    // 自己判断。两者都显示「关」，区别只在「上次翻译」那一行有没有。
    const never = translationRows(OFF, asIs);
    const usedThenOff = translationRows(
      with_({ last_used_at: '2026-08-01T12:00:00+08:00' }),
      asIs,
    );

    expect(never).toHaveLength(2);
    expect(usedThenOff).toHaveLength(3);
  });
});
