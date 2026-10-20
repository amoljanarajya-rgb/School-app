import { Field } from "@/components/Field";
import { useLang } from "@/lib/i18n";

type Props = {
  label: string;
  labelKey?: string;
  localLabel: string;
  value: string;
  localValue: string;
  onChange: (v: string) => void;
  onLocalChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  localPlaceholder?: string;
};

export function BilingualInput({
  label,
  labelKey,
  localLabel,
  value,
  localValue,
  onChange,
  onLocalChange,
  required,
  placeholder,
  localPlaceholder,
}: Props) {
  const { lang } = useLang();
  const displayLabel = labelKey ? label : label;

  return (
    <div className="space-y-2">
      <Field
        label={displayLabel}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <div className="relative">
        <Field
          label={localLabel}
          value={localValue}
          onChange={(e) => onLocalChange(e.target.value)}
          placeholder={localPlaceholder ?? "देवनागरी में दर्ज करें"}
          className="font-devanagari"
        />
        {lang === "hi" && (
          <span className="absolute top-7 right-3 text-[10px] font-medium text-sky-500 bg-sky-50 px-1.5 py-0.5 rounded">
            हिं
          </span>
        )}
      </div>
    </div>
  );
}
