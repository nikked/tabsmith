type Option<T extends string> = {
  readonly value: T
  readonly label: string
  readonly title?: string
}

type Props<T extends string> = {
  readonly label: string
  readonly options: readonly Option<T>[]
  readonly value: T
  readonly onChange: (value: T) => void
  readonly small?: boolean
}

/**
 * One control with an end per choice rather than separate buttons: a thumb
 * slides to the one in force, so what is set reads at a glance. Every choice
 * stays on screen, so it never has to be read as what clicking would do.
 */
export function Toggle<T extends string>({
  label,
  options,
  value,
  onChange,
  small = false,
}: Props<T>) {
  return (
    <div
      className={small ? 'toggle small' : 'toggle'}
      data-count={options.length}
      data-index={options.findIndex((option) => option.value === value)}
      role="group"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
