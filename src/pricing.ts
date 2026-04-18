type Pricing = {
  input_per_mtok: number;
  output_per_mtok: number;
  cache_read_per_mtok: number;
  cache_write_per_mtok: number;
};

const ANTHROPIC_PRICING: Record<string, Pricing> = {
  "claude-opus-4-7": {
    input_per_mtok: 15,
    output_per_mtok: 75,
    cache_read_per_mtok: 1.5,
    cache_write_per_mtok: 18.75,
  },
  "claude-sonnet-4-6": {
    input_per_mtok: 3,
    output_per_mtok: 15,
    cache_read_per_mtok: 0.3,
    cache_write_per_mtok: 3.75,
  },
  "claude-haiku-4-5-20251001": {
    input_per_mtok: 1,
    output_per_mtok: 5,
    cache_read_per_mtok: 0.1,
    cache_write_per_mtok: 1.25,
  },
};

export function costUsd(
  model: string,
  input: number,
  output: number,
  cacheRead: number,
  cacheWrite: number,
): number {
  const p = ANTHROPIC_PRICING[model] ?? ANTHROPIC_PRICING["claude-sonnet-4-6"]!;
  return (
    (input / 1_000_000) * p.input_per_mtok +
    (output / 1_000_000) * p.output_per_mtok +
    (cacheRead / 1_000_000) * p.cache_read_per_mtok +
    (cacheWrite / 1_000_000) * p.cache_write_per_mtok
  );
}
