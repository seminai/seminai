import { useState, useCallback, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface RuleContent {
  readonly sezioni: readonly string[];
  readonly requisiti: readonly string[];
}

interface RuleContentEditorProps {
  readonly value: string;
  readonly onChange: (json: string) => void;
}

function parseContent(raw: string): RuleContent {
  try {
    const parsed = JSON.parse(raw);
    return {
      sezioni: Array.isArray(parsed.sezioni) ? parsed.sezioni.map(String) : [],
      requisiti: Array.isArray(parsed.requisiti) ? parsed.requisiti.map(String) : [],
    };
  } catch {
    return { sezioni: [], requisiti: [] };
  }
}

function serializeContent(content: RuleContent): string {
  return JSON.stringify({ sezioni: content.sezioni, requisiti: content.requisiti });
}

export function RuleContentEditor({ value, onChange }: RuleContentEditorProps) {
  const [content, setContent] = useState<RuleContent>(() => parseContent(value));

  useEffect(() => {
    setContent(parseContent(value));
  }, [value]);

  const update = useCallback(
    (next: RuleContent) => {
      setContent(next);
      onChange(serializeContent(next));
    },
    [onChange],
  );

  const addSezione = (text: string) => {
    if (!text.trim()) return;
    update({ ...content, sezioni: [...content.sezioni, text.trim()] });
  };

  const removeSezione = (index: number) => {
    update({ ...content, sezioni: content.sezioni.filter((_, i) => i !== index) });
  };

  const addRequisito = (text: string) => {
    if (!text.trim()) return;
    update({ ...content, requisiti: [...content.requisiti, text.trim()] });
  };

  const removeRequisito = (index: number) => {
    update({ ...content, requisiti: content.requisiti.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-4">
      <ContentList
        title="Sezioni"
        description="Le sezioni che compongono la regola."
        items={content.sezioni}
        onAdd={addSezione}
        onRemove={removeSezione}
        placeholder="Aggiungi una sezione..."
      />
      <ContentList
        title="Requisiti"
        description="I requisiti necessari per rispettare la regola."
        items={content.requisiti}
        onAdd={addRequisito}
        onRemove={removeRequisito}
        placeholder="Aggiungi un requisito..."
      />
    </div>
  );
}

function ContentList({
  title,
  description,
  items,
  onAdd,
  onRemove,
  placeholder,
}: {
  readonly title: string;
  readonly description: string;
  readonly items: readonly string[];
  readonly onAdd: (text: string) => void;
  readonly onRemove: (index: number) => void;
  readonly placeholder: string;
}) {
  const [draft, setDraft] = useState('');

  const handleAdd = () => {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length > 0 && (
          <ul className="space-y-1.5">
            {items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <span className="min-w-0 flex-1 text-sm">{item}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemove(idx)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="text-sm"
          />
          <Button type="button" variant="outline" size="sm" onClick={handleAdd} disabled={!draft.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
