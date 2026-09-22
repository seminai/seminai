import { jobFieldLabelIt } from './job-detail-italian-labels';
import { KeyRowAlways, KeyRowNode } from './job-detail-key-row';
import { asObject, isEmpty, readScalar, type AlertNotes } from './alert-notes-helpers';

export function StringListRow({ label, items }: { readonly label: string; readonly items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <KeyRowNode label={label}>
      <ul className="list-disc space-y-1 pl-4">
        {items.map((s, i) => (
          <li key={`${i}-${s.slice(0, 24)}`} className="leading-relaxed">
            {s}
          </li>
        ))}
      </ul>
    </KeyRowNode>
  );
}

export function ObjectListRow({
  label,
  items,
}: {
  readonly label: string;
  readonly items: readonly Record<string, unknown>[];
}) {
  if (items.length === 0) return null;
  return (
    <KeyRowNode label={label}>
      <div className="space-y-2">
        {items.map((obj, i) => (
          <div key={i} className="rounded-md border border-border/60 bg-background/70 p-2">
            {Object.entries(obj).map(([k, v]) => {
              const val = readScalar({ [k]: v }, k);
              if (val == null) return null;
              return (
                <div key={k} className="mb-1 last:mb-0">
                  <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                    {jobFieldLabelIt(k)}
                  </span>
                  <p className="mt-0.5 leading-relaxed">{val}</p>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </KeyRowNode>
  );
}

export function AlertField({
  notes,
  fieldKey,
  label,
}: {
  readonly notes: AlertNotes;
  readonly fieldKey: string;
  readonly label?: string;
}) {
  const v = notes[fieldKey];
  if (isEmpty(v)) return null;
  const lbl = label ?? jobFieldLabelIt(fieldKey);

  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string')) {
      return <StringListRow label={lbl} items={v as readonly string[]} />;
    }
    if (v.every((x) => x && typeof x === 'object' && !Array.isArray(x))) {
      return <ObjectListRow label={lbl} items={v as readonly Record<string, unknown>[]} />;
    }
    return null;
  }

  const obj = asObject(v);
  if (obj) {
    return (
      <KeyRowNode label={lbl}>
        <div className="space-y-1 rounded-md border border-border/60 bg-background/70 p-2">
          {Object.entries(obj).map(([k, val]) => {
            const text = readScalar({ [k]: val }, k);
            if (text == null) return null;
            return (
              <div key={k}>
                <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  {jobFieldLabelIt(k)}
                </span>
                <p className="mt-0.5 leading-relaxed">{text}</p>
              </div>
            );
          })}
        </div>
      </KeyRowNode>
    );
  }

  const scalar = readScalar(notes, fieldKey);
  if (scalar == null) return null;
  return <KeyRowAlways label={lbl} value={scalar} />;
}
