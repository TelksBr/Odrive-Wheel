export interface SetupFormSpec {
  path: string;
  type: 'number' | 'text' | 'bool';
  defaultValue: string | boolean | number;
}

interface SetupParamFormProps {
  specs: SetupFormSpec[];
  values: Record<string, string>;
  onChange: (path: string, value: string) => void;
}

export function SetupParamForm({ specs, values, onChange }: SetupParamFormProps) {
  return (
    <div className="setup-params-form">
      {specs.map((spec) => (
        <div className="row" key={spec.path}>
          <code>{spec.path}</code>
          {spec.type === 'bool' ? (
            <input
              type="checkbox"
              checked={values[spec.path] === 'true'}
              onChange={(e) => onChange(spec.path, e.target.checked ? 'true' : 'false')}
            />
          ) : (
            <input
              type={spec.type === 'number' ? 'number' : 'text'}
              value={values[spec.path] ?? String(spec.defaultValue)}
              step="any"
              onChange={(e) => onChange(spec.path, e.target.value)}
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function initialFormValues(specs: SetupFormSpec[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const spec of specs) {
    out[spec.path] = typeof spec.defaultValue === 'boolean' ? (spec.defaultValue ? 'true' : 'false') : String(spec.defaultValue);
  }
  return out;
}

export function specsToWrites(specs: SetupFormSpec[], values: Record<string, string>) {
  return specs.map((spec) => ({
    path: spec.path,
    value: spec.type === 'bool' ? values[spec.path] === 'true' : values[spec.path],
  }));
}
