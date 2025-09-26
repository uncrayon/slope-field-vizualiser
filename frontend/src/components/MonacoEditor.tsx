import React, { useEffect, useRef } from "react";

/**
 * Setup MonacoEnvironment BEFORE loading Monaco to ensure the editor will create workers.
 * We use module workers so Vite can bundle them correctly via import.meta.url.
 *
 * Note: avoid importing monaco at module top-level to prevent the library from doing worker checks
 * before MonacoEnvironment is defined. We'll import the ESM entry dynamically inside the effect.
 */
;(self as any).MonacoEnvironment = (self as any).MonacoEnvironment || {};
(self as any).MonacoEnvironment.getWorker = (moduleId: string, label: string) => {
  // runtime log to validate worker creation (should appear in browser console)
  console.log("MonacoEnvironment.getWorker called", { moduleId, label });
  if (label === "typescript" || label === "javascript") {
    return new Worker(
      new URL("monaco-editor/esm/vs/language/typescript/ts.worker.js?worker", import.meta.url),
      { type: "module" }
    );
  }
  if (label === "json") {
    return new Worker(
      new URL("monaco-editor/esm/vs/language/json/json.worker.js?worker", import.meta.url),
      { type: "module" }
    );
  }
  if (label === "css" || label === "scss" || label === "less") {
    return new Worker(
      new URL("monaco-editor/esm/vs/language/css/css.worker.js?worker", import.meta.url),
      { type: "module" }
    );
  }
  // fallback to the generic editor worker
  return new Worker(new URL("monaco-editor/esm/vs/editor/editor.worker.js?worker", import.meta.url), {
    type: "module",
  });
};

type MonacoEditorProps = {
  value: string;
  language?: string;
  onChange?: (v: string) => void;
  height?: string;
};

const MonacoEditor: React.FC<MonacoEditorProps> = ({
  value,
  language = "javascript",
  onChange,
  height = "220px",
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // editorRef typed as any because we import monaco dynamically
  const editorRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        // Dynamically import the ESM monaco entry AFTER MonacoEnvironment is defined
        const monaco = await import("monaco-editor/esm/vs/editor/editor.api");
        if (cancelled) return;

        editorRef.current = monaco.editor.create(containerRef.current!, {
          value,
          language,
          automaticLayout: true,
          minimap: { enabled: false },
          theme: "vs-light",
        });

        const ed = editorRef.current!;
        const disposable = ed.onDidChangeModelContent(() => {
          onChange && onChange(ed.getValue());
        });

        // store disposable so cleanup below can access it via closure
        (editorRef.current as any).__disposable = disposable;
      } catch (err) {
        // log any errors to help debugging worker / editor creation issues
        console.error("Failed to load/create Monaco editor:", err);
        // rethrow so the error surfaces in dev if desired
        throw err;
      }
    })();

    return () => {
      cancelled = true;
      const ed = editorRef.current;
      if (ed) {
        const disposable = (ed as any).__disposable;
        if (disposable) disposable.dispose();
        try {
          ed.dispose();
        } catch (e) {
          // ignore
        }
        const model = ed.getModel?.();
        if (model) model.dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (ed.getValue() !== value) ed.setValue(value);
  }, [value]);

  return <div ref={containerRef} className="monaco-container" style={{ height }} />;
};

export default MonacoEditor;