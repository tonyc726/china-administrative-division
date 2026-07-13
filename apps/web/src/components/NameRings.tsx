/**
 * 村名的年轮 —— 这个站最强的传播点，且完全由数据自证：
 * 中国最常见的村名不是「张家村」，是「和平」（778 个）。
 * 最常见的 20 个村名里 13 个是集体化年代的政治词汇。
 *
 * 「时代词」是本站的归类而非官方定义，页面必须如实声明（见 eraDisclaimer）。
 */
import type { Names } from '../types';
import { COPY, type Lang } from '../i18n';

interface Props {
  data: Names;
  lang: Lang;
}

export function NameRings({ data, lang }: Props): JSX.Element {
  const t = COPY[lang];
  const top = data.topNames.slice(0, 20);
  const max = top[0]?.[1] ?? 1;
  const eraInTop = top.filter(([, , isEra]) => isEra === 1).length;
  const first = top[0];

  const surMax = data.surnames.rank[0]?.[1] ?? 1;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
        {t.namesTitle}
      </h2>
      <p className="mt-2 text-sm text-ink-3">{t.namesSub(data.era.total)}</p>

      <p className="mt-8 max-w-3xl font-display text-lg leading-loose text-ink-2">
        {first ? t.namesLead(first[0], first[1], eraInTop) : ''}
      </p>

      {/* TOP20 榜：时代词用赤陶橙，其余用墨色——一眼看出比例 */}
      <ol className="mt-10 grid gap-2 sm:grid-cols-2 sm:gap-x-10">
        {top.map(([name, count, isEra], i) => (
          <li key={name} className="flex items-center gap-3">
            <span className="w-6 shrink-0 text-right font-mono text-xs text-ink-3">
              {i + 1}
            </span>
            <span
              className={`w-16 shrink-0 font-display text-base ${
                isEra ? 'text-clay' : 'text-ink'
              }`}
            >
              {name}
            </span>
            <span className="relative h-4 flex-1 overflow-hidden rounded-sm bg-paper-3/50">
              <span
                className={`absolute inset-y-0 left-0 rounded-sm ${
                  isEra ? 'bg-clay/75' : 'bg-ink-3/40'
                }`}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </span>
            <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-ink-2">
              {count}
            </span>
          </li>
        ))}
      </ol>

      <p className="mt-6 flex flex-wrap items-center gap-2 text-xs text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-clay/75" />
          {t.eraBadge}
        </span>
        <span className="text-line-2">·</span>
        <span className="max-w-2xl leading-relaxed">{t.eraDisclaimer}</span>
      </p>

      {/* 姓氏村 */}
      <div className="mt-16 border-t border-line pt-10">
        <h3 className="font-display text-xl font-semibold text-ink">
          {t.surnameTitle}
        </h3>
        <p className="mt-2 text-sm text-ink-3">
          {t.surnameSub(data.surnames.total.toLocaleString())}
        </p>
        <ol className="mt-6 flex flex-wrap gap-x-6 gap-y-3">
          {data.surnames.rank.slice(0, 12).map(([sur, count]) => (
            <li key={sur} className="flex items-baseline gap-2">
              <span className="font-display text-lg text-ink">{sur}</span>
              <span className="text-xs text-ink-3">{lang === 'zh' ? '家' : ''}</span>
              <span
                className="inline-block h-1.5 rounded-sm bg-clay/60"
                style={{ width: `${Math.max(8, (count / surMax) * 64)}px` }}
              />
              <span className="font-mono text-xs tabular-nums text-ink-2">
                {count}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
