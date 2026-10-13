import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

const appWindow = getCurrentWindow();

export default function CustomTitlebar() {
  return (
    <div
      data-tauri-drag-region
      className="h-8 select-none flex justify-between items-center bg-background border-b border-border shrink-0 print:hidden"
    >
      {/* Spacer for drag region on the left */}
      <div data-tauri-drag-region className="h-full flex-1 flex items-center px-4 text-xs font-semibold text-muted-foreground">
         UpNote
      </div>

      {/* Window Controls */}
      <div className="flex h-full">
        <div
          className="inline-flex justify-center items-center w-10 h-full hover:bg-accent hover:text-foreground cursor-pointer text-muted-foreground transition-colors"
          onClick={() => appWindow.minimize()}
        >
          <Minus size={14} />
        </div>
        <div
          className="inline-flex justify-center items-center w-10 h-full hover:bg-accent hover:text-foreground cursor-pointer text-muted-foreground transition-colors"
          onClick={() => appWindow.toggleMaximize()}
        >
          <Square size={12} />
        </div>
        <div
          className="inline-flex justify-center items-center w-10 h-full hover:bg-red-500 hover:text-white cursor-pointer text-muted-foreground transition-colors"
          onClick={() => appWindow.close()}
        >
          <X size={14} />
        </div>
      </div>
    </div>
  );
}
