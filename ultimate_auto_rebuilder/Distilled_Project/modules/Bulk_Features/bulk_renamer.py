"""
=======================================================================
Bulk-Renamer RBY 🔄  — Cyberpunk Edition
=======================================================================
Standalone GUI to batch-rename files with **prefix**, **suffix** or
Regex-based search/replace.  
• Dark neon theme, split view (Explorer | Log), ttk.Notebook ready.  
• Fully self-contained (tkinter + stdlib).  
• Detailed logging to ./logs/bulk_renamer.log + on-screen.  
• Collision-safe (adds _1, _2 …), Windows-safe (strips illegal chars).  
• Preview mode lets you verify before committing.  
-----------------------------------------------------------------------
"""

import os, re, shutil, logging, datetime, tkinter as tk
from tkinter import ttk, filedialog, messagebox

# ──────────────────────────────────────────────────────────────────────
#  CONFIG & LOGGING SETUP
# ──────────────────────────────────────────────────────────────────────
APP_NAME      = "Bulk-Renamer RBY"
PRIMARY_BG    = "#0A0A0A"
NEON_GREEN_FG = "#39FF14"
NEON_RED      = "#FF073A"
FONT_FAMILY   = "Consolas"

LOG_DIR       = os.path.join(os.path.dirname(__file__), "logs")
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    filename=os.path.join(LOG_DIR, "bulk_renamer.log"),
    level=logging.DEBUG,
    format="%(asctime)s  %(levelname)-8s  %(message)s"
)

# ──────────────────────────────────────────────────────────────────────
#  GUI THEME
# ──────────────────────────────────────────────────────────────────────
def apply_theme():
    style = ttk.Style()
    style.theme_use("clam")
    style.configure(".", background=PRIMARY_BG, foreground=NEON_GREEN_FG,
                    fieldbackground=PRIMARY_BG, font=(FONT_FAMILY, 10))
    style.configure("Treeview", background=PRIMARY_BG, foreground=NEON_GREEN_FG,
                    rowheight=22, borderwidth=0)
    style.map("Treeview", background=[("selected", NEON_RED)],
              foreground=[("selected", "#ffffff")])
    style.configure("TNotebook.Tab", background=PRIMARY_BG,
                    foreground=NEON_GREEN_FG, padding=6)
    style.map("TNotebook.Tab", background=[("selected", NEON_RED)],
              foreground=[("selected", "#ffffff")])
    style.configure("TButton", background=PRIMARY_BG,
                    foreground=NEON_GREEN_FG)
    style.map("TButton", background=[("active", NEON_RED)],
              foreground=[("active", "#ffffff")])

# ──────────────────────────────────────────────────────────────────────
#  UTILS
# ──────────────────────────────────────────────────────────────────────
_ILLEGAL = re.compile(r'[<>:"/\\|?*\x00-\x1F]')

def safe_name(name:str)->str:
    """Strip Windows-illegal characters."""
    return _ILLEGAL.sub("_", name)

def unique_path(path:str)->str:
    """Append _n until path is free."""
    base, ext = os.path.splitext(path)
    counter = 1
    while os.path.exists(path):
        path = f"{base}_{counter}{ext}"
        counter += 1
    return path

def build_new_name(old:str, pre:str, suf:str, find:str, repl:str)->str:
    base, ext = os.path.splitext(old)
    if find:
        base = re.sub(find, repl, base)
    return f"{pre}{base}{suf}{ext}"

# ──────────────────────────────────────────────────────────────────────
#  APP
# ──────────────────────────────────────────────────────────────────────
class BulkRenamer(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_NAME)
        self.geometry("1100x650")
        self.configure(bg=PRIMARY_BG)
        apply_theme()

        self.dir_var = tk.StringVar()
        self._build_menu()
        self._build_toolbar()
        self._build_panes()
        self._build_controls()

    # Menu Bar
    def _build_menu(self):
        mb = tk.Menu(self, bg=PRIMARY_BG, fg=NEON_GREEN_FG,
                     activebackground=NEON_RED, activeforeground="#fff")
        filem = tk.Menu(mb, tearoff=0, bg=PRIMARY_BG, fg=NEON_GREEN_FG)
        filem.add_command(label="Open Folder…", command=self.pick_dir)
        filem.add_separator(); filem.add_command(label="Exit", command=self.quit)
        mb.add_cascade(label="File", menu=filem)
        for lab in ("Edit","View","Tools","Settings","Help"):
            dummy=tk.Menu(mb, tearoff=0,bg=PRIMARY_BG,fg=NEON_GREEN_FG)
            dummy.add_command(label="[Placeholder]")
            mb.add_cascade(label=lab, menu=dummy)
        self.config(menu=mb)

    # Toolbar
    def _build_toolbar(self):
        tb=ttk.Frame(self); tb.pack(fill="x")
        ttk.Button(tb, text="Open Folder", command=self.pick_dir).pack(side="left", padx=4)
        ttk.Button(tb, text="Preview", command=lambda: self.process(preview=True)).pack(side="left", padx=4)
        ttk.Button(tb, text="Rename", command=lambda: self.process(preview=False)).pack(side="left", padx=4)

    # Split panes
    def _build_panes(self):
        self.paned = ttk.PanedWindow(self, orient="horizontal"); self.paned.pack(fill="both", expand=True)
        # Explorer
        lfrm=ttk.Frame(self.paned, width=300)
        self.tree=ttk.Treeview(lfrm); self.tree.pack(fill="both",expand=True,side="left")
        scr=ttk.Scrollbar(lfrm,command=self.tree.yview); scr.pack(side="right",fill="y")
        self.tree.configure(yscrollcommand=scr.set)
        self.paned.add(lfrm)
        # Log notebook
        self.nb=ttk.Notebook(self.paned)
        self.log=tk.Text(self.nb,bg="#141414",fg=NEON_GREEN_FG,insertbackground=NEON_RED,state="disabled")
        self.preview=tk.Text(self.nb,bg="#141414",fg=NEON_GREEN_FG,insertbackground=NEON_RED,state="disabled")
        self.nb.add(self.log,text="Log"); self.nb.add(self.preview,text="Preview")
        self.paned.add(self.nb)

    # Control panel
    def _build_controls(self):
        pnl=ttk.Frame(self); pnl.pack(fill="x", pady=2)
        self.pre=tk.StringVar(); self.suf=tk.StringVar()
        self.find=tk.StringVar(); self.repl=tk.StringVar()
        ttk.Label(pnl,text="Prefix").pack(side="left"); ttk.Entry(pnl,textvariable=self.pre,width=12).pack(side="left")
        ttk.Label(pnl,text="Suffix").pack(side="left"); ttk.Entry(pnl,textvariable=self.suf,width=12).pack(side="left")
        ttk.Label(pnl,text="Regex Find").pack(side="left"); ttk.Entry(pnl,textvariable=self.find,width=14).pack(side="left")
        ttk.Label(pnl,text="Replace").pack(side="left"); ttk.Entry(pnl,textvariable=self.repl,width=14).pack(side="left")
        ttk.Label(pnl,textvariable=self.dir_var).pack(side="right", padx=6)

    # Directory chooser
    def pick_dir(self):
        path = filedialog.askdirectory(title="Select folder to rename files")
        if path:
            self.dir_var.set(path); self.populate_tree(path)

    # Populate tree
    def populate_tree(self, root):
        self.tree.delete(*self.tree.get_children())
        def walk(parent, abspath):
            for item in sorted(os.listdir(abspath)):
                fp=os.path.join(abspath,item); node=self.tree.insert(parent,"end",text=item,values=[fp])
                if os.path.isdir(fp): walk(node, fp)
        walk("", root)

    # Logging helpers
    def _log(self, msg, panel="log"):
        tgt=self.log if panel=="log" else self.preview
        tgt.configure(state="normal"); tgt.insert("end",msg+"\n"); tgt.configure(state="disabled"); tgt.see("end")

    # Core process
    def process(self, preview:bool):
        root=self.dir_var.get()
        if not os.path.isdir(root):
            messagebox.showwarning("No folder","Please choose a folder first"); return
        pre,suf,find,repl=self.pre.get(),self.suf.get(),self.find.get(),self.repl.get()
        self.preview.configure(state="normal"); self.preview.delete("1.0","end"); self.preview.configure(state="disabled")
        actions=[]
        for dirpath,_,files in os.walk(root):
            for fn in files:
                old_path=os.path.join(dirpath,fn)
                new_name=build_new_name(fn,pre,suf,find,repl)
                new_name=safe_name(new_name)
                new_path=unique_path(os.path.join(dirpath,new_name))
                if new_path!=old_path:
                    actions.append((old_path,new_path))
        if not actions:
            messagebox.showinfo("Nothing to rename","No files match the criteria.")
            return
        # Preview
        for old,new in actions: self._log(f"{old}  →  {new}", panel="preview")
        if preview: return
        # Rename loop with robust error handling
        failures=[]
        for old,new in actions:
            try:
                shutil.move(old,new)
                logging.info("RENAMED: %s -> %s", old, new)
                self._log(f"✔ {old} → {new}")
            except Exception as exc:
                failures.append((old,str(exc)))
                logging.error("FAILED: %s :: %s", old, exc)
                self._log(f"✖ {old}  ({exc})")
        if failures:
            messagebox.showerror("Some files failed", f"{len(failures)} failures logged.")
        else:
            messagebox.showinfo("Done", f"Renamed {len(actions)} files.")
        # Refresh explorer
        self.populate_tree(root)

# ──────────────────────────────────────────────────────────────────────
if __name__=="__main__":
    BulkRenamer().mainloop()
