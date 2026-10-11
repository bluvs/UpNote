import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Virtuoso } from "react-virtuoso";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import DOMPurify from "dompurify";
import TurndownService from "turndown";
import { marked } from "marked";
import { Folder, FileText, File as FileIcon, ChevronRight, ChevronDown, Save, Bold, Italic, Heading1, Heading2, List, ListOrdered } from "lucide-react";
import "./App.css";

interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileEntry[];
  isOpen?: boolean;
}

function App() {
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFile, setActiveFile] = useState<FileEntry | null>(null);
  const [fileContent, setFileContent] = useState<string>("");

  // Tiptap Editor for .md
  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    onUpdate: ({ editor }) => {
      setFileContent(editor.getHTML());
    },
  });

  const selectWorkspace = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });
    if (selected && !Array.isArray(selected)) {
      setWorkspace(selected as string);
      loadFiles(selected as string, "");
    }
  };

  const loadFiles = async (workspacePath: string, relativePath: string = "") => {
    try {
      const entries: FileEntry[] = await invoke("list_directory", {
        workspacePath,
        relativePath,
      });
      setFiles(entries);
    } catch (error) {
      console.error("Failed to load directory:", error);
    }
  };

  const flattenFiles = (entries: FileEntry[], depth = 0): { entry: FileEntry, depth: number }[] => {
      let flat: { entry: FileEntry, depth: number }[] = [];
      for (const entry of entries) {
          flat.push({ entry, depth });
          if (entry.isOpen && entry.children) {
              flat = flat.concat(flattenFiles(entry.children, depth + 1));
          }
      }
      return flat;
  };

  const flatFileList = flattenFiles(files);

  const loadDirectoryContents = async (path: string) => {
       if (!workspace) return [];
       try {
          return await invoke<FileEntry[]>("list_directory", {
            workspacePath: workspace,
            relativePath: path,
          });
       } catch(e) {
           console.error(e);
           return [];
       }
  };

  const handleToggleDir = async (clickedEntry: FileEntry) => {
    if (!workspace) return;

    const recursivelyToggle = async (entries: FileEntry[]): Promise<FileEntry[]> => {
      let result = [];
      for(let entry of entries) {
        if(entry.path === clickedEntry.path) {
          let newChildren = entry.children;
          if(!entry.isOpen && !entry.children) {
              newChildren = await loadDirectoryContents(entry.path);
          }
          result.push({ ...entry, isOpen: !entry.isOpen, children: newChildren });
        } else if(entry.children) {
           result.push({ ...entry, children: await recursivelyToggle(entry.children) })
        } else {
           result.push(entry);
        }
      }
      return result;
    }

    setFiles(await recursivelyToggle(files));
  };

  const openFile = async (entry: FileEntry) => {
    if (!workspace) return;
    try {
      const content: string = await invoke("read_file", {
        workspacePath: workspace,
        relativePath: entry.path,
      });
      setActiveFile(entry);

      if (entry.name.endsWith(".md")) {
          // Parse markdown to HTML first
          const parsedHtml = await marked.parse(content);
          const clean = DOMPurify.sanitize(parsedHtml as string);
          setFileContent(clean);
          editor?.commands.setContent(clean);
      } else {
          setFileContent(content);
      }
    } catch (error) {
      console.error("Failed to read file:", error);
    }
  };

  const saveActiveFile = async () => {
    if (!workspace || !activeFile) return;

    try {
      let contentToSave = fileContent;
      if (activeFile.name.endsWith(".md")) {
        const turndownService = new TurndownService();
        contentToSave = turndownService.turndown(editor?.getHTML() || "");
      }

      await invoke("write_file", {
        workspacePath: workspace,
        relativePath: activeFile.path,
        content: contentToSave,
      });
      alert("Saved!");
    } catch (error) {
      console.error("Failed to save file:", error);
      alert("Failed to save file");
    }
  };

  const createNewFile = async () => {
      if(!workspace) return;
      const path = await save({
         defaultPath: workspace,
         filters: [{ name: 'Text', extensions: ['txt', 'md'] }]
      });

      if(path) {
          // Since save dialog gives absolute path, and write_file expects workspace + relative,
          // for new files created outside workspace we could either reject or change workspace.
          // The robust way is to write using an absolute write command if outside, but for simplicity
          // let's adjust the workspace to the directory of the new file.
          const lastSlashIndex = path.lastIndexOf('/');
          const backslashIndex = path.lastIndexOf('\\');
          const sepIndex = Math.max(lastSlashIndex, backslashIndex);
          const newWorkspace = path.substring(0, sepIndex);
          const newFileName = path.substring(sepIndex + 1);

           setWorkspace(newWorkspace);
           // Create the file at new location
           await invoke("write_file", {
                workspacePath: newWorkspace,
                relativePath: newFileName,
                content: "",
           });
           await loadFiles(newWorkspace, "");
           openFile({ name: newFileName, path: newFileName, is_dir: false });
      }
  };


  return (
    <div className="flex h-screen bg-zinc-50 text-black font-sans font-semibold overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 flex flex-col border-r-2 border-black bg-white z-10">
        <div className="p-4 border-b-2 border-black flex justify-between items-center">
          <h1 className="text-xl uppercase tracking-wider font-bold">UpNote</h1>
        </div>

        <div className="p-4 border-b-2 border-black flex flex-col gap-3">
            {!workspace ? (
              <button className="neo-btn" onClick={selectWorkspace}>
                Open Workspace
              </button>
            ) : (
                <>
                <button className="neo-btn text-sm" onClick={selectWorkspace}>
                  Change Workspace
                </button>
                <button className="neo-btn text-sm" onClick={createNewFile}>
                  + New File
                </button>
                </>
            )}
        </div>

        <div className="flex-1 overflow-hidden p-2">
           {workspace && (
               <Virtuoso
                 style={{ height: '100%' }}
                 data={flatFileList}
                 itemContent={(_, { entry, depth }) => (
                   <div
                     className={`neo-list-item flex items-center p-2 mb-1 cursor-pointer ${activeFile?.path === entry.path ? 'bg-black text-white border-black' : ''}`}
                     style={{ paddingLeft: `${depth * 1.5 + 0.5}rem` }}
                     onClick={() => entry.is_dir ? handleToggleDir(entry) : openFile(entry)}
                   >
                     {entry.is_dir ? (
                         <>
                           {entry.isOpen ? <ChevronDown size={16} className="mr-2"/> : <ChevronRight size={16} className="mr-2"/>}
                           <Folder size={16} className="mr-2" fill="currentColor"/>
                         </>
                     ) : (
                         <>
                           <span className="w-5 mr-1"></span>
                           {entry.name.endsWith('.md') ? <FileIcon size={16} className="mr-2"/> : <FileText size={16} className="mr-2"/>}
                         </>
                     )}
                     <span className="truncate text-sm font-semibold">{entry.name}</span>
                   </div>
                 )}
               />
           )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {activeFile ? (
          <>
            <div className="p-4 border-b-2 border-black bg-white flex justify-between items-center z-10">
              <h2 className="text-lg font-bold">{activeFile.name}</h2>
              <button className="neo-btn flex items-center gap-2" onClick={saveActiveFile}>
                <Save size={18} /> Save
              </button>
            </div>
            <div className="flex-1 overflow-auto p-8 bg-zinc-50">
                <div className="neo-panel max-w-4xl mx-auto h-full flex flex-col p-6 bg-white">
                    {activeFile.name.endsWith('.md') ? (
                        <div className="flex-1 flex flex-col h-full">
                           <div className="flex items-center gap-2 mb-4 p-2 border-b-2 border-black bg-zinc-100">
                               <button className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={16}/></button>
                               <button className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16}/></button>
                               <span className="w-px h-4 bg-black mx-1"></span>
                               <button className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={16}/></button>
                               <button className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={16}/></button>
                               <span className="w-px h-4 bg-black mx-1"></span>
                               <button className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={16}/></button>
                               <button className="p-1 hover:bg-black hover:text-white border-2 border-transparent hover:border-black transition-colors" onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={16}/></button>
                           </div>
                           <div className="prose max-w-none flex-1 overflow-auto focus:outline-none tiptap-editor">
                               <EditorContent editor={editor} className="h-full outline-none font-sans" />
                           </div>
                        </div>
                    ) : (
                        <textarea
                            className="w-full h-full resize-none outline-none font-mono text-base p-2"
                            value={fileContent}
                            onChange={(e) => setFileContent(e.target.value)}
                            placeholder="Type here..."
                        />
                    )}
                </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center flex flex-col items-center">
                <h2 className="text-4xl mb-6 font-bold uppercase tracking-widest border-2 border-black px-6 py-3 bg-white shadow-neo">UpNote</h2>
                <p className="text-lg text-zinc-600 font-semibold">Select a file to start editing.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;