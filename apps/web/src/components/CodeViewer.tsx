// ============================================
// Code Viewer - Monaco Editor integration
// ============================================
import React from 'react';
import Editor from '@monaco-editor/react';
import { useFileStore } from '../stores/fileStore';
import { useProjectStore } from '../stores/projectStore';
import { X, Save, Circle } from 'lucide-react';

export function CodeViewer() {
  const { openFiles, activeFilePath, setActiveFile, closeFile, updateFileContent, saveFile } = useFileStore();
  const { activeProject } = useProjectStore();

  const activeFile = openFiles.find(f => f.path === activeFilePath);

  if (openFiles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-ide-text-dim text-sm">
        <div className="text-center">
          <p className="text-lg mb-1">📝</p>
          <p>Click a file in the browser to open it here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex items-center bg-ide-panel border-b border-ide-border overflow-x-auto">
        {openFiles.map(f => (
          <div
            key={f.path}
            onClick={() => setActiveFile(f.path)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer border-r border-ide-border shrink-0 ${
              activeFilePath === f.path
                ? 'bg-ide-bg text-ide-text'
                : 'text-ide-text-dim hover:bg-ide-bg/50'
            }`}
          >
            {f.isDirty && <Circle className="w-2 h-2 fill-ide-accent text-ide-accent" />}
            <span className="truncate max-w-32">{f.path.split('/').pop()}</span>
            <button
              onClick={(e) => { e.stopPropagation(); closeFile(f.path); }}
              className="ml-1 p-0.5 hover:bg-ide-border rounded"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {/* Save button */}
        {activeFile?.isDirty && activeProject && (
          <button
            onClick={() => saveFile(activeProject.rootPath, activeFile.path, activeFile.content)}
            className="ml-auto px-2 py-1 mx-1 text-xs text-ide-accent hover:bg-ide-accent/10 rounded flex items-center gap-1"
          >
            <Save className="w-3 h-3" />
            Save
          </button>
        )}
      </div>

      {/* Editor */}
      {activeFile && (
        <div className="flex-1">
          <Editor
            height="100%"
            language={activeFile.language}
            value={activeFile.content}
            theme="vs-dark"
            onChange={(value) => {
              if (value !== undefined) updateFileContent(activeFile.path, value);
            }}
            options={{
              fontSize: 13,
              minimap: { enabled: false },
              wordWrap: 'on',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
            }}
          />
        </div>
      )}
    </div>
  );
}
