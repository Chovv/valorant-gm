// src/utils/devToolsIO.ts
// tiny helpers for import/export on dev tools pages

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function uploadJson(accept: string = '.json'): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { reject(new Error('no file')); return; }
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(JSON.parse(reader.result as string)); }
        catch { reject(new Error('invalid json')); }
      };
      reader.onerror = () => reject(new Error('read error'));
      reader.readAsText(file);
    };
    input.click();
  });
}
