import { useEffect, useRef, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { debounce } from "lodash";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { TabData } from "./App";
import { Bold, Italic, Heading1, Heading2, List, ListOrdered } from "lucide-react";

interface EditorTabProps {
    tab: TabData;
    isActive: boolean;
    onChangeAndSave?: (id: string, content: string, words: number, chars: number) => void;
}

export default function EditorTab({ tab, isActive, onChangeAndSave }: EditorTabProps) {
    const editorRef = useRef<HTMLDivElement>(null);

    // We construct a debounced wrapper that only calls the upstream onChangeAndSave to prevent immediate React re-renders on every keystroke
    const debouncedUpdate = useMemo(() => debounce((id: string, content: string, words: number, chars: number) => {
        if (onChangeAndSave) {
            onChangeAndSave(id, content, words, chars);
        }
    }, 500), [onChangeAndSave]);

    const editor = useEditor({
        extensions: [
            StarterKit,
        ],
        content: tab.content,
        autofocus: isActive ? 'end' : false,
        onUpdate: ({ editor }) => {
            const rawText = editor.getText();
            // Regex to count words and chars natively
            const words = rawText.trim() === '' ? 0 : rawText.trim().split(/\s+/).length;
            const chars = rawText.length;

            debouncedUpdate(tab.id, editor.getHTML(), words, chars);
        },
    });

    useEffect(() => {
        if (isActive && editor) {
            editor.commands.focus();
        }
    }, [isActive, editor]);

    // File content parsing for initial load
    useEffect(() => {
        if (editor && tab.content && !editor.isFocused) {
            // If the content comes from a file (it might have line breaks), parse it properly if it's markdown
            // We assume if it's an opened file, we want to respect its formatting.
            // We use marked.parse regardless of whether we find a # or * to ensure standard text with \n is parsed to <p> tags correctly.
            const parseAsync = async () => {
                 let parsedHtml: string | null = await marked.parse(tab.content, { breaks: true });
                 let clean: string | null = DOMPurify.sanitize(parsedHtml as string);
                 editor.commands.setContent(clean);
                 parsedHtml = null;
                 clean = null;
            };
            parseAsync();
        }
    }, []);

    // Strict Memory cleanup on unmount - CRITICAL for preventing leaks in multi-tab view
    useEffect(() => {
        return () => {
            debouncedUpdate.cancel();
            if (editor) {
                // Ensure all event listeners and DOM elements are cleanly destroyed
                editor.destroy();
            }
        };
    }, [editor, debouncedUpdate]);

    return (
        <div className="flex flex-col h-full bg-background" ref={editorRef}>
            <div className="flex items-center gap-1 p-1 border-b border-border bg-accent/50 shrink-0 overflow-x-auto custom-scrollbar">
               <button className="btn-ghost" onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={14}/></button>
               <button className="btn-ghost" onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={14}/></button>
               <span className="w-px h-4 bg-border mx-1"></span>
               <button className="btn-ghost" onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}><Heading1 size={14}/></button>
               <button className="btn-ghost" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={14}/></button>
               <span className="w-px h-4 bg-border mx-1"></span>
               <button className="btn-ghost" onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={14}/></button>
               <button className="btn-ghost" onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={14}/></button>
            </div>

            <div className="flex-1 overflow-auto p-8 relative">
                <div className="max-w-3xl mx-auto h-full">
                    <EditorContent editor={editor} className="h-full font-sans text-base leading-relaxed" />
                </div>
            </div>
        </div>
    );
}
