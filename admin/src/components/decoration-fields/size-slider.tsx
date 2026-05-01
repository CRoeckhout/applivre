type Props = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
};

// Slider + numeric input couplés pour resize la preview admin. State piloté
// par le parent ; min/max bornent les deux contrôles.
export function SizeSlider({ label, value, min, max, onChange }: Props) {
  function clamp(n: number) {
    if (!Number.isFinite(n)) return value;
    return Math.max(min, Math.min(max, Math.round(n)));
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ width: 14, color: 'var(--ink-muted)' }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number.parseInt(e.target.value, 10)))}
        style={{ flex: 1 }}
      />
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number.parseInt(e.target.value, 10)))}
        style={{ width: 56 }}
      />
    </div>
  );
}
