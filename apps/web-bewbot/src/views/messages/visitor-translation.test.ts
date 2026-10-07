import type { VisitorTranslation } from './visitor-translation';

import { describe, expect, it } from 'vitest';

import {
  directionBlocks,
  directionTag,
  isTranslating,
  lastUsedText,
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

describe('directionBlocks', () => {
  it('两块，顺序恒为读在前', () => {
    const blocks = directionBlocks(with_({ write_enabled: true }));

    expect(blocks.map((b) => b.key)).toEqual(['read', 'write']);
    expect(blocks.map((b) => b.title)).toEqual(['读取方向', '发送方向']);
  });

  it('开着的方向写清楚「什么消息译成什么语言」，并给出服务商', () => {
    const [read] = directionBlocks(
      with_({
        read_enabled: true,
        read_lang: '🇯🇵 日语',
        read_provider: '微软翻译',
      }),
    );

    expect(read?.statusText).toBe('已启用');
    expect(read?.description).toBe('访客发来的消息会译成 🇯🇵 日语');
    expect(read?.providerLine).toBe('翻译服务商：微软翻译');
  });

  it('两个方向的说法各是各的，不会串味', () => {
    // 措辞曾经用一串 `.replace()` 从「读」那一侧拼出来，结果在「发」上拼成了
    // 「你发出的消息不译，按原文显示」。两边各写各的，这条钉住它们不会互相污染。
    const off = directionBlocks(OFF);
    const on = directionBlocks(
      with_({ read_enabled: true, write_enabled: true, write_lang: '🇺🇸 英语' }),
    );

    expect(off[0]?.description).toBe('访客发来的消息按原文显示');
    expect(off[1]?.description).toBe('你发出的消息按原文发出');
    expect(on[1]?.description).toBe('你发出的消息会译成 🇺🇸 英语');
  });

  it('关着的方向不摊开它留着的语言与服务商', () => {
    // 关掉不删行，语言和服务商还留着——但抽屉回答的是「他现在在翻什么」。把不生效的
    // 配置摆出来只是让人多看两行（机器人侧那张卡上「关着就不画那一行」是同一取舍）。
    const [read] = directionBlocks(
      with_({
        read_enabled: false,
        read_lang: '🇯🇵 日语',
        read_provider: '微软翻译',
      }),
    );

    expect(read?.statusText).toBe('未启用');
    expect(read?.providerLine).toBe('');
    expect(JSON.stringify(read)).not.toContain('日语');
    expect(JSON.stringify(read)).not.toContain('微软翻译');
  });

  it('每块都带自己的图标与启用态，模板不必再判一次', () => {
    const [read, write] = directionBlocks(with_({ read_enabled: true }));

    expect(read?.icon).toBe('lucide:inbox');
    expect(read?.enabled).toBe(true);
    expect(write?.icon).toBe('lucide:send');
    expect(write?.enabled).toBe(false);
  });
});

describe('lastUsedText', () => {
  it('译过才给值；没译过是 null，那一行整个不显示', () => {
    expect(lastUsedText(OFF, asIs)).toBeNull();
    expect(
      lastUsedText(with_({ last_used_at: '2026-08-01T12:00:00+08:00' }), asIs),
    ).toBe('格式化(2026-08-01T12:00:00+08:00)');
  });

  it('「设置过、后来关了」和「从没设置过」靠它分开', () => {
    // 这是这张卡存在的理由之一：没有任何东西会自动关掉一位访客的翻译，得让人有材料
    // 自己判断。两者的两块方向块完全一样，区别只在「上次翻译」那一行有没有。
    const never = lastUsedText(OFF, asIs);
    const usedThenOff = lastUsedText(
      with_({ last_used_at: '2026-08-01T12:00:00+08:00' }),
      asIs,
    );

    expect(never).toBeNull();
    expect(usedThenOff).not.toBeNull();
    expect(directionBlocks(OFF)).toEqual(
      directionBlocks(with_({ last_used_at: '2026-08-01T12:00:00+08:00' })),
    );
  });
});
