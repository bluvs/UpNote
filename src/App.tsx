import { useState, useCallback, useEffect } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import TurndownService from "turndown";
import {
    FilePlus, X, Columns, File, FolderOpen
} from "lucide-react";
import "./App.css";

import EditorTab from "./EditorTab";
import CustomTitlebar from "./CustomTitlebar";

export interface TabData {
  id: string;
  path: string | null;
  name: string;
  content: string;
  isDirty: boolean;
  words: number;
  chars: number;
}

function App() {
  const [tabs, setTabs] = useState<TabData[]>([{ id: '1', path: null, name: 'Untitled', content: '', isDirty: false, words: 0, chars: 0 }]);
  const [activeTabId, setActiveTabId] = useState<string>('1');
  const [splitView, setSplitView] = useState<boolean>(false);
  const [secondaryTabId, setSecondaryTabId] = useState<string | null>(null);

  // We handle the debounced save and state update together
  const handleTabChangeAndSave = useCallback(async (id: string, content: string, words: number, chars: number) => {
      // 1. Update global state efficiently
      setTabs(prev => {
          const newTabs = [...prev];
          const tabIndex = newTabs.findIndex(t => t.id === id);
          if (tabIndex > -1) {
              newTabs[tabIndex] = { ...newTabs[tabIndex], content, words, chars, isDirty: true };
          }
          return newTabs;
      });

      // 2. Perform the auto-save logic if the file already has a path
      const tabToSave = tabs.find(t => t.id === id);
      if (tabToSave && tabToSave.path) {
          try {
             const turndownService = new TurndownService();
             let textToSave: string | null = turndownService.turndown(content);
             await writeTextFile(tabToSave.path, textToSave);
             textToSave = null;

             // Mark as clean
             setTabs(prev => prev.map(t => t.id === id ? { ...t, isDirty: false } : t));
          } catch(e) {
             console.error("Auto-save failed", e);
          }
      }
  }, [tabs]);

  const handleNewFile = () => {
    const newId = Date.now().toString();
    setTabs(prev => [...prev, { id: newId, path: null, name: 'Untitled', content: '', isDirty: false, words: 0, chars: 0 }]);
    setActiveTabId(newId);
  };

  const handleOpenFile = async () => {
      try {
          const selectedPath = await open({
              multiple: false,
              filters: [{ name: 'Markdown', extensions: ['md', 'txt'] }]
          });

          if (selectedPath && !Array.isArray(selectedPath)) {
              let content: string | null = await readTextFile(selectedPath);
              const newId = Date.now().toString();
              const sep = selectedPath.includes('\\') ? '\\' : '/';
              const name = selectedPath.split(sep).pop() || "Untitled";

              setTabs(prev => [...prev, { id: newId, path: selectedPath, name, content: content as string, isDirty: false, words: 0, chars: 0 }]);
              setActiveTabId(newId);
              content = null; // free string memory
          }
      } catch (err) {
          console.error("Failed to open file", err);
      }
  };

  // Global Keyboard Shortcut for Save & Close
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab && activeTab.isDirty) {
             let pathToSave = activeTab.path;
             if (!pathToSave) {
                 const selectedPath = await save({
                     filters: [{ name: 'Markdown', extensions: ['md', 'txt'] }]
                 });
                 if (!selectedPath) return;
                 pathToSave = selectedPath;
             }
             const turndownService = new TurndownService();
             let textToSave: string | null = turndownService.turndown(activeTab.content);
             await writeTextFile(pathToSave, textToSave);
             textToSave = null;

             setTabs(prev => {
                const newTabs = [...prev];
                const tabIndex = newTabs.findIndex(t => t.id === activeTabId);
                if (tabIndex > -1) {
                    newTabs[tabIndex] = { ...newTabs[tabIndex], path: pathToSave, name: pathToSave.split(/[/\\]/).pop() || "Untitled", isDirty: false };
                }
                return newTabs;
            });
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        handleCloseTab(activeTabId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, tabs]);

  const handleCloseTab = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setTabs(prev => {
        const newTabs = prev.filter(t => t.id !== id);
        if (newTabs.length === 0) {
            return [{ id: Date.now().toString(), path: null, name: 'Untitled', content: '', isDirty: false, words: 0, chars: 0 }];
        }
        if (activeTabId === id) {
            setActiveTabId(newTabs[newTabs.length - 1].id);
        }
        return newTabs;
    });
    if (secondaryTabId === id) {
        setSecondaryTabId(null);
        setSplitView(false);
    }
  };

  const toggleSplitView = () => {
    if (splitView) {
        setSplitView(false);
        setSecondaryTabId(null);
    } else {
        if (tabs.length > 1) {
            const otherTab = tabs.find(t => t.id !== activeTabId);
            if (otherTab) {
                setSecondaryTabId(otherTab.id);
                setSplitView(true);
            }
        }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <CustomTitlebar />
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-accent z-10 shrink-0 h-12">
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar flex-1">
            {tabs.map(tab => (
                <div
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-t-md border-b-2 cursor-pointer max-w-[200px] group transition-colors ${activeTabId === tab.id ? 'bg-background border-foreground text-foreground' : 'bg-transparent border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}
                >
                    <File size={14} className="shrink-0" />
                    <span className="truncate text-xs font-medium">{tab.name}{tab.isDirty ? ' *' : ''}</span>
                    <button
                        onClick={(e) => handleCloseTab(tab.id, e)}
                        className={`p-0.5 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-slate-200 transition-opacity ${activeTabId === tab.id ? 'opacity-100' : ''}`}
                    >
                        <X size={12} />
                    </button>
                </div>
            ))}
        </div>
        <div className="flex items-center gap-2 pl-4 shrink-0">
             <button className="btn-ghost" onClick={handleNewFile} title="New File">
                <FilePlus size={16} />
             </button>
             <button className="btn-ghost" onClick={handleOpenFile} title="Open File">
                <FolderOpen size={16} />
             </button>
             <button className="btn-ghost" onClick={toggleSplitView} title="Split View" disabled={tabs.length < 2}>
                <Columns size={16} className={tabs.length < 2 ? 'opacity-50' : ''} />
             </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 overflow-hidden flex relative">
          <PanelGroup direction="horizontal">
            {/* Primary Editor */}
            <Panel defaultSize={splitView ? 50 : 100} minSize={30}>
                {tabs.find(t => t.id === activeTabId) && (
                    <EditorTab
                        key={activeTabId}
                        tab={tabs.find(t => t.id === activeTabId)!}
                        isActive={true}
                        onChangeAndSave={handleTabChangeAndSave}
                    />
                )}
            </Panel>

            {/* Secondary Editor (Split View) */}
            {splitView && secondaryTabId && (
                <>
                <PanelResizeHandle className="w-1 bg-border hover:bg-blue-400 transition-colors cursor-col-resize" />
                <Panel defaultSize={50} minSize={30}>
                    <div className="h-full border-l border-border bg-muted/20 relative">
                        {/* Selector for secondary pane */}
                        <div className="absolute top-0 right-0 p-2 z-10 flex gap-2">
                             <select
                                className="input-base text-xs py-1"
                                value={secondaryTabId}
                                onChange={(e) => setSecondaryTabId(e.target.value)}
                             >
                                 {tabs.filter(t => t.id !== activeTabId).map(t => (
                                     <option key={t.id} value={t.id}>{t.name}</option>
                                 ))}
                             </select>
                             <button className="btn-ghost bg-background border border-border shadow-sm" onClick={() => setSplitView(false)}>
                                 <X size={14} />
                             </button>
                        </div>
                        {tabs.find(t => t.id === secondaryTabId) && (
                            <EditorTab
                                key={secondaryTabId}
                                tab={tabs.find(t => t.id === secondaryTabId)!}
                                isActive={false}
                                onChangeAndSave={handleTabChangeAndSave}
                            />
                        )}
                    </div>
                </Panel>
                </>
            )}
          </PanelGroup>
      </div>

      {/* Status Bar Placeholder */}
      <div className="h-6 border-t border-border bg-accent flex items-center justify-between px-4 text-xs text-muted-foreground shrink-0">
          <div>Words: {tabs.find(t => t.id === activeTabId)?.words || 0} | Characters: {tabs.find(t => t.id === activeTabId)?.chars || 0}</div>
          <div>UTF-8</div>
      </div>
    </div>
  );
}

export default App;