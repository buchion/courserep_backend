type Labels = Record<string, string | number>;

const counters = new Map<string, number>();
const histograms = new Map<string, number[]>();

function metricKey(name: string, labels?: Labels): string {
  if (!labels) return name;
  const suffix = Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
  return `${name}{${suffix}}`;
}

export const metrics = {
  increment(name: string, labels?: Labels, value = 1): void {
    const key = metricKey(name, labels);
    counters.set(key, (counters.get(key) ?? 0) + value);
  },

  observe(name: string, value: number, labels?: Labels): void {
    const key = metricKey(name, labels);
    const values = histograms.get(key) ?? [];
    values.push(value);
    histograms.set(key, values);
  },

  getCounters(): Record<string, number> {
    return Object.fromEntries(counters);
  },

  getHistograms(): Record<string, { count: number; avg: number }> {
    const result: Record<string, { count: number; avg: number }> = {};
    for (const [key, values] of histograms) {
      const sum = values.reduce((a, b) => a + b, 0);
      result[key] = { count: values.length, avg: values.length ? sum / values.length : 0 };
    }
    return result;
  },
};
