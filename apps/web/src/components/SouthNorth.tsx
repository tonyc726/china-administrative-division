/**
 * 南塘北屯 —— 地名通名的语言地理。
 *
 * 不画地图（规避地图审核/审图号），用「通名 × 最集中的省份」表达分界，
 * 数据自证：庄/屯/营/堡 → 河北山东辽宁；塘/圩/畈/冲 → 湖南湖北安徽江西。
 */
import type { Names } from '../types';
import { COPY, type Lang } from '../i18n';

interface Props {
  data: Names;
  lang: Lang;
}

function MarkRow({
  mark,
  total,
  provs,
  max,
  tone,
}: {
  mark: string;
  total: number;
  provs: [string, number][];
  max: number;
  tone: 'north' | 'south';
}): JSX.Element {
  const color = tone === 'north' ? 'bg-ink/55' : 'bg-clay/70';
  const textColor = tone === 'north' ? 'text-ink' : 'text-clay';
  return (
    <li className="border-b border-line py-4 last:border-0">
      <div className="flex items-baseline gap-3">
        <span className={`font-display text-3xl ${textColor}`}>{mark}</span>
        <span className="font-mono text-xs tabular-nums text-ink-3">
          {total.toLocaleString()}
        </span>
      </div>
      <div className="mt-2.5 space-y-1.5">
        {provs.slice(0, 3).map(([prov, count]) => (
          <div key={prov} className="flex items-center gap-2 text-xs">
            <span className="w-16 shrink-0 truncate text-ink-2">{prov}</span>
            <span className="relative h-2 flex-1 overflow-hidden rounded-sm bg-paper-3/60">
              <span
                className={`absolute inset-y-0 left-0 rounded-sm ${color}`}
                style={{ width: `${(count / max) * 100}%` }}
              />
            </span>
            <span className="w-10 shrink-0 text-right font-mono tabular-nums text-ink-3">
              {count}
            </span>
          </div>
        ))}
      </div>
    </li>
  );
}

export function SouthNorth({ data, lang }: Props): JSX.Element {
  const t = COPY[lang];
  const { north, south, stats } = data.marks;

  // 两侧共用一个刻度，否则「庄 13871」与「垅 118」的条形会骗人
  const max = Math.max(
    ...[...north, ...south].flatMap((m) => (stats[m]?.provs ?? []).map(([, c]) => c))
  );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <h2 className="font-display text-2xl font-semibold text-ink sm:text-3xl">
        {t.marksTitle}
      </h2>
      <p className="mt-2 text-sm text-ink-3">{t.marksSub}</p>

      <div className="mt-10 grid gap-x-16 gap-y-10 sm:grid-cols-2">
        <section>
          <h3 className="mb-2 text-xs uppercase tracking-widest text-ink-3">
            {t.marksNorth}
          </h3>
          <ul>
            {north.map((m) => (
              <MarkRow
                key={m}
                mark={m}
                total={stats[m]?.total ?? 0}
                provs={stats[m]?.provs ?? []}
                max={max}
                tone="north"
              />
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 text-xs uppercase tracking-widest text-clay">
            {t.marksSouth}
          </h3>
          <ul>
            {south.map((m) => (
              <MarkRow
                key={m}
                mark={m}
                total={stats[m]?.total ?? 0}
                provs={stats[m]?.provs ?? []}
                max={max}
                tone="south"
              />
            ))}
          </ul>
        </section>
      </div>

      <p className="mt-10 max-w-3xl border-l-2 border-clay pl-4 font-display text-lg leading-loose text-ink-2">
        {t.marksLead}
      </p>
    </div>
  );
}
