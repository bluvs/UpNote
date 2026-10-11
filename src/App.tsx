import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Virtuoso } from "react-virtuoso";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import DOMPurify from "dompurify";
import TurndownService from "turndown";
import { Folder, FileText, File as FileIcon, ChevronRight, ChevronDown, Save } from "lucide-react";
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
          // Sanitize raw text before passing to tiptap if treating as HTML,
          // though tiptap handles markdown. We'll set content and sanitize on output.
          // For simplicity, we just set it.
          const clean = DOMPurify.sanitize(content);
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
    <div className="flex h-screen bg-neo-bg text-black font-sans font-bold overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 flex flex-col border-r-4 border-black bg-white z-10">
        <div className="p-4 border-b-4 border-black bg-neo-yellow flex justify-between items-center">
          <h1 className="text-xl uppercase tracking-wider">UpNote</h1>
        </div>

        <div className="p-2 border-b-4 border-black bg-neo-pink flex flex-col gap-2">
            {!workspace ? (
              <button className="neo-btn bg-white" onClick={selectWorkspace}>
                Open Workspace
              </button>
            ) : (
                <>
                <button className="neo-btn bg-white text-xs" onClick={selectWorkspace}>
                  Change Workspace
                </button>
                <button className="neo-btn bg-neo-blue text-xs" onClick={createNewFile}>
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
                     className={`flex items-center p-1 cursor-pointer hover:bg-neo-yellow border-2 border-transparent hover:border-black hover:shadow-neo transition-all mb-1 ${activeFile?.path === entry.path ? 'bg-neo-blue border-black shadow-neo' : ''}`}
                     style={{ paddingLeft: `${depth * 1.5 + 0.25}rem` }}
                     onClick={() => entry.is_dir ? handleToggleDir(entry) : openFile(entry)}
                   >
                     {entry.is_dir ? (
                         <>
                           {entry.isOpen ? <ChevronDown size={16} className="mr-1"/> : <ChevronRight size={16} className="mr-1"/>}
                           <Folder size={16} className="mr-2 text-neo-pink" fill="currentColor"/>
                         </>
                     ) : (
                         <>
                           <span className="w-4 mr-1"></span>
                           {entry.name.endsWith('.md') ? <FileIcon size={16} className="mr-2 text-neo-green"/> : <FileText size={16} className="mr-2 text-gray-600"/>}
                         </>
                     )}
                     <span className="truncate text-sm">{entry.name}</span>
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
            <div className="p-4 border-b-4 border-black bg-neo-blue flex justify-between items-center z-10 shadow-neo">
              <h2 className="text-lg">{activeFile.name}</h2>
              <button className="neo-btn flex items-center gap-2" onClick={saveActiveFile}>
                <Save size={18} /> Save
              </button>
            </div>
            <div className="flex-1 overflow-auto p-8 bg-neo-bg">
                <div className="neo-panel max-w-4xl mx-auto h-full flex flex-col p-4 bg-white">
                    {activeFile.name.endsWith('.md') ? (
                        <div className="prose max-w-none flex-1 overflow-auto focus:outline-none tiptap-editor">
                           <EditorContent editor={editor} className="h-full outline-none" />
                        </div>
                    ) : (
                        <textarea
                            className="w-full h-full resize-none outline-none font-mono text-sm p-2"
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
            <div className="text-center neo-panel p-12 bg-white">
                <h2 className="text-3xl mb-4 bg-neo-yellow inline-block px-4 py-2 border-2 border-black shadow-neo">UpNote</h2>
                <p className="text-xl">Select a file to start editing.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;