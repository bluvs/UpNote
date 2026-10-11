import { useState, useEffect, useCallback } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import DOMPurify from "dompurify";
import TurndownService from "turndown";
import { marked } from "marked";
import { Save, FolderOpen, FilePlus, Settings, Bold, Italic, Heading1, Heading2, List, ListOrdered, X } from "lucide-react";
import "./App.css";

function App() {
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [editorFont, setEditorFont] = useState<string>("font-sans");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Tiptap Editor for .md
  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    autofocus: true,
  });

  useEffect(() => {
    const savedFont = localStorage.getItem("upnote-font");
    if (savedFont) {
      setEditorFont(savedFont);
    }
  }, []);

  const changeFont = (fontClass: string) => {
    setEditorFont(fontClass);
    localStorage.setItem("upnote-font", fontClass);
  };

  const handleNewFile = () => {
    setActiveFilePath(null);
    editor?.commands.setContent("");
    editor?.commands.focus();
  };

  const handleOpenFile = async () => {
    try {
      const selectedPath = await open({
        multiple: false,
        filters: [{ name: 'Markdown', extensions: ['md', 'txt'] }]
      });

      if (selectedPath && !Array.isArray(selectedPath)) {
        let content: string | null = await readTextFile(selectedPath);
        setActiveFilePath(selectedPath);

        if (selectedPath.endsWith(".md")) {
            let parsedHtml: string | null = await marked.parse(content);
            let clean: string | null = DOMPurify.sanitize(parsedHtml as string);
            editor?.commands.setContent(clean);
            // Free memory explicitly
            parsedHtml = null;
            clean = null;
        } else {
            // For txt, we can just set it directly, Tiptap will treat it as plain text paragraphs
            editor?.commands.setContent(content);
        }
        // Free memory explicitly
        content = null;
        editor?.commands.focus();
      }
    } catch (error) {
      console.error("Failed to open file:", error);
      alert("Failed to open file.");
    }
  };

  const handleSaveFile = useCallback(async () => {
    try {
      let pathToSave = activeFilePath;

      if (!pathToSave) {
        const selectedPath = await save({
          filters: [{ name: 'Markdown', extensions: ['md', 'txt'] }]
        });
        if (!selectedPath) return; // User cancelled
        pathToSave = selectedPath;
      }

      let contentToSave: string | null = "";
      if (pathToSave.endsWith(".md")) {
        const turndownService = new TurndownService();
        let editorHtml: string | null = editor?.getHTML() || "";
        contentToSave = turndownService.turndown(editorHtml);
        editorHtml = null; // free html memory
      } else {
        contentToSave = editor?.getText() || "";
      }

      await writeTextFile(pathToSave, contentToSave);
      setActiveFilePath(pathToSave);

      // Free string memory explicitly
      contentToSave = null;

    } catch (error) {
      console.error("Failed to save file:", error);
      alert("Failed to save file.");
    }
  }, [activeFilePath, editor]);

  // Global Keyboard Shortcut for Save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveFile();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveFile]);

  const getFileName = (path: string | null) => {
      if (!path) return "Untitled";
      const sep = path.includes('\\') ? '\\' : '/';
      return path.split(sep).pop() || "Untitled";
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-50 text-black font-sans font-semibold overflow-hidden">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between p-2 border-b-2 border-black bg-white z-10 shrink-0 shadow-neo">
        <div className="flex items-center gap-4">
            <h1 className="text-xl uppercase tracking-widest font-bold border-r-2 border-black pr-4">UpNote</h1>
            <button className="neo-btn flex items-center gap-2 text-sm" onClick={handleNewFile}>
                <FilePlus size={16} /> New
            </button>
            <button className="neo-btn flex items-center gap-2 text-sm" onClick={handleOpenFile}>
                <FolderOpen size={16} /> Open
            </button>
            <button className="neo-btn flex items-center gap-2 text-sm" onClick={handleSaveFile}>
                <Save size={16} /> Save
            </button>
        </div>
        <div className="flex items-center gap-4">
             <span className="text-sm font-bold bg-zinc-100 px-3 py-1 border-2 border-black">{getFileName(activeFilePath)}</span>
             <button className="neo-btn flex items-center gap-2 text-sm" onClick={() => setIsSettingsOpen(true)}>
                <Settings size={16} /> Settings
             </button>
        </div>
      </div>

      {/* Editor Formatting Toolbar (Markdown) */}
      <div className="flex items-center justify-center p-2 border-b-2 border-black bg-zinc-100 shrink-0">
           <div className="flex items-center gap-2 bg-white border-2 border-black p-1 shadow-neo">
               <button className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={16}/></button>
               <button className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16}/></button>
               <span className="w-px h-4 bg-black mx-1"></span>
               <button className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={16}/></button>
               <button className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16}/></button>
               <span className="w-px h-4 bg-black mx-1"></span>
               <button className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={16}/></button>
               <button className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors" onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={16}/></button>
           </div>
      </div>

      {/* Main Content (Editor) */}
      <div className="flex-1 overflow-auto p-4 md:p-8 bg-zinc-50 flex justify-center">
          <div className="neo-panel w-full max-w-4xl h-full flex flex-col p-6 bg-white relative">
             <div className="prose max-w-none flex-1 overflow-auto focus:outline-none tiptap-editor h-full">
                 <EditorContent editor={editor} className={`h-full outline-none ${editorFont}`} />
             </div>
          </div>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="neo-panel bg-white max-w-md w-full p-6 relative">
                  <button
                      className="absolute top-2 right-2 p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors"
                      onClick={() => setIsSettingsOpen(false)}
                  >
                      <X size={20} />
                  </button>
                  <h2 className="text-2xl font-bold border-b-2 border-black pb-2 mb-4">Settings</h2>

                  <div className="mb-6">
                      <h3 className="text-lg font-bold mb-2">Editor Font</h3>
                      <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-zinc-100 border-2 border-transparent hover:border-black transition-colors">
                              <input
                                  type="radio"
                                  name="font"
                                  checked={editorFont === 'font-sans'}
                                  onChange={() => changeFont('font-sans')}
                                  className="accent-black w-4 h-4"
                              />
                              <span className="font-sans">Sans-serif (Inter)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-zinc-100 border-2 border-transparent hover:border-black transition-colors">
                              <input
                                  type="radio"
                                  name="font"
                                  checked={editorFont === 'font-serif'}
                                  onChange={() => changeFont('font-serif')}
                                  className="accent-black w-4 h-4"
                              />
                              <span className="font-serif">Serif</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer p-2 hover:bg-zinc-100 border-2 border-transparent hover:border-black transition-colors">
                              <input
                                  type="radio"
                                  name="font"
                                  checked={editorFont === 'font-mono'}
                                  onChange={() => changeFont('font-mono')}
                                  className="accent-black w-4 h-4"
                              />
                              <span className="font-mono">Monospace (Cascadia)</span>
                          </label>
                      </div>
                  </div>

                  <div className="flex justify-end">
                      <button className="neo-btn" onClick={() => setIsSettingsOpen(false)}>Done</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}

export default App;