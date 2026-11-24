export type StorageChangeHandler = () => void;

export function readBrowserJson<T>(
  key: string,
  fallback: T,
  validate?: (value: unknown) => value is T,
): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value: unknown = JSON.parse(raw);
    if (validate && !validate(value)) return fallback;
    return value as T;
  } catch {
    return fallback;
  }
}

export function writeBrowserJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function readBrowserText(key: string, fallback: string | null = null): string | null {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeBrowserText(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeBrowserValue(key: string): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function dispatchBrowserChange(eventName: string): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(eventName));
}

export function subscribeBrowserChanges(
  keys: string[],
  eventNames: string[],
  onChange: StorageChangeHandler,
): () => void {
  const keySet = new Set(keys);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || keySet.has(event.key) || keys.some((key) => event.key?.startsWith(key))) onChange();
  };
  const listeners = eventNames.map((name) => {
    window.addEventListener(name, onChange);
    return name;
  });
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener('storage', onStorage);
    listeners.forEach((name) => window.removeEventListener(name, onChange));
  };
}
