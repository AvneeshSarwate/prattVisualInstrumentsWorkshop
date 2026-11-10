import { File, FileDiff, parseDiffFromFile, type FileContents } from "@pierre/diffs";
import { Editor } from "@pierre/diffs/edit";
import { CODE_BG, CODE_THEME } from "./theme";

// Code views, all rendered by Pierre (@pierre/diffs) with the same Shiki theme,
// so the editors and the diff look identical apart from the diff highlights.

const SHARED_OPTIONS = {
  theme: CODE_THEME,
  themeType: "dark" as const,
  overflow: "scroll" as const,
  disableFileHeader: true, // the app draws its own pane headers
};

export type DiffStyle = "split" | "unified";

/** An editable file. Edits are reported through onChange with the full text. */
export class EditorPane {
  readonly el: HTMLDivElement;
  private file: File;
  private editor: Editor<"file">;
  private detach: () => void;
  private edited = false;

  constructor(parent: HTMLElement, name: string, text: string, onChange: (text: string) => void, onFocus: () => void) {
    this.el = document.createElement("div");
    this.el.className = "code-scroll";
    this.el.style.background = CODE_BG;
    parent.append(this.el);

    // Accepting on completion keeps the edited text if the session ends (e.g. on teardown).
    this.file = new File({ ...SHARED_OPTIONS, onEditComplete: () => "accept" });
    this.file.render({ file: { name, contents: text }, containerWrapper: this.el });

    this.editor = new Editor("file", {
      onChange: () => {
        this.edited = true;
        onChange(this.editor.getText());
      },
      onFocus,
    });
    this.detach = this.editor.edit(this.file);
  }

  /**
   * The current text, straight from the editor — or undefined if nothing has been typed yet.
   * (Right after mounting, the editor's document can still be empty while it attaches.)
   */
  text(): string | undefined {
    return this.edited ? this.editor.getText() : undefined;
  }

  /** Replace the whole document (undoable, like a paste). */
  replaceText(text: string): void {
    const lines = this.editor.getText().split("\n");
    const end = { line: lines.length - 1, character: lines[lines.length - 1].length };
    this.editor.applyEdits([{ range: { start: { line: 0, character: 0 }, end }, newText: text }]);
  }

  destroy(): void {
    this.detach();
    this.editor.cleanUp();
    this.file.cleanUp();
    this.el.remove();
  }
}

/** A read-only diff of two files, split (side by side) or unified. */
export class DiffPane {
  readonly el: HTMLDivElement;
  private diff: FileDiff;

  constructor(parent: HTMLElement, oldFile: FileContents, newFile: FileContents, diffStyle: DiffStyle) {
    this.el = document.createElement("div");
    this.el.className = "code-scroll";
    this.el.style.background = CODE_BG;
    parent.append(this.el);
    this.diff = new FileDiff({
      ...SHARED_OPTIONS,
      diffStyle,
      lineDiffType: "word-alt", // highlight the changed words inside a changed line
      expandUnchanged: true, // sketches are short: always show the whole file for context
      diffIndicators: "bars",
    });
    this.diff.render({ oldFile, newFile, containerWrapper: this.el });
  }

  destroy(): void {
    this.diff.cleanUp();
    this.el.remove();
  }
}

/** Lines added and removed between two versions. */
export function diffStats(oldFile: FileContents, newFile: FileContents): { added: number; removed: number } {
  const { hunks } = parseDiffFromFile(oldFile, newFile);
  return {
    added: hunks.reduce((sum, h) => sum + h.additionLines, 0),
    removed: hunks.reduce((sum, h) => sum + h.deletionLines, 0),
  };
}
